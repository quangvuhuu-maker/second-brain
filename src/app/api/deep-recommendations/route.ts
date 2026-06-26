import { NextRequest, NextResponse } from "next/server";
import { generateAIContent, APIKeys } from "@/lib/ai-orchestrator";
import { fetchStockData, fetchMacroNews } from "@/lib/market-data";
import { adminDb } from "@/lib/firebase-admin";
import { safeParseJSON } from "@/lib/safe-parse-json";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

const CACHE_DOC = "deep-recommendations";
const LOCK_DOC = "deep-recommendations-lock";
const CACHE_COLLECTION = "ai_cache";
const LOCK_COLLECTION = "ai_locks";

// Tăng timeout cho Vercel serverless
export const maxDuration = 60;

// Cache TTL: 2 giờ (đủ để tránh gọi AI lặp lại liên tục)
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

// Lock TTL: nếu lock cũ hơn 55 giây thì coi như expired (request trước đã timeout)
const LOCK_TTL_MS = 55 * 1000; // 55 seconds

function isCacheValid(cachedAt: string | undefined): boolean {
  if (!cachedAt) return false;
  const cachedTime = new Date(cachedAt).getTime();
  return Date.now() - cachedTime < CACHE_TTL_MS;
}

/**
 * Lấy ngày Việt Nam dạng YYYY-MM-DD
 */
function getVNDateString(): string {
  const now = new Date();
  const vnOffset = 7 * 60;
  const vnDate = new Date(now.getTime() + vnOffset * 60000);
  return vnDate.toISOString().slice(0, 10);
}

/**
 * Lọc danh sách ứng viên MUA: chỉ giữ mã có tín hiệu bullish rõ ràng.
 * Đây là hard filter bằng code — AI không thể override.
 * Mã KHÔNG hợp lệ để MUA:
 *   - Trend downtrend (rõ ràng)
 *   - SMC = Bearish CHoCH / Lower Low / Bearish FVG
 *   - OBV Down + Trend không phải uptrend
 */
function getBuyPool(stocks: any[], topN: number = 40): any[] {
  const candidates = stocks.filter((s) => {
    const trend = (s.trend || "").toLowerCase();
    const smc = (s.smcSignal || "").toLowerCase();
    const obv = (s.obvTrend || "").toLowerCase();
    const rsi = parseFloat(s.rsi) || 50;

    // Loại trừ cứng: downtrend rõ ràng
    if (trend.includes("down")) return false;

    // Loại trừ cứng: SMC bearish signals (lower low, bearish choch, bearish fvg)
    if (smc.includes("lower low") || smc.includes("ll")) return false;
    if (smc.includes("bearish choch") || smc.includes("bearish cho")) return false;
    if (smc.includes("bearish fvg") && obv.includes("down")) return false;

    // Loại trừ: OBV Down + không có tín hiệu bullish nào
    const hasBullish = smc.includes("bullish") || smc.includes("bos") || (s.vsaSignal || "").toLowerCase().includes("sos");
    if (obv.includes("down") && !hasBullish) return false;

    // RSI quá cao (overbought) không nên mua đuổi
    if (rsi > 72) return false;

    return true;
  });

  // Score và lấy top N
  const scored = candidates.map((s) => {
    let score = 0;
    const smc = (s.smcSignal || "").toLowerCase();
    const vsa = (s.vsaSignal || "").toLowerCase();
    const obv = (s.obvTrend || "").toLowerCase();
    const rsi = parseFloat(s.rsi) || 50;
    const macd = (s.macd || "").toLowerCase();

    if (smc.includes("bullish") || smc.includes("bos") || smc.includes("choch")) score += 3;
    if (vsa.includes("sos") || vsa.includes("sign of strength")) score += 3;
    if (obv.includes("up")) score += 2;
    if (rsi >= 45 && rsi <= 65) score += 2;
    if (macd.includes("bullish") || macd.includes("up")) score += 1;
    if ((parseFloat(s.volume) || 0) > 500000) score += 1;

    return { ...s, _score: score };
  });

  return scored
    .sort((a, b) => b._score - a._score)
    .slice(0, topN)
    .map(({ _score, ...rest }) => rest);
}

/**
 * Lọc danh sách ứng viên BÁN: chỉ giữ mã có tín hiệu bearish rõ ràng.
 * Loại trừ mã đang trong uptrend mạnh với Bullish BOS/CHoCH.
 */
function getSellPool(stocks: any[], topN: number = 40): any[] {
  const candidates = stocks.filter((s) => {
    const trend = (s.trend || "").toLowerCase();
    const smc = (s.smcSignal || "").toLowerCase();
    const obv = (s.obvTrend || "").toLowerCase();
    const rsi = parseFloat(s.rsi) || 50;

    // Loại trừ: uptrend mạnh với xác nhận bullish
    if (trend.includes("up") && smc.includes("bullish bos") && obv.includes("up")) return false;

    // Loại trừ: RSI thấp (oversold) kết hợp OBV Up — đang tích lũy
    if (rsi < 30 && obv.includes("up")) return false;

    // Ưu tiên mã có tín hiệu bearish rõ
    const hasBearish = smc.includes("bearish") || (s.vsaSignal || "").toLowerCase().includes("sow")
      || trend.includes("down") || obv.includes("down") || rsi > 70;
    return hasBearish;
  });

  const scored = candidates.map((s) => {
    let score = 0;
    const smc = (s.smcSignal || "").toLowerCase();
    const vsa = (s.vsaSignal || "").toLowerCase();
    const obv = (s.obvTrend || "").toLowerCase();
    const rsi = parseFloat(s.rsi) || 50;

    if (vsa.includes("sow") || vsa.includes("sign of weakness")) score += 3;
    if (smc.includes("bearish") || smc.includes("lower low")) score += 3;
    if (obv.includes("down")) score += 2;
    if (rsi > 70) score += 2;
    if (rsi > 75) score += 1;

    return { ...s, _score: score };
  });

  return scored
    .sort((a, b) => b._score - a._score)
    .slice(0, topN)
    .map(({ _score, ...rest }) => rest);
}


export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("refresh") === "true";

    // --- Kiểm tra cache (TTL 2 giờ) ---
    try {
      const cacheDoc = await adminDb.collection(CACHE_COLLECTION).doc(CACHE_DOC).get();
      if (cacheDoc.exists) {
        const cached = cacheDoc.data();
        const cachedAt = cached?.cachedAt?.toDate?.()?.toISOString() || cached?.cachedAt;

        if (!forceRefresh && isCacheValid(cachedAt)) {
          // Kiểm tra schema version: nếu cache cũ (không có targetShort) thì invalidate
          const firstBuy = cached?.data?.topBuys?.[0];
          const isNewSchema = firstBuy?.targetShort !== undefined;
          if (isNewSchema) {
            console.log("[DeepRec] Trả về cache hợp lệ (< 2h, schema v2)");
            return NextResponse.json({
              success: true,
              data: cached?.data,
              cachedAt,
              fromCache: true,
            });
          }
          console.log("[DeepRec] Cache cũ (schema v1, thiếu targetShort) → bỏ qua cache, chạy lại AI");
        }
      }
    } catch (cacheErr) {
      console.warn("[DeepRec] Cache read failed:", cacheErr);
    }

    // --- Kiểm tra lock (tránh nhiều request chạy song song) ---
    try {
      const lockDoc = await adminDb.collection(LOCK_COLLECTION).doc(LOCK_DOC).get();
      if (lockDoc.exists) {
        const lock = lockDoc.data();
        const lockedAt = lock?.lockedAt?.toDate?.()?.getTime() || 0;
        const lockAge = Date.now() - lockedAt;

        if (lockAge < LOCK_TTL_MS) {
          const remainingSec = Math.ceil((LOCK_TTL_MS - lockAge) / 1000);
          console.warn(`[DeepRec] Đang có request AI đang chạy. Còn ~${remainingSec}s.`);
          return NextResponse.json(
            {
              success: false,
              error: `Hệ thống đang phân tích AI, vui lòng chờ ~${remainingSec} giây rồi thử lại.`,
              isGenerating: true,
            },
            { status: 429 }
          );
        }
      }
    } catch (lockErr) {
      console.warn("[DeepRec] Lock check failed:", lockErr);
    }

    // --- Đặt lock ---
    try {
      await adminDb.collection(LOCK_COLLECTION).doc(LOCK_DOC).set({
        lockedAt: FieldValue.serverTimestamp(),
      });
    } catch (lockErr) {
      console.warn("[DeepRec] Lock set failed:", lockErr);
    }

    let analysis: any = null;

    try {
      // --- Fetch dữ liệu ---
      const [stocks, news] = await Promise.all([
        fetchStockData(forceRefresh),
        fetchMacroNews(),
      ]);

      const stocksMap = new Map();
      stocks.forEach((s: any) => stocksMap.set(s.symbol, s.price));

      // --- Hard filter bằng code: tách riêng buy pool và sell pool ---
      const buyPool = getBuyPool(stocks, 40);
      const sellPool = getSellPool(stocks, 40);
      console.log(`[DeepRec] buyPool: ${buyPool.length} mã | sellPool: ${sellPool.length} mã (từ ${stocks.length} mã tổng)`);

      // Format compact
      const formatStocks = (list: any[]) => list
        .map((s: any) =>
          `${s.symbol}|${s.price}|${s.volume}|${s.trend}|${s.rsi}|${s.macd}|${s.obvTrend}|${s.bbWidth}|${s.support}|${s.resistance}|${s.smcSignal}|${s.vsaSignal}`
        )
        .join("\n");

      const buyText = formatStocks(buyPool);
      const sellText = formatStocks(sellPool);

      const newsText = news
        .slice(0, 10)
        .map((n: any) => `- ${n.title}: ${n.summary}`)
        .join("\n");

      const prompt = `Bạn là CIO của quỹ đầu tư hàng đầu Việt Nam. Chọn Top 10 MUA từ danh sách BUY POOL và Top 10 BÁN từ danh sách SELL POOL dưới đây.

⚠️ QUAN TRỌNG: Danh sách đã được lọc kỹ bằng code. CHỈ chọn từ đúng pool tương ứng.

BUY POOL — ${buyPool.length} mã ĐÃ QUA BỘ LỌC (Trend không giảm, SMC không có LL/Bearish CHoCH, OBV hợp lệ):
[Symbol|Price|Vol|Trend|RSI|MACD|OBV|BB|Support|Resistance|SMC|VSA]
${buyText}

SELL POOL — ${sellPool.length} mã có tín hiệu bearish:
[Symbol|Price|Vol|Trend|RSI|MACD|OBV|BB|Support|Resistance|SMC|VSA]
${sellText}

TIN VĨ MÔ (10 tin mới nhất):
${newsText}

TIÊU CHÍ MUA: VSA=SOS hoặc SMC=Bullish BOS/CHoCH, OBV tăng, RSI 45-65, gần vùng Support.
TIÊU CHÍ BÁN: VSA=SOW hoặc SMC=Bearish FVG, OBV giảm, RSI>70 hoặc thủng Support.

QUY TẮC ENTRY & TARGET (BẮT BUỘC TUÂN THỦ):
- entryPrice: Điểm vào lệnh AN TOÀN = vùng Support hoặc pullback về MA. PHẢI thấp hơn giá hiện tại 2-5%. KHÔNG phép bằng hoặc cao hơn giá hiện tại.
- stopLoss (số): Thấp hơn Support mạnh 2-3%. Đây là mức cắt lỗ cứng tuyệt đối.
- targetShort (ngắn hạn 1-4 tuần): Kháng cự gần nhất. upsideShort tối thiểu 8%.
- targetMedium (trung hạn 1-3 tháng): Kháng cự trung hạn. upsideMedium tối thiểu 15%.
- targetLong (dài hạn 3-6 tháng): Mục tiêu toàn sóng / Fair Value. upsideLong tối thiểu 25%.
- Tất cả upside = TÍNH CHÍNH XÁC: ((target - entryPrice) / entryPrice * 100), làm tròn 1 chữ số thập phân.
- Tương tự cho topSells: sellPrice = điểm bán an toàn, downside tính từ sellPrice.

Trả về JSON hợp lệ (không có markdown):
{"topBuys":[{"symbol":"","currentPrice":0,"entryPrice":0,"entryPointDesc":"","stopLoss":0,"stopLossPoint":"","dcaPoint":"","scaleInPoint":"","targetShort":0,"upsideShort":0,"targetMedium":0,"upsideMedium":0,"targetLong":0,"upsideLong":0,"targetPrice":0,"upsidePercent":0,"technicalReason":"","fundamentalReason":""}],"topSells":[{"symbol":"","currentPrice":0,"sellPrice":0,"stopLoss":0,"targetShort":0,"downsideShort":0,"targetMedium":0,"downsideMedium":0,"targetLong":0,"downsideLong":0,"targetPrice":0,"downsidePercent":0,"technicalReason":"","fundamentalReason":""}]}

Ghi chú: targetPrice = targetMedium (alias), upsidePercent = upsideMedium (alias). Điền cùng giá trị.

TIÊU CHÍ LOẠI TRỪ (TUYỆT ĐỐI KHÔNG được đưa vào topBuys):
❌ Trend = "downtrend" hoặc "bearish" → KHÔNG MUA dù RSI oversold
❌ SMC có tín hiệu "Lower Low" (LL) hoặc "Bearish CHoCH" gần nhất → KHÔNG MUA (cấu trúc giảm còn nguyên)
❌ OBV đang giảm (down) kết hợp Trend giảm → KHÔNG MUA
❌ Giá đang dưới cả MA20 lẫn Support chính → KHÔNG MUA
✅ Chỉ MUA khi: Trend tăng/sideways AND (SMC=Bullish BOS/CHoCH hoặc VSA=SOS) AND OBV Up AND RSI 35-65

TIÊU CHÍ LOẠI TRỪ topSells:
❌ Trend = "uptrend" mạnh + SMC=Bullish BOS → KHÔNG BÁN
✅ Chỉ BÁN khi: Trend giảm/đảo chiều AND (VSA=SOW hoặc SMC=Bearish) AND RSI>68 hoặc thủng Support

QUY TẮC DCA vs SCALE IN (BẮT BUỘC ĐÚNG THỨ TỰ):
- dcaPoint: Giá THẤP HƠN entryPrice (mua thêm nếu giá về sâu hơn vùng support)
- scaleInPoint: Giá CAO HƠN entryPrice (mua thêm khi giá breakout xác nhận xu hướng)
- KHÔNG được để scaleIn < entry hoặc dca > entry

QUY TẮC fundamentalReason (BẮT BUỘC KHÔNG được để "N/A"):
- Dùng kiến thức của bạn về công ty niêm yết trên HOSE/HNX: ngành nghề, vị thế cạnh tranh, tình hình kinh doanh gần đây.
- Kết hợp với tin vĩ mô đã cung cấp để đánh giá tác động lên công ty cụ thể.
- Ví dụ: "VCB: Ngân hàng nhà nước lớn nhất, hưởng lợi từ chính sách nới lỏng tiền tệ, NIM ổn định, nợ xấu kiểm soát tốt."
- Nếu không có thông tin cụ thể, hãy nêu rủi ro/cơ hội ngành theo tin vĩ mô. TUYỆT ĐỐI không trả về "N/A".

Quy tắc BẮT BUỘC:
1. Chọn ĐÚNG 10 mã Mua và 10 mã Bán từ danh sách trên.
2. entryPrice PHẢI nhỏ hơn currentPrice (entry an toàn, không chase giá).
3. dcaPoint < entryPrice < scaleInPoint (thứ tự giá bắt buộc).
4. Tuyệt đối KHÔNG đưa mã có Trend giảm + LL mới vào topBuys.
5. fundamentalReason PHẢI có nội dung thực tế, KHÔNG được "N/A".
6. Tất cả giá là NUMBER. Chỉ trả về JSON thuần, không text thêm.`;

      // --- Fetch API keys từ Firestore ---
      let apiKeys: APIKeys = {};
      try {
        const settingsDoc = await adminDb.collection("settings").doc("api_keys").get();
        if (settingsDoc.exists) {
          apiKeys = {
            geminiKeys: settingsDoc.data()?.geminiKeys || [],
            deepseekKeys: settingsDoc.data()?.deepseekKeys || [],
          };
        }
      } catch (e) {
        console.warn("[DeepRec] Failed to fetch API keys from settings:", e);
      }

      const requestContent = {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          // Tắt thinking mode — gemini-2.5-flash thinking có thể mất 30-60s thêm
          // Với phân tích cổ phiếu, tốc độ quan trọng hơn (phải xong trong 60s Vercel)
          thinkingConfig: { thinkingBudget: 0 },
        },
      };

      const result = await generateAIContent(requestContent, apiKeys, "gemini-2.5-flash");
      const responseText = result.response.text();
      analysis = safeParseJSON(responseText);

      const now = new Date().toISOString();
      const vnDate = getVNDateString();

      // --- Lưu cache ---
      try {
        await adminDb.collection(CACHE_COLLECTION).doc(CACHE_DOC).set({
          data: analysis,
          cachedAt: FieldValue.serverTimestamp(),
        });
      } catch (cacheErr) {
        console.warn("[DeepRec] Cache write failed:", cacheErr);
      }

      // --- Lưu log khuyến nghị ---
      try {
        const analysisData: any = analysis;
        const logEntry = {
          date: vnDate,
          createdAt: FieldValue.serverTimestamp(),
          topBuys: (analysisData.topBuys || []).map((s: Record<string, unknown>) => {
            const actualPrice = stocksMap.get(s.symbol as string);
            return {
              symbol: s.symbol,
              entryPrice: actualPrice || s.entryPrice,
              entryPointDesc: s.entryPointDesc,
              dcaPoint: s.dcaPoint,
              scaleInPoint: s.scaleInPoint,
              stopLossPoint: s.stopLossPoint,
              targetPrice: s.targetPrice,
              currentPrice: actualPrice || s.currentPrice,
              upsidePercent: s.upsidePercent,
              technicalReason: s.technicalReason,
              fundamentalReason: s.fundamentalReason,
            };
          }),
          topSells: (analysisData.topSells || []).map((s: Record<string, unknown>) => {
            const actualPrice = stocksMap.get(s.symbol as string);
            return {
              symbol: s.symbol,
              sellPrice: actualPrice || s.sellPrice,
              targetPrice: s.targetPrice,
              currentPrice: actualPrice || s.currentPrice,
              downsidePercent: s.downsidePercent,
            };
          }),
        };
        await adminDb.collection("recommendation_logs").doc(vnDate).set(logEntry);
      } catch (logErr) {
        console.warn("[DeepRec] Log write failed:", logErr);
      }

      return NextResponse.json({
        success: true,
        data: analysis,
        cachedAt: now,
        fromCache: false,
      });
    } finally {
      // --- Giải phóng lock dù thành công hay thất bại ---
      try {
        await adminDb.collection(LOCK_COLLECTION).doc(LOCK_DOC).delete();
      } catch (lockErr) {
        console.warn("[DeepRec] Lock release failed:", lockErr);
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[DeepRec] Analysis Error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

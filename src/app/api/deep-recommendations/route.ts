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
 * Pre-filter danh sách cổ phiếu xuống còn top 60 mã tốt nhất trước khi gửi vào prompt.
 * Tiêu chí lọc: ưu tiên có tín hiệu SMC/VSA rõ ràng, RSI hợp lý, OBV tích cực.
 * Mục đích: giảm kích thước prompt ~60%, giúp AI phân tích chính xác hơn và tránh timeout.
 */
function preFilterStocks(stocks: any[], topN: number = 60): any[] {
  // Scoring: mỗi tín hiệu tích cực +1 điểm
  const scored = stocks.map((s) => {
    let score = 0;
    const smc = (s.smcSignal || "").toLowerCase();
    const vsa = (s.vsaSignal || "").toLowerCase();
    const obv = (s.obvTrend || "").toLowerCase();
    const rsi = parseFloat(s.rsi) || 50;
    const macd = (s.macd || "").toLowerCase();

    // Tín hiệu mua mạnh
    if (smc.includes("bullish") || smc.includes("bos") || smc.includes("choch")) score += 3;
    if (vsa.includes("sos") || vsa.includes("sign of strength")) score += 3;
    if (obv.includes("up")) score += 2;
    if (rsi >= 45 && rsi <= 70) score += 1; // RSI hợp lý
    if (macd.includes("bullish") || macd.includes("up")) score += 1;

    // Tín hiệu bán mạnh (cũng cần để chọn top sells)
    if (vsa.includes("sow") || vsa.includes("sign of weakness")) score += 3;
    if (smc.includes("bearish") || smc.includes("fvg")) score += 2;
    if (obv.includes("down")) score += 1;
    if (rsi > 70 || rsi < 30) score += 2; // RSI extreme

    // Volume cao hơn bình thường cũng ưu tiên
    const vol = parseFloat(s.volume) || 0;
    if (vol > 500000) score += 1;

    return { ...s, _score: score };
  });

  // Sắp xếp theo score giảm dần, lấy top N
  return scored
    .sort((a, b) => b._score - a._score)
    .slice(0, topN)
    .map(({ _score, ...rest }) => rest); // bỏ trường _score trước khi đưa vào prompt
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
          console.log("[DeepRec] Trả về cache hợp lệ (< 2h)");
          return NextResponse.json({
            success: true,
            data: cached?.data,
            cachedAt,
            fromCache: true,
          });
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

      // --- Pre-filter: chỉ giữ top 60 mã có tín hiệu rõ nhất ---
      const filteredStocks = preFilterStocks(stocks, 60);
      console.log(`[DeepRec] Pre-filter: ${stocks.length} → ${filteredStocks.length} mã`);

      // Format compact: bỏ số thập phân thừa
      const stocksText = filteredStocks
        .map((s: any) =>
          `${s.symbol}|${s.price}|${s.volume}|${s.trend}|${s.rsi}|${s.macd}|${s.obvTrend}|${s.bbWidth}|${s.support}|${s.resistance}|${s.smcSignal}|${s.vsaSignal}`
        )
        .join("\n");

      const newsText = news
        .slice(0, 10) // Chỉ lấy 10 tin mới nhất
        .map((n: any) => `- ${n.title}: ${n.summary}`)
        .join("\n");

      const prompt = `Bạn là CIO của quỹ đầu tư hàng đầu Việt Nam. Phân tích ${filteredStocks.length} cổ phiếu được chọn lọc (từ rổ 150 mã thanh khoản cao) và tin vĩ mô để chọn Top 10 MUA và Top 10 BÁN.

DỮ LIỆU CỔ PHIẾU [Symbol|Price|Vol|Trend|RSI|MACD|OBV|BB|Support|Resistance|SMC|VSA]:
${stocksText}

TIN VĨ MÔ (10 tin mới nhất):
${newsText}

TIÊU CHÍ MUA: VSA=SOS hoặc SMC=Bullish BOS/CHoCH, OBV tăng, RSI 45-65, gần vùng Support.
TIÊU CHÍ BÁN: VSA=SOW hoặc SMC=Bearish FVG, OBV giảm, RSI>70 hoặc thủng Support.

Trả về JSON hợp lệ (không có markdown):
{"topBuys":[{"symbol":"","currentPrice":0,"entryPrice":0,"entryPointDesc":"","dcaPoint":"","scaleInPoint":"","stopLossPoint":"","targetPrice":0,"upsidePercent":0,"technicalReason":"","fundamentalReason":""}],"topSells":[{"symbol":"","currentPrice":0,"sellPrice":0,"targetPrice":0,"downsidePercent":0,"technicalReason":"","fundamentalReason":""}]}

Quy tắc BẮT BUỘC:
1. Chọn ĐÚNG 10 mã Mua và 10 mã Bán từ danh sách trên.
2. entryPrice và sellPrice là số (NUMBER), sát với Price trong dữ liệu (lệch tối đa 1%).
3. Chỉ trả về JSON, không có text thêm.`;

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
        },
      };

      const result = await generateAIContent(requestContent, apiKeys, "gemini-1.5-flash");
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

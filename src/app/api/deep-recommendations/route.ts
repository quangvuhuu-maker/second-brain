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
 * Hard sanitize: Đảm bảo entryPrice/sellPrice luôn < currentPrice.
 * Nếu AI trả sai, tự động fix bằng fallback.
 */
/**
 * Phân loại proximity của cổ phiếu so với vùng support.
 * Tier A: cách support ≤3% (đang chạm/test support → entry ngay)
 * Tier B: cách support ≤8% (gần support → chờ pullback nhỏ)
 * Tier C: cách support >8% (xa support → chỉ dùng momentum entry)
 */
function getSupportProximity(s: any): {
  tier: "A" | "B" | "C";
  proximityPct: number | null;
  useMomentumEntry: boolean;
} {
  const price = parseFloat(s.price) || 0;
  const support = parseFloat(s.support) || 0;

  if (!price || !support || support >= price) {
    return { tier: "C", proximityPct: null, useMomentumEntry: true };
  }

  const pct = ((price - support) / price) * 100;

  if (pct <= 3) return { tier: "A", proximityPct: pct, useMomentumEntry: false };
  if (pct <= 8) return { tier: "B", proximityPct: pct, useMomentumEntry: false };
  return { tier: "C", proximityPct: pct, useMomentumEntry: true };
}

function sanitizeAnalysis(analysis: any, stocksMap: Map<string, any>): any {
  if (!analysis) return analysis;

  const fixBuy = (s: any) => {
    const stock = stocksMap.get(s.symbol);
    const currentPrice = stock?.price ?? s.currentPrice;
    const support = stock?.support;
    const ma20 = stock?.movingAverage20;
    const proximity = stock ? getSupportProximity(stock) : { tier: "C", proximityPct: null, useMomentumEntry: true };

    let entryPrice = s.entryPrice;

    // Nếu AI trả entryPrice >= currentPrice → tự động fix theo tier
    if (!entryPrice || entryPrice >= currentPrice) {
      if (proximity.tier === "A" && support && support < currentPrice) {
        // Tier A: entry tại support ngay (cách ≤3%)
        entryPrice = support;
        s.entryPointDesc = `[Auto-fix] 🟢 Tier A — Entry tại Support ${support.toLocaleString("vi-VN")} (cách giá ${proximity.proximityPct?.toFixed(1)}%)`;
      } else if (proximity.tier === "B" && support && support < currentPrice) {
        // Tier B: chờ pullback về support
        entryPrice = support;
        s.entryPointDesc = `[Auto-fix] 🟡 Tier B — Chờ pullback về Support ${support.toLocaleString("vi-VN")} (cách giá ${proximity.proximityPct?.toFixed(1)}%)`;
      } else if (proximity.useMomentumEntry) {
        // Tier C: momentum entry tại giá hiện tại
        entryPrice = currentPrice;
        s.entryPointDesc = `[Auto-fix] 🔵 Momentum Entry — Vào tại giá hiện tại ${currentPrice.toLocaleString("vi-VN")} (support xa ${proximity.proximityPct?.toFixed(1) ?? "?"}%)`;
      } else if (ma20 && ma20 < currentPrice) {
        entryPrice = ma20;
        s.entryPointDesc = `[Auto-fix] Pullback về MA20 tại ${ma20.toLocaleString("vi-VN")}`;
      } else {
        entryPrice = Math.round(currentPrice * 0.97);
        s.entryPointDesc = `[Auto-fix] Fallback -3% tại ${entryPrice.toLocaleString("vi-VN")}`;
      }
      console.warn(`[Sanitize] ${s.symbol} (Tier ${proximity.tier}): entryPrice ${s.entryPrice} >= currentPrice ${currentPrice} → fixed to ${entryPrice}`);
    }

    return {
      ...s,
      entryPrice,
      currentPrice,
      proximityTier: proximity.tier,
      proximityPct: proximity.proximityPct,
    };
  };

  const fixSell = (s: any) => {
    const stock = stocksMap.get(s.symbol);
    const currentPrice = stock?.price ?? s.currentPrice;
    let sellPrice = s.sellPrice;

    // sellPrice nên <= currentPrice (bán ở giá hiện tại hoặc thấp hơn)
    if (sellPrice && sellPrice > currentPrice * 1.02) {
      sellPrice = currentPrice;
      console.warn(`[Sanitize] ${s.symbol}: sellPrice ${s.sellPrice} > currentPrice ${currentPrice} → fixed to ${currentPrice}`);
    }

    return { ...s, sellPrice, currentPrice };
  };

  return {
    ...analysis,
    topBuys: (analysis.topBuys || []).map(fixBuy),
    topSells: (analysis.topSells || []).map(fixSell),
  };
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

  // Score và lấy top N — ưu tiên mã gần vùng support
  const scored = candidates.map((s) => {
    let score = 0;
    const smc = (s.smcSignal || "").toLowerCase();
    const vsa = (s.vsaSignal || "").toLowerCase();
    const obv = (s.obvTrend || "").toLowerCase();
    const rsi = parseFloat(s.rsi) || 50;
    const macd = (s.macd || "").toLowerCase();
    const proximity = getSupportProximity(s);

    // ── Tín hiệu kỹ thuật ──
    if (smc.includes("bullish") || smc.includes("bos") || smc.includes("choch")) score += 3;
    if (vsa.includes("sos") || vsa.includes("sign of strength")) score += 3;
    if (obv.includes("up")) score += 2;
    if (rsi >= 45 && rsi <= 65) score += 2;
    if (macd.includes("bullish") || macd.includes("up")) score += 1;
    if ((parseFloat(s.volume) || 0) > 500000) score += 1;

    // ── Proximity to Support (TRỌNG SỐ CAO NHẤT) ──
    // Tier A: đang chạm/test support ≤3% → đây là cơ hội entry thực sự
    if (proximity.tier === "A") score += 5;
    // Tier B: gần support ≤8% → entry tốt khi có pullback
    else if (proximity.tier === "B") score += 2;
    // Tier C: xa support >8% → momentum entry, ưu tiên thấp hơn
    // (không cộng điểm, nhưng vẫn giữ trong pool để fallback)

    return { ...s, _score: score, _tier: proximity.tier, _proximityPct: proximity.proximityPct };
  });

  // Sort: Tier A trước, rồi Tier B, cuối Tier C — trong cùng tier thì theo score
  const tierOrder: Record<string, number> = { A: 0, B: 1, C: 2 };
  const sorted = scored.sort((a, b) => {
    const tierDiff = (tierOrder[a._tier] ?? 2) - (tierOrder[b._tier] ?? 2);
    if (tierDiff !== 0) return tierDiff;
    return b._score - a._score;
  });

  // Log phân bổ tier để debug
  const tierCount = { A: 0, B: 0, C: 0 };
  sorted.slice(0, topN).forEach((s) => { tierCount[s._tier as "A" | "B" | "C"]++; });
  console.log(`[BuyPool] Tier A: ${tierCount.A} | Tier B: ${tierCount.B} | Tier C: ${tierCount.C} (trong top ${topN})`);

  return sorted
    .slice(0, topN)
    .map(({ _score, _tier, _proximityPct, ...rest }) => ({
      ...rest,
      proximityTier: _tier,
      proximityPct: _proximityPct,
    }));
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

      // Map đầy đủ stock object (không chỉ price) để sanitize dùng support/MA20
      const stocksMap = new Map<string, any>();
      stocks.forEach((s: any) => stocksMap.set(s.symbol, s));

      // --- Hard filter bằng code: tách riêng buy pool và sell pool ---
      const buyPool = getBuyPool(stocks, 40);
      const sellPool = getSellPool(stocks, 40);
      console.log(`[DeepRec] buyPool: ${buyPool.length} mã | sellPool: ${sellPool.length} mã (từ ${stocks.length} mã tổng)`);

      // Format compact — bổ sung proximityTier và proximityPct để AI biết ngữ cảnh entry
      const formatStocks = (list: any[]) => list
        .map((s: any) => {
          const tierLabel = s.proximityTier === "A"
            ? `Tier-A(${s.proximityPct?.toFixed(1) ?? "?"}%_from_support)`
            : s.proximityTier === "B"
              ? `Tier-B(${s.proximityPct?.toFixed(1) ?? "?"}%_from_support)`
              : `Tier-C(far_from_support${s.proximityPct ? `_${s.proximityPct.toFixed(1)}%` : ""})`;
          return `${s.symbol}|${s.price}|${s.volume}|${s.trend}|${s.rsi}|${s.macd}|${s.obvTrend}|${s.bbWidth}|${s.support}|${s.resistance}|${s.smcSignal}|${s.vsaSignal}|${tierLabel}`;
        })
        .join("\n");

      const buyText = formatStocks(buyPool);
      const sellText = formatStocks(sellPool);

      const newsText = news
        .slice(0, 10)
        .map((n: any) => `- ${n.title}: ${n.summary}`)
        .join("\n");

      const prompt = `Bạn là CIO của quỹ đầu tư hàng đầu Việt Nam. Chọn Top 10 MUA từ danh sách BUY POOL và Top 10 BÁN từ danh sách SELL POOL dưới đây.

⚠️ QUAN TRỌNG: Danh sách đã được lọc kỹ bằng code. CHỈ chọn từ đúng pool tương ứng.

🎯 ƯU TIÊN HÀNG ĐẦU: Chọn mã Tier-A trước (đang chạm/test support ≤3%), sau đó Tier-B (≤8%), cuối cùng mới Tier-C (xa support).

BUY POOL — ${buyPool.length} mã ĐÃ QUA BỘ LỌC (đã sắp xếp theo Tier A→B→C, trong cùng Tier theo tín hiệu kỹ thuật):
[Symbol|Price|Vol|Trend|RSI|MACD|OBV|BB|Support|Resistance|SMC|VSA|ProximityTier]
${buyText}

SELL POOL — ${sellPool.length} mã có tín hiệu bearish:
[Symbol|Price|Vol|Trend|RSI|MACD|OBV|BB|Support|Resistance|SMC|VSA|ProximityTier]
${sellText}

TIN VĨ MÔ (10 tin mới nhất):
${newsText}

TIÊU CHÍ MUA: VSA=SOS hoặc SMC=Bullish BOS/CHoCH, OBV tăng, RSI 45-65, ưu tiên mã Tier-A/B.
TIÊU CHÍ BÁN: VSA=SOW hoặc SMC=Bearish FVG, OBV giảm, RSI>70 hoặc thủng Support.

QUY TẮC ENTRY THEO TIER (BẮT BUỘC TUÂN THỦ):

📌 Tier-A (cách support ≤3%): MÃ ĐANG TEST SUPPORT — CƠ HỘI ENTRY TỐT NHẤT
  → entryPrice = giá support trong data (có thể vào ngay hoặc chờ xác nhận nến)
  → entryPointDesc: "🟢 Tier A — Entry tại Support [giá] (cách giá [x]%)"
  → Đây là mã ƯU TIÊN CHỌN VÀO topBuys — đang ở vùng cầu thực sự

📌 Tier-B (cách support 3-8%): GẦN SUPPORT — CHỜ PULLBACK NHỎ
  → entryPrice = giá support (chờ giá kéo về) hoặc MA20 nếu MA20 gần hơn support
  → entryPointDesc: "🟡 Tier B — Chờ pullback về Support [giá] (cách giá [x]%)"
  → Vẫn chọn được nếu tín hiệu kỹ thuật mạnh

📌 Tier-C (cách support >8%): XA SUPPORT — CHỈ DÙNG KHI MOMENTUM MẠNH
  → entryPrice = currentPrice (momentum entry, không chờ support)
  → entryPointDesc: "🔵 Momentum Entry — Vào tại giá hiện tại (support xa [x]%, cần momentum xác nhận)"
  → Chỉ chọn khi Tier A+B không đủ 10 mã, HOẶC tín hiệu SMC BOS/VSA SOS cực mạnh
  → PHẢI ghi rõ lý do momentum trong technicalReason

- stopLoss (số): Thấp hơn Support mạnh 2-3%. Đây là mức cắt lỗ cứng tuyệt đối.
- targetShort (ngắn hạn 1-4 tuần): Kháng cự gần nhất. HAI ĐIỀU KIỆN BẮT BUỘC ĐỒNG THỜI: (1) upsideShort = ((targetShort - entryPrice) / entryPrice * 100) ≥ 8%; (2) targetShort PHẢI > currentPrice × 1.05 (cách giá hiện tại ít nhất +5%). Nếu không tìm được kháng cự thỏa điều kiện → KHÔNG đưa mã này vào danh sách.
- targetMedium (trung hạn 1-3 tháng): Kháng cự trung hạn. HAI ĐIỀU KIỆN BẮT BUỘC ĐỒNG THỜI: (1) upsideMedium = ((targetMedium - entryPrice) / entryPrice * 100) ≥ 15%; (2) targetMedium PHẢI > currentPrice × 1.10 (cách giá hiện tại ít nhất +10%).
- targetLong (dài hạn 3-6 tháng): Mục tiêu toàn sóng / Fair Value. HAI ĐIỀU KIỆN BẮT BUỘC ĐỒNG THỜI: (1) upsideLong = ((targetLong - entryPrice) / entryPrice * 100) ≥ 25%; (2) targetLong PHẢI > currentPrice × 1.18 (cách giá hiện tại ít nhất +18%).
- Tất cả upside = TÍNH CHÍNH XÁC: ((target - entryPrice) / entryPrice * 100), làm tròn 1 chữ số thập phân.
- ⚠️ CẢNH BÁO: Nếu một mã KHÔNG có đủ dư địa tăng (target ngắn hạn < currentPrice × 1.05) → BỎ QUA mã đó, chọn mã khác trong pool có tiềm năng tăng thực sự.
- Tương tự cho topSells: sellPrice = điểm bán an toàn, downside tính từ sellPrice.

Trả về JSON hợp lệ (không có markdown):
{"topBuys":[{"symbol":"","currentPrice":0,"entryPrice":0,"entryPointDesc":"","stopLoss":0,"stopLossPoint":"","dcaPoint":"","scaleInPoint":"","targetShort":0,"upsideShort":0,"targetMedium":0,"upsideMedium":0,"targetLong":0,"upsideLong":0,"targetPrice":0,"upsidePercent":0,"proximityTier":"","technicalReason":"","fundamentalReason":""}],"topSells":[{"symbol":"","currentPrice":0,"sellPrice":0,"stopLoss":0,"targetShort":0,"downsideShort":0,"targetMedium":0,"downsideMedium":0,"targetLong":0,"downsideLong":0,"targetPrice":0,"downsidePercent":0,"technicalReason":"","fundamentalReason":""}]}

Ghi chú: targetPrice = targetMedium (alias), upsidePercent = upsideMedium (alias). Điền cùng giá trị.
Ghi chú: proximityTier trong JSON = "A", "B", hoặc "C" (lấy từ cột ProximityTier trong data).

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
2. ƯU TIÊN MÃ TIER-A trước. Tier-C chỉ chọn khi không đủ mã Tier-A và Tier-B.
3. Tier-A/B: entryPrice = support (PHẢI < currentPrice). Tier-C: entryPrice = currentPrice.
4. dcaPoint < entryPrice < scaleInPoint (thứ tự giá bắt buộc).
5. Tuyệt đối KHÔNG đưa mã có Trend giảm + LL mới vào topBuys.
6. fundamentalReason PHẢI có nội dung thực tế, KHÔNG được "N/A".
7. Tất cả giá là NUMBER. Chỉ trả về JSON thuần, không text thêm.
8. targetShort PHẢI > currentPrice × 1.05 (target ngắn hạn phải cách giá hiện tại ít nhất +5% để có giá trị giao dịch thực tiễn). Target quá gần giá hiện tại = vô nghĩa.
9. Nếu một mã không có đủ dư địa tăng thỏa điều kiện → LOẠI mã đó, chọn mã có tiềm năng tốt hơn trong pool.`;

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

      // --- Hard sanitize: fix entryPrice/sellPrice sai ngay tại đây ---
      analysis = sanitizeAnalysis(analysis, stocksMap);

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
            const stock = stocksMap.get(s.symbol as string);
            return {
              symbol: s.symbol,
              entryPrice: s.entryPrice,           // Đã được sanitize ở trên
              entryPointDesc: s.entryPointDesc,
              dcaPoint: s.dcaPoint,
              scaleInPoint: s.scaleInPoint,
              stopLossPoint: s.stopLossPoint,
              targetPrice: s.targetPrice,
              currentPrice: stock?.price || s.currentPrice,
              upsidePercent: s.upsidePercent,
              technicalReason: s.technicalReason,
              fundamentalReason: s.fundamentalReason,
            };
          }),
          topSells: (analysisData.topSells || []).map((s: Record<string, unknown>) => {
            const stock = stocksMap.get(s.symbol as string);
            return {
              symbol: s.symbol,
              sellPrice: s.sellPrice,             // Đã được sanitize ở trên
              targetPrice: s.targetPrice,
              currentPrice: stock?.price || s.currentPrice,
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

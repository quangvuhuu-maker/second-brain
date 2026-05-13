import { NextRequest, NextResponse } from "next/server";
import { geminiModel, generateContentWithFallback } from "@/lib/gemini";
import { fetchStockData, fetchMacroNews } from "@/lib/market-data";
import { adminDb } from "@/lib/firebase-admin";
import { safeParseJSON } from "@/lib/safe-parse-json";
import { FieldValue } from "firebase-admin/firestore";

const CACHE_DOC = "deep-recommendations";
const CACHE_COLLECTION = "ai_cache";

function isCacheToday(cachedAt: string | undefined): boolean {
  if (!cachedAt) return false;
  const cachedDate = new Date(cachedAt);
  const now = new Date();
  const vnOffset = 7 * 60;
  const cachedVN = new Date(cachedDate.getTime() + vnOffset * 60000);
  const nowVN = new Date(now.getTime() + vnOffset * 60000);
  return (
    cachedVN.getUTCFullYear() === nowVN.getUTCFullYear() &&
    cachedVN.getUTCMonth() === nowVN.getUTCMonth() &&
    cachedVN.getUTCDate() === nowVN.getUTCDate()
  );
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get("refresh") === "true";

    // Kiểm tra cache
    try {
      const cacheDoc = await adminDb.collection(CACHE_COLLECTION).doc(CACHE_DOC).get();
      if (cacheDoc.exists) {
        const cached = cacheDoc.data();
        const cachedAt = cached?.cachedAt?.toDate?.()?.toISOString() || cached?.cachedAt;
        if (!forceRefresh) {
          return NextResponse.json({
            success: true,
            data: cached?.data,
            cachedAt,
            fromCache: true,
          });
        }
      }
    } catch (cacheErr) {
      console.warn("Cache read failed:", cacheErr);
    }

    const stocks = await fetchStockData(forceRefresh);
    const news = await fetchMacroNews();

    const stocksMap = new Map();
    stocks.forEach((s: any) => stocksMap.set(s.symbol, s.price));

    const stocksText = stocks.map((s: any) => `${s.symbol}|${s.price}|${s.volume}|${s.trend}|${s.rsi}|${s.macd}|${s.obvTrend}|${s.bbWidth}`).join("\n");
    const newsText = news.map((n: any) => `- ${n.title} (${n.time}): ${n.summary}`).join("\n");

    const prompt = `
    Bạn là Giám đốc Đầu tư (CIO) của một quỹ đầu tư hàng đầu tại Việt Nam.
    Nhiệm vụ của bạn là phân tích rổ cổ phiếu siêu thanh khoản (150+ mã chọn lọc từ HSX, HNX, UPCOM) và tin tức vĩ mô mới nhất để chọn ra Top 10 cổ phiếu KHUYẾN NGHỊ MUA và Top 10 cổ phiếu KHUYẾN NGHỊ BÁN/CẮT LỖ.

    DỮ LIỆU CỔ PHIẾU (Đã được lọc sơ bộ):
    [Symbol | Price | Vol | Trend | RSI | MACD/Signal | OBV_Trend | BB_Width]
    ${stocksText}
    
    TIN TỨC VĨ MÔ & THỊ TRƯỜNG:
    ${newsText}
    
    TIÊU CHÍ LỌC (KHUYẾN NGHỊ MUA) - BẮT BUỘC ÁP DỤNG CHECKLIST "LỆNH MUA ĐIỂM 10":
    1. Cổ phiếu có dư địa tăng tốt, thuộc ngành nghề tiềm năng, vĩ mô ủng hộ.
    2. Kỹ thuật: RSI nằm trong khoảng 50-60 (đang lấy đà).
    3. Kỹ thuật: MACD cắt lên Signal Line (MACD > Signal).
    4. Kỹ thuật: OBV dốc lên (OBV_Trend = Up) cho thấy dòng tiền vào.
    5. Kỹ thuật: Bollinger Bands (BB) thắt nút cổ chai (BB_Width = Tight) chuẩn bị bứt phá.
    * BẮT BUỘC loại bỏ các mã bị phân kỳ âm RSI hoặc MACD cắt xuống (kể cả khi giá vẫn nằm trên MA20).

    TIÊU CHÍ LỌC (KHUYẾN NGHỊ BÁN):
    1. Cổ phiếu gãy trend, thủng MA20, vĩ mô không ủng hộ.
    2. Kỹ thuật: RSI quá mua (> 70) hoặc gãy (< 40).
    3. Kỹ thuật: MACD cắt xuống Signal Line (MACD < Signal).
    4. Kỹ thuật: OBV đi ngang hoặc dốc xuống (OBV_Trend = Flat/Down) thể hiện dòng tiền rút ra.

    YÊU CẦU ĐẦU RA: Trả về ĐÚNG định dạng JSON sau (không chứa markdown \`\`\`json):
    {
      "topBuys": [
        {
          "symbol": "Mã CP",
          "currentPrice": 0,
          "entryPrice": 0,
          "targetPrice": 0,
          "stopLossPrice": 0,
          "upsidePercent": 0,
          "technicalReason": "Phân tích kỹ thuật chi tiết...",
          "fundamentalReason": "Phân tích cơ bản/vĩ mô..."
        }
      ],
      "topSells": [
        {
          "symbol": "Mã CP",
          "currentPrice": 0,
          "sellPrice": 0,
          "targetPrice": 0,
          "downsidePercent": 0,
          "technicalReason": "Phân tích kỹ thuật chi tiết...",
          "fundamentalReason": "Phân tích cơ bản/vĩ mô..."
        }
      ]
    }
    Lưu ý: Bạn phải chọn ĐÚNG 10 mã Mua và ĐÚNG 10 mã Bán từ danh sách Cổ phiếu trên. Cung cấp cụ thể:
    - Mua: Vùng giá mua (entryPrice) BẮT BUỘC phải sát với Giá hiện tại (Price) trong dữ liệu (bằng hoặc lệch tối đa 1%), Chốt lời (targetPrice), Cắt lỗ (stopLossPrice).
    - Bán: Vùng giá bán/cắt lỗ (sellPrice) BẮT BUỘC phải sát với Giá hiện tại (Price) trong dữ liệu (bằng hoặc lệch tối đa 1%), Chờ mua lại ở (targetPrice).
    TUYỆT ĐỐI KHÔNG tự bịa ra giá khuyến nghị cách xa giá hiện tại. Ví dụ giá trong dữ liệu đang 20.0 thì entryPrice/sellPrice chỉ được dao động 19.8 - 20.2.
    `;

    // Fetch API keys from settings
    let apiKeys: string[] = [];
    try {
      const settingsDoc = await adminDb.collection("settings").doc("api_keys").get();
      if (settingsDoc.exists) {
        apiKeys = settingsDoc.data()?.geminiKeys || [];
      }
    } catch (e) {
      console.warn("Failed to fetch API keys from settings", e);
    }

    const requestContent = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      }
    };

    const result = await generateContentWithFallback(requestContent, apiKeys, "gemini-flash-latest");

    const responseText = result.response.text();
    const analysis = safeParseJSON(responseText);

    const now = new Date().toISOString();
    const vnDate = getVNDateString();

    // Lưu cache vào Firestore
    try {
      await adminDb.collection(CACHE_COLLECTION).doc(CACHE_DOC).set({
        data: analysis,
        cachedAt: FieldValue.serverTimestamp(),
      });
    } catch (cacheErr) {
      console.warn("Cache write failed:", cacheErr);
    }

    // Lưu log khuyến nghị vào Firestore
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
            targetPrice: s.targetPrice,
            stopLossPrice: s.stopLossPrice,
            currentPrice: actualPrice || s.currentPrice,
            upsidePercent: s.upsidePercent,
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
      console.warn("Log write failed:", logErr);
    }

    return NextResponse.json({
      success: true,
      data: analysis,
      cachedAt: now,
      fromCache: false,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Deep Analysis Error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

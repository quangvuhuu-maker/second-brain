import { NextRequest, NextResponse } from "next/server";
import { geminiModel, generateContentWithFallback } from "@/lib/gemini";
import { fetchStockData, fetchMacroNews } from "@/lib/market-data";
import { adminDb } from "@/lib/firebase-admin";
import { safeParseJSON } from "@/lib/safe-parse-json";
import { FieldValue } from "firebase-admin/firestore";

const CACHE_DOC = "deep-recommendations";
const CACHE_COLLECTION = "ai_cache";

// Tăng timeout cho Vercel serverless (cho phép chạy tới 60 giây)
export const maxDuration = 60;

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

    const stocksText = stocks.map((s: any) => `${s.symbol}|${s.price}|${s.volume}|${s.trend}|${s.rsi}|${s.macd}|${s.obvTrend}|${s.bbWidth}|${s.support}|${s.resistance}|${s.smcSignal}|${s.vsaSignal}`).join("\n");
    const newsText = news.map((n: any) => `- ${n.title} (${n.time}): ${n.summary}`).join("\n");

    const prompt = `
    Bạn là Giám đốc Đầu tư (CIO) của một quỹ đầu tư hàng đầu tại Việt Nam.
    Nhiệm vụ của bạn là phân tích rổ cổ phiếu siêu thanh khoản (150+ mã chọn lọc từ HSX, HNX, UPCOM) và tin tức vĩ mô mới nhất để chọn ra Top 10 cổ phiếu KHUYẾN NGHỊ MUA và Top 10 cổ phiếu KHUYẾN NGHỊ BÁN/CẮT LỖ.

    DỮ LIỆU CỔ PHIẾU (Đã được lọc sơ bộ):
    [Symbol | Price | Vol | Trend | RSI | MACD | OBV | BB | Support | Resistance | SMC_Signal | VSA_Signal]
    ${stocksText}
    
    TIN TỨC VĨ MÔ & THỊ TRƯỜNG:
    ${newsText}
    
    TIÊU CHÍ LỌC (KHUYẾN NGHỊ MUA) - BẮT BUỘC ÁP DỤNG CHECKLIST "LỆNH MUA SMC/VSA":
    1. Ưu tiên các mã có tín hiệu VSA "SOS (Sign of Strength)" hoặc SMC "Bullish FVG", "Bullish BOS/CHoCH".
    2. Cổ phiếu có dư địa tăng tốt, nằm gần vùng Hỗ trợ (Support), vĩ mô ủng hộ.
    3. Kỹ thuật: RSI nằm trong khoảng 50-60 (đang lấy đà) hoặc MACD cắt lên Signal Line.
    4. Kỹ thuật: OBV dốc lên (Up) cho thấy dòng tiền vào gom hàng.
    * BẮT BUỘC loại bỏ các mã bị phân kỳ âm RSI hoặc đang có tín hiệu phân phối VSA "SOW".

    TIÊU CHÍ LỌC (KHUYẾN NGHỊ BÁN):
    1. Ưu tiên các mã có tín hiệu VSA "SOW (Sign of Weakness)" hoặc SMC "Bearish FVG".
    2. Cổ phiếu gãy trend, thủng vùng Hỗ trợ (Support), vĩ mô không ủng hộ.
    3. Kỹ thuật: RSI quá mua (> 70) hoặc MACD cắt xuống Signal Line.
    4. Kỹ thuật: OBV đi ngang hoặc dốc xuống (Flat/Down) thể hiện dòng tiền phân phối rút ra.

    YÊU CẦU ĐẦU RA: Trả về ĐÚNG định dạng JSON sau (không chứa markdown \`\`\`json):
    {
      "topBuys": [
        {
          "symbol": "Mã CP",
          "currentPrice": 0,
          "entryPrice": 0,
          "entryPointDesc": "Mô tả điểm vào lệnh an toàn (gần giá hiện tại)",
          "dcaPoint": "Mô tả điểm trung bình giá (nếu thủng về hỗ trợ sâu hơn)",
          "scaleInPoint": "Mô tả điểm gia tăng (nếu break cản)",
          "stopLossPoint": "Mô tả điểm cắt lỗ cứng khi thủng hỗ trợ mạnh",
          "targetPrice": 0,
          "upsidePercent": 0,
          "technicalReason": "Phân tích SMC/VSA và Kỹ thuật chi tiết...",
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
          "technicalReason": "Phân tích SMC/VSA và Kỹ thuật chi tiết...",
          "fundamentalReason": "Phân tích cơ bản/vĩ mô..."
        }
      ]
    }
    Lưu ý: Bạn phải chọn ĐÚNG 10 mã Mua và ĐÚNG 10 mã Bán từ danh sách Cổ phiếu trên. 
    Trường "entryPrice" và "sellPrice" phải là KIỂU SỐ (NUMBER) BẮT BUỘC sát với Giá hiện tại trong dữ liệu (bằng hoặc lệch tối đa 1%) để hệ thống tracking. Các trường entryPointDesc, dcaPoint, v.v. dùng để cung cấp chi tiết bằng Text.
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

import { NextRequest, NextResponse } from "next/server";
import { generateAIContent, APIKeys } from "@/lib/ai-orchestrator";
import { fetchStockData, fetchMacroNews, fetchSingleStock } from "@/lib/market-data";
import { adminDb } from "@/lib/firebase-admin";
import { safeParseJSON } from "@/lib/safe-parse-json";
import { FieldValue } from "firebase-admin/firestore";

// Tăng timeout cho Vercel serverless (cho phép chạy tới 60 giây)
export const maxDuration = 60;

const CACHE_COLLECTION = "ai_cache";

function getVNDateString(): string {
  const now = new Date();
  const vnOffset = 7 * 60;
  const vnDate = new Date(now.getTime() + vnOffset * 60000);
  return vnDate.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol")?.toUpperCase().trim();
    const forceRefresh = searchParams.get("refresh") === "true";

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: "Thiếu mã cổ phiếu. Vui lòng truyền ?symbol=VCB" },
        { status: 400 }
      );
    }

    const vnDate = getVNDateString();
    const cacheDocId = `stock-evaluate-${symbol}-${vnDate}`;

    // Kiểm tra cache trong ngày (trả về ngay nếu đã đánh giá rồi)
    if (!forceRefresh) {
      try {
        const cacheDoc = await adminDb.collection(CACHE_COLLECTION).doc(cacheDocId).get();
        if (cacheDoc.exists) {
          const cached = cacheDoc.data();
          return NextResponse.json({
            success: true,
            data: cached?.evaluation,
            stockData: cached?.stockData,
            fromCache: true,
            cachedAt: cached?.cachedAt?.toDate?.()?.toISOString() || cached?.cachedAt,
          });
        }
      } catch (cacheErr) {
        console.warn("Cache read failed:", cacheErr);
      }
    }

    // Lấy tin tức vĩ mô (luôn cần)
    const news = await fetchMacroNews();

    // Tìm cổ phiếu: ưu tiên từ cache danh sách 150+, nếu không có thì fetch riêng lẻ
    let stockData;
    try {
      const stocks = await fetchStockData(false);
      stockData = stocks.find((s: any) => s.symbol === symbol);
    } catch (e) {
      console.warn("Failed to fetch stock list, will try single stock fetch");
    }

    // Fallback: Fetch riêng lẻ cho mã không nằm trong danh sách
    if (!stockData) {
      try {
        stockData = await fetchSingleStock(symbol);
      } catch (singleErr: unknown) {
        const msg = singleErr instanceof Error ? singleErr.message : "Mã cổ phiếu không hợp lệ hoặc đã bị hủy niêm yết.";
        return NextResponse.json(
          { success: false, error: msg },
          { status: 404 }
        );
      }
    }

    const newsText = news.slice(0, 5).map((n: any) => `- ${n.title}: ${n.summary}`).join("\n");

    // Fetch API keys song song với việc chuẩn bị prompt
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
      console.warn("Failed to fetch API keys from settings", e);
    }

    const prompt = `
    Bạn là chuyên gia phân tích chứng khoán cao cấp tại Việt Nam, sử dụng phương pháp Smart Money Concept (SMC) và Volume Spread Analysis (VSA).
    Đánh giá NGẮN GỌN nhưng SẮC BÉN cổ phiếu ${symbol}:

    DỮ LIỆU: Giá=${stockData.price} | Δ=${stockData.changePercent}% | Vol=${stockData.volume} | MA20=${stockData.movingAverage20} | Trend=${stockData.trend} | RSI=${stockData.rsi} | MACD=${stockData.macd} | OBV=${stockData.obvTrend} | BB=${stockData.bbWidth} | Support=${stockData.support || 'N/A'} | Resistance=${stockData.resistance || 'N/A'} | SMC=${stockData.smcSignal || 'None'} | VSA=${stockData.vsaSignal || 'None'}

    VĨ MÔ: ${newsText}

    Trả về ĐÚNG JSON (không markdown):
    {
      "symbol": "${symbol}",
      "overallScore": 0,
      "overallRating": "Mua mạnh / Mua / Trung lập / Bán / Bán mạnh",
      "priceTarget": 0,
      "stopLoss": 0,
      "technicalAnalysis": {
        "trendScore": 0,
        "trendComment": "...",
        "momentumScore": 0,
        "momentumComment": "...",
        "volumeScore": 0,
        "volumeComment": "...",
        "smcComment": "...",
        "vsaComment": "..."
      },
      "fundamentalAnalysis": {
        "macroScore": 0,
        "macroComment": "...",
        "sectorComment": "..."
      },
      "tradingPlan": {
        "entryPoint": "...",
        "dcaPoint": "...",
        "scaleInPoint": "...",
        "stopLossPoint": "...",
        "takeProfitPoint": "..."
      },
      "risks": ["..."],
      "summary": "..."
    }
    Điểm 0-100. priceTarget/stopLoss là SỐ (VND). Trả lời ngắn gọn, đi thẳng vào trọng tâm.
    `;

    const requestContent = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 }, // Tắt thinking để đảm bảo xong trong 60s Vercel
      }
    };

    const result = await generateAIContent(requestContent, apiKeys, "gemini-2.5-flash");
    const responseText = result.response.text();
    const evaluation = safeParseJSON(responseText);

    const stockDataResponse = {
      symbol: stockData.symbol,
      price: stockData.price,
      changePercent: stockData.changePercent,
      volume: stockData.volume,
      trend: stockData.trend,
      rsi: stockData.rsi,
      macd: stockData.macd,
      obvTrend: stockData.obvTrend,
      bbWidth: stockData.bbWidth,
      support: stockData.support,
      resistance: stockData.resistance,
      smcSignal: stockData.smcSignal,
      vsaSignal: stockData.vsaSignal,
    };

    // Lưu cache vào Firestore để lần sau trả về tức thì
    try {
      await adminDb.collection(CACHE_COLLECTION).doc(cacheDocId).set({
        evaluation,
        stockData: stockDataResponse,
        cachedAt: FieldValue.serverTimestamp(),
      });
    } catch (cacheErr) {
      console.warn("Cache write failed:", cacheErr);
    }

    return NextResponse.json({
      success: true,
      data: evaluation,
      stockData: stockDataResponse,
      fromCache: false,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Stock Evaluate Error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

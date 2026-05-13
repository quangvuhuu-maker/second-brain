import { NextRequest, NextResponse } from "next/server";
import { generateContentWithFallback } from "@/lib/gemini";
import { fetchStockData, fetchMacroNews } from "@/lib/market-data";
import { adminDb } from "@/lib/firebase-admin";
import { safeParseJSON } from "@/lib/safe-parse-json";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get("symbol")?.toUpperCase().trim();

    if (!symbol) {
      return NextResponse.json(
        { success: false, error: "Thiếu mã cổ phiếu. Vui lòng truyền ?symbol=VCB" },
        { status: 400 }
      );
    }

    // Lấy dữ liệu thị trường từ Backend Python
    const stocks = await fetchStockData(false);
    const news = await fetchMacroNews();

    // Tìm cổ phiếu trong danh sách
    const stockData = stocks.find((s: any) => s.symbol === symbol);

    if (!stockData) {
      return NextResponse.json(
        { success: false, error: `Không tìm thấy mã cổ phiếu "${symbol}" trong danh sách theo dõi. Vui lòng thử mã khác.` },
        { status: 404 }
      );
    }

    const newsText = news.slice(0, 5).map((n: any) => `- ${n.title}: ${n.summary}`).join("\n");

    const prompt = `
    Bạn là chuyên gia phân tích chứng khoán cao cấp tại Việt Nam, sử dụng phương pháp Smart Money Concept (SMC) và Volume Spread Analysis (VSA).
    
    Hãy ĐÁNH GIÁ CHI TIẾT cổ phiếu ${symbol} dựa trên dữ liệu kỹ thuật và vĩ mô sau:

    === DỮ LIỆU KỸ THUẬT ===
    Mã: ${stockData.symbol}
    Giá hiện tại: ${stockData.price}
    Thay đổi: ${stockData.changePercent}%
    Khối lượng: ${stockData.volume}
    MA20: ${stockData.movingAverage20}
    Xu hướng: ${stockData.trend}
    RSI (14): ${stockData.rsi}
    MACD/Signal: ${stockData.macd}
    OBV Trend: ${stockData.obvTrend}
    Bollinger Bands: ${stockData.bbWidth}
    Hỗ trợ (20D Low): ${stockData.support || 'N/A'}
    Kháng cự (20D High): ${stockData.resistance || 'N/A'}
    SMC Signal: ${stockData.smcSignal || 'None'}
    VSA Signal: ${stockData.vsaSignal || 'None'}

    === TIN TỨC VĨ MÔ GẦN NHẤT ===
    ${newsText}

    YÊU CẦU: Hãy đánh giá cổ phiếu này và trả về ĐÚNG JSON format sau (không markdown):
    {
      "symbol": "${symbol}",
      "overallScore": 0,
      "overallRating": "Mua mạnh / Mua / Trung lập / Bán / Bán mạnh",
      "priceTarget": 0,
      "stopLoss": 0,
      "technicalAnalysis": {
        "trendScore": 0,
        "trendComment": "Nhận xét xu hướng...",
        "momentumScore": 0,
        "momentumComment": "Nhận xét RSI, MACD...",
        "volumeScore": 0,
        "volumeComment": "Nhận xét OBV, Volume...",
        "smcComment": "Phân tích SMC chi tiết (FVG, BOS, CHoCH, Support/Resistance)...",
        "vsaComment": "Phân tích VSA chi tiết (SOS/SOW, Spread, Volume Profile)..."
      },
      "fundamentalAnalysis": {
        "macroScore": 0,
        "macroComment": "Tác động vĩ mô đến cổ phiếu này...",
        "sectorComment": "Nhận xét ngành..."
      },
      "tradingPlan": {
        "entryPoint": "Mô tả điểm vào lệnh tốt nhất...",
        "dcaPoint": "Mô tả điểm trung bình giá nếu giá giảm...",
        "scaleInPoint": "Mô tả điểm mua gia tăng nếu breakout...",
        "stopLossPoint": "Mô tả mức cắt lỗ cứng...",
        "takeProfitPoint": "Mô tả mức chốt lời..."
      },
      "risks": ["Rủi ro 1...", "Rủi ro 2..."],
      "summary": "Tóm tắt ngắn gọn quan điểm đầu tư trong 2-3 câu..."
    }

    Quy tắc chấm điểm:
    - overallScore: Thang 0-100 (0 = cực kỳ tiêu cực, 100 = cực kỳ tích cực)
    - trendScore, momentumScore, volumeScore, macroScore: Thang 0-100
    - priceTarget: Mục tiêu giá trong 1-3 tháng (KIỂU SỐ, đơn vị VND)
    - stopLoss: Mức cắt lỗ khuyến nghị (KIỂU SỐ, đơn vị VND)
    `;

    // Fetch API keys
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
    const evaluation = safeParseJSON(responseText);

    return NextResponse.json({
      success: true,
      data: evaluation,
      stockData: {
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
      }
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

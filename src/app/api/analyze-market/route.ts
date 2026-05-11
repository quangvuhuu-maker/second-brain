import { NextResponse } from "next/server";
import { geminiModel } from "@/lib/gemini";
import { fetchStockData, fetchMacroNews } from "@/lib/market-data";

export async function GET() {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ success: false, error: "Missing API Key" }, { status: 500 });
    }

    const stocks = await fetchStockData();
    const news = await fetchMacroNews();

    const prompt = `
    Bạn là một chuyên gia phân tích chứng khoán Việt Nam xuất sắc.
    Dưới đây là dữ liệu thị trường hiện tại:
    
    CỔ PHIẾU:
    ${JSON.stringify(stocks, null, 2)}
    
    TIN TỨC VĨ MÔ:
    ${JSON.stringify(news, null, 2)}
    
    Dựa vào dữ liệu trên, hãy phân tích và xuất ĐÚNG định dạng JSON. Chỉ trả về JSON, không kèm markdown code block (như \`\`\`json).
    Cấu trúc JSON bắt buộc:
    {
      "marketTrend": "Bullish" | "Bearish" | "Sideway",
      "trendReason": "Lý do ngắn gọn",
      "macroImpact": "Positive" | "Negative" | "Neutral",
      "macroReason": "Lý do ngắn gọn",
      "aiSuggestion": "Buy" | "Sell" | "Hold",
      "aiReasoning": "Lời khuyên chiến lược ngắn gọn",
      "strongStocks": [
        { "symbol": "Mã CP", "price": 0, "changePercent": 0, "reason": "Lý do ngắn gọn" }
      ],
      "weakStocks": [
        { "symbol": "Mã CP", "price": 0, "changePercent": 0, "reason": "Lý do ngắn gọn" }
      ],
      "newsRecap": [
        { "title": "Tiêu đề", "summary": "Tóm tắt tác động thực tế", "time": "Thời gian" }
      ]
    }
    `;

    const result = await geminiModel.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const responseText = result.response.text();
    const analysis = JSON.parse(responseText);

    return NextResponse.json({ success: true, data: analysis });
  } catch (error: any) {
    console.error("Market Analysis Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

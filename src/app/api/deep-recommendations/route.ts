import { NextResponse } from "next/server";
import { geminiModel } from "@/lib/gemini";
import { fetchStockData, fetchMacroNews } from "@/lib/market-data";

export async function GET() {
  try {
    const stocks = await fetchStockData();
    const news = await fetchMacroNews();

    const prompt = `
    Bạn là Giám đốc Đầu tư (CIO) của một quỹ đầu tư hàng đầu tại Việt Nam.
    Nhiệm vụ của bạn là phân tích rổ cổ phiếu siêu thanh khoản (150+ mã chọn lọc từ HSX, HNX, UPCOM) và tin tức vĩ mô mới nhất để chọn ra Top 10 cổ phiếu KHUYẾN NGHỊ MUA và Top 10 cổ phiếu KHUYẾN NGHỊ BÁN/CẮT LỖ.

    DỮ LIỆU CỔ PHIẾU (Đã được lọc sơ bộ loại bỏ thanh khoản thấp):
    ${JSON.stringify(stocks, null, 2)}
    
    TIN TỨC VĨ MÔ & THỊ TRƯỜNG:
    ${JSON.stringify(news, null, 2)}
    
    TIÊU CHÍ LỌC (KHUYẾN NGHỊ MUA):
    1. Cổ phiếu có dư địa tăng tốt (Upside lớn).
    2. Đang trong giai đoạn tích lũy nền (sideway) hoặc chuẩn bị break out (Dựa vào Price và MA20).
    3. Thuộc ngành nghề có tiềm năng tăng trưởng, hưởng lợi từ các tin tức vĩ mô.

    TIÊU CHÍ LỌC (KHUYẾN NGHỊ BÁN):
    1. Cổ phiếu gãy trend, thủng MA20.
    2. Ngành nghề đang gặp khó khăn, vĩ mô không ủng hộ.
    3. Rủi ro giảm giá (Downside) lớn.

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
    - Mua: Vùng giá mua (entryPrice), Chốt lời (targetPrice), Cắt lỗ (stopLossPrice).
    - Bán: Vùng giá bán/cắt lỗ (sellPrice), Chờ mua lại ở (targetPrice).
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
    console.error("Deep Analysis Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

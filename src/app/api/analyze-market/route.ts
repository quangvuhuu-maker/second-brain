import { NextRequest, NextResponse } from "next/server";
import { geminiModel, generateContentWithFallback } from "@/lib/gemini";
import { fetchStockData, fetchMacroNews } from "@/lib/market-data";
import { adminDb } from "@/lib/firebase-admin";
import { safeParseJSON } from "@/lib/safe-parse-json";
import { FieldValue } from "firebase-admin/firestore";

const CACHE_DOC = "market-analysis";
const CACHE_COLLECTION = "ai_cache";

/**
 * Kiểm tra cache có phải hôm nay không (múi giờ Việt Nam UTC+7)
 */
function isCacheToday(cachedAt: string | undefined): boolean {
  if (!cachedAt) return false;
  const cachedDate = new Date(cachedAt);
  const now = new Date();
  // Chuyển sang timezone VN (UTC+7)
  const vnOffset = 7 * 60;
  const cachedVN = new Date(cachedDate.getTime() + vnOffset * 60000);
  const nowVN = new Date(now.getTime() + vnOffset * 60000);
  return (
    cachedVN.getUTCFullYear() === nowVN.getUTCFullYear() &&
    cachedVN.getUTCMonth() === nowVN.getUTCMonth() &&
    cachedVN.getUTCDate() === nowVN.getUTCDate()
  );
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
        // Trả cache nếu không ép refresh
        if (!forceRefresh && isCacheToday(cachedAt)) {
          return NextResponse.json({
            success: true,
            data: cached?.data,
            cachedAt,
            fromCache: true,
          });
        }
        // Nếu cache cũ nhưng không ép refresh, vẫn trả cache cũ
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

    const stocksText = stocks.map((s: any) => `${s.symbol}|${s.price}|${s.changePercent}%|Vol:${s.volume}|MA20:${s.movingAverage20}|${s.trend}`).join("\n");
    const newsText = news.map((n: any) => `- ${n.title} (${n.time}): ${n.summary}`).join("\n");

    const prompt = `
    Bạn là một chuyên gia phân tích chứng khoán Việt Nam xuất sắc.
    Dưới đây là dữ liệu thị trường hiện tại:
    
    CỔ PHIẾU:
    [Symbol | Price | Change% | Volume | MA20 | Trend]
    ${stocksText}
    
    TIN TỨC VĨ MÔ:
    ${newsText}
    
    Dựa vào dữ liệu trên, hãy phân tích và xuất ĐÚNG định dạng JSON. Chỉ trả về JSON, không kèm markdown code block (như \`\`\`json).
    
    YÊU CẦU QUAN TRỌNG:
    - trendReason: Phân tích CHI TIẾT xu hướng thị trường (ít nhất 2-3 câu, bao gồm các chỉ số cụ thể)
    - macroReason: Phân tích CHI TIẾT tác động vĩ mô (ít nhất 2-3 câu, đề cập đến các sự kiện cụ thể)
    - aiReasoning: Giải thích CHI TIẾT chiến lược đầu tư (ít nhất 2-3 câu, nêu rõ lý do và điều kiện)
    
    Cấu trúc JSON bắt buộc:
    {
      "marketTrend": "Bullish" | "Bearish" | "Sideway",
      "trendReason": "Phân tích chi tiết xu hướng (2-3 câu)...",
      "macroImpact": "Positive" | "Negative" | "Neutral",
      "macroReason": "Phân tích chi tiết tác động vĩ mô (2-3 câu)...",
      "aiSuggestion": "Buy" | "Sell" | "Hold",
      "aiReasoning": "Chiến lược đầu tư chi tiết (2-3 câu)...",
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

    // Lưu cache vào Firestore
    try {
      await adminDb.collection(CACHE_COLLECTION).doc(CACHE_DOC).set({
        data: analysis,
        cachedAt: FieldValue.serverTimestamp(),
      });
    } catch (cacheErr) {
      console.warn("Cache write failed:", cacheErr);
    }

    const now = new Date().toISOString();
    return NextResponse.json({
      success: true,
      data: analysis,
      cachedAt: now,
      fromCache: false,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Market Analysis Error:", message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

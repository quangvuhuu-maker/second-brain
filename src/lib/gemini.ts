import { GoogleGenerativeAI, GenerateContentRequest } from "@google/generative-ai";

// Ensure the API key is available
const apiKey = process.env.GEMINI_API_KEY || "";

// Initialize the Google Generative AI client
const genAI = new GoogleGenerativeAI(apiKey);

// Use the standard high-quality model
export const geminiModel = genAI.getGenerativeModel({
  model: "gemini-flash-latest", // Revert về model mặc định vì 2.0 có limit = 0 trên free tier
});

/**
 * Hàm hỗ trợ fallback (xoay vòng API key) khi gặp lỗi 429 Quota Exceeded.
 * @param request Request truyền vào hàm generateContent
 * @param keys Mảng các API Keys lấy từ DB (hoặc ENV)
 * @param modelName Tên model (mặc định gemini-flash-latest)
 */
export async function generateContentWithFallback(
  request: string | GenerateContentRequest,
  keys: string[],
  modelName: string = "gemini-flash-latest"
) {
  // Đảm bảo luôn có ít nhất 1 key từ env nếu mảng truyền vào rỗng
  const apiKeysToTry = keys && keys.length > 0 ? keys : [process.env.GEMINI_API_KEY || ""];

  let lastError: any;

  for (const key of apiKeysToTry) {
    if (!key) continue;
    
    try {
      const client = new GoogleGenerativeAI(key);
      const model = client.getGenerativeModel({ model: modelName });
      
      const result = await model.generateContent(request);
      return result;
    } catch (error: any) {
      console.warn(`API Key rotation: Key failed (thử tiếp theo nếu có). Error:`, error.message);
      lastError = error;
      
      // Nếu lỗi 429 hoặc báo quota exceeded thì mới đổi key, các lỗi khác (như sai cú pháp) thì quăng lỗi luôn.
      const msg = error.message?.toLowerCase() || "";
      if (
        msg.includes("429") || 
        msg.includes("quota") || 
        msg.includes("exhausted") || 
        msg.includes("too many requests") ||
        msg.includes("api key not valid")
      ) {
        continue;
      }
      
      throw error;
    }
  }

  throw new Error(`Tất cả API keys đều thất bại. Lỗi cuối cùng: ${lastError?.message || 'Unknown'}`);
}

export default genAI;

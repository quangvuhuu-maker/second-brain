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
  const MAX_RETRIES = 3;
  const BASE_DELAY = 1000;

  for (const key of apiKeysToTry) {
    if (!key) continue;
    
    let retries = 0;
    while (retries <= MAX_RETRIES) {
      try {
        const client = new GoogleGenerativeAI(key);
        const model = client.getGenerativeModel({ model: modelName });
        
        const result = await model.generateContent(request);
        return result;
      } catch (error: any) {
        lastError = error;
        const msg = error.message?.toLowerCase() || "";
        
        // Nếu lỗi 503, 500, 502 thì retry với exponential backoff trên CÙNG 1 KEY
        if (msg.includes("503") || msg.includes("500") || msg.includes("502") || msg.includes("504") || msg.includes("fetch failed")) {
          console.warn(`[Gemini] Server error (50x/Network). Retrying ${retries + 1}/${MAX_RETRIES} after delay... Error:`, error.message);
          if (retries < MAX_RETRIES) {
            await new Promise(resolve => setTimeout(resolve, BASE_DELAY * Math.pow(2, retries)));
            retries++;
            continue; // Thử lại vòng lặp while
          }
        }
        
        console.warn(`API Key rotation: Key failed (thử tiếp theo nếu có). Error:`, error.message);
        
        // Nếu lỗi 429 hoặc báo quota exceeded thì break khỏi vòng lặp while, nhảy sang key tiếp theo
        if (
          msg.includes("429") || 
          msg.includes("quota") || 
          msg.includes("exhausted") || 
          msg.includes("too many requests") ||
          msg.includes("api key not valid")
        ) {
          break; // Break ra khỏi while loop, tiếp tục for loop (key tiếp theo)
        }
        
        // Các lỗi khác (như sai cú pháp) thì quăng lỗi luôn.
        throw error;
      }
    }
  }

  throw new Error(`Tất cả API keys đều thất bại. Lỗi cuối cùng: ${lastError?.message || 'Unknown'}`);
}

export default genAI;

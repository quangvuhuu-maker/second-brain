import { GoogleGenerativeAI, GenerateContentRequest } from "@google/generative-ai";

// Ensure the API key is available
const apiKey = process.env.GEMINI_API_KEY || "";

// Initialize the Google Generative AI client
const genAI = new GoogleGenerativeAI(apiKey);

// Use the standard high-quality model
export const geminiModel = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
});

/**
 * Đọc mảng API keys từ env GEMINI_API_KEYS (comma-separated) hoặc fallback về GEMINI_API_KEY.
 * Dùng làm default pool khi không có keys từ DB.
 */
export function getEnvGeminiKeys(): string[] {
  const poolEnv = process.env.GEMINI_API_KEYS;
  if (poolEnv) {
    return poolEnv.split(",").map((k) => k.trim()).filter(Boolean);
  }
  const single = process.env.GEMINI_API_KEY;
  return single ? [single] : [];
}

/**
 * Hàm hỗ trợ fallback (xoay vòng API key) khi gặp lỗi 429 Quota Exceeded
 * và tự động thử lại (Exponential Backoff) khi gặp lỗi 503 High Demand.
 *
 * Cải tiến so với bản cũ:
 * - Fix bug: sau MAX_RETRIES phải throw lỗi, không thoát im lặng
 * - MAX_RETRIES = 2 (tổng delay tối đa ~3s), tiết kiệm thời gian trong giới hạn 60s Vercel
 * - Đọc keys từ GEMINI_API_KEYS env nếu mảng truyền vào rỗng
 *
 * @param request Request truyền vào hàm generateContent
 * @param keys Mảng các API Keys lấy từ DB (hoặc ENV)
 * @param modelName Tên model
 */
export async function generateContentWithFallback(
  request: string | GenerateContentRequest,
  keys: string[],
  modelName: string = "gemini-2.5-flash"
) {
  // Ưu tiên keys từ DB, nếu rỗng thì lấy từ env pool
  const apiKeysToTry = keys && keys.length > 0 ? keys : getEnvGeminiKeys();

  if (apiKeysToTry.length === 0) {
    throw new Error("Không có Gemini API key nào được cấu hình.");
  }

  let lastError: any;
  const MAX_RETRIES = 2; // giảm từ 3 → 2 để tiết kiệm thời gian
  const BASE_DELAY = 800; // giảm từ 1000 → 800ms

  for (let keyIndex = 0; keyIndex < apiKeysToTry.length; keyIndex++) {
    const key = apiKeysToTry[keyIndex];
    if (!key) continue;

    console.log(`[Gemini] Thử key ${keyIndex + 1}/${apiKeysToTry.length}...`);

    for (let retries = 0; retries <= MAX_RETRIES; retries++) {
      try {
        const client = new GoogleGenerativeAI(key);
        const model = client.getGenerativeModel({ model: modelName });

        const result = await model.generateContent(request);
        console.log(`[Gemini] ✅ Thành công với key ${keyIndex + 1}, retry #${retries}`);
        return result;
      } catch (error: any) {
        lastError = error;
        const msg = error.message?.toLowerCase() || "";

        // Lỗi 5xx hoặc network → retry exponential backoff trên CÙNG 1 KEY
        const isServerError =
          msg.includes("503") ||
          msg.includes("500") ||
          msg.includes("502") ||
          msg.includes("504") ||
          msg.includes("fetch failed") ||
          msg.includes("high demand") ||
          msg.includes("overloaded");

        if (isServerError) {
          if (retries < MAX_RETRIES) {
            const delay = BASE_DELAY * Math.pow(2, retries);
            console.warn(`[Gemini] Server error (5xx). Retry ${retries + 1}/${MAX_RETRIES} sau ${delay}ms...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue; // retry while
          } else {
            // Hết MAX_RETRIES → nhảy sang key tiếp theo
            console.warn(`[Gemini] Key ${keyIndex + 1} hết retry (${MAX_RETRIES} lần), thử key tiếp theo...`);
            lastError = error;
            break; // break while → next key
          }
        }

        // Lỗi quota / 429 → nhảy sang key tiếp theo ngay
        const isQuotaError =
          msg.includes("429") ||
          msg.includes("quota") ||
          msg.includes("exhausted") ||
          msg.includes("too many requests") ||
          msg.includes("rate limit") ||
          msg.includes("resource_exhausted");

        if (isQuotaError) {
          console.warn(`[Gemini] Key ${keyIndex + 1} quota exceeded. Chuyển sang key tiếp theo...`);
          lastError = error;
          break; // break while → next key
        }

        // API key không hợp lệ → nhảy sang key tiếp theo
        if (msg.includes("api key not valid") || msg.includes("invalid api key")) {
          console.warn(`[Gemini] Key ${keyIndex + 1} không hợp lệ. Chuyển sang key tiếp theo...`);
          lastError = error;
          break;
        }

        // Model không tồn tại (404) → log rõ và throw ngay với message dễ hiểu
        if (msg.includes("404") || msg.includes("not found") || msg.includes("no longer available")) {
          console.error(`[Gemini] ❌ Model "${modelName}" không tồn tại hoặc đã bị deprecated. Vui lòng cập nhật tên model.`);
          throw new Error(`Model "${modelName}" không khả dụng (404). Vui lòng cập nhật tên model trong code.`);
        }

        // Các lỗi khác (cú pháp, content policy...) → throw ngay
        console.error(`[Gemini] Lỗi không xử lý được:`, error.message);
        throw error;
      }
    }
  }

  throw new Error(`Tất cả ${apiKeysToTry.length} Gemini API keys đều thất bại. Lỗi cuối: ${lastError?.message || "Unknown"}`);
}

export default genAI;

import { generateContentWithFallback, getEnvGeminiKeys } from "./gemini";

// Mở rộng request object để hỗ trợ cấu trúc của Gemini
export interface AIRequest {
  contents: {
    role: string; // "user" | "model"
    parts: { text: string }[];
  }[];
  generationConfig?: {
    responseMimeType?: string;
  };
}

export interface APIKeys {
  deepseekKeys?: string[];
  geminiKeys?: string[];
}

/**
 * Sinh nội dung AI với Gemini.
 * DeepSeek bị tắt tạm thời (chưa có token). Khi có token DeepSeek thì bỏ comment lại.
 *
 * Thứ tự ưu tiên keys:
 * 1. Keys từ Firestore DB (apiKeys.geminiKeys)
 * 2. Keys từ GEMINI_API_KEYS env (comma-separated pool)
 * 3. GEMINI_API_KEY env (single key fallback)
 */
export async function generateAIContent(
  request: AIRequest,
  apiKeys: APIKeys,
  geminiFallbackModel: string = "gemini-2.5-flash-preview-05-20"
) {
  // Merge keys: DB keys có ưu tiên cao hơn, sau đó bổ sung bằng env keys
  const dbKeys = apiKeys.geminiKeys || [];
  const envKeys = getEnvGeminiKeys();

  // Loại duplicate: DB keys trước, rồi thêm env keys chưa có trong DB
  const mergedKeys = [...dbKeys, ...envKeys.filter((k) => !dbKeys.includes(k))];

  console.log(`[AI] Sử dụng Gemini với ${mergedKeys.length} key(s). Model: ${geminiFallbackModel}`);

  return generateContentWithFallback(request as any, mergedKeys, geminiFallbackModel);
}

import OpenAI from "openai";
import { generateContentWithFallback } from "./gemini";

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

export async function generateAIContent(
  request: AIRequest,
  apiKeys: APIKeys,
  geminiFallbackModel: string = "gemini-flash-latest"
) {
  // Lấy key cho DeepSeek (ưu tiên từ database, nếu không có thì lấy từ env)
  let deepseekKey = process.env.DEEPSEEK_API_KEY || "";
  if (apiKeys.deepseekKeys && apiKeys.deepseekKeys.length > 0) {
    deepseekKey = apiKeys.deepseekKeys[0]; 
  }

  if (deepseekKey) {
    try {
      const openai = new OpenAI({
        baseURL: "https://api.deepseek.com",
        apiKey: deepseekKey,
      });

      // Convert cấu trúc prompt từ kiểu của Gemini sang kiểu của OpenAI (DeepSeek)
      const messages: any[] = request.contents.map((c) => ({
        role: c.role === "model" ? "assistant" : "user",
        content: c.parts.map((p) => p.text).join("\n"),
      }));

      const isJson = request.generationConfig?.responseMimeType === "application/json";

      const completion = await openai.chat.completions.create({
        model: "deepseek-chat",
        messages: messages,
        response_format: isJson ? { type: "json_object" } : undefined,
      });

      const responseText = completion.choices[0]?.message?.content || "";

      console.log("[AI] Successfully generated content using DeepSeek");

      // Trả về cấu trúc giả lập của Gemini để tương thích ngược với code cũ
      return {
        response: {
          text: () => responseText,
        },
      };
    } catch (error: any) {
      console.warn("[AI] DeepSeek failed, falling back to Gemini. Error:", error.message);
    }
  } else {
    console.warn("[AI] No DeepSeek API key found, skipping directly to Gemini fallback.");
  }

  // Chạy fallback Gemini nếu DeepSeek lỗi hoặc không có key
  console.log("[AI] Running fallback with Gemini...");
  return generateContentWithFallback(request as any, apiKeys.geminiKeys || [], geminiFallbackModel);
}

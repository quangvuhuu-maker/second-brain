/**
 * Safely parse JSON from Gemini response.
 * Gemini sometimes adds extra text/markdown around JSON output.
 */
export function safeParseJSON(text: string): unknown {
  // Thử parse trực tiếp
  try {
    return JSON.parse(text);
  } catch {
    // Bỏ markdown fences nếu có
  }

  // Thử bỏ markdown code block
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // Tiếp tục thử cách khác
    }
  }

  // Tìm JSON object đầu tiên { ... }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(text.slice(firstBrace, lastBrace + 1));
    } catch {
      // Tiếp tục
    }
  }

  // Tìm JSON array đầu tiên [ ... ]
  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(text.slice(firstBracket, lastBracket + 1));
    } catch {
      // Không parse được
    }
  }

  throw new Error("Không thể parse JSON từ Gemini response");
}

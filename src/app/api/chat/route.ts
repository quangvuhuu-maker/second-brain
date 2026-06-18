import { NextResponse } from "next/server";
import { geminiModel, generateContentWithFallback } from "@/lib/gemini";
import { adminDb } from "@/lib/firebase-admin";

export async function POST(req: Request) {
  try {
    const { messages, prompt } = await req.json();

    let contents = [];

    // Hỗ trợ cả 2 chuẩn: Mảng messages (cho UI mới) hoặc prompt đơn (tương thích ngược)
    if (messages && Array.isArray(messages)) {
      contents = messages.map((msg: any) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }]
      }));
    } else if (prompt) {
      contents = [
        { role: "user", parts: [{ text: prompt }] }
      ];
    } else {
      return NextResponse.json(
        { success: false, error: "Missing messages or prompt" },
        { status: 400 }
      );
    }

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
      contents: contents,
    };

    const result = await generateContentWithFallback(requestContent, apiKeys, "gemini-1.5-flash");

    const responseText = result.response.text();

    return NextResponse.json({ success: true, result: responseText });
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

import { GoogleGenerativeAI } from "@google/generative-ai";
import { generateContentWithFallback } from "./src/lib/gemini";

async function run() {
  try {
    console.log("Testing with bad key...");
    const keys = ["bad_key_1", "bad_key_2"];
    const req = { contents: [{ role: "user", parts: [{ text: "Hello" }] }] };
    const res = await generateContentWithFallback(req as any, keys);
    console.log("Success");
  } catch (e) {
    console.error("Caught error:", e);
  }
}
run();

import { GoogleGenerativeAI } from "@google/generative-ai";

// Ensure the API key is available
const apiKey = process.env.GEMINI_API_KEY || "";

// Initialize the Google Generative AI client
const genAI = new GoogleGenerativeAI(apiKey);

// Use the standard high-quality model
export const geminiModel = genAI.getGenerativeModel({
  model: "gemini-flash-latest", // Sử dụng alias gemini-flash-latest để hệ thống tự động trỏ vào model miễn phí khả dụng nhất
});

export default genAI;

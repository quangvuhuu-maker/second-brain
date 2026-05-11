import fetch from "node-fetch";
import fs from "fs";
import path from "path";

// Read API key from .env.local
const envPath = path.resolve(".env.local");
const envContent = fs.readFileSync(envPath, "utf-8");
const match = envContent.match(/GEMINI_API_KEY=(.*)/);
const apiKey = match ? match[1].trim() : "";

async function listModels() {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await res.json();
    if (data.models) {
      console.log(data.models.map(m => m.name));
    } else {
      console.log("Error:", data);
    }
  } catch (err) {
    console.error("Fetch error:", err);
  }
}

listModels();

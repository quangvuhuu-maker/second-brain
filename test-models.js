const fs = require('fs');

async function checkModels() {
  let apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    try {
      const envFile = fs.readFileSync('.env.local', 'utf8');
      const match = envFile.match(/GEMINI_API_KEY=([^ \n]+)/);
      if (match) apiKey = match[1].replace(/['"]/g, '');
    } catch (e) {}
  }

  if (!apiKey) {
    console.error("No API key found.");
    return;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const response = await fetch(url);
  const data = await response.json();

  if (data.models) {
    const validModels = data.models
      .filter(m => m.supportedGenerationMethods.includes("generateContent"))
      .map(m => m.name);
    console.log("Valid models for generateContent:");
    console.log(validModels.join('\n'));
  } else {
    console.log("Error fetching models:", data);
  }
}

checkModels();

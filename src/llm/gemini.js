// Google Gemini API (AI Studio) — free tier, no credit card required.
// Docs: https://ai.google.dev/gemini-api/docs

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-2.5-flash";

// Free tier is 5 requests/minute for this model — pace calls to stay under that,
// with a safety margin (13s gives 4.6 req/min, comfortably under the limit).
const MIN_INTERVAL_MS = 13000;
let lastCallTime = 0;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttle() {
  const elapsed = Date.now() - lastCallTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - elapsed);
  }
  lastCallTime = Date.now();
}

export async function callLLM(system, userText, maxTokens = 1024, attempt = 1) {
  if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY env var");

  await throttle();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: userText }] }],
      generationConfig: {
        maxOutputTokens: Math.max(maxTokens, 2048), // headroom so JSON never gets cut off
        temperature: 0.3,
        thinkingConfig: { thinkingBudget: 0 }, // disable "thinking" — it eats the output budget otherwise
      },
    }),
  });

  if (res.status === 429 && attempt <= 2) {
    // Back off and retry once or twice — free tier quota resets every minute.
    console.warn(`Gemini rate-limited, retrying in 60s (attempt ${attempt})...`);
    await sleep(60000);
    return callLLM(system, userText, maxTokens, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  return parts.map((p) => p.text || "").join("");
}
// Anthropic Claude API — switch to this once you're ready to move off the free tier.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-sonnet-5"; // or "claude-haiku-4-5-20251001" for a cheaper/faster option

export async function callLLM(system, userText, maxTokens = 1024) {
  if (!ANTHROPIC_API_KEY) throw new Error("Missing ANTHROPIC_API_KEY env var");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userText }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Claude API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.content.map((block) => block.text || "").join("");
}

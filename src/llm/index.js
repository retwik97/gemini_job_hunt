// Picks which AI provider to use based on the LLM_PROVIDER env var.
// This is the ONLY place you need to touch to switch providers later —
// set LLM_PROVIDER=claude (and add ANTHROPIC_API_KEY as a secret) when you're ready.

import * as gemini from "./gemini.js";
import * as claude from "./claude.js";

const PROVIDER = (process.env.LLM_PROVIDER || "gemini").toLowerCase();

const PROVIDERS = { gemini, claude };

if (!PROVIDERS[PROVIDER]) {
  throw new Error(`Unknown LLM_PROVIDER "${PROVIDER}" — expected "gemini" or "claude"`);
}

export const callLLM = PROVIDERS[PROVIDER].callLLM;
export const activeProvider = PROVIDER;

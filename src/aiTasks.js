// Job scoring and resume tailoring — uses whichever provider is configured
// in src/llm/index.js (currently controlled by the LLM_PROVIDER env var).

import { callLLM } from "./llm/index.js";

function extractJson(text) {
  // Strip markdown fences if the model added them despite instructions
  let cleaned = text.replace(/```json|```/g, "").trim();
  // If there's stray text before/after the JSON object, grab just the {...} span
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }
  return JSON.parse(cleaned);
}

export async function scoreJob(job, baseResume) {
  const system = `You are an ATS-style recruiter screening assistant. Respond with ONLY valid JSON, no preamble, no markdown fences. Format:
{"score": <0-100 integer>, "matchingSkills": [...], "missingSkills": [...], "reason": "<1-2 sentences>"}`;

  const userText = `CANDIDATE RESUME SUMMARY:
${baseResume.summary}
Skills: ${baseResume.skills.join(", ")}
Experience highlights: ${baseResume.experienceHighlights.join(" | ")}

JOB TITLE: ${job.title}
COMPANY: ${job.company}
JOB DESCRIPTION:
${job.description}

Score how well this candidate matches this job from 0-100.`;

  const raw = await callLLM(system, userText, 500);
  return extractJson(raw);
}

export async function tailorResume(job, baseResume) {
  const system = `You are a resume-tailoring assistant. Given a candidate's base resume content and a job description, rewrite the candidate's skills list (reordered/reworded to match JD keywords, but ONLY using skills the candidate actually has) and rewrite up to 5 experience bullet points to emphasize what's relevant to this JD. Never invent experience, tools, or metrics the candidate didn't provide. Respond with ONLY valid JSON, no markdown fences:
{"tailoredSummary": "...", "tailoredSkills": [...], "tailoredBullets": [...]}`;

  const userText = `BASE RESUME:
Summary: ${baseResume.summary}
Skills: ${baseResume.skills.join(", ")}
Experience bullets (raw pool to choose/rewrite from): ${JSON.stringify(baseResume.experienceHighlights)}

JOB TITLE: ${job.title}
COMPANY: ${job.company}
JOB DESCRIPTION:
${job.description}`;

  const raw = await callLLM(system, userText, 1200);
  return extractJson(raw);
}
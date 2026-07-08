// Job scoring and resume tailoring — uses whichever provider is configured
// in src/llm/index.js (currently controlled by the LLM_PROVIDER env var).
//
// Tailoring never rewrites your actual bullet wording or invents skills —
// it only: (1) writes a JD-tailored summary from facts you already provided,
// (2) picks/orders a "key skills" line from skills you already have, and
// (3) reorders each section's existing bullets to put the most relevant ones first.

import { callLLM } from "./llm/index.js";

function extractJson(text) {
  let cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }
  return JSON.parse(cleaned);
}

function flattenSkills(baseResume) {
  return baseResume.skillCategories.flatMap((c) => c.skills);
}

function flattenBullets(baseResume) {
  const bullets = [];
  for (const exp of baseResume.experience) {
    for (const section of exp.sections) {
      bullets.push(`[${section.title}] ${section.bullets.join(" ")}`);
    }
  }
  for (const proj of baseResume.projects || []) {
    bullets.push(`[Project: ${proj.title}] ${proj.bullets.join(" ")}`);
  }
  return bullets.join("\n");
}

export async function scoreJob(job, baseResume) {
  const system = `You are an ATS-style recruiter screening assistant. Respond with ONLY valid JSON, no preamble, no markdown fences. Format:
{"score": <0-100 integer>, "matchingSkills": [...], "missingSkills": [...], "reason": "<1-2 sentences>"}`;

  const userText = `CANDIDATE RESUME SUMMARY:
${baseResume.summary}
Skills: ${flattenSkills(baseResume).join(", ")}
Experience highlights:
${flattenBullets(baseResume)}

JOB TITLE: ${job.title}
COMPANY: ${job.company}
JOB DESCRIPTION:
${job.description}

Score how well this candidate matches this job from 0-100.`;

  const raw = await callLLM(system, userText, 500);
  return extractJson(raw);
}

export async function tailorResume(job, baseResume) {
  const sectionTitles = baseResume.experience.flatMap((exp) =>
    exp.sections.map((s) => ({ title: s.title, bulletCount: s.bullets.length }))
  );

  const system = `You are a resume-tailoring assistant. You will be given a candidate's REAL resume content and a job description. You must NOT invent, exaggerate, or reword any factual claim, metric, or skill the candidate didn't provide. Your only jobs:
1. Write a 3-4 sentence tailored professional summary using only facts already present in the candidate's resume, emphasizing what's relevant to this JD.
2. Pick up to 12 skills FROM THE CANDIDATE'S EXISTING SKILL LIST ONLY (copy exact strings) that best match this JD, ordered by relevance — this becomes a "key skills for this role" line.
3. For each resume section listed below, return the existing bullet points REORDERED by relevance to this JD (as a permutation of indices 0..N-1, where N is that section's bullet count) — do not change bullet wording, do not drop or add bullets, only reorder.

Respond with ONLY valid JSON, no markdown fences, in this exact shape:
{
  "tailoredSummary": "...",
  "topSkillsForThisRole": ["...", "..."],
  "sectionBulletOrder": { "<exact section title>": [<permutation of indices>], ... }
}`;

  const userText = `CANDIDATE RESUME:
Summary: ${baseResume.summary}
Full skill list: ${flattenSkills(baseResume).join(", ")}

Sections and bullet counts (return a reordering for each, using its exact title as the key):
${sectionTitles.map((s) => `- "${s.title}" (${s.bulletCount} bullets, indices 0-${s.bulletCount - 1})`).join("\n")}

Full section content for context:
${flattenBullets(baseResume)}

JOB TITLE: ${job.title}
COMPANY: ${job.company}
JOB DESCRIPTION:
${job.description}`;

  const raw = await callLLM(system, userText, 1500);
  const result = extractJson(raw);

  // Defensive validation — fall back to original order if the model returned
  // something malformed, rather than crashing or silently dropping content.
  for (const { title, bulletCount } of sectionTitles) {
    const order = result.sectionBulletOrder?.[title];
    const isValidPermutation =
      Array.isArray(order) &&
      order.length === bulletCount &&
      new Set(order).size === bulletCount &&
      order.every((i) => Number.isInteger(i) && i >= 0 && i < bulletCount);

    if (!isValidPermutation) {
      result.sectionBulletOrder = result.sectionBulletOrder || {};
      result.sectionBulletOrder[title] = Array.from({ length: bulletCount }, (_, i) => i);
    }
  }

  if (!Array.isArray(result.topSkillsForThisRole)) {
    result.topSkillsForThisRole = [];
  } else {
    const allSkills = new Set(flattenSkills(baseResume));
    result.topSkillsForThisRole = result.topSkillsForThisRole.filter((s) => allSkills.has(s));
  }

  return result;
}

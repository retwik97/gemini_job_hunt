// Job scoring and resume tailoring — uses whichever provider is configured
// in src/llm/index.js (currently controlled by the LLM_PROVIDER env var).
//
// Scoring is BATCHED — all jobs go in a single API call instead of one call
// per job. This is the difference between ~55 requests/day and ~2-6, which
// matters a lot given how aggressively free-tier quotas get cut.
//
// Tailoring never rewrites your actual bullet wording or invents skills —
// it only: (1) writes a JD-tailored summary from facts you already provided,
// (2) picks/orders a "key skills" line from skills you already have, and
// (3) reorders each section's existing bullets to put the most relevant ones first.

import { callLLM } from "./llm/index.js";

function extractJson(text) {
  let cleaned = text.replace(/```json|```/g, "").trim();
  // For arrays, grab the [...] span; for objects, grab the {...} span.
  const arrStart = cleaned.indexOf("[");
  const objStart = cleaned.indexOf("{");
  if (arrStart !== -1 && (objStart === -1 || arrStart < objStart)) {
    const end = cleaned.lastIndexOf("]");
    if (end > arrStart) cleaned = cleaned.slice(arrStart, end + 1);
  } else if (objStart !== -1) {
    const end = cleaned.lastIndexOf("}");
    if (end > objStart) cleaned = cleaned.slice(objStart, end + 1);
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

// Truncate long JDs so a batch of ~50-60 jobs doesn't blow the token budget.
function truncate(text, maxChars = 900) {
  if (!text) return "";
  return text.length > maxChars ? text.slice(0, maxChars) + "..." : text;
}

// Scores ALL jobs in a single API call. Returns a Map keyed by job.id.
export async function scoreJobsBatch(jobs, baseResume) {
  if (jobs.length === 0) return new Map();

  const system = `You are an ATS-style recruiter screening assistant. You will be given a candidate profile and a list of jobs. Score EVERY job in the list from 0-100 based on fit. Respond with ONLY a valid JSON array, no preamble, no markdown fences, one entry per job in the exact order given:
[{"id": "<job id, copied exactly>", "score": <0-100 integer>, "matchingSkills": [...], "missingSkills": [...], "reason": "<1 short sentence>"}, ...]`;

  const jobsList = jobs
    .map(
      (j, i) =>
        `--- JOB ${i + 1} ---\nid: ${j.id}\ntitle: ${j.title}\ncompany: ${j.company}\ndescription: ${truncate(j.description)}`
    )
    .join("\n\n");

  const userText = `CANDIDATE PROFILE:
Summary: ${baseResume.summary}
Skills: ${flattenSkills(baseResume).join(", ")}
Experience highlights:
${flattenBullets(baseResume)}

JOBS TO SCORE (${jobs.length} total):
${jobsList}

Return a JSON array with exactly ${jobs.length} entries, one per job, in the same order, each with the job's exact "id".`;

  // Generous token budget: ~60-90 tokens per job entry, scaled to batch size.
  const maxTokens = Math.min(8192, 500 + jobs.length * 120);

  const raw = await callLLM(system, userText, maxTokens);
  const results = extractJson(raw);

  const map = new Map();
  for (const r of results) {
    if (r && r.id) map.set(String(r.id), r);
  }
  return map;
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
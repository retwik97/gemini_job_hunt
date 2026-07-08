import fs from "fs";
import path from "path";
import { fetchJobs } from "./fetchJobs.js";
import { fetchCompanyCareerJobs } from "./fetchCompanyCareers.js";
import { scoreJobsBatch, tailorResume } from "./aiTasks.js";
import { generateResumeDocx } from "./generateResume.js";
import { convertDocxToPdf } from "./convertToPdf.js";
import { notifyJob } from "./notify.js";

const SEEN_JOBS_PATH = path.resolve("data/seen-jobs.json");
const BASE_RESUME_PATH = path.resolve("data/base-resume.json");
const LOG_PATH = path.resolve("data/application-log.json");
const RESUME_OUTPUT_DIR = path.resolve("data/generated-resumes");

const SCORE_THRESHOLD = 70;
const BATCH_SIZE = 15; // keeps each scoring call's token usage safely bounded

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

async function main() {
  const baseResume = loadJson(BASE_RESUME_PATH, null);
  if (!baseResume) {
    throw new Error("data/base-resume.json is missing — fill it in first.");
  }

  const seenJobIds = new Set(loadJson(SEEN_JOBS_PATH, []));
  const log = loadJson(LOG_PATH, []);

  fs.mkdirSync(RESUME_OUTPUT_DIR, { recursive: true });

  console.log("Fetching recent job postings...");
  const [aggregatorJobs, companyJobs] = await Promise.all([
    fetchJobs(),
    fetchCompanyCareerJobs(),
  ]);
  const jobs = [...aggregatorJobs, ...companyJobs];
  const newJobs = jobs.filter((j) => !seenJobIds.has(j.id));
  console.log(`Found ${jobs.length} postings, ${newJobs.length} are new.`);

  for (const j of newJobs) seenJobIds.add(j.id);

  console.log(`Scoring ${newJobs.length} jobs in batches of ${BATCH_SIZE}...`);
  const scoreMap = new Map();
  for (const batch of chunk(newJobs, BATCH_SIZE)) {
    try {
      const results = await scoreJobsBatch(batch, baseResume);
      for (const [id, result] of results) scoreMap.set(id, result);
    } catch (err) {
      console.error(`  Batch scoring failed: ${err.message}`);
      for (const job of batch) {
        log.push({ ...job, status: "error", error: `batch scoring failed: ${err.message}` });
      }
    }
  }

  for (const job of newJobs) {
    const scoreResult = scoreMap.get(job.id);

    if (!scoreResult) {
      console.log(`No score returned for: ${job.title} @ ${job.company}, skipping`);
      log.push({ ...job, status: "error", error: "no score returned from batch" });
      continue;
    }

    if (scoreResult.score < SCORE_THRESHOLD) {
      log.push({ ...job, score: scoreResult.score, status: "skipped_low_score" });
      continue;
    }

    try {
      console.log(`Match! ${job.title} @ ${job.company} — score ${scoreResult.score}. Tailoring resume...`);
      const tailored = await tailorResume(job, baseResume);

      const safeName = job.id.replace(/[^a-z0-9]/gi, "_");
      const docxPath = path.join(RESUME_OUTPUT_DIR, `resume_${safeName}.docx`);
      await generateResumeDocx(baseResume, tailored, docxPath);

      let notifyPath = docxPath;
      try {
        notifyPath = convertDocxToPdf(docxPath);
      } catch (pdfErr) {
        console.warn(`  PDF conversion failed, sending .docx instead: ${pdfErr.message}`);
      }

      await notifyJob(job, scoreResult, notifyPath);

      log.push({
        ...job,
        score: scoreResult.score,
        status: "notified_pending_review",
        resumePath: notifyPath,
      });
    } catch (err) {
      console.error(`  Error processing job ${job.id}:`, err.message);
      log.push({ ...job, status: "error", error: err.message });
    }
  }

  saveJson(SEEN_JOBS_PATH, [...seenJobIds]);
  saveJson(LOG_PATH, log);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
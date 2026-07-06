import fs from "fs";
import path from "path";
import { fetchJobs } from "./fetchJobs.js";
import { fetchCompanyCareerJobs } from "./fetchCompanyCareers.js";
import { scoreJob, tailorResume } from "./aiTasks.js";
import { generateResumeDocx } from "./generateResume.js";
import { notifyJob } from "./notify.js";

const SEEN_JOBS_PATH = path.resolve("data/seen-jobs.json");
const BASE_RESUME_PATH = path.resolve("data/base-resume.json");
const LOG_PATH = path.resolve("data/application-log.json");
const RESUME_OUTPUT_DIR = path.resolve("data/generated-resumes");

const SCORE_THRESHOLD = 70;

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function saveJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
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

  for (const job of newJobs) {
    seenJobIds.add(job.id);

    try {
      console.log(`Scoring: ${job.title} @ ${job.company}`);
      const scoreResult = await scoreJob(job, baseResume);

      if (scoreResult.score < SCORE_THRESHOLD) {
        console.log(`  Skipped (score ${scoreResult.score} < ${SCORE_THRESHOLD})`);
        log.push({ ...job, score: scoreResult.score, status: "skipped_low_score" });
        continue;
      }

      console.log(`  Match! Score ${scoreResult.score}. Tailoring resume...`);
      const tailored = await tailorResume(job, baseResume);

      const safeName = job.id.replace(/[^a-z0-9]/gi, "_");
      const resumePath = path.join(RESUME_OUTPUT_DIR, `resume_${safeName}.docx`);
      await generateResumeDocx(baseResume, tailored, resumePath);

      await notifyJob(job, scoreResult, resumePath);

      log.push({
        ...job,
        score: scoreResult.score,
        status: "notified_pending_review",
        resumePath,
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

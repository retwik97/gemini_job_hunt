// Fetches recent job postings from Adzuna (supports India) filtered by keywords
// and how many days old the posting is (max_days_old).

const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID;
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY;

// Edit these to match what you're targeting. Keep queries specific and few
// (each is a separate API call) rather than one giant OR'd string.
export const SEARCH_QUERIES = [
  "Azure DevOps Engineer",
  ".NET Developer Azure",
  "Site Reliability Engineer",
  "Cloud Infrastructure Engineer",
];

const MAX_DAYS_OLD = 3;
const RESULTS_PER_QUERY = 20;
const COUNTRY = "in"; // Adzuna country code for India

export async function fetchJobs() {
  if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) {
    throw new Error("Missing ADZUNA_APP_ID / ADZUNA_APP_KEY env vars");
  }

  const allJobs = [];

  for (const query of SEARCH_QUERIES) {
    const url = new URL(`https://api.adzuna.com/v1/api/jobs/${COUNTRY}/search/1`);
    url.searchParams.set("app_id", ADZUNA_APP_ID);
    url.searchParams.set("app_key", ADZUNA_APP_KEY);
    url.searchParams.set("what", query);
    url.searchParams.set("max_days_old", String(MAX_DAYS_OLD));
    url.searchParams.set("results_per_page", String(RESULTS_PER_QUERY));
    url.searchParams.set("content-type", "application/json");

    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Adzuna query failed for "${query}": ${res.status}`);
      continue;
    }
    const data = await res.json();
    for (const job of data.results || []) {
      allJobs.push({
        id: String(job.id),
        title: job.title,
        company: job.company?.display_name || "Unknown",
        location: job.location?.display_name || "Unknown",
        description: job.description,
        url: job.redirect_url,
        created: job.created,
        query,
      });
    }
  }

  // De-dupe by job id in case multiple queries matched the same posting
  const seenIds = new Set();
  return allJobs.filter((j) => {
    if (seenIds.has(j.id)) return false;
    seenIds.add(j.id);
    return true;
  });
}

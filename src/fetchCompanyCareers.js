// Pulls live job listings directly from individual companies' career pages,
// by querying the public JSON API their ATS (Greenhouse/Lever/SmartRecruiters/Ashby)
// already uses to render that company's own careers site.
//
// This only works for companies in TARGET_COMPANIES below, each tagged with
// which ATS they use and their slug (the identifier in their careers page URL).
// It CANNOT cover companies on a custom/proprietary career page or one requiring
// login (e.g. many Workday-hosted portals) — those aren't included.

const MAX_AGE_DAYS = 3;

// How to find a company's slug:
//  - Greenhouse: their careers URL looks like boards.greenhouse.io/<slug> or
//    jobs.<company>.com (view page source, search for "greenhouse")
//  - Lever: jobs.lever.co/<slug>
//  - Ashby: jobs.ashbyhq.com/<slug>
//  - SmartRecruiters: careers.smartrecruiters.com/<slug>
export const TARGET_COMPANIES = [
  // { name: "Stripe", ats: "greenhouse", slug: "stripe" },
  // { name: "Figma", ats: "greenhouse", slug: "figma" },
  // { name: "Ramp", ats: "ashby", slug: "ramp" },
  // { name: "Notion", ats: "lever", slug: "notion" },
  // Add companies you're actually targeting here.
];

async function fetchGreenhouse(company) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${company.slug}/jobs?content=true`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.jobs || []).map((job) => ({
    id: `gh_${company.slug}_${job.id}`,
    title: job.title,
    company: company.name,
    location: job.location?.name || "Unknown",
    description: stripHtml(job.content),
    url: job.absolute_url,
    created: job.updated_at,
    query: `direct:${company.name}`,
  }));
}

async function fetchLever(company) {
  const url = `https://api.lever.co/v0/postings/${company.slug}?mode=json`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data || []).map((job) => ({
    id: `lv_${company.slug}_${job.id}`,
    title: job.text,
    company: company.name,
    location: job.categories?.location || "Unknown",
    description: stripHtml(job.descriptionPlain || job.description),
    url: job.hostedUrl,
    created: new Date(job.createdAt).toISOString(),
    query: `direct:${company.name}`,
  }));
}

async function fetchAshby(company) {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${company.slug}`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.jobs || []).map((job) => ({
    id: `ash_${company.slug}_${job.id}`,
    title: job.title,
    company: company.name,
    location: job.location || "Unknown",
    description: stripHtml(job.descriptionPlain || job.description),
    url: job.jobUrl,
    created: job.publishedAt,
    query: `direct:${company.name}`,
  }));
}

async function fetchSmartRecruiters(company) {
  const url = `https://api.smartrecruiters.com/v1/companies/${company.slug}/postings`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return (data.content || []).map((job) => ({
    id: `sr_${company.slug}_${job.id}`,
    title: job.name,
    company: company.name,
    location: job.location?.city || "Unknown",
    description: job.jobAd?.sections?.jobDescription?.text
      ? stripHtml(job.jobAd.sections.jobDescription.text)
      : "",
    url: job.applyUrl || job.ref,
    created: job.releasedDate,
    query: `direct:${company.name}`,
  }));
}

const FETCHERS = {
  greenhouse: fetchGreenhouse,
  lever: fetchLever,
  ashby: fetchAshby,
  smartrecruiters: fetchSmartRecruiters,
};

function stripHtml(html = "") {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function isRecent(dateStr) {
  if (!dateStr) return true; // some ATS don't return a date; don't drop it just for that
  const posted = new Date(dateStr);
  const ageMs = Date.now() - posted.getTime();
  return ageMs <= MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

export async function fetchCompanyCareerJobs() {
  const results = [];
  for (const company of TARGET_COMPANIES) {
    const fetcher = FETCHERS[company.ats];
    if (!fetcher) {
      console.warn(`Unknown ATS "${company.ats}" for ${company.name}, skipping`);
      continue;
    }
    try {
      const jobs = await fetcher(company);
      results.push(...jobs.filter((j) => isRecent(j.created)));
    } catch (err) {
      console.error(`Failed fetching ${company.name} (${company.ats}):`, err.message);
    }
  }
  return results;
}

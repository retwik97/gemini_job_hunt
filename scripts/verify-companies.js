// Run this ONCE (locally, or as a one-off GitHub Action) to find out which
// companies in CANDIDATES actually have a live public feed on Greenhouse,
// Lever, Ashby, or SmartRecruiters — instead of guessing slugs blindly.
//
// Usage:
//   node scripts/verify-companies.js
//
// It prints a ready-to-paste TARGET_COMPANIES array containing only the
// entries that returned real data, straight into src/fetchCompanyCareers.js.

const CANDIDATES = [
  // Hyderabad-headquartered / large Hyderabad presence
  "Darwinbox", "HighRadius", "Tanla Platforms", "Cyient", "ValueLabs",
  "Innominds", "Apisero", "Pegasystems", "Sify",

  // Major India-wide product/tech companies & unicorns
  "Postman", "Chargebee", "Freshworks", "Razorpay", "PhonePe", "CRED",
  "Meesho", "Swiggy", "Zomato", "Ola", "Urban Company", "Cult.fit",
  "Groww", "Slice", "Zerodha", "Upstox", "Unacademy", "Vedantu",
  "Dream11", "MPL", "Games24x7", "Nazara", "Lenskart", "Nykaa", "boAt",
  "Mamaearth", "Licious", "Rebel Foods", "Zepto", "Blinkit", "Dunzo",
  "BigBasket", "Tata1mg", "PharmEasy", "Practo", "Innovaccer", "Uniphore",
  "Amagi", "LeadSquared", "Icertis", "MindTickle", "Whatfix", "CleverTap",
  "MoEngage", "Hasura", "Wingify", "Zeta", "Yellow.ai", "Observe.AI",
  "Fractal Analytics", "Sprinklr", "Druva", "Gainsight", "Zycus",
  "Zinnov", "Capillary Technologies", "Hevo Data", "Rippling",
];

// Slug guesses derived mechanically from the name — many will be wrong,
// that's expected and fine, this script exists to filter those out.
function guessSlug(name) {
  return name
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9]+/g, "");
}

async function checkGreenhouse(slug) {
  const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data.jobs) ? data.jobs.length : null;
}

async function checkLever(slug) {
  const res = await fetch(`https://api.lever.co/v0/postings/${slug}?mode=json`);
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) ? data.length : null;
}

async function checkAshby(slug) {
  const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data.jobs) ? data.jobs.length : null;
}

async function checkSmartRecruiters(slug) {
  const res = await fetch(`https://api.smartrecruiters.com/v1/companies/${slug}/postings`);
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data.content) ? data.content.length : null;
}

const CHECKS = [
  ["greenhouse", checkGreenhouse],
  ["lever", checkLever],
  ["ashby", checkAshby],
  ["smartrecruiters", checkSmartRecruiters],
];

async function main() {
  const confirmed = [];

  for (const name of CANDIDATES) {
    const slug = guessSlug(name);
    for (const [ats, checkFn] of CHECKS) {
      try {
        const count = await checkFn(slug);
        if (count !== null) {
          console.log(`✅ ${name} -> ${ats} (slug: "${slug}", ${count} live jobs)`);
          confirmed.push({ name, ats, slug });
          break; // found a match, no need to check other ATSs for this company
        }
      } catch {
        // network error, ignore and move on
      }
    }
  }

  console.log("\n--- Paste this into src/fetchCompanyCareers.js TARGET_COMPANIES ---\n");
  console.log(
    "export const TARGET_COMPANIES = [\n" +
      confirmed
        .map((c) => `  { name: "${c.name}", ats: "${c.ats}", slug: "${c.slug}" },`)
        .join("\n") +
      "\n];"
  );
  console.log(`\n${confirmed.length} of ${CANDIDATES.length} candidates confirmed.`);
}

main();

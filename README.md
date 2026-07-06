# Daily Job Search Bot

Runs every day at 10:00 AM IST via GitHub Actions. It:
1. Searches for jobs posted in the last 2-3 days (Adzuna API)
2. Scores each one against your resume using Claude
3. Tailors your resume for anything scoring 70+
4. Sends you a Telegram message with the job + tailored resume attached

It does **not** auto-submit applications on LinkedIn/Naukri — you review and
apply yourself with one tap. This avoids ToS/ban risk and stops low-quality
matches from going out unreviewed.

## Setup — step by step

### 1. Get your API keys

**Adzuna (job search API, free tier)**
1. Go to https://developer.adzuna.com/ and sign up.
2. Create an app — you'll get an `app_id` and `app_key`.

**Anthropic (Claude API) — optional for now**
This bot defaults to Google Gemini's free tier for testing. Skip this step until you're ready to switch to Claude (see "Switching to Claude later" below).
1. Go to https://console.anthropic.com/ and create an API key.
2. Note: this is pay-as-you-go, separate from your claude.ai subscription.

**Google Gemini (free tier, used by default)**
1. Go to https://aistudio.google.com/apikey and sign in with a Google account — no credit card needed.
2. Click "Create API key" and copy it.
3. Free tier covers Gemini 2.5 Flash with a generous daily request quota — plenty for scoring/tailoring ~20-30 jobs/day.
4. Note: free-tier prompts may be used by Google to improve their models. Fine for testing with your resume; if that matters to you for sensitive data, switch to Claude sooner rather than later.

**Telegram bot (for notifications)**
1. Open Telegram, message **@BotFather**, send `/newbot`, follow the prompts. You'll get a bot token.
2. Message your new bot anything (e.g. "hi") to start a chat with it.
3. Get your chat ID: visit `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates` in a browser after messaging the bot, and read the `chat.id` field from the JSON response.

### 2. Create the GitHub repo

```bash
cd job-bot
git init
git add .
git commit -m "Initial job search bot"
gh repo create job-application-bot --private --source=. --push
# or manually: create an empty repo on github.com, then
# git remote add origin https://github.com/<you>/job-application-bot.git
# git branch -M main
# git push -u origin main
```

### 3. Add secrets to the repo

On GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Add these:
- `ADZUNA_APP_ID`
- `ADZUNA_APP_KEY`
- `GEMINI_API_KEY` (required now, since the bot defaults to Gemini)
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`
- `ANTHROPIC_API_KEY` (optional — only needed once you switch to Claude, see below)

### 4. Customize your search and resume data

- Edit `src/fetchJobs.js` → `SEARCH_QUERIES` array to match the roles you want (currently set to Azure DevOps Engineer, .NET Developer Azure, SRE, Cloud Infrastructure Engineer — matches your dual-resume strategy).
- Edit `data/base-resume.json` → I've pre-filled this from what you've shared with me before, but double check it's accurate and add anything missing (more experience bullets = better tailoring options for the AI to draw from).
- Adjust `SCORE_THRESHOLD` in `src/index.js` (default 70) — lower it if you want more jobs surfaced, raise it to be pickier.

### 5. Test it manually before trusting the schedule

Go to the repo's **Actions** tab → **Daily Job Search Bot** → **Run workflow** (this uses the `workflow_dispatch` trigger). Watch the logs. Check your Telegram for messages.

You can also test locally:
```bash
npm install
export ADZUNA_APP_ID=xxx ADZUNA_APP_KEY=xxx LLM_PROVIDER=gemini GEMINI_API_KEY=xxx TELEGRAM_BOT_TOKEN=xxx TELEGRAM_CHAT_ID=xxx
npm start
```

### 6. Let it run

Once the manual test works, it'll fire automatically every day at 10:00 AM IST (04:30 UTC). Check `data/application-log.json` in the repo any time to see what it found and skipped.

## Finding companies for the direct career-page source

I can't hand you a verified list of 300 companies — I checked, and there is no public directory of "companies + their ATS + their slug," and the vast majority of large Indian employers (TCS, Infosys, Wipro, Accenture, Amazon, Microsoft, Deloitte, etc.) don't run on Greenhouse/Lever/Ashby/SmartRecruiters at all, so they can't be reached this way regardless. Guessing slugs blindly is also risky — e.g. BrowserStack looks like a Greenhouse company from search results but is actually on Workday, and a wrong guess just silently returns zero jobs forever without telling you it's wrong.

Instead, use the verifier:

1. Open `scripts/verify-companies.js` and edit the `CANDIDATES` array — add any company names you want checked (I seeded it with ~65 Hyderabad and India-wide product/tech companies as a starting point).
2. Run it via **Actions → Verify Company ATS Slugs (run manually, one-off) → Run workflow**, or locally with `node scripts/verify-companies.js`.
3. It checks each candidate against all 4 ATS APIs and prints only the ones that are real, in a format ready to paste directly into `src/fetchCompanyCareers.js` → `TARGET_COMPANIES`.
4. Re-run it any time you want to add more candidates — takes a few minutes, costs nothing, no manual URL-hunting required.



## Switching to Claude later

Everything routes through `src/llm/index.js`, so switching providers is a one-line change:

1. Add `ANTHROPIC_API_KEY` as a repo secret (see step 3 above).
2. In `.github/workflows/daily-job-search.yml`, change `LLM_PROVIDER: gemini` to `LLM_PROVIDER: claude`.
3. Commit and push. Next run uses Claude — no other code changes needed.

You can also compare providers side by side before fully switching: run the workflow once with each value (change the line, commit, run, revert) and compare how well each tailors your resume for the same job.

## Notes on Naukri

Naukri has no public search API, so it isn't included here. If it's your primary channel, two options:
- Manually check Naukri alongside this bot (it already covers LinkedIn/Indeed via Adzuna's aggregation).
- Add a scraping step later with Playwright — I didn't include this by default since scraping logged-in pages can violate ToS and break often when the site changes; happy to add it if you want to accept that trade-off.

## Extending this

- Swap `MODEL` in `src/llm/gemini.js` or `src/llm/claude.js` to a cheaper/faster variant for the scoring step (quality matters more for tailoring than scoring).
- Swap `src/generateResume.js` for your existing full navy/blue Arial resume template — just replace the summary/skills/bullets sections with `tailored.tailoredSummary`, `tailored.tailoredSkills`, `tailored.tailoredBullets`.
- Add an email-send step for postings that take applications by email instead of a portal.

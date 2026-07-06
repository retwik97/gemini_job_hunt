import fs from "fs";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Sends a text message with the job details + score, then the tailored resume
// as a document. You tap the job link and apply yourself — this bot preps
// everything but deliberately does not click submit on LinkedIn/Naukri for you.
export async function notifyJob(job, scoreResult, resumePath) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn("Telegram not configured, skipping notification");
    return;
  }

  const text =
    `🔔 *${escapeMd(job.title)}* — ${escapeMd(job.company)}\n` +
    `📍 ${escapeMd(job.location)}\n` +
    `✅ Match score: *${scoreResult.score}/100*\n` +
    `Matching: ${escapeMd(scoreResult.matchingSkills.join(", "))}\n` +
    `Missing: ${escapeMd(scoreResult.missingSkills.join(", ") || "none")}\n` +
    `🔗 ${job.url}`;

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "Markdown" }),
  });

  const fileBuffer = fs.readFileSync(resumePath);
  const form = new FormData();
  form.append("chat_id", CHAT_ID);
  form.append(
    "document",
    new Blob([fileBuffer], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
    resumePath.split("/").pop()
  );

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
    method: "POST",
    body: form,
  });
}

function escapeMd(text = "") {
  return text.replace(/([_*[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

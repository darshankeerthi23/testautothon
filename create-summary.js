// create-summary.js (no external deps, ESM)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { WebClient } from "@slack/web-api";

// __dirname shim (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- tiny argv parser ---
function getArg(name, def = "") {
  const prefix = `--${name}=`;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith(prefix)) return a.slice(prefix.length);
    if (a === `--${name}`) return "true";
  }
  return def;
}

// --- args & env ---
const PLATFORM = getArg("platform", process.env.PLATFORM || "web");
const SLACK_TOKEN = process.env.SLACK_TOKEN || "";
const SLACK_CHANNELS = (process.env.SLACK_CHANNEL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const repo = process.env.GITHUB_REPOSITORY || ""; // "owner/repo"
const runId = process.env.GITHUB_RUN_ID || "";
const [owner, repoName] = repo.split("/");
const defaultPages =
  owner && repoName ? `https://${owner}.github.io/${repoName}` : "";
const PAGES_BASE_URL = process.env.PAGES_BASE_URL || defaultPages;
const workflowUrl = repo && runId ? `https://github.com/${repo}/actions/runs/${runId}` : "";

// --- allure files ---
const reportDir = path.resolve(__dirname, "allure-report");
const summaryFile = path.join(reportDir, "widgets", "summary.json");

if (!fs.existsSync(summaryFile)) {
  console.error("Allure summary file is missing. Run Allure report first.");
  process.exit(1);
}

const summaryData = JSON.parse(await fs.promises.readFile(summaryFile, "utf-8"));

// --- extract stats ---
const passed = summaryData?.statistic?.passed ?? 0;
const failed = summaryData?.statistic?.failed ?? 0;
const broken = summaryData?.statistic?.broken ?? 0;
const skipped = summaryData?.statistic?.skipped ?? 0;
const total =
  summaryData?.statistic?.total ?? passed + failed + broken + skipped;
const duration = formatHMS(summaryData?.time?.duration || 0);

const nowDate = new Date();
const now = formatDateTime(nowDate);
const today = formatDateOnly(nowDate);

const reportUrl = PAGES_BASE_URL || "(report URL unavailable)";
const debugUrl = workflowUrl || "(workflow URL unavailable)";

// ---------------- email bodies ----------------
const emailBodyTxt = `
Hello,

The automation test run is complete. Here's the summary:
- Platform: ${PLATFORM}
- Total Tests: ${total}
- ✅ Passed: ${passed}
- ❌ Failed: ${failed}
- 💔 Broken: ${broken}
- ⚠️ Skipped: ${skipped}
- Duration: ${duration}

Report for Hackathon project (${now}):
${reportUrl}

Debug this run:
${debugUrl}

Best regards,
Automation Team
`.trim() + "\n";

const emailBodyHtml = `
<!doctype html>
<html>
  <body style="font-family:sans-serif;line-height:1.45">
    <p>Hello,</p>
    <p>The automation test run is complete. Here's the summary:</p>
    <ul>
      <li><strong>Platform:</strong> ${PLATFORM}</li>
      <li><strong>Total Tests:</strong> ${total}</li>
      <li>✅ <strong>Passed:</strong> ${passed}</li>
      <li>❌ <strong>Failed:</strong> ${failed}</li>
      <li>💔 <strong>Broken:</strong> ${broken}</li>
      <li>⚠️ <strong>Skipped:</strong> ${skipped}</li>
      <li><strong>Duration:</strong> ${duration}</li>
    </ul>
    <p><a href="${escapeHtml(reportUrl)}">Report</a> <span style="color:#666">(${escapeHtml(now)})</span></p>
    <p><a href="${escapeHtml(debugUrl)}">Debug this run</a></p>
    <p>Best regards,<br/>Automation Team</p>
  </body>
</html>
`.trim() + "\n";

// write outputs
await fs.promises.writeFile("email-body.txt", emailBodyTxt);
await fs.promises.writeFile("email-body.html", emailBodyHtml);
await fs.promises.writeFile("email-subject.txt", `Playwright Automation – ${today}\n`);

console.log("email-body.txt, email-body.html, email-subject.txt created.");

// ---------------- Slack (optional) ----------------
if (SLACK_TOKEN && SLACK_CHANNELS.length > 0) {
  const slackText = [
    `*Platform:* ${PLATFORM}`,
    `*Total:* ${total}  ✅ ${passed}  ❌ ${failed}  💔 ${broken}  ⚠️ ${skipped}`,
    `*Duration:* ${duration}`,
    `<${reportUrl}|Report>  •  <${debugUrl}|Debug>`,
    `_${now}_`,
  ].join("\n");

  try {
    const client = new WebClient(SLACK_TOKEN);
    for (const channel of SLACK_CHANNELS) {
      await client.chat.postMessage({ channel, text: slackText, mrkdwn: true });
      console.log(`Slack message sent to ${channel}`);
    }
  } catch (err) {
    console.error("Error sending Slack:", err.message);
  }
} else {
  console.log("Slack token/channel not set. Skipping Slack notification.");
}

// --- helpers ---
function formatDateTime(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = d.toLocaleString("en-US", { month: "short" });
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${dd}-${mm}-${yy} ${hh}:${mi}:${ss}`;
}
function formatDateOnly(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = d.toLocaleString("en-US", { month: "short" });
  const yy = d.getFullYear();
  return `${dd}-${mm}-${yy}`;
}
function formatHMS(ms) {
  const sec = Math.floor(ms / 1000);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

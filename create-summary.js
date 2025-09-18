// create-summary.js (ESM)
// Reads Allure summary.json, optionally posts to Slack, and writes
// email-body.txt, email-body.html, email-subject.txt.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import { WebClient } from '@slack/web-api';

// ___dirname shim (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- args & env ---
const argv = yargs(hideBin(process.argv)).argv;
const PLATFORM = argv.platform || process.env.PLATFORM || 'web';
const SLACK_TOKEN = process.env.SLACK_TOKEN || '';
const SLACK_CHANNELS = (process.env.SLACK_CHANNEL || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const repo = process.env.GITHUB_REPOSITORY || ''; // "owner/repo"
const runId = process.env.GITHUB_RUN_ID || '';
const [owner, repoName] = repo.split('/');
const defaultPages = (owner && repoName)
  ? `https://${owner}.github.io/${repoName}`
  : '';
const PAGES_BASE_URL = process.env.PAGES_BASE_URL || defaultPages;
const workflowUrl = (repo && runId)
  ? `https://github.com/${repo}/actions/runs/${runId}`
  : '';

// --- allure files ---
const reportDir = path.resolve(__dirname, 'allure-report');
const summaryFile = path.join(reportDir, 'widgets', 'summary.json');

if (!fs.existsSync(summaryFile)) {
  console.error('Allure summary file is missing. Ensure allure-report/widgets/summary.json exists.');
  process.exit(1);
}

const summaryData = JSON.parse(await fs.promises.readFile(summaryFile, 'utf-8'));

// --- extract stats (Allure 2 structure) ---
const passed  = summaryData?.statistic?.passed  ?? 0;
const failed  = summaryData?.statistic?.failed  ?? 0;
const broken  = summaryData?.statistic?.broken  ?? 0;
const skipped = summaryData?.statistic?.skipped ?? 0;
const total   = summaryData?.statistic?.total   ?? (passed + failed + broken + skipped);
const duration = formatHMS(summaryData?.time?.duration || 0);

// Timestamps
const nowDate = new Date();
const now = formatDateTime(nowDate);
const today = formatDateOnly(nowDate);

// Links
const reportUrl = PAGES_BASE_URL || '(report URL unavailable)';
const debugUrl  = workflowUrl   || '(workflow URL unavailable)';

// ---------------- email (PLAIN) ----------------
const emailBodyTxt =
`Hello,

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
`;

// ---------------- email (HTML) ----------------
const emailBodyHtml = `<!doctype html>
<html>
  <body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;line-height:1.45">
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
    <p>
      <a href="${escapeHtml(reportUrl)}">Report for hackathon project</a>
      <span style="color:#666">(${escapeHtml(now)})</span>
    </p>
    <p><a href="${escapeHtml(debugUrl)}">Debug this run</a></p>
    <p>Best regards,<br/>Automation Team</p>
  </body>
</html>
`;

// Write files
await fs.promises.writeFile('email-body.txt', emailBodyTxt, 'utf-8');
await fs.promises.writeFile('email-body.html', emailBodyHtml, 'utf-8');
await fs.promises.writeFile('email-subject.txt', `Playwright Automation – ${today}\n`, 'utf-8');
console.log('email-body.txt, email-body.html, email-subject.txt created.');

// ---------------- Slack (optional) ----------------
if (SLACK_TOKEN && SLACK_CHANNELS.length > 0) {
  const slackText = [
    `*Platform:* ${PLATFORM}`,
    `*Total:* ${total}  ✅ ${passed}  ❌ ${failed}  💔 ${broken}  ⚠️ ${skipped}`,
    `*Duration:* ${duration}`,
    `<${reportUrl}|Report for hackathon project>  •  <${debugUrl}|Debug this run>`,
    `_${now}_`
  ].join('\n');

  try {
    const client = new WebClient(SLACK_TOKEN);
    for (const channel of SLACK_CHANNELS) {
      await client.chat.postMessage({ channel, text: slackText, mrkdwn: true });
      console.log(`Slack message sent to ${channel}`);
    }
  } catch (err) {
    console.error('Error sending Slack message:', err?.message || err);
  }
} else {
  console.log('Slack token/channel not set. Skipping Slack notification.');
}

// --- helpers ---
function formatDateTime(d) {
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-US', { month: 'short' });
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${day}-${month}-${year} ${hh}:${mm}:${ss}`;
}
function formatDateOnly(d) {
  const day = String(d.getDate()).padStart(2, '0');
  const month = d.toLocaleString('en-US', { month: 'short' });
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}
function formatHMS(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
}
function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

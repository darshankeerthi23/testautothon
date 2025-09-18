const fs = require('fs');
const path = require('path');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const { WebClient } = require('@slack/web-api');
//const { argv } = require('process');
const argv = yargs(process.argv.slice(2)).argv;
const SLACK_TOKEN = process.env.SLACK_TOKEN; // Add your Slack token here or via .env file
const CHANNEL_ID = process.env.SLACK_CHANNEL.split(','); // Add your Slack channel ID
console.log(`Generating summary for platform: ${argv.platform}`);
//const reportDir = path.resolve(__dirname, 'playwright-report');
const reportDir = path.resolve(__dirname, 'allure-report');
console.log('reportDir:',reportDir);
const suitesFile = path.join(reportDir, 'suites.json');
const categoriesFile = path.join(reportDir, 'categories.json');
const summaryFile = path.join(reportDir, 'results.json');

console.log('slack-token:',SLACK_TOKEN);
console.log('Channel id:',CHANNEL_ID);
// GitHub-specific environment variables
const repo = process.env.GITHUB_REPOSITORY; // "owner/repo"
const runId = process.env.GITHUB_RUN_ID; // Workflow run ID
const workflowUrl = `https://github.com/${repo}/actions/runs/${runId}`;

if (!fs.existsSync(summaryFile)) {
  console.error('Required Playwright report files are missing. Ensure the report is generated.');
  process.exit(1);
}

const summaryData = JSON.parse(fs.readFileSync(summaryFile, 'utf-8'));


const passedTests = summaryData.stats.expected;
const failedTests = summaryData.stats.unexpected;
const brokenTests = summaryData.stats.flaky;
const skippedTests = summaryData.stats.skipped;
const totalTests = passedTests+failedTests+brokenTests+skippedTests;

var duration=formatTimestampToTime(summaryData.stats.duration);

function formatDateTime(date) {
    const day = date.getDate().toString().padStart(2, '0');
    const month = date.toLocaleString('en-US', { month: 'short' });
    const year = date.getFullYear();
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
      
    return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
    }
  const date = formatDateTime(new Date());

function formatTimestampToTime(timestamp) {
  // Convert the timestamp to seconds
  const totalSeconds = Math.floor(timestamp / 1000);

  // Calculate hours, minutes, and seconds
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  // Format with leading zeros if needed
  const formattedTime = [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      seconds.toString().padStart(2, '0')
  ].join(':');

  return formattedTime;
}


if (!SLACK_TOKEN || !CHANNEL_ID) {
  console.error('Slack token or channel ID is missing!');
  //process.exit(1);
}
const slackClient = new WebClient(SLACK_TOKEN);
const sendSlackMessage = async (message, channelIds) => {
    try {
       for (const channel of channelIds) {
         await slackClient.chat.postMessage({
           channel: channel,
           text: message,
         });
         console.log(`Message sent to channel: ${channel}`);
       }
     } catch (error) {
       console.error('Error sending Slack message:', error);
     }
   };

const emailBody = `
Hello,

The JPMC automation test run is complete. Here's the summary:
- Platform: ${argv.platform}
- Total Tests: ${totalTests}
- ✅ Passed: ${passedTests}
- ❌ Failed: ${failedTests}
- 💔 Broken : ${brokenTests}
- ⚠️ Skipped: ${skippedTests}

- Duration: ${duration}  

Note:- 
Skipped test cases are the tests under maintenance due to code or requirement changes.
Broken test's are the Flaky test's which passed on the Retry

JPMC Web Automation report for ${date} is available on the below mentioned link:
https://codeandtheory.github.io/playwright-automation-framework

You can debug this run using the following workflow link:
${workflowUrl}

Best regards,  
C&T Automation Team
`;

sendSlackMessage(emailBody,CHANNEL_ID);
fs.writeFileSync('email-body.txt', emailBody);
console.log('Email body created successfully.');
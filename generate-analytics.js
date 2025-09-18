const fs = require('fs');
const path = require('path');

// Paths
const summaryPath = path.resolve(__dirname, 'allure-report', 'widgets', 'summary.json');
const analyticsPath = path.resolve(__dirname, 'analytics', 'history.json');

// GitHub run URL from environment variable
const runUrl = process.env.GITHUB_RUN_URL || '';

// Load current summary from Allure
if (!fs.existsSync(summaryPath)) {
  console.error('summary.json not found in allure-report/widgets');
  process.exit(1);
}

const summaryData = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));

// Extract stats
const stats = {
  date: new Date().toISOString().split('T')[0],
  total: summaryData.statistic.total || 0,
  passed: summaryData.statistic.passed || 0,
  failed: summaryData.statistic.failed || 0,
  broken: summaryData.statistic.broken || 0,
  skipped: summaryData.statistic.skipped || 0,
  duration: formatDuration(summaryData.time.duration || 0),
  runUrl
};

// Load existing history (if any)
let history = [];
if (fs.existsSync(analyticsPath)) {
  try {
    const existing = fs.readFileSync(analyticsPath, 'utf-8');
    history = JSON.parse(existing);
  } catch (err) {
    console.warn('Failed to parse existing analytics/history.json. Starting fresh.');
  }
}

// Add current stats
history.push(stats);

// Save updated history
fs.writeFileSync(analyticsPath, JSON.stringify(history, null, 2));
console.log('Analytics history updated successfully.');

// Format duration helper
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map(val => val.toString().padStart(2, '0'))
    .join(':');
}

async function main() {
  // The page lives at /allure-report/analytics/, so history is sibling file:
  const res = await fetch('./history.json', { cache: 'no-store' });
  const data = await res.json(); // array of { ts, total, passed, failed, broken, skipped, durationMs, runUrl }

  const byTime = data.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const labels = byTime.map(x => new Date(x.ts || Date.now()).toLocaleString());
  const passed = byTime.map(x => x.passed || 0);
  const failed = byTime.map(x => (x.failed || 0) + (x.broken || 0)); // count broken as fail-class
  const total  = byTime.map(x => x.total || 0);

  const last = byTime[byTime.length - 1] || {};
  const lastTotal = last.total || 0;
  const lastPassed = last.passed || 0;
  const lastFailed = (last.failed || 0) + (last.broken || 0);
  const lastSkipped = last.skipped || 0;

  // Cards
  document.getElementById('runsCount').textContent = byTime.length.toString();
  const passRate = lastTotal ? Math.round((lastPassed / lastTotal) * 100) : 0;
  document.getElementById('passRate').textContent = lastTotal ? `${passRate}%` : '—';
  document.getElementById('duration').textContent = fmtHMS(last.durationMs || 0);
  const runUrlEl = document.getElementById('runUrl');
  runUrlEl.textContent = last.runUrl ? 'Open in GitHub Actions' : '—';
  if (last.runUrl) runUrlEl.href = last.runUrl;

  // Range label
  if (byTime.length > 1) {
    const first = new Date(byTime[0].ts || Date.now()).toLocaleString();
    const lastStr = new Date(last.ts || Date.now()).toLocaleString();
    document.getElementById('rangeLabel').textContent = `From ${first} to ${lastStr}`;
  }

  // Charts
  const trendCtx = document.getElementById('trendChart');
  new Chart(trendCtx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Passed', data: passed },   // default colors
        { label: 'Failed+Broken', data: failed },
        { label: 'Total', data: total }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });

  const pieCtx = document.getElementById('lastPie');
  new Chart(pieCtx, {
    type: 'pie',
    data: {
      labels: ['Passed','Failed+Broken','Skipped'],
      datasets: [{ data: [lastPassed, lastFailed, lastSkipped] }]
    },
    options: { responsive: true }
  });
}

function fmtHMS(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map(v => String(v).padStart(2, '0')).join(':');
}

main().catch(err => {
  console.error('Analytics viewer failed:', err);
  alert('Failed to load analytics. Check console.');
});

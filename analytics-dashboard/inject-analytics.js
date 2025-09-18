// Injects an "Analytics" link into the Allure UI after page loads.
// Safe to include on every run; does nothing if already present.
(function () {
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  ready(function () {
    if (document.getElementById('ac-analytics-link')) return;

    // Find a reasonable place to put the link
    const nav =
      document.querySelector('.sidebar__menu') ||       // older Allure
      document.querySelector('.menu__list') ||           // newer Allure
      document.querySelector('header') ||                // fallback
      document.body;

    const link = document.createElement('a');
    link.id = 'ac-analytics-link';
    link.href = './analytics/';
    link.textContent = 'Analytics';
    link.target = '_self';
    link.rel = 'noopener';

    // Simple styling that blends with Allure UI
    link.style.display = 'inline-block';
    link.style.margin = '8px 12px';
    link.style.padding = '6px 10px';
    link.style.borderRadius = '8px';
    link.style.border = '1px solid currentColor';
    link.style.fontSize = '13px';
    link.style.textDecoration = 'none';
    link.style.opacity = '0.9';

    // Put it near existing nav (top or sidebar)
    nav.appendChild(link);
  });
})();

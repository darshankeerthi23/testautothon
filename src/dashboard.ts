import fs from 'fs';
import path from 'path';
import ejs from 'ejs';

export async function renderDashboard(enrichedPath: string, outDir = 'out/report') {
  const raw = await fs.promises.readFile(enrichedPath, 'utf-8');
  const rows = raw.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
  const byCat: Record<string, number> = {};
  const byComp: Record<string, number> = {};
  for (const r of rows) {
    byCat[r.category || 'Unknown'] = (byCat[r.category || 'Unknown'] || 0) + 1;
    const c = r.suspected_component || 'Unknown';
    byComp[c] = (byComp[c] || 0) + 1;
  }
  const tpl = await fs.promises.readFile(path.join('templates', 'report.ejs'), 'utf-8');
  const html = ejs.render(tpl, {
    generatedAt: new Date().toISOString(),
    total: rows.length,
    byCategory: byCat,
    byComponent: byComp,
    samples: rows
  });

  await fs.promises.mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, 'triage_report.html');
  await fs.promises.writeFile(outFile, html, 'utf-8');
  await fs.promises.copyFile(path.join('templates', 'report.css'), path.join(outDir, 'report.css'));
  return outFile;
}

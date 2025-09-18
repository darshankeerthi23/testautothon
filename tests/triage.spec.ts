import { test, expect } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import { readJsonl, writeJsonl, readTicketsCsv } from '../src/io';
import { trainModel, classifyOne } from '../src/classifier';
import { renderDashboard } from '../src/dashboard';
import { correlate } from '../src/correlate';
import { postSlack } from '../src/slack';
import { buildText } from '../src/fields'; // NEW: build robust message if "message" is missing

const Env = z.object({
  TRAIN_JSON: z.string(),
  TEST_JSON: z.string(),
  TICKETS_CSV: z.string().optional(),
  JIRA_URL: z.string().optional(),
  JIRA_EMAIL: z.string().optional(),
  JIRA_TOKEN: z.string().optional(),
  JIRA_PROJECT: z.string().optional(),
  USE_AI: z.string().optional() // "1" to enable OpenAI mode
});

test('Triage pipeline', async ({}, testInfo) => {
  const env = Env.parse(process.env);
  const USE_AI = env.USE_AI === '1';

  // ---- Paths
  const trainPath = path.resolve(env.TRAIN_JSON);
  const testPath  = path.resolve(env.TEST_JSON);
  const outDir    = path.resolve('out');
  const outJsonl  = path.join(outDir, 'enriched.jsonl');

  await fs.promises.mkdir(outDir, { recursive: true });

  await test.step('Attach inputs', async () => {
    await testInfo.attach('inputs.json', {
      body: JSON.stringify({ trainPath, testPath, useAI: USE_AI }, null, 2),
      contentType: 'application/json'
    });
  });

  // We keep placeholders so Allure always has artifacts even on failure
  let enriched: any[] = [];
  let reportPath = '';

  try {
    // ---- Load
    const training = await test.step('Load training & test JSONL', async () => {
      const train = await readJsonl<any>(trainPath);
      const testData = await readJsonl<any>(testPath);
      expect(train.length).toBeGreaterThan(0);
      expect(testData.length).toBeGreaterThan(0);
      // stash to testInfo for debug
      await testInfo.attach('sizes.txt', {
        body: `training=${train.length}, test=${testData.length}`
      });
      return { train, testData };
    });

    // ---- Train (resilient: bootstraps categories when missing via rules)
    const model = await test.step('Train classifier (TF-IDF + centroids)', async () => {
      return trainModel(training.train);
    });

    // ---- Tickets (optional)
    const tickets = await test.step('Load tickets (optional CSV)', async () => {
      return readTicketsCsv(process.env.TICKETS_CSV);
    });

    // ---- Classify each record
    enriched = await test.step('Classify, reason, correlate', async () => {
      const arr: any[] = [];
      for (const r of training.testData) {
        // AI toggle with safe fallback
        if (USE_AI) {
          try {
            const { classifyWithOpenAI } = await import('../src/ai');
            const ai = await classifyWithOpenAI(r);
            const msg = (r as any).message || buildText(r);
            const corr = msg ? correlate(msg, tickets, 0.25) : null;

            // attach AI raw for this row (helps Allure demo)
            await testInfo.attach(`ai_${(r as any).test_id || 'row'}.json`, {
              body: JSON.stringify(ai, null, 2),
              contentType: 'application/json'
            });

            arr.push({
              ...r,
              category: ai.category,
              reasoning: ai.reasoning,
              suspected_component: ai.suspected_component || (r as any).component || 'Unknown',
              correlated_ticket: corr?.key || null,
              correlation_score: corr?.score || null,
              ai_jira_summary: ai.jira_draft?.summary || null,
              ai_jira_description_md: ai.jira_draft?.description_md || null
            });
            continue; // next row
          } catch (e) {
            // fall back to classic below
          }
        }

        // Classic classifier path
        const { category, reasoning, suspected_component } = classifyOne(model, r);
        const msg = (r as any).message || buildText(r);
        const corr = msg ? correlate(msg, tickets, 0.25) : null;

        arr.push({
          ...r,
          category,
          reasoning,
          suspected_component,
          correlated_ticket: corr?.key || null,
          correlation_score: corr?.score || null
        });
      }
      return arr;
    });

    // ---- Persist enriched & attach
    await test.step('Write enriched JSONL', async () => {
      await writeJsonl(outJsonl, enriched);
      await testInfo.attach('enriched.jsonl', { path: outJsonl });
    });

    // ---- Render dashboard & attach (always!)
    reportPath = await test.step('Render dashboard (HTML)', async () => {
      const p = await renderDashboard(outJsonl, 'out/report');
      await testInfo.attach('triage_report.html', { path: p, contentType: 'text/html' });
      return p;
    });

    // ---- Slack summary (best-effort)
    await test.step('Post Slack summary (optional)', async () => {
      const byCat = enriched.reduce<Record<string, number>>((m, r) => {
        const k = r.category || 'Unknown';
        m[k] = (m[k] || 0) + 1;
        return m;
      }, {});
      const summary = `Triage summary: total ${enriched.length} | ` +
        Object.entries(byCat).map(([k, v]) => `${k}:${v}`).join(', ');
      await postSlack(summary).catch(() => {});
      // keep a small text artifact for the report
      await testInfo.attach('summary.txt', { body: summary });
      expect(Object.keys(byCat).length).toBeGreaterThan(0);
    });

  } finally {
    // Safety net: if something exploded earlier, still drop minimal artifacts
    try {
      if (!fs.existsSync(outJsonl)) {
        await writeJsonl(outJsonl, enriched);
        await testInfo.attach('enriched.jsonl', { path: outJsonl });
      }
    } catch {}
    try {
      if (reportPath && fs.existsSync(reportPath)) {
        // already attached above
      } else if (fs.existsSync(outJsonl)) {
        const p = await renderDashboard(outJsonl, 'out/report');
        await testInfo.attach('triage_report.html', { path: p, contentType: 'text/html' });
      }
    } catch {}
  }
});

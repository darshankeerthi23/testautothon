import { TfIdf } from './vectorizer';
import type { FailureRecord } from './types';
import { buildText, getComponent } from './fields';

export const RULES: [RegExp, string][] = [
  [/timeout|exceeded\s*\d+ms|operation timed out|navigation timeout/i, 'Timeout/Flaky'],
  [/no such element|selector.*not found|element.*detached|stale element|locator/i, 'Locator/Selector'],
  [/network|ECONNRESET|ENOTFOUND|ETIMEDOUT|5\d{2}\s*server|connection refused|dns|proxy/i, 'Network/Backend'],
  [/assert|expected .* to|AssertionError|mismatch/i, 'Assertion/Expectation'],
  [/\b401\b|\b403\b|unauthoriz|forbidden|token|session|login/i, 'Auth/Permissions'],
  [/dataset|seed|fixture|env(?:ironment)?|config|variable not set/i, 'Data/Environment'],
];

export type TrainedModel = {
  tfidf: TfIdf;
  centroids: Map<string, Map<number, number>>; // category -> centroid vector
  categories: string[];
};

export function ruleCategory(text: string): string | undefined {
  for (const [rx, cat] of RULES) {
    if (rx.test(text)) return cat;
  }
  return undefined;
}

export function trainModel(training: any[]): TrainedModel {
  const texts = training.map(buildText);
  const tfidf = new TfIdf();
  tfidf.fit(texts);

  // Prepare categories: from data or bootstrap via rules when missing
  const rawCats = training.map((r, i) => {
    const c = (r.category || r.failure_category || r.label || r.type || r.class || r.root_cause || r.rca) as string | undefined;
    if (c && String(c).trim()) return String(c).trim();
    // bootstrap from rules
    return ruleCategory(texts[i]) || 'Unknown';
  });

  // centroid per category
  const catDocs = new Map<string, Map<number, number>[]>();
  training.forEach((_, i) => {
    const v = tfidf.vectorize(texts[i]);
    const cat = rawCats[i] || 'Unknown';
    if (!catDocs.has(cat)) catDocs.set(cat, []);
    catDocs.get(cat)!.push(v);
  });

  const centroids = new Map<string, Map<number, number>>();
  for (const [cat, vecs] of catDocs) {
    const agg = new Map<number, number>();
    vecs.forEach(v => {
      v.forEach((val, idx) => agg.set(idx, (agg.get(idx) || 0) + val));
    });
    const c = new Map<number, number>();
    agg.forEach((sum, idx) => c.set(idx, sum / vecs.length));
    centroids.set(cat, c);
  }

  const categories = [...centroids.keys()];
  return { tfidf, centroids, categories };
}

export function classifyOne(model: TrainedModel, r: FailureRecord) {
  const text = buildText(r as any);
  const v = model.tfidf.vectorize(text);

  // rule hit first
  const ruleCat = ruleCategory(text);

  // nearest centroid among learned categories
  let bestCat = 'Unknown', best = -1;
  for (const [cat, c] of model.centroids) {
    const s = model.tfidf.cosine(v, c);
    if (s > best) { best = s; bestCat = cat; }
  }

  const category = ruleCat || bestCat;
  // top tokens for explanation
  const tokens = model.tfidf.topTokens(v, 6);

  // suspected component: prefer explicit field, else token heuristic
  const suspected =
    getComponent(r as any) ||
    tokens.find(t => t.includes('/') || t.includes('.') || t.includes(':')) ||
    'Unknown';

  const reasons: string[] = [];
  if (ruleCat) reasons.push(`Rule matched → ${ruleCat}`);
  reasons.push(`Nearest centroid: ${bestCat} (score ${best.toFixed(2)})`);
  if (tokens.length) reasons.push(`Top tokens: ${tokens.join(', ')}`);

  return { category, reasoning: reasons.join(' | '), suspected_component: suspected };
}

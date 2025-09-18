import type { TicketRow } from './types';

function norm(s?: string) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// simple token overlap score for hackathons
export function correlate(message: string, tickets: TicketRow[], threshold = 0.25) {
  if (!tickets?.length) return null;
  const q = new Set(norm(message).split(' ').filter(Boolean));
  let bestKey = null as string | null;
  let bestScore = 0;

  for (const t of tickets) {
    const text = norm(`${t.summary || ''} ${t.description || ''}`);
    const tok = new Set(text.split(' ').filter(Boolean));
    let overlap = 0;
    for (const w of q) if (tok.has(w)) overlap++;
    const score = overlap / Math.max(1, q.size);
    if (score > bestScore) { bestScore = score; bestKey = t.key; }
  }
  return bestScore >= threshold ? { key: bestKey!, score: Number(bestScore.toFixed(2)) } : null;
}

import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse';

/**
 * Robust reader for:
 *  - Proper JSONL (one object per line)
 *  - Multi-line pretty-printed objects (records separated by blank lines)
 *  - A single JSON array file
 *  - BOM, CRLF, trailing commas, comment lines (# or //)
 *
 * Strategy:
 * 1) If whole file parses as JSON array → return it.
 * 2) Otherwise, stream characters and extract balanced JSON objects by counting braces outside strings.
 */
export async function readJsonl<T = any>(file: string): Promise<T[]> {
  const raw = await fs.promises.readFile(file, 'utf-8');
  const content = raw.replace(/^\uFEFF/, ''); // strip BOM
  const trimmed = content.trim();

  // Case A: whole-file JSON array
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const arr = JSON.parse(trimmed);
      if (Array.isArray(arr)) return arr as T[];
    } catch {
      // fall through
    }
  }

  // Pre-clean: drop pure comment lines
  const cleaned = content
    .split(/\r?\n/)
    .filter((ln) => {
      const s = ln.trim();
      return s && !s.startsWith('//') && !s.startsWith('#');
    })
    .join('\n');

  // Fast path: try strict JSONL (one object per line)
  if (!cleaned.includes('{') || (cleaned.match(/{/g) || []).length === (cleaned.match(/}/g) || []).length) {
    const lines = cleaned.split(/\r?\n/).filter(Boolean);
    let ok = true;
    const out: T[] = [];
    for (const l of lines) {
      const line = stripTrailingComma(l.trim());
      try { out.push(JSON.parse(line)); }
      catch { ok = false; break; }
    }
    if (ok && out.length) return out;
  }

  // General path: multi-line objects (brace-aware)
  const out: T[] = [];
  let buf = '';
  let depth = 0;
  let inStr = false;
  let esc = false;

  const pushIfObject = () => {
    const candidate = stripTrailingComma(buf.trim());
    if (!candidate) return;
    try {
      out.push(JSON.parse(candidate));
    } catch (e) {
      // give context near the first 160 chars to help debug
      const context = candidate.slice(0, 160).replace(/\s+/g, ' ');
      const lineGuess = approximateLineNumber(content, candidate);
      throw new SyntaxError(`Invalid JSON near ${path.basename(file)} line ~${lineGuess}. Context: ${context}`);
    }
  };

  const s = cleaned;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    buf += ch;

    if (inStr) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = false; }
      continue;
    }

    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') { depth++; continue; }
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        // Completed an object; allow a trailing comma right after
        // Eat any following whitespace/comma/newlines before next object
        pushIfObject();
        buf = '';
      }
      continue;
    }
  }

  // If buffer has leftover (e.g., last object without newline)
  if (buf.trim()) {
    // Some exporters omit the closing brace or leave commas;
    // try a last-ditch parse after trimming trailing commas/brackets
    const candidate = stripTrailingComma(buf.trim());
    try { out.push(JSON.parse(candidate)); }
    catch {
      // ignore if it's just whitespace/bric-a-brac
    }
  }

  if (!out.length) {
    throw new SyntaxError(`Could not parse ${path.basename(file)} as JSONL or array. Check formatting around the reported line.`);
  }
  return out;
}

function stripTrailingComma(s: string) {
  // Remove a single trailing comma before } or ] if present: {...,} or [...,]
  return s
    // ,}  → }
    .replace(/,\s*}/g, '}')
    // ,]  → ]
    .replace(/,\s*]/g, ']')
    .trim();
}

function approximateLineNumber(full: string, snippet: string) {
  const idx = full.indexOf(snippet.slice(0, 24));
  if (idx < 0) return '?';
  return full.slice(0, idx).split(/\r?\n/).length;
}

export async function writeJsonl(file: string, rows: any[]) {
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const out = rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
  await fs.promises.writeFile(file, out, 'utf-8');
}

export async function readTicketsCsv(file?: string) {
  if (!file) return [] as { key: string; summary?: string; description?: string }[];
  if (!fs.existsSync(file)) return [];
  const rows: any[] = [];
  return new Promise((resolve, reject) => {
    fs.createReadStream(file)
      .pipe(parse({ columns: true, trim: true }))
      .on('data', (r) => rows.push(r))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

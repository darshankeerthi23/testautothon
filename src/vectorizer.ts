// Simple TF-IDF vectorizer + cosine sim (small + predictable for hackathons)
export class TfIdf {
  private vocab = new Map<string, number>();
  private df = new Map<number, number>();
  private docs: string[][] = [];
  private N = 0;

  private tokenize(s: string): string[] {
    return (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9_\/\.\-]+/g, ' ')
      .split(' ')
      .filter(t => t.length > 1);
  }

  fit(texts: string[]) {
    this.N = texts.length;
    this.docs = texts.map(t => this.tokenize(t));
    // build vocab + df
    const seen = new Set<string>();
    this.docs.forEach(doc => {
      seen.clear();
      doc.forEach(tok => {
        if (!this.vocab.has(tok)) this.vocab.set(tok, this.vocab.size);
        const idx = this.vocab.get(tok)!;
        if (!seen.has(tok)) {
          this.df.set(idx, (this.df.get(idx) || 0) + 1);
          seen.add(tok);
        }
      });
    });
  }

  vectorize(text: string): Map<number, number> {
    const toks = this.tokenize(text);
    const tf = new Map<number, number>();
    toks.forEach(tok => {
      const idx = this.vocab.get(tok);
      if (idx === undefined) return;
      tf.set(idx, (tf.get(idx) || 0) + 1);
    });
    // tf-idf
    const v = new Map<number, number>();
    for (const [idx, f] of tf) {
      const idf = Math.log((this.N + 1) / ((this.df.get(idx) || 1) + 1)) + 1;
      v.set(idx, f * idf);
    }
    return v;
  }

  cosine(a: Map<number, number>, b: Map<number, number>) {
    let dot = 0, na = 0, nb = 0;
    for (const [i, va] of a) {
      na += va * va;
      const vb = b.get(i);
      if (vb) dot += va * vb;
    }
    for (const [, vb] of b) nb += vb * vb;
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
  }

  // utility to extract top tokens that contributed to similarity
  topTokens(query: Map<number, number>, k = 6): string[] {
    const pairs = [...query.entries()].sort((a, b) => b[1] - a[1]).slice(0, k);
    const inv = [...this.vocab.entries()].reduce((m, [t, i]) => (m.set(i, t), m), new Map<number, string>());
    return pairs.map(([i]) => inv.get(i)!).filter(Boolean);
  }
}

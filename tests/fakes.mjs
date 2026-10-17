// Test doubles for the Worker bindings: D1 (on node:sqlite), Workers AI embeddings and Vectorize.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { terms } from '../server/src/kb/terms.js';

export function fakeD1(schemaFile) {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(schemaFile, 'utf8'));
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    first: async () => db.prepare(sql).get(...args) ?? null,
    run: async () => { db.prepare(sql).run(...args); return { success: true }; }
  });
  return { prepare: sql => stmt(sql), batch: async list => { for (const s of list) await s.run(); }, _db: db };
}

// Bag-of-words hashing embedding: texts that share words get similar vectors. Deterministic.
export function fakeAI(dims = 64) {
  return { calls: 0, async run(_model, { contexts }) {
    this.calls++; const text = contexts.map(c => c.text);
    return { response: text.map(t => { const v = new Array(dims).fill(0); for (const w of terms(t)) { let h = 0; for (const ch of w) h = (h * 31 + ch.charCodeAt(0)) >>> 0; v[h % dims] += 1; }
      const n = Math.hypot(...v) || 1; return v.map(x => x / n); }) };
  } };
}

// Vectorize double. leaky: true ignores namespace and filter, like a misconfigured index would,
// to prove the code's own client_id checks still stop cross-client results.
export function fakeVectorize({ leaky = false } = {}) {
  const vecs = new Map();
  return { vecs,
    async upsert(list) { for (const v of list) vecs.set(v.id, v); return { mutationId: 'x' }; },
    async deleteByIds(ids) { ids.forEach(id => vecs.delete(id)); return { mutationId: 'x' }; },
    async query(q, { topK = 5, namespace, filter, returnMetadata } = {}) {
      const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
      const matches = [...vecs.values()]
        .filter(v => leaky || ((!namespace || v.namespace === namespace) && (!filter?.client_id || v.metadata.client_id === filter.client_id)))
        .map(v => ({ id: v.id, score: cos(q, v.values), namespace: v.namespace, metadata: returnMetadata ? v.metadata : undefined }))
        .sort((a, b) => b.score - a.score).slice(0, topK);
      return { count: matches.length, matches };
    } };
}

// Tiny website for crawler tests.
export function fakeSite(pages, robots = '') {
  return async url => {
    const u = new URL(url);
    if (u.pathname === '/robots.txt') return new Response(robots, { status: robots ? 200 : 404 });
    if (u.pathname === '/sitemap.xml') return new Response('', { status: 404 });
    const html = pages[u.pathname];
    if (!html) return new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } });
    const r = new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    Object.defineProperty(r, 'url', { value: u.href });
    return r;
  };
}

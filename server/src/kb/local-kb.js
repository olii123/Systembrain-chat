// Local knowledge base for `npm start`: same reindex flow, chunks saved in a JSON file and
// searched by keyword overlap (no embeddings, no Cloudflare). Good enough to try ingestion offline.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { reindexClient } from './ingest.js';

import { terms } from './terms.js';

export function createLocalKb(file, { topK = 4, minScore = 0.34 } = {}) {
  mkdirSync(dirname(file), { recursive: true });
  let db = { chunks: [], runs: [] };
  try { db = { ...db, ...JSON.parse(readFileSync(file, 'utf8')) }; } catch {}
  const save = () => writeFileSync(file, JSON.stringify(db, null, 1));
  const store = {
    async listChunks(clientId) { return db.chunks.filter(c => c.client_id === clientId); },
    async insertChunks(clientId, rows) { db.chunks.push(...rows.map(r => ({ id: r.id, client_id: clientId, source: r.source, url: r.url, title: r.title, text: r.text, hash: r.hash, updated_at: r.updated_at }))); save(); },
    async deleteChunks(clientId, ids) { const s = new Set(ids); db.chunks = db.chunks.filter(c => !(c.client_id === clientId && s.has(c.id))); save(); },
    async stats(clientId) { const mine = db.chunks.filter(c => c.client_id === clientId); return { chunks: mine.length, pages: [...new Set(mine.map(c => c.url))], lastRun: db.runs.filter(r => r.clientId === clientId).at(-1) || null }; },
    async logRun(clientId, r) { db.runs.push({ ...r, pageList: undefined, skipped: undefined }); db.runs = db.runs.slice(-50); save(); }
  };
  const index = { async upsert() {}, async remove() {} };
  return {
    name: 'local',
    async search(clientId, query) {
      const q = [...new Set(terms(query))]; if (!q.length) return [];
      return db.chunks.filter(c => c.client_id === clientId).map(c => {
        const t = new Set(terms(`${c.title} ${c.text}`));
        return { ...c, score: q.filter(w => t.has(w)).length / q.length };
      }).filter(c => c.score >= minScore).sort((a, b) => b.score - a.score).slice(0, topK);
    },
    reindex: (cfg, opts = {}) => reindexClient({ cfg, store, index, ...opts }),
    stats: clientId => store.stats(clientId)
  };
}

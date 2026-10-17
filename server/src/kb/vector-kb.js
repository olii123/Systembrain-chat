// Knowledge base backed by Workers AI embeddings + Vectorize + D1 (Worker side).
// Tenant isolation, three layers deep:
//  1. every vector is stored in the Vectorize namespace named after its client, and queries name that namespace;
//  2. queries also filter on metadata client_id (a metadata index on client_id is required, see README);
//  3. matches are re-checked against metadata and then loaded from D1 with WHERE client_id = ?, so a stray
//     vector from another client can never turn into context.
import { reindexClient } from './ingest.js';
import { createD1KbStore } from './d1-kb-store.js';
import { expandQuery } from './expand.js';

// bge-m3 beat bge-base-en-v1.5 on a test set of Cloud 9 questions (right page first 11 of 12 times, against 7)
// and takes up to 8,192 input tokens, so 500 to 800 token chunks are embedded whole. 1024 dimensions.
export const EMBED_MODEL = '@cf/baai/bge-m3';
export const EMBED_DIMS = 1024;

export function createVectorKb({ AI, VEC, DB, topK = 4, minScore = 0.5, crawl, limit = 50 }) {
  const store = createD1KbStore(DB);
  const embed = async texts => {
    const out = [];
    for (let i = 0; i < texts.length; i += 50) {
      const r = await AI.run(EMBED_MODEL, { contexts: texts.slice(i, i + 50).map(text => ({ text })), truncate_inputs: true });
      const vecs = r.data || r.response;
      if (!Array.isArray(vecs) || vecs.length !== Math.min(50, texts.length - i)) throw new Error('Unexpected embedding response');
      out.push(...vecs);
    }
    return out;
  };
  const index = {
    async upsert(clientId, rows) {
      if (!rows.length) return;
      const vecs = await embed(rows.map(r => `${r.title}\n${r.text}`));
      for (let i = 0; i < rows.length; i += 200) {
        await VEC.upsert(rows.slice(i, i + 200).map((r, j) => ({ id: r.id, values: vecs[i + j], namespace: clientId,
          metadata: { client_id: clientId, source: r.source, url: r.url.slice(0, 500), title: String(r.title).slice(0, 200) } })));
      }
    },
    async remove(_clientId, ids) { for (let i = 0; i < ids.length; i += 100) if (ids.length) await VEC.deleteByIds(ids.slice(i, i + 100)); }
  };
  return {
    name: 'vectorize',
    async search(clientId, query, { k = topK, min = minScore } = {}) {
      if (!clientId || !String(query || '').trim()) return [];
      const [vector] = await embed([expandQuery(String(query).slice(0, 1000))]);
      const res = await VEC.query(vector, { topK: k, namespace: clientId, filter: { client_id: clientId }, returnMetadata: 'all' });
      const matches = (res.matches || []).filter(m => m.score >= min && m.metadata?.client_id === clientId && (m.namespace ?? clientId) === clientId);
      const rows = await store.getChunks(clientId, matches.map(m => m.id));
      const byId = new Map(rows.filter(r => r.client_id === clientId).map(r => [r.id, r]));
      return matches.filter(m => byId.has(m.id)).map(m => ({ ...byId.get(m.id), score: m.score }));
    },
    reindex: (cfg, opts = {}) => reindexClient({ cfg, store, index, crawl, limit, ...opts }),
    stats: clientId => store.stats(clientId),
    _store: store, _embed: embed
  };
}

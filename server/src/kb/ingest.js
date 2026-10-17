// Reindex one client: crawl its website (if set), add FAQs, chunk, then sync the chunk store and
// the vector index. Unchanged chunks (same id) are kept, new ones embedded, removed ones deleted.
// Works with any store/index pair: D1 + Vectorize in the Worker, JSON + keyword search locally.
import { crawlSite } from './crawl.js';
import { pagesToDocs, faqDocs } from './docs.js';

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

// The id includes the client id, so the same text on two clients still gives two separate chunks.
// 64 hex chars, the Vectorize id length limit.
export const chunkId = (clientId, url, text) => sha256(`${clientId}\n${url}\n${text}`);

export async function reindexClient({ cfg, store, index, crawl = crawlSite, limit = 50, pdfDocs = [], log = () => {} }) {
  const clientId = cfg.clientId; const started = new Date().toISOString();
  const run = { clientId, website: cfg.website || null, started_at: started, pages: 0, chunks: 0, added: 0, removed: 0, kept: 0, skipped: [], error: null };
  let docs = [], crawlOk = true;
  if (cfg.website) {
    try {
      const r = await crawl(cfg.website, { limit, log });
      run.pages = r.pages.length; run.pageList = r.pages.map(p => ({ url: p.url, title: p.title })); run.skipped = r.skipped;
      if (!r.pages.length) { crawlOk = false; run.error = `No pages could be crawled from ${cfg.website}` + (r.skipped[0] ? ` (${r.skipped[0].reason})` : ''); }
      docs.push(...pagesToDocs(r.pages));
    } catch (e) { crawlOk = false; run.error = `Crawl failed: ${e.message}`; }
  }
  docs.push(...faqDocs(cfg), ...pdfDocs);

  const rows = [];
  for (const d of docs) {
    const id = await chunkId(clientId, d.url, d.text);
    if (!rows.some(r => r.id === id)) rows.push({ ...d, id, client_id: clientId, hash: await sha256(d.text) });
  }
  const existing = await store.listChunks(clientId);
  const have = new Set(existing.map(r => r.id)), want = new Set(rows.map(r => r.id));
  const fresh = rows.filter(r => !have.has(r.id));
  // If the crawl failed, keep the old web chunks rather than wiping the client's knowledge.
  const stale = existing.filter(r => !want.has(r.id) && (crawlOk || r.source !== 'web')).map(r => r.id);

  const now = new Date().toISOString();
  // Write rows before vectors, so a search never finds a vector without its text.
  await store.insertChunks(clientId, fresh.map(r => ({ ...r, updated_at: now })));
  await index.upsert(clientId, fresh);
  await index.remove(clientId, stale);
  await store.deleteChunks(clientId, stale);

  Object.assign(run, { chunks: rows.length, added: fresh.length, removed: stale.length, kept: rows.length - fresh.length, finished_at: new Date().toISOString() });
  await store.logRun?.(clientId, run);
  log(`reindex ${clientId}: ${run.pages} pages, ${run.chunks} chunks (+${run.added} -${run.removed})${run.error ? ' ERROR ' + run.error : ''}`);
  return run;
}

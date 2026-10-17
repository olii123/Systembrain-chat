// Knowledge base chunk store on D1 (table kb_chunks). Every query filters on client_id.
export function createD1KbStore(DB) {
  const inList = n => Array.from({ length: n }, (_, i) => `?${i + 2}`).join(',');
  const inBatches = async (ids, size, fn) => { for (let i = 0; i < ids.length; i += size) await fn(ids.slice(i, i + size)); };
  return {
    async listChunks(clientId) {
      return (await DB.prepare('SELECT id, hash, source, url FROM kb_chunks WHERE client_id = ?1').bind(clientId).all()).results;
    },
    async insertChunks(clientId, rows) {
      const stmt = DB.prepare(`INSERT INTO kb_chunks (id, client_id, source, url, title, text, hash, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        ON CONFLICT(id) DO UPDATE SET title = ?5, updated_at = ?8 WHERE client_id = ?2`);
      for (let i = 0; i < rows.length; i += 50)
        await DB.batch(rows.slice(i, i + 50).map(r => stmt.bind(r.id, clientId, r.source, r.url, r.title, r.text, r.hash, r.updated_at)));
    },
    async deleteChunks(clientId, ids) {
      await inBatches(ids, 90, b => DB.prepare(`DELETE FROM kb_chunks WHERE client_id = ?1 AND id IN (${inList(b.length)})`).bind(clientId, ...b).run());
    },
    async getChunks(clientId, ids) {
      if (!ids.length) return [];
      return (await DB.prepare(`SELECT id, client_id, source, url, title, text, updated_at FROM kb_chunks WHERE client_id = ?1 AND id IN (${inList(ids.length)})`)
        .bind(clientId, ...ids).all()).results;
    },
    async stats(clientId) {
      const pages = (await DB.prepare('SELECT source, url, title, count(*) AS chunks, max(updated_at) AS updated_at FROM kb_chunks WHERE client_id = ?1 GROUP BY source, url, title ORDER BY source DESC, url')
        .bind(clientId).all()).results;
      const lastRun = await DB.prepare('SELECT * FROM kb_runs WHERE client_id = ?1 ORDER BY id DESC LIMIT 1').bind(clientId).first();
      return { chunks: pages.reduce((a, p) => a + p.chunks, 0), pages, lastRun };
    },
    async logRun(clientId, r) {
      await DB.prepare(`INSERT INTO kb_runs (client_id, started_at, finished_at, website, pages, chunks, added, removed, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(clientId, r.started_at, r.finished_at, r.website, r.pages, r.chunks, r.added, r.removed, r.error).run();
    }
  };
}

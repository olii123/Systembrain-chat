// Cloudflare D1 store. Every method takes clientId first and every query filters on client_id.
// Use through repo.js (bindRepo), never directly from routes.
export function createD1Store(DB) {
  const now = () => new Date().toISOString();
  const getConversation = (clientId, id) => DB.prepare('SELECT * FROM conversations WHERE client_id = ? AND id = ?').bind(clientId, id).first();
  return {
    async conversationOwner(id) { const r = await DB.prepare('SELECT client_id FROM conversations WHERE id = ?').bind(id).first(); return r ? r.client_id : null; },
    getConversation,
    async upsertConversation(clientId, { id, pageUrl, userAgent }) {
      await DB.prepare(`INSERT INTO conversations (id, client_id, started_at, updated_at, page_url, user_agent) VALUES (?1, ?2, ?3, ?3, ?4, ?5)
        ON CONFLICT(id) DO UPDATE SET updated_at = ?3 WHERE client_id = ?2`).bind(id, clientId, now(), pageUrl || null, userAgent || null).run();
      return getConversation(clientId, id);
    },
    async addMessage(clientId, conversationId, role, content) {
      await DB.prepare('INSERT INTO messages (client_id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').bind(clientId, conversationId, role, content, now()).run();
    },
    async getMessages(clientId, conversationId) {
      return (await DB.prepare('SELECT * FROM messages WHERE client_id = ? AND conversation_id = ? ORDER BY id').bind(clientId, conversationId).all()).results;
    },
    async saveLead(clientId, l) {
      // One quote lead and one booking lead per conversation; a booking time later fills in the same row.
      const t = now();
      const row = l.conversationId && await DB.prepare('SELECT id FROM leads WHERE client_id = ? AND conversation_id = ? AND kind = ?').bind(clientId, l.conversationId, l.kind).first();
      if (!row) {
        return DB.prepare(`INSERT INTO leads (client_id, conversation_id, kind, name, mobile, email, booking_day, booking_time, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`).bind(clientId, l.conversationId || null, l.kind, l.name || null, l.mobile || null,
          l.email || null, l.day || null, l.time || null, t, t).first();
      }
      return DB.prepare(`UPDATE leads SET name = COALESCE(NULLIF(?, ''), name), mobile = COALESCE(NULLIF(?, ''), mobile), email = COALESCE(NULLIF(?, ''), email),
        booking_day = COALESCE(NULLIF(?, ''), booking_day), booking_time = COALESCE(NULLIF(?, ''), booking_time), updated_at = ? WHERE client_id = ? AND id = ? RETURNING *`)
        .bind(l.name || '', l.mobile || '', l.email || '', l.day || '', l.time || '', t, clientId, row.id).first();
    },
    async getLeads(clientId, conversationId) {
      return (await DB.prepare('SELECT * FROM leads WHERE client_id = ? AND conversation_id = ? ORDER BY id').bind(clientId, conversationId).all()).results;
    },
    async endConversation(clientId, id) {
      await DB.prepare('UPDATE conversations SET ended_at = ? WHERE client_id = ? AND id = ?').bind(now(), clientId, id).run();
      return getConversation(clientId, id);
    },
    async saveSummary(clientId, s) {
      return DB.prepare(`INSERT INTO summaries (conversation_id, client_id, summary, email_to, email_status, created_at) VALUES (?, ?, ?, ?, 'not_sent', ?) RETURNING *`)
        .bind(s.conversationId, clientId, s.summary, s.emailTo || null, now()).first();
    }
  };
}

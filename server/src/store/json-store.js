// Local file store. Every method takes clientId first and filters on it (use via repo.js).
// Same tables and columns as schema.sql so it can be swapped
// for a D1 store (env.DB.prepare(...)) without touching the routes.
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

export function createJsonStore(file) {
  mkdirSync(dirname(file), { recursive: true });
  let db = { conversations: [], messages: [], leads: [], summaries: [], seq: { messages: 0, leads: 0, summaries: 0 } };
  try { db = { ...db, ...JSON.parse(readFileSync(file, 'utf8')) }; } catch {}
  let queue = Promise.resolve();
  const flush = () => (queue = queue.then(() => {
    writeFileSync(file + '.tmp', JSON.stringify(db, null, 2)); renameSync(file + '.tmp', file);
  }));
  const now = () => new Date().toISOString();
  const nextId = t => ++db.seq[t];

  return {
    async conversationOwner(id) { const c = db.conversations.find(c => c.id === id); return c ? c.client_id : null; },
    async getConversation(clientId, id) { return db.conversations.find(c => c.client_id === clientId && c.id === id) || null; },
    async upsertConversation(clientId, { id, pageUrl, userAgent }) {
      let c = db.conversations.find(c => c.id === id);
      if (c && c.client_id !== clientId) throw new Error('tenant mismatch');
      if (!c) { c = { id, client_id: clientId, started_at: now(), updated_at: now(), ended_at: null, page_url: pageUrl || null, user_agent: userAgent || null }; db.conversations.push(c); }
      else c.updated_at = now();
      await flush(); return c;
    },
    async addMessage(clientId, conversationId, role, content) {
      db.messages.push({ id: nextId('messages'), client_id: clientId, conversation_id: conversationId, role, content, created_at: now() });
      await flush();
    },
    async getMessages(clientId, conversationId) { return db.messages.filter(m => m.client_id === clientId && m.conversation_id === conversationId); },
    async saveLead(clientId, l) {
      // One quote lead and one booking lead per conversation; a booking time later fills in the same row.
      let row = l.conversationId && db.leads.find(x => x.client_id === clientId && x.conversation_id === l.conversationId && x.kind === l.kind);
      if (!row) { row = { id: nextId('leads'), client_id: clientId, conversation_id: l.conversationId || null, kind: l.kind, name: null, mobile: null, email: null, booking_day: null, booking_time: null, created_at: now(), updated_at: now() }; db.leads.push(row); }
      for (const [k, col] of [['name', 'name'], ['mobile', 'mobile'], ['email', 'email'], ['day', 'booking_day'], ['time', 'booking_time']]) if (l[k]) row[col] = l[k];
      row.updated_at = now();
      await flush(); return row;
    },
    async getLeads(clientId, conversationId) { return db.leads.filter(l => l.client_id === clientId && l.conversation_id === conversationId); },
    async endConversation(clientId, id) { const c = db.conversations.find(c => c.client_id === clientId && c.id === id); if (c) { c.ended_at = now(); await flush(); } return c; },
    async saveSummary(clientId, s) {
      const row = { id: nextId('summaries'), conversation_id: s.conversationId, client_id: clientId, summary: s.summary, email_to: s.emailTo || null, email_status: 'not_sent', created_at: now() };
      db.summaries.push(row); await flush(); return row;
    },
    _dump: () => db
  };
}

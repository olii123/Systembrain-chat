// EXAMPLE ONLY, not used yet. How the same app plugs into a Cloudflare Worker.
// wrangler.toml: [[d1_databases]] binding = "DB", and [vars] AI_PROVIDER = "grok";
// secret: wrangler secret put XAI_API_KEY
import { createApp } from './app.js';
import { getProvider } from './providers/index.js';
import demo from '../clients/demo.json';

const clients = { demo }; // or load from KV / a D1 "clients" table

function createD1Store(DB) {
  const now = () => new Date().toISOString();
  return {
    async upsertConversation({ id, clientId, pageUrl, userAgent }) {
      await DB.prepare(`INSERT INTO conversations (id, client_id, started_at, updated_at, page_url, user_agent) VALUES (?1, ?2, ?3, ?3, ?4, ?5)
        ON CONFLICT(id) DO UPDATE SET updated_at = ?3`).bind(id, clientId, now(), pageUrl || null, userAgent || null).run();
      return DB.prepare('SELECT * FROM conversations WHERE id = ?').bind(id).first();
    },
    addMessage: (cid, role, content) => DB.prepare('INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)').bind(cid, role, content, now()).run(),
    getMessages: async cid => (await DB.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY id').bind(cid).all()).results,
    async saveLead(l) { /* INSERT or UPDATE leads, same columns as json-store.js */ },
    getLeads: async cid => (await DB.prepare('SELECT * FROM leads WHERE conversation_id = ?').bind(cid).all()).results,
    async endConversation(id) { await DB.prepare('UPDATE conversations SET ended_at = ? WHERE id = ?').bind(now(), id).run(); return DB.prepare('SELECT * FROM conversations WHERE id = ?').bind(id).first(); },
    async saveSummary(s) { /* INSERT INTO summaries ... */ }
  };
}

export default {
  fetch(request, env, ctx) {
    const app = createApp({ store: createD1Store(env.DB), loadClient: async id => clients[id] || null, getProvider, env });
    return app.fetch(request, env, ctx);
  }
};

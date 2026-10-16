// Repository layer. Routes only ever talk to a repo bound to ONE client, so every read
// and write is scoped by client_id. Under the hood each store method takes clientId first
// and filters on it in SQL (D1) or in code (JSON).

export class TenantError extends Error {
  constructor(msg = 'Session belongs to a different client') { super(msg); this.status = 403; }
}

// Tenant check used by every route that touches a session: the conversation must not
// exist under another client. Returns the conversation (or null if new).
export async function assertSessionOwner(store, clientId, sessionId) {
  const owner = await store.conversationOwner(sessionId);
  if (owner && owner !== clientId) throw new TenantError();
  return owner ? store.getConversation(clientId, sessionId) : null;
}

export function bindRepo(store, clientId) {
  if (!clientId) throw new Error('clientId required');
  return {
    clientId,
    checkSession: sid => assertSessionOwner(store, clientId, sid),
    upsertConversation: async c => { await assertSessionOwner(store, clientId, c.id); return store.upsertConversation(clientId, c); },
    addMessage: (sid, role, content) => store.addMessage(clientId, sid, role, content),
    getMessages: sid => store.getMessages(clientId, sid),
    saveLead: l => store.saveLead(clientId, l),
    getLeads: sid => store.getLeads(clientId, sid),
    endConversation: sid => store.endConversation(clientId, sid),
    saveSummary: s => store.saveSummary(clientId, s)
  };
}

// D1 binding per client. Default is the shared "DB" binding; to give a client a dedicated
// database, add a d1_databases entry (e.g. binding "DB_ACME") in wrangler.jsonc and map it here.
export const D1_BINDINGS = { /* acme: 'DB_ACME' */ };
export const bindingFor = clientId => D1_BINDINGS[clientId] || 'DB';

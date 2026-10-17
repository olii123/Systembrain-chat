// Hono app using only Web-standard Request/Response. The same file runs in Node
// (see node.js) and, later, in a Cloudflare Worker (see README).
// Dependencies are injected: { storeFor, loadClient, getProvider, env, kb }.
// kb (optional) is the knowledge base: { search(clientId, query), reindex(cfg), stats(clientId) }.
// storeFor(clientId) returns the raw store for that client (shared by default, or a dedicated
// database). Routes only use repo(cfg), which is bound to one client_id.
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { buildSummary } from './summary.js';
import { bindRepo, TenantError } from './store/repo.js';

export const WIDGET_VERSIONS = ['v1']; // add 'v2' when widget/v2/widget.js exists
const DEFAULT_WIDGET = 'v1';
const ID = /^[a-z0-9-]{1,64}$/;
const SID = /^[A-Za-z0-9_-]{8,64}$/;
const clip = (s, n) => String(s ?? '').slice(0, n);

// The public part of a client config. Never send owner-only fields (summary email, tone) to browsers.
export function publicConfig(c) {
  return { clientId: c.clientId, brand: c.brand, logoText: c.logoText, colours: c.colours, greeting: c.greeting,
    teaser: c.teaser, chips: c.chips, placeholder: c.placeholder, phone: c.phone, sms: c.sms, bookingSlots: c.bookingSlots,
    widgetVersion: c.widgetVersion || 'v1', features: c.features || {} };
}

// Constant-time string compare (via SHA-256 so lengths match).
async function sameSecret(a, b) {
  const h = async s => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s))));
  const [x, y] = await Promise.all([h(a), h(b)]); let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

export function createApp({ storeFor, loadClient, getProvider, env = {}, kb = null }) {
  const app = new Hono();
  const repo = cfg => bindRepo(storeFor(cfg.clientId), cfg.clientId);
  app.onError((err, c) => {
    if (err instanceof TenantError) return c.json({ error: err.message }, 403);
    console.error('[error]', err.message); return c.json({ error: 'Server error' }, 500);
  });
  app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['content-type'] }));

  const client = async id => (ID.test(id || '') ? await loadClient(id) : null);
  const body = async c => { try { return await c.req.json(); } catch { return null; } };

  // Versioned widget. Files live at /widget/<version>/widget.js. The /widget.js alias picks the
  // version from the client's config (widgetVersion), so a new version can go to one client first.
  app.get('/widget.js', async c => {
    const cfg = await client(c.req.query('c'));
    const v = cfg && WIDGET_VERSIONS.includes(cfg.widgetVersion) ? cfg.widgetVersion : DEFAULT_WIDGET;
    c.header('cache-control', 'public, max-age=300');
    return c.redirect(`/widget/${v}/widget.js`, 302);
  });

  app.get('/api/health', c => c.json({ ok: true, provider: getProvider(env).name }));

  app.get('/api/config/:clientId', async c => {
    const cfg = await client(c.req.param('clientId'));
    if (!cfg) return c.json({ error: 'Unknown client' }, 404);
    c.header('cache-control', 'public, max-age=60');
    return c.json(publicConfig(cfg));
  });

  // Body: { clientId, sessionId, messages: [{ role: 'user'|'assistant', content }], pageUrl }
  // Reply: SSE stream (Accept: text/event-stream) or JSON { status, text, actions }.
  app.post('/api/chat', async c => {
    const b = await body(c);
    const cfg = b && await client(b.clientId);
    if (!cfg) return c.json({ error: 'Unknown client' }, 404);
    if (!SID.test(b.sessionId || '')) return c.json({ error: 'Bad sessionId' }, 400);
    const messages = (Array.isArray(b.messages) ? b.messages : []).slice(-30)
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && m.content)
      .map(m => ({ role: m.role, content: clip(m.content, 2000) }));
    const last = messages[messages.length - 1];
    if (!last || last.role !== 'user') return c.json({ error: 'Last message must be from the user' }, 400);

    const store = repo(cfg);
    await store.upsertConversation({ id: b.sessionId, pageUrl: clip(b.pageUrl, 500), userAgent: clip(c.req.header('user-agent'), 300) });
    await store.addMessage(b.sessionId, 'user', last.content);
    const provider = getProvider(env);
    // Retrieval: only this client's chunks (see kb/vector-kb.js). A KB failure never blocks the chat.
    let context = [];
    if (kb) {
      try { context = await kb.search(cfg.clientId, last.content); }
      catch (err) { console.error('[kb search]', err.message); }
    }
    const run = async emit => {
      let text = '';
      try {
        for await (const ev of provider.chat({ client: cfg, messages, sessionId: b.sessionId, context })) {
          if (ev.type === 'delta') text += ev.text;
          await emit(ev);
        }
      } catch (err) {
        console.error('[chat]', err.message);
        const fallback = `Sorry, I am having trouble right now. You can call us on ${cfg.phone}.`;
        text += fallback; await emit({ type: 'delta', text: fallback });
      }
      if (text) await store.addMessage(b.sessionId, 'assistant', text);
    };

    if ((c.req.header('accept') || '').includes('text/event-stream')) {
      return streamSSE(c, async s => {
        await run(ev => s.writeSSE({ event: ev.type, data: JSON.stringify(ev) }));
        await s.writeSSE({ event: 'done', data: '{}' });
      });
    }
    const out = { status: '', text: '', actions: [] };
    await run(ev => { if (ev.type === 'status') out.status = ev.text; if (ev.type === 'delta') out.text += ev.text; if (ev.type === 'actions') out.actions = ev.actions; });
    return c.json(out);
  });

  // Body: { clientId, sessionId, kind: 'quote'|'booking', name, mobile, email, day, time }
  app.post('/api/lead', async c => {
    const b = await body(c);
    const cfg = b && await client(b.clientId);
    if (!cfg) return c.json({ error: 'Unknown client' }, 404);
    if (!['quote', 'booking'].includes(b.kind)) return c.json({ error: 'Bad kind' }, 400);
    const mobile = clip(b.mobile, 20).replace(/\s/g, '');
    if (b.mobile && !/^(\+?61|0)4\d{8}$/.test(mobile)) return c.json({ error: 'Invalid Australian mobile' }, 400);
    if (!b.mobile && !b.day) return c.json({ error: 'Nothing to save' }, 400);
    const sid = SID.test(b.sessionId || '') ? b.sessionId : null;
    const store = repo(cfg);
    if (sid) await store.upsertConversation({ id: sid });
    const lead = await store.saveLead({ conversationId: sid, kind: b.kind,
      name: clip(b.name, 100).trim(), mobile: b.mobile ? mobile : '', email: clip(b.email, 200).trim(), day: clip(b.day, 60), time: clip(b.time, 60) });
    return c.json({ ok: true, leadId: lead.id });
  });

  // Body: { clientId, sessionId }. Builds a summary for the owner. Email sending comes later.
  app.post('/api/end', async c => {
    const b = await body(c) || {};
    const cfg = await client(b.clientId);
    if (!cfg) return c.json({ error: 'Unknown client' }, 404);
    if (!SID.test(b.sessionId || '')) return c.json({ error: 'Bad sessionId' }, 400);
    const store = repo(cfg);
    if (!await store.checkSession(b.sessionId)) return c.json({ ok: true, summary: null });
    const conv = await store.endConversation(b.sessionId);
    if (!conv) return c.json({ ok: true, summary: null });
    const summary = buildSummary(cfg, conv, await store.getMessages(conv.id), await store.getLeads(conv.id));
    const row = await store.saveSummary({ conversationId: conv.id, summary, emailTo: cfg.summaryEmail });
    // TODO: send to cfg.summaryEmail (e.g. Cloudflare Email Workers or Resend) and set email_status = 'sent'.
    return c.json({ ok: true, summaryId: row.id, summary });
  });

  // Admin: knowledge base. Needs header "Authorization: Bearer <ADMIN_TOKEN>". No token set means admin is off.
  const admin = async (c, next) => {
    const token = env.ADMIN_TOKEN, got = (c.req.header('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token || !got || !await sameSecret(got, token)) return c.json({ error: 'Unauthorised' }, 401);
    const cfg = await client(c.req.param('clientId'));
    if (!cfg) return c.json({ error: 'Unknown client' }, 404);
    if (!kb) return c.json({ error: 'Knowledge base is not configured' }, 503);
    c.set('cfg', cfg); return next();
  };
  // Crawl the client's website (if set) and reload its FAQs. Returns pages, chunk counts and anything skipped.
  app.post('/api/admin/:clientId/reindex', admin, async c => c.json(await kb.reindex(c.get('cfg'))));
  app.get('/api/admin/:clientId/kb', admin, async c => c.json(await kb.stats(c.get('cfg').clientId)));
  // What the chat would retrieve for a question (for checking answers and tenant isolation). ?min=0 shows weaker matches too.
  app.get('/api/admin/:clientId/search', admin, async c => c.json({ clientId: c.get('cfg').clientId,
    results: (await kb.search(c.get('cfg').clientId, clip(c.req.query('q'), 500), c.req.query('min') ? { min: Number(c.req.query('min')), k: 8 } : undefined)).map(r => ({ id: r.id, client_id: r.client_id, score: r.score, source: r.source, url: r.url, title: r.title, text: clip(r.text, 300) })) }));
  // PDF upload: STUB. Planned: store the file in R2, extract text, then add chunks with source 'pdf'.
  app.post('/api/admin/:clientId/pdf', admin, c => c.json({ error: 'PDF upload is not built yet. Add the text as kbFaqs in the client config for now.' }, 501));

  return app;
}

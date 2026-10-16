// Hono app using only Web-standard Request/Response. The same file runs in Node
// (see node.js) and, later, in a Cloudflare Worker (see README).
// Dependencies are injected: { store, loadClient, getProvider, env }.
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { buildSummary } from './summary.js';

const ID = /^[a-z0-9-]{1,64}$/;
const SID = /^[A-Za-z0-9_-]{8,64}$/;
const clip = (s, n) => String(s ?? '').slice(0, n);

// The public part of a client config. Never send owner-only fields (summary email, tone) to browsers.
export function publicConfig(c) {
  return { clientId: c.clientId, brand: c.brand, logoText: c.logoText, colours: c.colours, greeting: c.greeting,
    teaser: c.teaser, chips: c.chips, placeholder: c.placeholder, phone: c.phone, sms: c.sms, bookingSlots: c.bookingSlots };
}

export function createApp({ store, loadClient, getProvider, env = {} }) {
  const app = new Hono();
  app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['content-type'] }));

  const client = async id => (ID.test(id || '') ? await loadClient(id) : null);
  const body = async c => { try { return await c.req.json(); } catch { return null; } };

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

    await store.upsertConversation({ id: b.sessionId, clientId: cfg.clientId, pageUrl: clip(b.pageUrl, 500), userAgent: clip(c.req.header('user-agent'), 300) });
    await store.addMessage(b.sessionId, 'user', last.content);
    const provider = getProvider(env);
    const run = async emit => {
      let text = '';
      try {
        for await (const ev of provider.chat({ client: cfg, messages, sessionId: b.sessionId })) {
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
    if (sid) await store.upsertConversation({ id: sid, clientId: cfg.clientId });
    const lead = await store.saveLead({ clientId: cfg.clientId, conversationId: sid, kind: b.kind,
      name: clip(b.name, 100).trim(), mobile: b.mobile ? mobile : '', email: clip(b.email, 200).trim(), day: clip(b.day, 60), time: clip(b.time, 60) });
    return c.json({ ok: true, leadId: lead.id });
  });

  // Body: { clientId, sessionId }. Builds a summary for the owner. Email sending comes later.
  app.post('/api/end', async c => {
    const b = await body(c) || {};
    const cfg = await client(b.clientId);
    if (!cfg) return c.json({ error: 'Unknown client' }, 404);
    if (!SID.test(b.sessionId || '')) return c.json({ error: 'Bad sessionId' }, 400);
    const conv = await store.endConversation(b.sessionId);
    if (!conv) return c.json({ ok: true, summary: null });
    const summary = buildSummary(cfg, conv, await store.getMessages(conv.id), await store.getLeads(conv.id));
    const row = await store.saveSummary({ conversationId: conv.id, clientId: cfg.clientId, summary, emailTo: cfg.summaryEmail });
    // TODO: send to cfg.summaryEmail (e.g. Cloudflare Email Workers or Resend) and set email_status = 'sent'.
    return c.json({ ok: true, summaryId: row.id, summary });
  });

  return app;
}

// Cloudflare Worker entry point: `npm run deploy`. Static files (widget/, demo/) are served
// by Workers static assets before this code runs; everything else (the /api routes) lands here.
// Storage is D1: shared binding DB by default, or a per-client binding (see store/repo.js). AI_PROVIDER comes from wrangler.jsonc vars (default mock).
// Secrets, never in the repo: XAI_API_KEY (Grok) and ADMIN_TOKEN (admin endpoints), set with `npx wrangler secret put`.
// Knowledge base: Workers AI (binding AI) for embeddings, Vectorize (binding KB_INDEX) for search, chunk text in D1.
import { createApp } from './app.js';
import { getProvider } from './providers/index.js';
import { createD1Store } from './store/d1-store.js';
import { bindingFor } from './store/repo.js';
import { createVectorKb } from './kb/vector-kb.js';
import demo from '../clients/demo.json';
import cloud9 from '../clients/cloud9.json';

// Client configs are bundled at build time. Add a new client by importing its JSON here.
export const clients = { demo, cloud9 };

const kbFor = env => (env.AI && env.KB_INDEX ? createVectorKb({ AI: env.AI, VEC: env.KB_INDEX, DB: env.DB,
  minScore: Number(env.KB_MIN_SCORE || 0.5), limit: Number(env.KB_CRAWL_LIMIT || 50) }) : null);

export default {
  fetch(request, env, ctx) {
    const app = createApp({ storeFor: id => createD1Store(env[bindingFor(id)]), loadClient: async id => clients[id] || null, getProvider, env, kb: kbFor(env) });
    app.get('/', c => c.redirect('/demo/'));
    return app.fetch(request, env, ctx);
  },
  // Weekly Cron Trigger (see wrangler.jsonc): re-crawl every client that has a website.
  async scheduled(event, env, ctx) {
    const kb = kbFor(env); if (!kb) return;
    ctx.waitUntil((async () => {
      for (const cfg of Object.values(clients)) {
        if (!cfg.website) continue;
        try { await kb.reindex(cfg, { log: m => console.log('[kb cron]', m) }); }
        catch (err) { console.error('[kb cron]', cfg.clientId, err.message); }
      }
    })());
  }
};

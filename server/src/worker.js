// Cloudflare Worker entry point: `npm run deploy`. Static files (widget/, demo/) are served
// by Workers static assets before this code runs; everything else (the /api routes) lands here.
// Storage is D1: shared binding DB by default, or a per-client binding (see store/repo.js). AI_PROVIDER comes from wrangler.jsonc vars (default mock).
// XAI_API_KEY is only ever a Worker secret: `npx wrangler secret put XAI_API_KEY`.
import { createApp } from './app.js';
import { getProvider } from './providers/index.js';
import { createD1Store } from './store/d1-store.js';
import { bindingFor } from './store/repo.js';
import demo from '../clients/demo.json';
import cloud9 from '../clients/cloud9.json';

// Client configs are bundled at build time. Add a new client by importing its JSON here.
const clients = { demo, cloud9 };

export default {
  fetch(request, env, ctx) {
    const app = createApp({ storeFor: id => createD1Store(env[bindingFor(id)]), loadClient: async id => clients[id] || null, getProvider, env });
    app.get('/', c => c.redirect('/demo/'));
    return app.fetch(request, env, ctx);
  }
};

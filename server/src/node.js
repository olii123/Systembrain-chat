// Local Node entry point: `npm start`. Serves the API plus the widget and demo files.
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { createApp } from './app.js';
import { createJsonStore } from './store/json-store.js';
import { getProvider } from './providers/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = join(here, '..', '..');
const rel = p => relative(process.cwd(), join(rootDir, p)) || '.';
const env = process.env;
const jsonStore = createJsonStore(env.DB_FILE || join(rootDir, 'server', 'data', 'db.json'));
const loadClient = async id => { try { return JSON.parse(await readFile(join(rootDir, 'server', 'clients', `${id}.json`), 'utf8')); } catch { return null; } };

const app = createApp({ storeFor: () => jsonStore, loadClient, getProvider, env });
app.use('/widget/*', serveStatic({ root: rel('.'), onFound: (_p, c) => c.header('cache-control', 'no-cache') }));
app.use('/demo/*', serveStatic({ root: rel('.') }));
app.get('/', c => c.redirect('/demo/'));

const port = Number(env.PORT || 8787);
serve({ fetch: app.fetch, port }, () => console.log(`SystemBrain chat running: http://localhost:${port}/demo/  (AI provider: ${getProvider(env).name})`));

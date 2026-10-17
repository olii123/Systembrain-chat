// Reindex a client on the live Worker: `npm run kb:reindex -- cloud9`.
// Reads the admin token from .admin-token (gitignored) or ADMIN_TOKEN in the environment.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.LIVE_URL || 'https://systembrain-chat.systembrain.workers.dev').replace(/\/$/, '');
const id = process.argv[2];
if (!id) { console.error('Usage: npm run kb:reindex -- <clientId>'); process.exit(1); }
let token = process.env.ADMIN_TOKEN;
try { token ||= readFileSync(join(root, '.admin-token'), 'utf8').trim(); } catch {}
if (!token) { console.error('No admin token: put it in .admin-token or set ADMIN_TOKEN.'); process.exit(1); }
const res = await fetch(`${BASE}/api/admin/${id}/reindex`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
const out = await res.text();
console.log(res.status, out);
if (!res.ok) process.exit(1);

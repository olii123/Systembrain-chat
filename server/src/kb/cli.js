// Local reindex without the server: `npm run kb:local -- cloud9`. Writes server/data/kb.json.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createLocalKb } from './local-kb.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const id = process.argv[2];
if (!/^[a-z0-9-]{1,64}$/.test(id || '')) { console.error('Usage: npm run kb:local -- <clientId>'); process.exit(1); }
const cfg = JSON.parse(await readFile(join(root, 'server', 'clients', `${id}.json`), 'utf8'));
const kb = createLocalKb(process.env.KB_FILE || join(root, 'server', 'data', 'kb.json'));
const run = await kb.reindex(cfg, { log: console.log });
console.log(JSON.stringify({ ...run, skipped: run.skipped?.length }, null, 2));

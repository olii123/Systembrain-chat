// Live knowledge base test against the deployed Worker: admin auth, tenant isolation, answers from
// Cloud 9 pages, and a screenshot of the Cloud 9 demo answering a real question (shots-live/kb/).
// Usage: npm run test:live:kb   (needs .admin-token, which is gitignored)
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.LIVE_URL || 'https://systembrain-chat.systembrain.workers.dev').replace(/\/$/, '');
const TOKEN = process.env.ADMIN_TOKEN || readFileSync(join(root, '.admin-token'), 'utf8').trim();
const shots = join(root, 'shots-live', 'kb'); mkdirSync(shots, { recursive: true });
const demoCfg = JSON.parse(readFileSync(join(root, 'server/clients/demo.json'), 'utf8'));
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const auth = { authorization: `Bearer ${TOKEN}` };
const search = async (id, q, min = 0) => (await (await fetch(`${BASE}/api/admin/${id}/search?min=${min}&q=${encodeURIComponent(q)}`, { headers: auth })).json()).results;
const chat = async (clientId, content) => (await (await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ clientId, sessionId: 'kbtest' + Date.now() + Math.random().toString(36).slice(2, 8), messages: [{ role: 'user', content }] }) })).json());

// Admin auth
ok((await fetch(`${BASE}/api/admin/cloud9/reindex`, { method: 'POST' })).status === 401, 'reindex without token is 401');
ok((await fetch(`${BASE}/api/admin/cloud9/reindex`, { method: 'POST', headers: { authorization: 'Bearer wrong' } })).status === 401, 'reindex with a wrong token is 401');
const stats = await (await fetch(`${BASE}/api/admin/cloud9/kb`, { headers: auth })).json();
ok(stats.chunks > 5, `cloud9 has ${stats.chunks} chunks from ${new Set(stats.pages.filter(p => p.source === 'web').map(p => p.url)).size} pages`);

// Tenant isolation: questions written to match demo's FAQs exactly. With no score cut-off (min=0),
// every result for cloud9 must still be a cloud9 chunk, and the reverse for demo.
const demoQs = demoCfg.kbFaqs.map(f => f.question);
let leak = 0, n = 0;
for (const q of [...demoQs, 'Acme Services call-out fee', 'What is your phone number?']) {
  for (const r of await search('cloud9', q)) { n++; if (r.client_id !== 'cloud9' || r.url.startsWith('faq:demo') || /Acme/.test(r.text)) leak++; }
  for (const r of await search('demo', q)) { n++; if (r.client_id !== 'demo' || /cloud9|Cloud 9/i.test(r.url + r.text)) leak++; }
}
ok(n > 0 && leak === 0, `tenant isolation: ${n} results checked, ${leak} from the other client`);
const pay = await chat('cloud9', demoQs[1]);
ok(!/card, bank transfer and cash/.test(pay.text), 'cloud9 chat never answers with demo FAQ text');
const dem = await chat('demo', demoQs[0]);
ok(/30 day workmanship guarantee/.test(dem.text) && /Source: our FAQs/.test(dem.text), 'demo answers its own FAQ with source');

// Cloud 9 Q&A: answers should come from Cloud 9 website pages.
const qa = ['What services do you offer?', 'What areas do you service?', 'How much does it cost?', 'Do you have any discounts?', 'How do I contact you?', 'Do you clean solar panels?', 'Do you offer a warranty?', 'Do you use chemicals?'];
for (const q of qa) {
  const top = (await search('cloud9', q, 0.5))[0];
  const a = await chat('cloud9', q);
  console.log(`  Q: ${q}\n  A: ${a.text}\n  top: ${top ? `${top.score.toFixed(3)} ${top.url}` : 'none'}`);
  ok(top && top.client_id === 'cloud9' && /Source: /.test(a.text), `"${q}" answered from ${top ? top.title : 'nothing'}`);
}

// Screenshot: the Cloud 9 demo answering a real question.
const browser = await chromium.launch();
try {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto(`${BASE}/demo/cloud9/`);
  await page.locator('#systembrain-widget .launch').click(); await page.waitForTimeout(500);
  const askUi = async (q, file) => {
    const n = await page.locator('#systembrain-widget .bot').count();
    await page.locator('#systembrain-widget .inp input').fill(q); await page.keyboard.press('Enter');
    await page.locator('#systembrain-widget .bot').nth(n).filter({ hasText: /Source: [^)]+\)/ }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(800); await page.screenshot({ path: `${shots}/${file}` });
    return page.locator('#systembrain-widget .bot').nth(n).textContent();
  };
  const t1 = await askUi('Do you use chemicals on the windows?', '01-cloud9-chemicals.png');
  ok(/chemical-free/i.test(t1) && /Source: /.test(t1), 'widget shows an answer from a Cloud 9 page');
  const t2 = await askUi('How do I contact you?', '02-cloud9-contact.png');
  ok(/0485 013 333|\(02\) 5564 4109/.test(t2), 'widget shows the real Cloud 9 phone number from the website');
} catch (e) { ok(false, 'exception: ' + e.message); }
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);

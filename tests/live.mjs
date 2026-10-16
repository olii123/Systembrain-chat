// Live end to end test against the deployed Worker. Checks D1 via `wrangler d1 execute --remote`.
// Usage: LIVE_URL=https://systembrain-chat.systembrain.workers.dev npm run test:live   (screenshots go to shots-live/)
import { chromium, devices } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.LIVE_URL || 'https://systembrain-chat.systembrain.workers.dev').replace(/\/$/, '');
const CLIENT = process.env.CLIENT_ID || readFileSync(join(root, (process.env.DEMO_PATH || '/demo/').slice(1), 'index.html'), 'utf8').match(/data-client-id="([^"]+)"/)[1];
const PAGE = process.env.DEMO_PATH || '/demo/';
const shots = join(root, 'shots-live', CLIENT); mkdirSync(shots, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const q = sql => JSON.parse(execFileSync('npx', ['wrangler', 'd1', 'execute', 'systembrain-chat', '--remote', '--json', '--command', sql], { cwd: root, encoding: 'utf8' }))[0].results;
const db = () => ({ leads: q(`SELECT * FROM leads WHERE client_id = '${CLIENT}'`), messages: q(`SELECT * FROM messages WHERE client_id = '${CLIENT}'`), summaries: q(`SELECT * FROM summaries WHERE client_id = '${CLIENT}'`) });
const browser = await chromium.launch();
try {
  // API checks
  const cfg = await (await fetch(`${BASE}/api/config/${CLIENT}`)).json();
  ok(cfg.brand && !('summaryEmail' in cfg), `GET /api/config/${CLIENT} returns public config (${cfg.brand})`);
  ok((await fetch(`${BASE}/api/config/nope`)).status === 404, 'unknown client gives 404');
  const j = await (await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: CLIENT, sessionId: 'apitest' + Date.now(), messages: [{ role: 'user', content: 'what are your hours' }] }) })).json();
  ok(/Monday/.test(j.text), 'POST /api/chat JSON mode replies');

  const wr = await fetch(`${BASE}/widget.js?c=${CLIENT}`, { redirect: 'manual' });
  ok(wr.status === 302 && /\/widget\/v1\/widget\.js$/.test(wr.headers.get('location')), '/widget.js?c= alias redirects to the client widgetVersion');
  ok((await fetch(`${BASE}/widget/v1/widget.js`)).status === 200, '/widget/v1/widget.js served as a static asset');
  ok((await fetch(`${BASE}/server/schema.sql`)).status === 404, 'server files are not public');
  // Tenant isolation: a session started under one client cannot be used by another.
  const other = CLIENT === 'demo' ? 'cloud9' : 'demo', xsid = 'xtenant' + Date.now();
  const post = (path, data) => fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  await post('/api/chat', { clientId: CLIENT, sessionId: xsid, messages: [{ role: 'user', content: 'hi' }] });
  ok((await post('/api/lead', { clientId: other, sessionId: xsid, kind: 'quote', name: 'X', mobile: '0412345678' })).status === 403, 'other client cannot write to this session (403)');
  ok((await post('/api/chat', { clientId: other, sessionId: xsid, messages: [{ role: 'user', content: 'hi' }] })).status === 403, 'other client cannot chat on this session (403)');
  ok(q(`SELECT count(*) n FROM leads WHERE conversation_id = '${xsid}'`)[0].n === 0, 'no cross-client lead written');

  // Desktop
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}${PAGE}`);
  await page.locator('#systembrain-widget .launch').waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${shots}/01-closed-teaser.png` });
  await page.locator('#systembrain-widget .launch').click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${shots}/02-open-greeting.png` });
  ok(await page.locator('#systembrain-widget .bot').count() === 1, 'greeting shown on open');

  await page.locator('#systembrain-widget .chip', { hasText: 'Hours' }).click();
  await page.locator('#systembrain-widget .status').waitFor();
  await page.screenshot({ path: `${shots}/03-status-pill.png` });
  await page.locator('#systembrain-widget .bot').nth(1).waitFor();
  await page.locator('#systembrain-widget .chips').nth(1).waitFor(); // reply finished streaming
  ok(/Monday/.test(await page.locator('#systembrain-widget .bot').nth(1).textContent()), 'chip -> streamed SSE reply');

  await page.locator('#systembrain-widget .inp input').fill('How much for a quote?');
  await page.keyboard.press('Enter');
    const lead = page.locator('#systembrain-widget form.card');
  await lead.waitFor();
  await lead.locator('button.pri').click();
  ok(/valid Australian mobile/.test(await lead.locator('.err').textContent()), 'lead form validates');
  await lead.locator('input[name=name]').fill('Sam Test');
  await lead.locator('input[name=mobile]').fill('0412 345 678');
  await lead.locator('input[name=email]').fill('sam@example.com');
  await page.screenshot({ path: `${shots}/04-lead-form.png` });
  await lead.locator('button.pri').click();
  await page.locator('#systembrain-widget .card h4', { hasText: 'Thanks, Sam Test' }).waitFor();
  await page.waitForTimeout(1000);
  const sid = await page.evaluate(c => localStorage.getItem('sb-session-' + c), CLIENT);
  ok(db().leads.some(l => l.kind === 'quote' && l.mobile === '0412345678' && l.conversation_id === sid), 'quote lead stored in db with sessionId');
  await page.screenshot({ path: `${shots}/05-lead-done.png` });

  await page.locator('#systembrain-widget .inp input').fill('I want to book an appointment');
  await page.keyboard.press('Enter');
  const bl = page.locator('#systembrain-widget form.card:has(input[name=name])');
  await bl.waitFor();
  await bl.locator('input[name=name]').fill('Sam Test'); await bl.locator('input[name=mobile]').fill('0412345678');
  await bl.locator('button.pri').click();
  const bk = page.locator('#systembrain-widget form.card:has(select[name=day])');
  await bk.waitFor();
  await page.screenshot({ path: `${shots}/06-booking-card.png` });
  await bk.locator('select[name=time]').selectOption({ index: 1 });
  await bk.locator('button.pri').click();
  await page.locator('#systembrain-widget .card h4', { hasText: 'Requested:' }).waitFor();
  await page.waitForTimeout(1000);
  const b = db().leads.find(l => l.kind === 'booking' && l.conversation_id === sid);
  ok(b && b.name === 'Sam Test' && b.booking_day && /Afternoon/.test(b.booking_time), 'booking stored (details + day/time in one row)');
  await page.screenshot({ path: `${shots}/07-booking-done.png` });

  const before = await page.locator('#systembrain-widget .body > *').count();
  await page.reload();
  await page.locator('#systembrain-widget .launch').click();
  await page.waitForTimeout(500);
  const after = await page.locator('#systembrain-widget .body > *').count();
  ok(after === before && after > 5, `reload keeps chat (${after} items)`);
  ok(await page.locator('#systembrain-widget .teaser').count() === 0, 'teaser stays dismissed after open');
  await page.screenshot({ path: `${shots}/08-after-reload.png` });
  ok(db().messages.filter(m => m.conversation_id === sid).length >= 4, 'chat messages logged');

  // Accessibility: focus trap and Esc
  for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
  ok(await page.evaluate(() => { const r = document.querySelector('#systembrain-widget').shadowRoot; return !!(r.activeElement && r.querySelector('.panel').contains(r.activeElement)); }), 'focus trapped in panel');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  ok(!(await page.evaluate(() => document.querySelector('#systembrain-widget').shadowRoot.querySelector('.w').classList.contains('open'))), 'Esc closes');

  // End chat -> summary
  await page.locator('#systembrain-widget .launch').click(); await page.waitForTimeout(300);
  await page.locator('#systembrain-widget .cl').click(); await page.waitForTimeout(800);
  const s = db().summaries.find(x => x.conversation_id === sid);
  ok(s && /Sam Test/.test(s.summary), 'close and clear posts /api/end and stores a summary');
  ok(errors.length === 0, 'no page errors ' + errors.join(';'));
  await ctx.close();

  // Mobile
  const m = await browser.newContext({ ...devices['iPhone 13'] });
  const mp = await m.newPage();
  await mp.goto(`${BASE}${PAGE}`);
  await mp.locator('#systembrain-widget .launch').waitFor(); await mp.waitForTimeout(400);
  await mp.screenshot({ path: `${shots}/09-mobile-closed.png` });
  await mp.locator('#systembrain-widget .launch').click(); await mp.waitForTimeout(500);
  const box = await mp.locator('#systembrain-widget .panel').boundingBox();
  ok(box && box.x === 0 && box.y === 0 && Math.round(box.width) === 390, 'mobile full-screen sheet');
  await mp.locator('#systembrain-widget .chip').first().click();
  await mp.locator('#systembrain-widget form.card').waitFor();
  await mp.waitForTimeout(300);
  await mp.screenshot({ path: `${shots}/10-mobile-chat.png` });
  await m.close();

  // Reduced motion
  const rm = await browser.newContext({ reducedMotion: 'reduce' });
  const rp = await rm.newPage(); await rp.goto(`${BASE}${PAGE}`); await rp.locator('#systembrain-widget .launch').waitFor();
  ok(await rp.evaluate(() => getComputedStyle(document.querySelector('#systembrain-widget').shadowRoot.querySelector('.launch')).animationName) === 'none', 'reduced motion disables animation');
  await rm.close();
} catch (e) { ok(false, 'exception: ' + e.message); for (const p of browser.contexts().flatMap(c => c.pages())) await p.screenshot({ path: shots + '/zz-fail.png' }).catch(() => {}); }
await browser.close();
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);

// End to end test: starts the server, drives the widget in Chromium, saves screenshots to shots/.
// Usage: npm test   (optional env CLIENT_ID, default reads demo/index.html's data-client-id)
import { chromium, devices } from 'playwright';
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8899, BASE = `http://localhost:${PORT}`;
const DB = join(root, 'server', 'data', 'test-db.json');
const CLIENT = process.env.CLIENT_ID || readFileSync(join(root, 'demo', 'index.html'), 'utf8').match(/data-client-id="([^"]+)"/)[1];
const shots = join(root, 'shots'); mkdirSync(shots, { recursive: true }); rmSync(DB, { force: true });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };

const srv = spawn('node', ['server/src/node.js'], { cwd: root, env: { ...process.env, PORT, DB_FILE: DB, MOCK_DELAY_MS: 300 }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise(r => srv.stdout.on('data', d => String(d).includes('running') && r()));
const db = () => JSON.parse(readFileSync(DB, 'utf8'));
const browser = await chromium.launch();
try {
  // API checks
  const cfg = await (await fetch(`${BASE}/api/config/${CLIENT}`)).json();
  ok(cfg.brand && !('summaryEmail' in cfg), `GET /api/config/${CLIENT} returns public config (${cfg.brand})`);
  ok((await fetch(`${BASE}/api/config/nope`)).status === 404, 'unknown client gives 404');
  const j = await (await fetch(`${BASE}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientId: CLIENT, sessionId: 'apitest123', messages: [{ role: 'user', content: 'what are your hours' }] }) })).json();
  ok(/Monday/.test(j.text), 'POST /api/chat JSON mode replies');

  // Desktop
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`${BASE}/demo/`);
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
  await mp.goto(`${BASE}/demo/`);
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
  const rp = await rm.newPage(); await rp.goto(`${BASE}/demo/`); await rp.locator('#systembrain-widget .launch').waitFor();
  ok(await rp.evaluate(() => getComputedStyle(document.querySelector('#systembrain-widget').shadowRoot.querySelector('.launch')).animationName) === 'none', 'reduced motion disables animation');
  await rm.close();
} catch (e) { ok(false, 'exception: ' + e.message); for (const p of browser.contexts().flatMap(c => c.pages())) await p.screenshot({ path: shots + '/zz-fail.png' }).catch(() => {}); }
await browser.close(); srv.kill(); rmSync(DB, { force: true });
console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);

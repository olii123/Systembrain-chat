// Same-domain crawler. Respects robots.txt, seeds from the sitemap, follows links, stops at `limit` pages.
// Uses only fetch, so it runs in Node and in a Worker. www. and the bare domain count as the same site.
import { parseRobots } from './robots.js';
import { extractPage } from './extract.js';

export const USER_AGENT = 'SystemBrainBot/1.0 (+https://systembrain.com.au; website chat knowledge base)';
const SKIP_EXT = /\.(pdf|jpe?g|png|gif|webp|svg|ico|css|js|json|xml|zip|gz|mp4|mp3|mov|avi|woff2?|ttf|eot|docx?|xlsx?|pptx?)$/i;
const siteKey = host => host.toLowerCase().replace(/^www\./, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function normalise(u) {
  const x = new URL(u); x.hash = ''; x.search = '';
  if (x.pathname !== '/' && x.pathname.endsWith('/')) x.pathname = x.pathname.slice(0, -1);
  return x.href;
}

export async function crawlSite(startUrl, { limit = 50, fetchFn = fetch, maxBytes = 5_000_000, timeoutMs = 15000, log = () => {} } = {}) {
  const start = new URL(startUrl);
  if (!/^https?:$/.test(start.protocol)) throw new Error('Website must be http or https');
  const site = siteKey(start.host);
  const same = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && siteKey(x.host) === site; } catch { return false; } };
  const get = async (url, accept) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
    try { return await fetchFn(url, { headers: { 'user-agent': USER_AGENT, accept }, redirect: 'follow', signal: ctl.signal }); }
    finally { clearTimeout(t); }
  };

  let robots = parseRobots('');
  try { const r = await get(new URL('/robots.txt', start).href, 'text/plain'); if (r.ok) robots = parseRobots(await r.text()); } catch (e) { log(`robots.txt: ${e.message}`); }
  const delay = Math.min(robots.crawlDelay * 1000, 5000);

  const queue = [normalise(start.href)], queued = new Set(queue), pages = [], skipped = [];
  const push = u => { if (!same(u) || SKIP_EXT.test(new URL(u).pathname)) return; const n = normalise(u); if (!queued.has(n)) { queued.add(n); queue.push(n); } };

  // Seed from sitemaps (one level of sitemap index, a few files at most).
  const maps = robots.sitemaps.length ? robots.sitemaps : [new URL('/sitemap.xml', start).href];
  for (const sm of maps.filter(same).slice(0, 3)) {
    try {
      const r = await get(sm, 'application/xml'); if (!r.ok) continue;
      const xml = await r.text(); const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(m => m[1]);
      if (/<sitemapindex/i.test(xml)) {
        for (const child of locs.filter(same).slice(0, 5)) {
          try { const c = await get(child, 'application/xml'); if (c.ok) for (const m of (await c.text()).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) push(m[1]); } catch {}
        }
      } else locs.forEach(push);
    } catch (e) { log(`sitemap ${sm}: ${e.message}`); }
  }

  while (queue.length && pages.length < limit) {
    const url = queue.shift(); const path = new URL(url).pathname;
    if (!robots.allowed(path)) { skipped.push({ url, reason: 'robots.txt' }); continue; }
    if (pages.length && delay) await sleep(delay);
    let res;
    try { res = await get(url, 'text/html'); } catch (e) { skipped.push({ url, reason: e.message }); continue; }
    const finalUrl = res.url || url;
    if (!res.ok) { skipped.push({ url, reason: `HTTP ${res.status}` }); continue; }
    if (!same(finalUrl)) { skipped.push({ url, reason: 'redirected off site' }); continue; }
    if (!(res.headers.get('content-type') || '').includes('text/html')) { skipped.push({ url, reason: 'not HTML' }); continue; }
    const html = (await res.text()).slice(0, maxBytes);
    if (/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html)) { skipped.push({ url, reason: 'noindex' }); continue; }
    const page = extractPage(html, finalUrl);
    const key = normalise(finalUrl);
    if (pages.some(p => p.url === key)) continue; // redirect landed on a page we already have
    queued.add(key);
    pages.push({ url: key, title: page.title, blocks: page.blocks });
    page.links.forEach(push);
    log(`crawled ${key} (${page.blocks.length} blocks)`);
  }
  return { pages, skipped, robotsSitemaps: robots.sitemaps };
}

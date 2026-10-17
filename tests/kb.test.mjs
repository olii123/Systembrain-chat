// Unit tests for the knowledge base: crawling, chunking, reindex, retrieval and tenant isolation.
// Run: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fakeD1, fakeAI, fakeVectorize, fakeSite } from './fakes.mjs';
import { parseRobots } from '../server/src/kb/robots.js';
import { extractPage } from '../server/src/kb/extract.js';
import { chunkBlocks, estTokens } from '../server/src/kb/chunk.js';
import { crawlSite } from '../server/src/kb/crawl.js';
import { createVectorKb } from '../server/src/kb/vector-kb.js';
import { createApp } from '../server/src/app.js';
import { createMockProvider } from '../server/src/providers/mock.js';
import { systemPrompt } from '../server/src/providers/grok.js';

const schema = join(dirname(fileURLToPath(import.meta.url)), '..', 'server', 'schema.sql');
const page = (title, body, links = []) => `<html><head><title>${title}</title><script>var x="<p>hidden</p>"</script></head><body><nav><a href="/">Home</a></nav>
  ${links.map(l => `<a href="${l}">link</a>`).join('')}<main><h1>${title}</h1>${body}</main><footer><p>Areas Served: Sydney</p></footer></body></html>`;

const C9 = { clientId: 'cloud9', brand: 'Cloud 9', website: 'https://www.c9.test/', phone: '1', faqs: [] };
const DEMO = { clientId: 'demo', brand: 'Acme', phone: '2', faqs: [], kbFaqs: [
  { question: 'Do you offer a warranty on window cleaning?', answer: 'Acme gives a 30 day workmanship guarantee on window cleaning jobs.' },
  { question: 'What is the price of window cleaning?', answer: 'Acme window cleaning costs $99 flat for any home.' }] };
const c9site = fakeSite({
  '/': page('Home | Cloud 9', '<p>Cloud 9 does residential window cleaning across the North Shore and Northern Beaches.</p><p>We use deionised water with a 7 day rain guarantee.</p>', ['/services', '/secret/page', 'https://other.test/x', '/file.pdf']),
  '/services': page('Services | Cloud 9', '<p>Solar panel cleaning keeps panels efficient. Glass balustrade and pool fence cleaning is chemical free.</p>'),
  '/secret/page': page('Secret', '<p>Should never be crawled.</p>')
}, 'User-agent: *\nDisallow: /secret/\n');

test('robots.txt rules', () => {
  const r = parseRobots('User-agent: PetalBot\nDisallow: /\n\nUser-agent: *\nAllow: /\nDisallow: *?lightbox=\nDisallow: /private/\nAllow: /private/ok\nSitemap: https://x.test/sitemap.xml');
  assert.equal(r.allowed('/about'), true);
  assert.equal(r.allowed('/private/a'), false);
  assert.equal(r.allowed('/private/ok'), true);
  assert.equal(r.allowed('/p?lightbox=1'), false);
  assert.deepEqual(r.sitemaps, ['https://x.test/sitemap.xml']);
  assert.equal(parseRobots('User-agent: *\nDisallow: /', 'SystemBrainBot').allowed('/x'), false);
});

test('extract drops scripts and nav, keeps text, tel links and links', () => {
  const r = extractPage(page('About | Cloud 9', '<p>Hello &amp; welcome</p><a href="tel:+61485013333">Call</a>', ['/a#x']), 'https://c9.test/');
  assert.equal(r.title, 'About | Cloud 9');
  assert.ok(r.blocks.includes('Hello & welcome'));
  assert.ok(r.blocks.includes('Phone: 0485 013 333'));
  assert.ok(!r.blocks.join(' ').includes('hidden'));
  assert.ok(r.links.includes('https://c9.test/a'));
});

test('chunks stay near the target size with overlap', () => {
  const blocks = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} talks about clean windows and shiny glass for homes.`);
  const chunks = chunkBlocks(blocks, { targetTokens: 120, overlapTokens: 20 });
  assert.ok(chunks.length > 4);
  for (const c of chunks) assert.ok(estTokens(c) <= 150, `chunk too big: ${estTokens(c)}`);
  const firstLast = chunks[0].split('\n').at(-1);
  assert.ok(chunks[1].includes(firstLast), 'next chunk starts with the overlap');
});

test('crawler stays on site, respects robots.txt and skips files', async () => {
  const r = await crawlSite('https://c9.test/', { fetchFn: async (u, o) => c9site(u.replace('www.c9.test', 'c9.test'), o) });
  const urls = r.pages.map(p => p.url);
  assert.deepEqual(urls.sort(), ['https://c9.test/', 'https://c9.test/services']);
  assert.ok(r.skipped.some(s => s.url.includes('/secret/') && s.reason === 'robots.txt'));
});

async function setup(vecOpts) {
  const DB = fakeD1(schema), AI = fakeAI(), VEC = fakeVectorize(vecOpts);
  const kb = createVectorKb({ AI, VEC, DB, minScore: 0.1, crawl: (url, o) => crawlSite(url, { ...o, fetchFn: c9site }) });
  const r1 = await kb.reindex(C9), r2 = await kb.reindex(DEMO);
  return { DB, AI, VEC, kb, r1, r2 };
}

test('reindex stores chunks in D1 and vectors in the client namespace', async () => {
  const { DB, VEC, r1, r2 } = await setup();
  assert.equal(r1.pages, 2); assert.ok(r1.chunks >= 2); assert.equal(r2.chunks, 2);
  const rows = DB._db.prepare('SELECT client_id, source, url FROM kb_chunks').all();
  assert.equal(rows.length, r1.chunks + r2.chunks);
  for (const v of VEC.vecs.values()) { assert.equal(v.namespace, v.metadata.client_id); assert.equal(v.id.length, 64); }
  assert.ok(rows.every(r => r.client_id === 'demo' ? r.source === 'faq' : r.source === 'web'));
});

test('reindex again changes nothing; removed pages are deleted', async () => {
  const { kb, AI, VEC } = await setup();
  const calls = AI.calls, before = VEC.vecs.size;
  const again = await kb.reindex(C9);
  assert.equal(again.added, 0); assert.equal(again.removed, 0); assert.equal(AI.calls, calls, 'no re-embedding of unchanged chunks');
  const smaller = await kb.reindex({ ...C9, website: undefined });
  assert.equal(smaller.removed, again.chunks); assert.equal(VEC.vecs.size, before - again.chunks);
});

test('failed crawl keeps the old web chunks', async () => {
  const { kb, r1 } = await setup();
  const broken = await kb.reindex(C9, { crawl: async () => { throw new Error('offline'); } });
  assert.match(broken.error, /offline/); assert.equal(broken.removed, 0);
  assert.equal((await kb.stats('cloud9')).chunks, r1.chunks);
});

for (const leaky of [false, true]) {
  test(`tenant isolation: a cloud9 query never returns demo chunks (${leaky ? 'leaky index' : 'normal index'})`, async () => {
    const { kb } = await setup({ leaky });
    // These questions match the demo FAQs word for word, so demo chunks are the closest vectors overall.
    for (const q of DEMO.kbFaqs.map(f => f.question).concat(['Acme warranty guarantee', 'window cleaning price $99'])) {
      const res = await kb.search('cloud9', q, { min: -1, k: 10 });
      assert.ok(res.length > 0, 'cloud9 still gets its own results');
      for (const r of res) { assert.equal(r.client_id, 'cloud9'); assert.ok(!/Acme/.test(r.text)); }
      const demo = await kb.search('demo', q, { min: -1, k: 10 });
      assert.ok(demo.every(r => r.client_id === 'demo'));
    }
  });
}

test('chat passes this client\'s chunks to the provider; mock shows excerpt and source', async () => {
  const { kb } = await setup();
  const seen = [];
  const mem = { conversationOwner: async () => null, getConversation: async () => null, upsertConversation: async () => ({}), addMessage: async () => {} };
  const spy = { name: 'spy', async *chat(a) { seen.push(a.context); yield* createMockProvider({ delayMs: 0 }).chat(a); } };
  const app = createApp({ storeFor: () => mem, loadClient: async id => ({ cloud9: C9, demo: DEMO })[id], getProvider: () => spy, kb });
  const ask = async (clientId, content) => (await app.request('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ clientId, sessionId: 'sess' + Math.random().toString(36).slice(2), messages: [{ role: 'user', content }] }) })).json();
  const a = await ask('cloud9', 'Do you clean solar panels?');
  assert.ok(seen.at(-1).length && seen.at(-1).every(c => c.client_id === 'cloud9'));
  assert.match(a.text, /Solar panel cleaning/); assert.match(a.text, /\(Source: Services\)/);
  const d = await ask('demo', 'Do you offer a warranty?');
  assert.match(d.text, /30 day workmanship guarantee/); assert.match(d.text, /Source: our FAQs/);
});

test('admin endpoints need the token', async () => {
  const { kb } = await setup();
  const app = createApp({ storeFor: () => ({}), loadClient: async id => ({ cloud9: C9 })[id], getProvider: () => ({ name: 'x' }), env: { ADMIN_TOKEN: 's3cret-token' }, kb });
  const post = h => app.request('/api/admin/cloud9/reindex', { method: 'POST', headers: h });
  assert.equal((await post({})).status, 401);
  assert.equal((await post({ authorization: 'Bearer wrong' })).status, 401);
  const ok = await post({ authorization: 'Bearer s3cret-token' });
  assert.equal(ok.status, 200); assert.equal((await ok.json()).pages, 2);
  assert.equal((await app.request('/api/admin/nope/reindex', { method: 'POST', headers: { authorization: 'Bearer s3cret-token' } })).status, 404);
  assert.equal((await app.request('/api/admin/cloud9/pdf', { method: 'POST', headers: { authorization: 'Bearer s3cret-token' } })).status, 501);
  const noToken = createApp({ storeFor: () => ({}), loadClient: async () => C9, getProvider: () => ({ name: 'x' }), env: {}, kb });
  assert.equal((await noToken.request('/api/admin/cloud9/reindex', { method: 'POST', headers: { authorization: 'Bearer ' } })).status, 401);
});

test('Grok prompt is grounded in the retrieved context', () => {
  const p = systemPrompt(C9, [{ title: 'Services | Cloud 9', url: 'https://c9.test/services', text: 'Solar panel cleaning.' }]);
  assert.match(p, /Answer only from/); assert.match(p, /check with the team/); assert.match(p, /\[1\] Services \| Cloud 9/);
  assert.match(systemPrompt(C9, []), /nothing relevant found/);
});

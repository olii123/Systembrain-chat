// Turns a client config (plus crawled pages) into knowledge base documents:
// { source: 'web'|'faq'|'pdf', url, title, text }.
import { chunkBlocks, estTokens } from './chunk.js';

const BOILERPLATE = new Set(['top of page', 'bottom of page', 'skip to main content', 'menu', 'close', 'call us', 'get your quote', 'learn more', 'read more']);
export const shortTitle = t => String(t || '').split(/\s+[|\u2013\u2014-]\s+/)[0].trim() || t;

// Header, footer and other text repeated on every page is kept once (on the first page that has it,
// usually the home page) so search results are not flooded with menus.
export function pagesToDocs(pages, opts) {
  const seen = new Set(), docs = [], contacts = [];
  for (const p of pages) {
    const blocks = [];
    for (const b of p.blocks) {
      const key = b.replace(/^## /, '').toLowerCase();
      if (/^(phone|email): /i.test(b)) { if (!contacts.some(c => c.toLowerCase() === b.toLowerCase())) contacts.push(b); continue; }
      if (BOILERPLATE.has(key) || seen.has(key)) continue;
      seen.add(key); blocks.push(b);
    }
    if (estTokens(blocks.join(' ')) < 20) continue; // nothing new on this page
    for (const text of chunkBlocks(blocks, opts)) docs.push({ source: 'web', url: p.url, title: p.title || p.url, text });
  }
  // Phone numbers and emails (from tel: and mailto: links) get their own small chunk, linked to the contact page if there is one.
  if (contacts.length && pages.length) {
    const home = pages.find(p => /contact/i.test(`${p.title} ${p.url}`)) || pages[0];
    const brand = (pages[0].title || '').split(/\s+\|\s+/).pop();
    docs.push({ source: 'web', url: home.url, title: home.title || home.url,
      text: `## How to contact ${brand || 'us'}\nContact details from the website, for calls, quotes and bookings:\n${contacts.join('\n')}\nWebsite contact page: ${home.url}` });
  }
  return docs;
}

// Manual FAQs. "kbFaqs": [{ "question", "answer" }] in the client config, plus the existing
// "faqs" (keyword answers used by the mock responder), so owners only write an answer once.
export function faqDocs(cfg) {
  const out = [];
  (cfg.kbFaqs || []).forEach((f, i) => {
    if (!f || !f.answer) return;
    out.push({ source: 'faq', url: `faq:${cfg.clientId}:${i + 1}`, title: `FAQ: ${f.question || 'General'}`, text: `${f.question ? `Q: ${f.question}\n` : ''}A: ${f.answer}` });
  });
  (cfg.faqs || []).forEach((f, i) => {
    if (!f || !f.answer) return;
    const topic = (f.keywords || []).join(', ');
    out.push({ source: 'faq', url: `faq:${cfg.clientId}:k${i + 1}`, title: `FAQ: ${topic || 'General'}`, text: `${topic ? `Topic: ${topic}\n` : ''}A: ${f.answer}` });
  });
  return out;
}

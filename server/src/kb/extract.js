// HTML to plain text without a DOM, so it runs the same in Node and in a Worker.
// Returns { title, blocks, links }: blocks are the visible text lines (headings marked with "## ").
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201d', ldquo: '\u201c',
  ndash: '-', mdash: '-', hellip: '...', copy: '\u00a9', reg: '\u00ae', trade: '\u2122', bull: '\u2022', middot: '\u00b7', eacute: '\u00e9' };
export const decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch { return ' '; } }
  return ENT[e.toLowerCase()] ?? m;
});

// Remove whole elements by tag name using indexOf (fast on multi-megabyte pages).
function dropElements(html, tags) {
  for (const tag of tags) {
    const lower = html.toLowerCase(); let out = '', pos = 0;
    for (;;) {
      const start = lower.indexOf('<' + tag, pos);
      if (start < 0) { out += html.slice(pos); break; }
      const next = lower[start + tag.length + 1];
      if (next && !/[\s>/]/.test(next)) { out += html.slice(pos, start + 1); pos = start + 1; continue; }
      const end = lower.indexOf('</' + tag, start);
      out += html.slice(pos, start) + ' ';
      if (end < 0) { pos = html.length; break; }
      pos = lower.indexOf('>', end) + 1 || html.length;
    }
    html = out;
  }
  return html;
}

export function extractPage(html, baseUrl) {
  html = String(html || '');
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim());
  const links = [];
  for (const m of html.matchAll(/<a\s[^>]*?href\s*=\s*["']([^"'#][^"']*)["']/gi)) {
    try { const u = new URL(decode(m[1]), baseUrl); u.hash = ''; links.push(u.href); } catch {}
  }
  // Phone numbers and emails often live only in tel: and mailto: links, so keep them as text.
  const contacts = [];
  for (const m of html.matchAll(/href\s*=\s*["'](tel|mailto):([^"'?]+)/gi)) {
    const v = decode(decodeURIComponent(m[2])).trim();
    contacts.push(m[1].toLowerCase() === 'tel' ? `Phone: ${formatPhone(v)}` : `Email: ${v}`);
  }
  let h = html.replace(/<!--[\s\S]*?-->/g, ' ');
  h = dropElements(h, ['head', 'script', 'style', 'noscript', 'svg', 'template', 'iframe', 'nav', 'select', 'button']);
  h = h.replace(/<h[1-3][\s>][^>]*>?/gi, '\n## ').replace(/<\/(h[1-6]|p|div|li|tr|section|article|header|footer|main|ul|ol|table|blockquote|figcaption|dd|dt)>|<br\s*\/?>|<(?=(p|div|li|tr|h[4-6]|section|article)[\s>])/gi, m => (m === '<' ? '\n<' : '\n'));
  h = decode(h.replace(/<[^>]+>/g, ' '));
  const seen = new Set(), blocks = [];
  for (let line of h.split('\n')) {
    line = line.replace(/\s+/g, ' ').trim();
    if (line.replace(/^## /, '').length < 3 || line === '##') continue;
    const key = line.replace(/^## /, '').toLowerCase();
    if (seen.has(key)) continue; seen.add(key); blocks.push(line);
  }
  for (const c of contacts) if (!seen.has(c.toLowerCase())) { seen.add(c.toLowerCase()); blocks.push(c); }
  return { title, blocks, links };
}

// +61485013333 -> 0485 013 333, +61255644109 -> (02) 5564 4109. Anything else is returned as is.
export function formatPhone(v) {
  const d = v.replace(/[^\d+]/g, '').replace(/^\+61/, '0');
  if (/^04\d{8}$/.test(d)) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  if (/^0[2378]\d{8}$/.test(d)) return `(${d.slice(0, 2)}) ${d.slice(2, 6)} ${d.slice(6)}`;
  if (/^1[38]00\d{6}$/.test(d)) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  return v;
}

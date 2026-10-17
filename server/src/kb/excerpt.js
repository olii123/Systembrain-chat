// Pick the most relevant few lines from a chunk for a question (used by the mock provider).
// Scores each run of consecutive lines (up to maxChars) by the question words it covers, weighting
// words that are rare inside the chunk higher, and the visitor's own words above the added related words.
import { terms } from './terms.js';
import { shortTitle } from './docs.js';
import { expandQuery } from './expand.js';

export function excerpt(text, query, maxChars = 260) {
  const own = new Set(terms(query)), extra = new Set(terms(expandQuery(query)).filter(w => !own.has(w)));
  const parts = String(text).replace(/^## /gm, '').split(/\n+|(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 2 && !/^(Topic|Q):/.test(s));
  if (!parts.length) return '';
  const pt = parts.map(p => new Set(terms(p)));
  const df = w => pt.filter(s => s.has(w)).length;
  const weight = new Map([...own, ...extra].map(w => [w, (own.has(w) ? 1 : 0.3) * Math.log(1 + parts.length / Math.max(1, df(w)))]));
  let best = { score: -1, i: 0, j: 0 };
  for (let i = 0; i < parts.length; i++) {
    let len = 0;
    for (let j = i; j < parts.length && (len += parts[j].length + 2) <= maxChars + 2 || j === i; j++) {
      const covered = new Set(); for (let k = i; k <= j; k++) for (const w of pt[k]) if (weight.has(w)) covered.add(w);
      const score = [...covered].reduce((a, w) => a + weight.get(w), 0) + Math.min(len, 200) / 2000;
      if (score > best.score + 1e-9) best = { score, i, j };
      if (j > i + 6) break;
    }
  }
  // Drop lines at either end that add no question words, then add following lines until it reads as a sentence or two.
  const adds = k => [...pt[k]].some(w => own.has(w) || (extra.has(w) && df(w) / parts.length < 0.05)); // skip lines that only share a common word
  let { i, j } = best;
  while (j > i && !adds(j)) j--;
  while (i < j && !adds(i)) i++;
  const size = () => parts.slice(i, j + 1).join('  ').length;
  while (size() < 100 && j + 1 < parts.length && size() + parts[j + 1].length + 2 <= maxChars) j++;
  best = { ...best, i, j };
  let out = parts.slice(best.i, best.j + 1).reduce((a, p) => (a ? join(a, p) : p), '').replace(/^A:\s*/, '');
  return out.length > maxChars ? out.slice(0, maxChars - 3).replace(/\s+\S*$/, '') + '...' : out;
}
const join = (a, b) => (/[.!?:]$/.test(a) ? `${a} ${b}` : `${a}. ${b}`);
export const sourceLabel = c => (c.source === 'faq' ? 'our FAQs' : shortTitle(c.title));

// Split page text into chunks of roughly targetTokens, with overlap between neighbours.
// Tokens are estimated as words * 1.3. Default: chunks of up to about 800 tokens, 80 tokens of overlap.
export const estTokens = s => Math.ceil((String(s).match(/\S+/g) || []).length * 1.3);

// A heading ("## ...") starts a new chunk once the current one has at least minTokens, so chunks
// stay on one topic. Size-based breaks carry overlapTokens of the previous chunk into the next one.
export function chunkBlocks(blocks, { targetTokens = 800, overlapTokens = 80, minTokens = 270 } = {}) {
  const words = n => Math.max(1, Math.floor(n / 1.3));
  // Break very long lines into sentence-sized pieces first.
  const pieces = [];
  for (const b of blocks) {
    if (estTokens(b) <= targetTokens) { pieces.push(b); continue; }
    const sentences = b.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [b];
    for (const s of sentences) {
      const w = s.trim().split(/\s+/);
      for (let i = 0; i < w.length; i += words(targetTokens)) pieces.push(w.slice(i, i + words(targetTokens)).join(' '));
    }
  }
  const chunks = []; let cur = [], curTok = 0;
  const flush = (overlap = true) => {
    if (!cur.length) return;
    chunks.push(cur.join('\n'));
    if (!overlap) { cur = []; curTok = 0; return; }
    // Carry the tail (about overlapTokens) into the next chunk.
    const tail = []; let t = 0;
    for (let i = cur.length - 1; i >= 0 && t < overlapTokens; i--) { tail.unshift(cur[i]); t += estTokens(cur[i]); }
    if (t > overlapTokens * 2) { const w = tail.join(' ').split(/\s+/); cur = [w.slice(-words(overlapTokens)).join(' ')]; }
    else cur = tail;
    curTok = cur.reduce((a, s) => a + estTokens(s), 0);
  };
  let fresh = 0;
  for (const p of pieces) {
    const t = estTokens(p);
    if (fresh && p.startsWith('## ') && curTok >= minTokens) { flush(false); fresh = 0; }
    else if (curTok + t > targetTokens && fresh) { flush(); fresh = 0; }
    cur.push(p); curTok += t; fresh++;
  }
  if (fresh) {
    const last = cur.join('\n');
    // A small leftover (often a "Book now" footer) joins the previous chunk instead of standing alone.
    if (chunks.length && estTokens(last) < minTokens / 3 && estTokens(chunks.at(-1)) + estTokens(last) <= targetTokens * 1.15) chunks[chunks.length - 1] += '\n' + cur.slice(cur.length - fresh).join('\n');
    else chunks.push(last);
  }
  return chunks;
}

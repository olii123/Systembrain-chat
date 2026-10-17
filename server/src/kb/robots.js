// Minimal robots.txt parser. Picks the group for our user agent (or "*"), then applies the
// longest matching Allow/Disallow rule, with "*" wildcards and "$" end anchors.
export function parseRobots(text, agent = 'systembrainbot') {
  const groups = []; let cur = null; let lastWasAgent = false; const sitemaps = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim(); if (!line) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase(), val = line.slice(i + 1).trim();
    if (key === 'sitemap') { if (val) sitemaps.push(val); continue; }
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [], delay: 0 }; groups.push(cur); }
      cur.agents.push(val.toLowerCase()); lastWasAgent = true; continue;
    }
    lastWasAgent = false; if (!cur) continue;
    if (key === 'allow' || key === 'disallow') cur.rules.push({ allow: key === 'allow', path: val });
    else if (key === 'crawl-delay') cur.delay = Number(val) || 0;
  }
  const ua = agent.toLowerCase();
  const group = groups.find(g => g.agents.some(a => a !== '*' && ua.includes(a))) || groups.find(g => g.agents.includes('*')) || { rules: [], delay: 0 };
  return { sitemaps, crawlDelay: group.delay, allowed: path => allowed(group.rules, path) };
}

const toRe = p => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, m => (m === '$' ? m : '\\' + m)).replace(/\\\$$/, '$').replace(/\*/g, '.*'));

function allowed(rules, path) {
  let best = null;
  for (const r of rules) {
    if (!r.path) continue; // empty Disallow means allow everything
    const pat = r.path.startsWith('/') || r.path.startsWith('*') ? r.path : '/' + r.path;
    if (!toRe(pat).test(path)) continue;
    if (!best || pat.length > best.len || (pat.length === best.len && r.allow)) best = { len: pat.length, allow: r.allow };
  }
  return best ? best.allow : true;
}

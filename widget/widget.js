/*! SystemBrain chat widget (Glass Orb).
 * Embed: <script src="https://YOUR-SERVER/widget/widget.js" data-client-id="demo" defer></script>
 * Optional: data-api="https://api.example.com" (defaults to the server that served this file).
 */
(function () {
  'use strict';
  if (window.SystemBrainWidget) return;
  var script = document.currentScript || document.querySelector('script[data-client-id]');
  if (!script) return;
  var CLIENT_ID = script.getAttribute('data-client-id');
  var API = (script.getAttribute('data-api') || new URL(script.src, location.href).origin).replace(/\/$/, '');
  if (!CLIENT_ID) { console.warn('[SystemBrain] data-client-id is missing'); return; }

  function start(cfg) {
    var C = {
      brand: cfg.brand || 'Chat', accent: (cfg.colours && cfg.colours.accent) || '#0a0a0a', accentText: (cfg.colours && cfg.colours.accentText) || '#ffffff',
      greeting: cfg.greeting || 'Hi there! How can I help?', teaser: cfg.teaser || '', chips: cfg.chips || [],
      placeholder: cfg.placeholder || 'Type a message...', phone: cfg.phone || '', sms: cfg.sms || (cfg.phone || '').replace(/\s/g, ''),
      slots: cfg.bookingSlots && cfg.bookingSlots.length ? cfg.bookingSlots : ['Morning', 'Afternoon']
    };
    var KEY = 'sb-chat-' + CLIENT_ID, SKEY = 'sb-session-' + CLIENT_ID, TKEY = 'sb-teaser-' + CLIENT_ID;
    var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
    var newSid = function () { return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9_-]/g, ''); };
    var sessionId = ls.get(SKEY) || newSid(); ls.set(SKEY, sessionId);

    var css = '\
:host{all:initial}\
*{box-sizing:border-box;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}\
.w{--a:' + C.accent + ';--at:' + C.accentText + ';--fg:#0a0a0a;--mut:#52525b;--glass:rgba(255,255,255,.72);--solid:rgba(255,255,255,.9);--line:rgba(255,255,255,.7);--hair:rgba(0,0,0,.08);\
position:fixed;right:24px;bottom:24px;z-index:2147483000;color:var(--fg);font-size:15px;line-height:1.5}\
.glass{background:var(--glass);-webkit-backdrop-filter:blur(26px) saturate(180%);backdrop-filter:blur(26px) saturate(180%);border:1px solid var(--line);box-shadow:inset 0 1px 0 rgba(255,255,255,.9),0 20px 60px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.08)}\
button{font:inherit;cursor:pointer;border:0;background:none;color:inherit}\
button:disabled{cursor:default;opacity:.6}\
button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:2px solid #0a0a0a;outline-offset:2px}\
.launch{position:absolute;right:0;bottom:0;width:60px;height:60px;border-radius:999px;transition:transform .25s cubic-bezier(.34,1.56,.64,1),opacity .2s;\
background:conic-gradient(from 200deg,#7dd3fc,#3b82f6,#a5b4fc,#e0f2fe,#38bdf8,#7dd3fc);box-shadow:0 10px 30px rgba(59,130,246,.45),inset 0 2px 6px rgba(255,255,255,.7),inset 0 -6px 12px rgba(30,64,175,.35);animation:spin 12s linear infinite}\
.launch::after{content:"";position:absolute;inset:6px;border-radius:999px;background:radial-gradient(circle at 35% 30%,rgba(255,255,255,.85),rgba(255,255,255,0) 45%)}\
.launch:hover{transform:scale(1.06)}\
@keyframes spin{to{filter:hue-rotate(40deg)}}\
.open .launch{opacity:0;transform:scale(.6);pointer-events:none}\
.teaser{position:absolute;right:0;bottom:76px;white-space:nowrap;padding:6px 6px 6px 16px;border-radius:999px;display:flex;align-items:center;gap:4px;font-size:14px;font-weight:500;background:var(--solid);animation:pop .3s cubic-bezier(.34,1.56,.64,1)}\
.teaser .tt{font-weight:500;min-height:32px}\
.teaser .x{width:32px;height:32px;border-radius:99px;display:grid;place-items:center;color:var(--mut)}\
.teaser .x:hover{background:var(--hair)}\
.open .teaser{display:none}\
@keyframes pop{from{opacity:0;transform:translateY(8px) scale(.96)}}\
.panel{position:absolute;right:0;bottom:0;width:392px;height:min(640px,calc(100vh - 48px));border-radius:24px;display:flex;flex-direction:column;overflow:hidden;transform-origin:bottom right;opacity:0;transform:scale(.4) translateY(20px);pointer-events:none;visibility:hidden;\
transition:transform .28s cubic-bezier(.34,1.4,.64,1),opacity .2s,visibility 0s .28s}\
.open .panel{opacity:1;transform:none;pointer-events:auto;visibility:visible;transition:transform .28s cubic-bezier(.34,1.4,.64,1),opacity .2s}\
.hd{display:flex;align-items:center;gap:10px;padding:14px 12px 12px 16px;border-bottom:1px solid var(--hair)}\
.av{width:34px;height:34px;border-radius:999px;flex:none;background:conic-gradient(from 200deg,#7dd3fc,#3b82f6,#a5b4fc,#e0f2fe,#38bdf8,#7dd3fc);box-shadow:inset 0 1px 3px rgba(255,255,255,.8)}\
.ti{flex:1;min-width:0}.ti b{display:block;font-size:15px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\
.ti span{font-size:12px;color:var(--mut);display:flex;align-items:center;gap:6px}\
.ti span::before{content:"";width:7px;height:7px;border-radius:9px;background:#22c55e}\
.ib{width:44px;height:44px;border-radius:999px;display:grid;place-items:center;color:var(--mut)}\
.ib:hover{background:var(--hair);color:var(--fg)}\
.body{flex:1;overflow-y:auto;padding:18px 16px 8px;display:flex;flex-direction:column;gap:14px;overscroll-behavior:contain}\
.bot{max-width:92%;padding:2px;white-space:pre-wrap}\
.user{align-self:flex-end;max-width:80%;background:var(--a);color:var(--at);padding:9px 16px;border-radius:22px;white-space:pre-wrap;overflow-wrap:anywhere}\
.status{align-self:flex-start;display:inline-flex;align-items:center;gap:8px;padding:8px 14px;border-radius:999px;background:#0a0a0a;color:#fff;font-size:13px;font-weight:500}\
.dots{display:inline-flex;gap:3px}.dots i{width:5px;height:5px;border-radius:9px;background:currentColor;opacity:.4;animation:b 1s infinite}\
.dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}\
@keyframes b{50%{opacity:1;transform:translateY(-2px)}}\
.chips{display:flex;flex-wrap:wrap;gap:8px}\
.chip{min-height:40px;padding:8px 16px;border-radius:999px;border:1px solid var(--hair);background:var(--solid);font-size:14px;font-weight:500}\
.chip:hover{border-color:var(--fg)}\
.card{border-radius:20px;padding:16px;background:var(--solid);border:1px solid var(--hair);display:flex;flex-direction:column;gap:10px}\
.card h4{margin:0;font-size:14px;font-weight:600}.card p{margin:0;font-size:13px;color:var(--mut)}\
.card label{font-size:12px;font-weight:500;color:var(--mut);display:flex;flex-direction:column;gap:4px}\
.card input,.card select{font:inherit;font-size:16px;height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--hair);background:#fff;color:var(--fg);width:100%}\
.row{display:flex;gap:8px}.row>*{flex:1;min-width:0}\
.pri{height:44px;border-radius:999px;background:var(--a);color:var(--at);font-weight:600;font-size:14px}\
.err{color:#dc2626;font-size:12px}.err:empty{display:none}\
.ft{padding:8px 12px 12px}\
.inp{display:flex;align-items:center;gap:6px;padding:5px 5px 5px 18px;border-radius:999px;background:var(--solid);border:1px solid var(--hair)}\
.inp input{flex:1;min-width:0;border:0;background:transparent;font:inherit;font-size:16px;color:var(--fg);height:44px;outline:none}\
.inp:focus-within{border-color:#0a0a0a}\
.inp input::placeholder{color:var(--mut)}\
.send{width:44px;height:44px;border-radius:999px;background:var(--a);color:var(--at);display:grid;place-items:center;flex:none}\
.human{display:flex;justify-content:center;gap:4px;margin-top:6px}\
.human a{color:var(--mut);font-size:12.5px;text-decoration:none;padding:0 10px;min-height:44px;display:inline-flex;align-items:center;border-radius:999px;font-weight:500}\
.human a:hover{color:var(--fg);background:var(--hair)}\
.pw{text-align:center;font-size:11px;color:var(--mut);opacity:.8}\
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}\
@media (max-width:520px){.w{right:16px;bottom:16px}.open.w{inset:0}\
.panel{position:fixed;inset:0;width:auto;height:100%;--glass:rgba(255,255,255,.94);height:100dvh;border-radius:0;transform:translateY(100%);transform-origin:bottom center}\
.ft{padding-bottom:max(12px,env(safe-area-inset-bottom))}}\
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}';

    var I = {
      send: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
      x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
      min: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>'
    };
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

    var host = document.createElement('div'); host.id = 'systembrain-widget';
    document.body.appendChild(host);
    var root = host.attachShadow({ mode: 'open' });
    var human = (C.phone ? '<a href="tel:' + esc(C.sms) + '">Talk to a person</a>' : '') + (C.sms ? '<a href="sms:' + esc(C.sms) + '">Text us instead</a>' : '');
    root.innerHTML = '<style>' + css + '</style><div class="w">' +
      '<button class="launch" aria-label="Open chat with ' + esc(C.brand) + '" aria-expanded="false"></button>' +
      '<div class="panel glass" role="dialog" aria-modal="true" aria-label="' + esc(C.brand) + ' chat">' +
      '<div class="hd"><div class="av" aria-hidden="true"></div><div class="ti"><b>' + esc(C.brand) + '</b><span>Replies instantly</span></div>' +
      '<button class="ib mn" aria-label="Minimise chat">' + I.min + '</button><button class="ib cl" aria-label="End chat and clear history">' + I.x + '</button></div>' +
      '<div class="body" role="log" aria-live="polite"></div>' +
      '<div class="ft"><form class="inp"><input placeholder="' + esc(C.placeholder) + '" aria-label="Message" maxlength="1000" autocomplete="off"><button class="send" aria-label="Send message">' + I.send + '</button></form>' +
      '<div class="human">' + human + '</div><div class="pw">Powered by SystemBrain</div></div></div></div>';

    var $ = function (s) { return root.querySelector(s); };
    var W = $('.w'), body = $('.body'), panel = $('.panel'), input = $('.inp input'), launch = $('.launch');

    if (C.teaser && !ls.get(TKEY)) {
      var t = document.createElement('div'); t.className = 'teaser glass';
      t.innerHTML = '<button class="tt">' + esc(C.teaser) + '</button><button class="x" aria-label="Dismiss">' + I.x + '</button>';
      W.insertBefore(t, panel);
      t.querySelector('.x').onclick = function () { ls.set(TKEY, 1); t.remove(); };
      t.querySelector('.tt').onclick = function () { open(); };
    }

    // log entries: {t:'user'|'bot', x} | {t:'chips', x:[...]} | {t:'lead', kind, done} | {t:'booking', done}
    var log = []; try { log = JSON.parse(ls.get(KEY)) || []; } catch (e) {}
    var save = function () { ls.set(KEY, JSON.stringify(log)); };
    var scroll = function () { body.scrollTop = body.scrollHeight; };
    var busy = false;

    function render(m) {
      var el;
      if (m.t === 'user' || m.t === 'bot') { el = document.createElement('div'); el.className = m.t; el.textContent = m.x; }
      else if (m.t === 'chips') {
        el = document.createElement('div'); el.className = 'chips';
        m.x.forEach(function (c) { var b = document.createElement('button'); b.className = 'chip'; b.textContent = c; b.onclick = function () { send(c); }; el.appendChild(b); });
      } else if (m.t === 'lead') el = leadCard(m);
      else if (m.t === 'booking') el = bookCard(m);
      else return null;
      body.appendChild(el); scroll(); return el;
    }
    function push(m) { log.push(m); save(); return render(m); }
    function history() {
      return log.filter(function (m) { return m.t === 'user' || m.t === 'bot'; }).slice(-30)
        .map(function (m) { return { role: m.t === 'user' ? 'user' : 'assistant', content: m.x }; });
    }
    function post(path, data) {
      var h = { 'content-type': 'application/json' };
      if (path === '/api/chat') h.accept = 'text/event-stream, application/json';
      return fetch(API + path, { method: 'POST', headers: h, keepalive: path === '/api/end', body: JSON.stringify(Object.assign({ clientId: CLIENT_ID, sessionId: sessionId }, data)) });
    }
    function statusEl(text) {
      var st = document.createElement('div'); st.className = 'status';
      st.innerHTML = '<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span><span></span>';
      st.lastChild.textContent = text || 'Typing...'; body.appendChild(st); scroll(); return st;
    }
    // Local acknowledgement (no AI call) after a form, still with the status pill.
    function localReply(text, status, after) {
      busy = true; var st = statusEl(status);
      setTimeout(function () { st.remove(); push({ t: 'bot', x: text }); (after || []).forEach(push); busy = false; }, 700);
    }

    function leadCard(m) {
      var el = document.createElement('form'); el.className = 'card'; el.noValidate = true;
      if (m.done) { el.innerHTML = '<h4>Thanks, ' + esc(m.done.name) + '</h4><p>We will text ' + esc(m.done.mobile) + ' shortly.</p>'; return el; }
      var b = m.kind === 'booking';
      el.innerHTML = '<h4>' + (b ? 'Your details for the booking' : 'Where should we send your quote?') + '</h4>' +
        '<label>Name<input name="name" autocomplete="name" required maxlength="100"></label>' +
        '<label>Mobile<input name="mobile" type="tel" autocomplete="tel" inputmode="tel" required placeholder="04xx xxx xxx" maxlength="16"></label>' +
        '<label>Email (optional)<input name="email" type="email" autocomplete="email" maxlength="200"></label>' +
        '<div class="err" role="alert"></div><button class="pri">' + (b ? 'Continue' : 'Send my quote') + '</button>';
      el.oninput = function () { el.querySelector('.err').textContent = ''; };
      el.onsubmit = function (e) {
        e.preventDefault();
        var f = new FormData(el), name = String(f.get('name')).trim(), mobile = String(f.get('mobile')).trim(), email = String(f.get('email')).trim();
        var err = el.querySelector('.err'), btn = el.querySelector('.pri');
        if (!name || !/^(\+?61|0)4\d{8}$/.test(mobile.replace(/\s/g, ''))) { err.textContent = 'Please add your name and a valid Australian mobile.'; return; }
        btn.disabled = true; err.textContent = '';
        post('/api/lead', { kind: m.kind, name: name, mobile: mobile, email: email }).then(function (r) {
          if (!r.ok) throw new Error('save failed');
          m.done = { name: name, mobile: mobile, email: email }; save(); el.replaceWith(leadCard(m));
          if (b) localReply('Great. Pick a day and time that suits and we will confirm by text.', 'Checking availability...', [{ t: 'booking' }]);
          else localReply('Thanks ' + name + '. We will send a firm quote to your mobile shortly. Anything else?', 'Saving your details...');
        }).catch(function () { btn.disabled = false; err.textContent = 'Sorry, that did not send. Please try again' + (C.phone ? ' or call ' + C.phone : '') + '.'; });
      };
      return el;
    }
    function bookCard(m) {
      var el = document.createElement('form'); el.className = 'card';
      if (m.done) { el.innerHTML = '<h4>Requested: ' + esc(m.done.day) + ', ' + esc(m.done.time) + '</h4><p>We will confirm by text.</p>'; return el; }
      var days = [];
      for (var i = 1; days.length < 6 && i < 14; i++) { var d = new Date(Date.now() + i * 864e5); if (d.getDay()) days.push(d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })); }
      el.innerHTML = '<h4>Preferred day and time</h4><div class="row"><label>Day<select name="day">' + days.map(function (d) { return '<option>' + esc(d) + '</option>'; }).join('') + '</select></label>' +
        '<label>Time<select name="time">' + C.slots.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('') + '</select></label></div>' +
        '<div class="err" role="alert"></div><button class="pri">Request booking</button>';
      el.onsubmit = function (e) {
        e.preventDefault();
        var f = new FormData(el), day = String(f.get('day')), time = String(f.get('time')), btn = el.querySelector('.pri');
        btn.disabled = true;
        post('/api/lead', { kind: 'booking', day: day, time: time }).then(function (r) {
          if (!r.ok) throw new Error('save failed');
          m.done = { day: day, time: time }; save(); el.replaceWith(bookCard(m));
          localReply('Done. You are pencilled in for ' + day + ', ' + time.toLowerCase() + '. We will text to confirm.', 'Holding your slot...');
        }).catch(function () { btn.disabled = false; el.querySelector('.err').textContent = 'Sorry, that did not send. Please try again.'; });
      };
      return el;
    }

    // Read an SSE response from fetch (EventSource cannot POST).
    function readSSE(res, on) {
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) return;
          buf += dec.decode(r.value, { stream: true });
          var parts = buf.split('\n\n'); buf = parts.pop();
          parts.forEach(function (p) {
            var ev = 'message', data = '';
            p.split('\n').forEach(function (l) { if (l.indexOf('event:') === 0) ev = l.slice(6).trim(); else if (l.indexOf('data:') === 0) data += l.slice(5).trim(); });
            try { on(ev, JSON.parse(data || '{}')); } catch (e) {}
          });
          return pump();
        });
      }
      return pump();
    }

    function send(text) {
      text = String(text || '').trim(); if (!text || busy) return;
      busy = true; push({ t: 'user', x: text }); input.value = '';
      var st = statusEl('Typing...'), msg = null, el = null, actions = [];
      var onEv = function (ev, d) {
        if (ev === 'status' && st) st.lastChild.textContent = d.text;
        else if (ev === 'delta') {
          if (!el) { if (st) { st.remove(); st = null; } msg = { t: 'bot', x: '' }; el = render(msg); }
          msg.x += d.text; el.textContent = msg.x; scroll();
        } else if (ev === 'actions') actions = d.actions || [];
      };
      post('/api/chat', { messages: history(), pageUrl: location.href })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          if ((res.headers.get('content-type') || '').indexOf('text/event-stream') > -1 && res.body) return readSSE(res, onEv);
          return res.json().then(function (j) { onEv('status', { text: j.status }); onEv('delta', { text: j.text }); onEv('actions', { actions: j.actions }); });
        })
        .catch(function () {
          if (!el) onEv('delta', { text: 'Sorry, I could not connect just now.' + (C.phone ? ' You can call us on ' + C.phone + '.' : '') });
        })
        .then(function () {
          if (st) st.remove();
          if (msg) { log.push(msg); save(); }
          actions.forEach(function (a) { if (a && (a.t === 'chips' || a.t === 'lead' || a.t === 'booking')) push(a); });
          busy = false;
        });
    }
    $('.inp').onsubmit = function (e) { e.preventDefault(); send(input.value); };

    var lastFocus = null;
    function open() {
      lastFocus = document.activeElement; W.classList.add('open'); launch.setAttribute('aria-expanded', 'true');
      ls.set(TKEY, 1); var t = $('.teaser'); if (t) t.remove();
      if (!log.length) { push({ t: 'bot', x: C.greeting }); if (C.chips.length) push({ t: 'chips', x: C.chips }); }
      setTimeout(function () { input.focus({ preventScroll: true }); scroll(); }, 60);
    }
    function close(clear) {
      W.classList.remove('open'); launch.setAttribute('aria-expanded', 'false');
      if (clear) {
        if (log.some(function (m) { return m.t === 'user'; })) post('/api/end', {}).catch(function () {});
        log = []; save(); body.innerHTML = ''; sessionId = newSid(); ls.set(SKEY, sessionId);
      }
      launch.focus();
    }
    launch.onclick = open; $('.mn').onclick = function () { close(false); }; $('.cl').onclick = function () { close(true); };
    root.addEventListener('keydown', function (e) {
      if (!W.classList.contains('open')) return;
      if (e.key === 'Escape') { e.preventDefault(); close(false); return; }
      if (e.key === 'Tab') {
        var f = [].slice.call(panel.querySelectorAll('button,input,select,a[href]')).filter(function (x) { return !x.disabled && x.getClientRects().length; });
        if (!f.length) return;
        var a = root.activeElement;
        if (e.shiftKey && (a === f[0] || !panel.contains(a))) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (a === f[f.length - 1] || !panel.contains(a))) { e.preventDefault(); f[0].focus(); }
      }
    });
    log.forEach(render);
    window.SystemBrainWidget = { open: open, close: close, send: send, clientId: CLIENT_ID };
  }

  function boot() {
    fetch(API + '/api/config/' + encodeURIComponent(CLIENT_ID))
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(start)
      .catch(function (e) { console.warn('[SystemBrain] could not load config for "' + CLIENT_ID + '":', e.message); });
  }
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
})();

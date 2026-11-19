// Brique à Brique — client
const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// ---------- Identité ----------
let playerId = store.get('bab:id');
if (!playerId) {
  playerId = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
  store.set('bab:id', playerId);
}
let playerName = store.get('bab:name') || '';

// ---------- État client ----------
let S = null; // snapshot serveur
let selected = Number(store.get('bab:color')) || 3;
let showGhost = true;
let hover = null; // {x, y}
let tokens = { tokens: 10, max: 10, regenMs: 1000, nextIn: 0, at: Date.now() };
let soundOn = store.get('bab:sound') !== 'off';
const anims = new Map(); // index -> start time
const CELL = 24;

// ---------- Canvas & sprites ----------
const canvas = $('wall');
const ctx = canvas.getContext('2d');
let dpr = 1;
let sprites = {}; // color index -> canvas
let emptySprite = null;

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}

function makeBrick(hex) {
  const s = CELL * dpr;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const p = 0.5;
  // corps
  g.fillStyle = hex;
  g.fillRect(p, p, CELL - 2 * p, CELL - 2 * p);
  // biseaux
  g.fillStyle = shade(hex, 0.18);
  g.fillRect(p, p, CELL - 2 * p, 2);
  g.fillRect(p, p, 2, CELL - 2 * p);
  g.fillStyle = shade(hex, -0.22);
  g.fillRect(p, CELL - p - 3, CELL - 2 * p, 3);
  g.fillRect(CELL - p - 2, p, 2, CELL - 2 * p);
  // tenon
  const cx = CELL / 2, cy = CELL / 2 - 1, r = CELL * 0.27;
  g.beginPath(); g.arc(cx + 0.5, cy + 1.6, r, 0, Math.PI * 2); g.fillStyle = shade(hex, -0.3); g.fill();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = hex; g.fill();
  const grad = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  grad.addColorStop(0, shade(hex, 0.25)); grad.addColorStop(0.6, '#0000');
  g.beginPath(); g.arc(cx, cy, r - 0.5, 0, Math.PI * 2); g.fillStyle = grad; g.fill();
  return c;
}

function makeEmpty() {
  const s = CELL * dpr;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.fillStyle = '#1a2133';
  g.fillRect(0, 0, CELL, CELL);
  g.beginPath(); g.arc(CELL / 2, CELL / 2, CELL * 0.22, 0, Math.PI * 2);
  g.fillStyle = '#20293e'; g.fill();
  g.strokeStyle = '#26304a'; g.lineWidth = 1; g.stroke();
  return c;
}

function setupCanvas() {
  if (!S) return;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = S.w * CELL * dpr;
  canvas.height = S.h * CELL * dpr;
  sprites = {};
  for (const p of S.palette) sprites[p.index] = makeBrick(p.hex);
  emptySprite = makeEmpty();
  draw();
}

const colorHex = (c) => S.palette[c - 1]?.hex || '#000';
const colorName = (c) => S.palette[c - 1]?.name || '?';

function expectedAt(x, y) {
  const b = S.blueprint;
  const bx = x - b.x0, by = y - b.y0;
  if (bx < 0 || by < 0 || bx >= b.w || by >= b.h) return 0;
  return b.data[by * b.w + bx];
}

function canPlace(x, y, c = selected) {
  if (!S || S.completedAt) return { ok: false };
  const i = y * S.w + x;
  const cur = S.grid[i];
  if (cur === c) return { ok: false, why: 'Déjà cette couleur' };
  if (cur === 0 && y < S.h - 1 && S.grid[i + S.w] === 0) return { ok: false, why: 'Gravité : rien en dessous' };
  const exp = expectedAt(x, y);
  if (exp && cur === exp) return { ok: false, why: 'Verrouillée 🔒' };
  return { ok: true };
}

let rafPending = false;
function requestDraw() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; draw(); });
}

function draw() {
  if (!S || !emptySprite) return;
  const now = performance.now();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const s = CELL * dpr;
  let animating = false;

  for (let y = 0; y < S.h; y++) {
    for (let x = 0; x < S.w; x++) {
      const i = y * S.w + x;
      const c = S.grid[i];
      const exp = expectedAt(x, y);
      ctx.drawImage(emptySprite, x * s, y * s);
      if (c) {
        const t0 = anims.get(i);
        if (t0 !== undefined) {
          const k = Math.min(1, (now - t0) / 220);
          const e = 1 - Math.pow(1 - k, 3);
          ctx.globalAlpha = 0.3 + 0.7 * e;
          ctx.drawImage(sprites[c], x * s, y * s - (1 - e) * s * 0.9);
          ctx.globalAlpha = 1;
          if (k >= 1) anims.delete(i); else animating = true;
        } else {
          ctx.drawImage(sprites[c], x * s, y * s);
        }
        if (showGhost && exp && c !== exp) {
          // brique incorrecte dans la notice : petit coin de la bonne couleur
          ctx.fillStyle = colorHex(exp);
          ctx.beginPath();
          ctx.moveTo(x * s + s, y * s);
          ctx.lineTo(x * s + s, y * s + s * 0.45);
          ctx.lineTo(x * s + s * 0.55, y * s);
          ctx.fill();
        }
      } else if (showGhost && exp) {
        ctx.globalAlpha = 0.33;
        ctx.drawImage(sprites[exp], x * s, y * s);
        ctx.globalAlpha = 1;
      }
    }
  }

  // contour de la notice
  if (showGhost) {
    const b = S.blueprint;
    ctx.save();
    ctx.setLineDash([6 * dpr, 5 * dpr]);
    ctx.strokeStyle = '#f2cd37cc';
    ctx.lineWidth = 2 * dpr;
    ctx.strokeRect(b.x0 * s + dpr, b.y0 * s + dpr, b.w * s - 2 * dpr, b.h * s - 2 * dpr);
    ctx.restore();
  }

  // aperçu au survol
  if (hover && !S.completedAt) {
    const { x, y } = hover;
    const r = canPlace(x, y);
    if (r.ok) {
      ctx.globalAlpha = 0.75;
      ctx.drawImage(sprites[selected], x * s, y * s);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff';
    } else {
      ctx.strokeStyle = '#ff4d3a';
    }
    ctx.lineWidth = 2 * dpr;
    ctx.strokeRect(x * s + dpr, y * s + dpr, s - 2 * dpr, s - 2 * dpr);
  }

  if (animating && !document.hidden) requestDraw();
}

// ---------- Mini notice ----------
function drawMini() {
  const b = S.blueprint;
  const mini = $('mini');
  mini.width = b.w * 10; mini.height = b.h * 10;
  const g = mini.getContext('2d');
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    const exp = b.data[y * b.w + x];
    const cur = S.grid[(b.y0 + y) * S.w + (b.x0 + x)];
    g.fillStyle = colorHex(exp);
    g.globalAlpha = cur === exp ? 1 : 0.35;
    g.fillRect(x * 10, y * 10, 10, 10);
  }
  g.globalAlpha = 1;
}

// ---------- UI ----------
function renderPalette() {
  const el = $('palette');
  el.innerHTML = '';
  S.palette.forEach((p, k) => {
    const b = document.createElement('button');
    b.className = 'swatch' + (p.index === selected ? ' active' : '');
    b.style.background = p.hex;
    b.title = `${p.name}${k < 9 ? ` (touche ${k + 1})` : ''}`;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', p.index === selected);
    b.setAttribute('aria-label', p.name);
    if (k < 9) b.innerHTML = `<span class="k">${k + 1}</span>`;
    b.onclick = () => selectColor(p.index);
    el.appendChild(b);
  });
}

function selectColor(c) {
  selected = c;
  store.set('bab:color', String(c));
  [...$('palette').children].forEach((b, k) => {
    const on = S.palette[k].index === c;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on);
  });
  requestDraw();
}

function renderProgress() {
  const { done, total } = S.progress;
  const pct = total ? Math.floor((done / total) * 100) : 0;
  $('progressFill').style.width = `${(done / total) * 100}%`;
  $('progressPct').textContent = `${pct} %`;
  $('progressCount').textContent = `${done} / ${total}`;
  drawMini();
}

function renderNotice() {
  $('bpName').textContent = S.blueprint.name;
  $('plateNo').textContent = `Plaque n°${S.plate}`;
  $('upcoming').textContent = S.upcoming;
  renderProgress();
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderLeaderboard() {
  const el = $('leaderboard');
  if (!S.leaderboard.length) {
    el.innerHTML = '<li class="empty">Personne pour l\'instant… à vous !</li>';
    return;
  }
  el.innerHTML = S.leaderboard.map((p) => `
    <li class="${p.name === playerName ? 'me' : ''}">
      <span class="n">${esc(p.name)}</span>
      <span class="sub">${p.bricks} 🧱</span>
      <span class="pts">${p.points} pts</span>
    </li>`).join('');
}

function addFeed(html, color) {
  const el = $('feed');
  el.querySelector('.empty')?.remove();
  const li = document.createElement('li');
  li.innerHTML = `${color ? `<span class="sw" style="background:${color}"></span>` : ''}<span>${html}</span>`;
  el.prepend(li);
  while (el.children.length > 8) el.lastChild.remove();
}

function drawPlate(canvasEl, gridStr) {
  const scale = 4;
  canvasEl.width = S.w * scale; canvasEl.height = S.h * scale;
  const g = canvasEl.getContext('2d');
  g.fillStyle = '#1a2133'; g.fillRect(0, 0, canvasEl.width, canvasEl.height);
  for (let i = 0; i < gridStr.length; i++) {
    const c = parseInt(gridStr[i], 16);
    if (!c) continue;
    g.fillStyle = colorHex(c);
    g.fillRect((i % S.w) * scale, Math.floor(i / S.w) * scale, scale, scale);
  }
}

function fmtDuration(ms) {
  const m = Math.floor(ms / 60000), s = Math.round((ms % 60000) / 1000);
  return m ? `${m} min ${String(s).padStart(2, '0')}` : `${s} s`;
}

function renderGallery() {
  const el = $('gallery');
  if (!S.gallery.length) {
    el.innerHTML = '<p class="empty">Aucun modèle terminé. Soyez les premiers !</p>';
    return;
  }
  el.innerHTML = '';
  for (const e of S.gallery) {
    const fig = document.createElement('figure');
    const c = document.createElement('canvas');
    drawPlate(c, e.grid);
    fig.appendChild(c);
    const cap = document.createElement('figcaption');
    cap.innerHTML = `<b>${esc(e.name)}</b> · plaque n°${e.plate}<br>${fmtDuration(e.durationMs)} · ${e.builders} bâtisseur${e.builders > 1 ? 's' : ''}`;
    fig.appendChild(cap);
    el.appendChild(fig);
  }
}

// Réserve de briques (simulée localement, resynchronisée par le serveur)
function currentTokens() {
  const elapsed = Date.now() - tokens.at;
  if (tokens.tokens >= tokens.max) return { n: tokens.max, frac: 0 };
  const sinceFirst = elapsed - tokens.nextIn;
  if (sinceFirst < 0) return { n: tokens.tokens, frac: 1 - (tokens.nextIn - elapsed) / tokens.regenMs };
  const extra = 1 + Math.floor(sinceFirst / tokens.regenMs);
  const n = Math.min(tokens.max, tokens.tokens + extra);
  return { n, frac: n >= tokens.max ? 0 : (sinceFirst % tokens.regenMs) / tokens.regenMs };
}

function renderReserve() {
  const bar = $('reserveBar');
  if (bar.children.length !== tokens.max) bar.innerHTML = '<i></i>'.repeat(tokens.max);
  const { n, frac } = currentTokens();
  [...bar.children].forEach((el, k) => {
    el.className = k < n ? 'full' : k === n ? 'charging' : '';
    if (k === n) el.style.setProperty('--p', frac.toFixed(2));
  });
  $('tokenText').textContent = `${n}/${tokens.max}`;
}
setInterval(renderReserve, 100);

let toastTimer;
function toast(msg, kind = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 2200);
}

// ---------- Sons (WebAudio, aucun fichier) ----------
let actx = null;
function beep(freq, dur = 0.06, type = 'square', vol = 0.06, when = 0) {
  if (!soundOn) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime + when;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur);
  } catch {}
}
const sfx = {
  place: () => { beep(180, 0.05, 'square', 0.05); beep(90, 0.06, 'triangle', 0.08, 0.01); },
  good: () => { beep(660, 0.07, 'triangle', 0.07); beep(990, 0.1, 'triangle', 0.06, 0.06); },
  bad: () => beep(110, 0.12, 'sawtooth', 0.04),
  win: () => [523, 659, 784, 1046, 784, 1046].forEach((f, k) => beep(f, 0.18, 'triangle', 0.08, k * 0.12)),
};
function renderSound() { $('soundBtn').textContent = soundOn ? '🔊' : '🔇'; }
$('soundBtn').onclick = () => { soundOn = !soundOn; store.set('bab:sound', soundOn ? 'on' : 'off'); renderSound(); };
renderSound();

// ---------- Célébration ----------
let confettiStop = null;
function celebrate(entry, nextPlateAt) {
  $('doneName').textContent = entry.name;
  $('doneStats').textContent = `Construit en ${fmtDuration(entry.durationMs)} par ${entry.builders} bâtisseur${entry.builders > 1 ? 's' : ''}.`;
  $('donePodium').innerHTML = entry.top.map((p, k) => `<li>${['🥇', '🥈', '🥉'][k]} <b>${esc(p.name)}</b> — ${p.points} briques</li>`).join('');
  $('celebrate').hidden = false;
  const tick = () => {
    const left = Math.max(0, Math.ceil((nextPlateAt - Date.now()) / 1000));
    $('doneCountdown').textContent = left;
    if (!$('celebrate').hidden && left > 0) setTimeout(tick, 250);
  };
  tick();
  confettiStop = runConfetti();
}
function endCelebrate() {
  $('celebrate').hidden = true;
  if (confettiStop) confettiStop();
}
$('celebrate').onclick = endCelebrate;

function runConfetti() {
  const c = $('confetti');
  const g = c.getContext('2d');
  c.width = innerWidth; c.height = innerHeight;
  const colors = S.palette.map((p) => p.hex);
  const parts = Array.from({ length: 160 }, () => ({
    x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.5,
    vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.2,
    col: colors[Math.floor(Math.random() * colors.length)], w: 10 + Math.random() * 6,
  }));
  let alive = true;
  (function frame() {
    if (!alive) return;
    g.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.r += p.vr;
      if (p.y > c.height + 20) { p.y = -20; p.vy = 2 + Math.random() * 3; }
      g.save(); g.translate(p.x, p.y); g.rotate(p.r);
      g.fillStyle = p.col; g.fillRect(-p.w / 2, -p.w * 0.35, p.w, p.w * 0.7);
      g.fillStyle = '#ffffff40'; g.fillRect(-p.w / 2, -p.w * 0.35, p.w, 2);
      g.restore();
    }
    requestAnimationFrame(frame);
  })();
  return () => { alive = false; g.clearRect(0, 0, c.width, c.height); };
}

// ---------- Réseau ----------
let ws = null;
let retry = 0;

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  $('conn').hidden = !!S;
  ws.onopen = () => {
    retry = 0;
    $('conn').hidden = true;
    if (playerName) send({ t: 'hello', id: playerId, name: playerName });
  };
  ws.onclose = () => {
    $('conn').hidden = false;
    $('conn').textContent = 'Connexion perdue… reconnexion';
    setTimeout(connect, Math.min(8000, 500 * 2 ** retry++));
  };
  ws.onmessage = (ev) => handle(JSON.parse(ev.data));
}

function handle(m) {
  switch (m.t) {
    case 'init': {
      const first = !S;
      const newPlate = S && S.plate !== m.state.plate;
      S = m.state;
      if (first) {
        setupCanvas(); renderPalette();
        // Sur mobile, on centre le défilement sur la notice
        const wrap = $('wallWrap');
        if (wrap.scrollWidth > wrap.clientWidth) {
          const b = S.blueprint;
          wrap.scrollLeft = ((b.x0 + b.w / 2) / S.w) * wrap.scrollWidth - wrap.clientWidth / 2;
        }
      } else draw();
      renderNotice(); renderLeaderboard(); renderGallery();
      if (newPlate) {
        endCelebrate();
        addFeed(`🧱 Nouvelle plaque : <b>${esc(S.blueprint.name)}</b> !`);
        toast(`Nouvelle notice : ${S.blueprint.name} !`, 'good');
      }
      break;
    }
    case 'welcome':
      playerName = m.name;
      $('meName').textContent = playerName;
      syncTokens(m.tokens);
      renderLeaderboard();
      break;
    case 'online':
      $('onlineCount').textContent = m.n;
      break;
    case 'brick': {
      const i = m.y * S.w + m.x;
      S.grid[i] = m.c;
      S.owners[i] = m.by;
      S.progress = m.progress;
      anims.set(i, performance.now());
      requestDraw();
      renderProgress();
      if (m.by !== playerName) addFeed(`<span class="who">${esc(m.by)}</span> ${m.good ? '<span class="good">✓ notice</span>' : 'a posé une brique'}`, colorHex(m.c));
      break;
    }
    case 'leaderboard':
      S.leaderboard = m.leaderboard;
      renderLeaderboard();
      break;
    case 'placed':
      if (m.tokens) syncTokens(m.tokens);
      if (!m.ok) { toast(m.error, 'bad'); sfx.bad(); }
      break;
    case 'complete':
      S.completedAt = m.entry.completedAt;
      S.gallery = m.gallery;
      renderGallery();
      addFeed(`🎉 <b>${esc(m.entry.name)}</b> terminé !`);
      sfx.win();
      celebrate(m.entry, m.nextPlateAt);
      break;
    case 'error':
      toast(m.error, 'bad');
      break;
  }
}

function syncTokens(t) {
  tokens = { ...t, at: Date.now() };
  renderReserve();
}

// ---------- Interactions ----------
function cellFromEvent(ev) {
  const r = canvas.getBoundingClientRect();
  const x = Math.floor(((ev.clientX - r.left) / r.width) * S.w);
  const y = Math.floor(((ev.clientY - r.top) / r.height) * S.h);
  if (x < 0 || y < 0 || x >= S.w || y >= S.h) return null;
  return { x, y };
}

function updateHoverInfo() {
  const el = $('hoverInfo');
  if (!hover || !S) return;
  const i = hover.y * S.w + hover.x;
  const parts = [];
  const exp = expectedAt(hover.x, hover.y);
  if (S.grid[i]) parts.push(`Brique ${colorName(S.grid[i]).toLowerCase()} posée par <b>${esc(S.owners[i] || '?')}</b>`);
  else parts.push('Case vide');
  if (exp) parts.push(`Notice : <b>${colorName(exp)}</b>${S.grid[i] === exp ? ' ✓' : ''}`);
  else parts.push('Zone libre');
  const r = canPlace(hover.x, hover.y);
  if (!r.ok && r.why) parts.push(`<span style="color:#ff8a7a">${r.why}</span>`);
  el.innerHTML = parts.join(' · ');
}

canvas.addEventListener('pointermove', (ev) => {
  if (!S) return;
  const c = cellFromEvent(ev);
  if (c && (!hover || c.x !== hover.x || c.y !== hover.y)) {
    hover = c; updateHoverInfo(); requestDraw();
  }
});
canvas.addEventListener('pointerleave', () => { hover = null; requestDraw(); });

function pipette(cell) {
  const exp = expectedAt(cell.x, cell.y) || S.grid[cell.y * S.w + cell.x];
  if (exp) { selectColor(exp); toast(`Pipette : ${colorName(exp)}`); }
}

let longPress = null;
canvas.addEventListener('pointerdown', (ev) => {
  if (!S || ev.button !== 0) return;
  const cell = cellFromEvent(ev);
  if (!cell) return;
  hover = cell;
  if (ev.pointerType === 'touch') {
    longPress = { cell, fired: false, timer: setTimeout(() => { longPress.fired = true; pipette(cell); }, 500) };
  }
});
canvas.addEventListener('pointerup', (ev) => {
  if (!S || ev.button !== 0) return;
  if (longPress) {
    clearTimeout(longPress.timer);
    const fired = longPress.fired;
    longPress = null;
    if (fired) return;
  }
  const cell = cellFromEvent(ev);
  if (!cell) return;
  if (!playerName) return openWelcome();
  const r = canPlace(cell.x, cell.y);
  if (!r.ok) { if (r.why) toast(r.why, 'bad'); sfx.bad(); return; }
  if (currentTokens().n <= 0) { toast('Plus de briques en réserve, patience…', 'bad'); sfx.bad(); return; }
  const good = expectedAt(cell.x, cell.y) === selected;
  good ? sfx.good() : sfx.place();
  if (good) addFeed(`<span class="who">Vous</span> <span class="good">✓ notice +1</span>`, colorHex(selected));
  send({ t: 'place', x: cell.x, y: cell.y, c: selected });
  // décrément optimiste de la réserve
  const cur = currentTokens();
  tokens = { ...tokens, tokens: cur.n - 1, nextIn: cur.n >= tokens.max ? tokens.regenMs : Math.round((1 - cur.frac) * tokens.regenMs), at: Date.now() };
  renderReserve();
});
canvas.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  const cell = S && cellFromEvent(ev);
  if (cell) pipette(cell);
});

window.addEventListener('keydown', (ev) => {
  if (!S || ev.target.tagName === 'INPUT') return;
  const n = Number(ev.key);
  if (n >= 1 && n <= 9 && S.palette[n - 1]) selectColor(S.palette[n - 1].index);
  if (ev.key === 'n' || ev.key === 'N') { $('ghostToggle').click(); }
});

$('ghostToggle').addEventListener('change', (ev) => { showGhost = ev.target.checked; requestDraw(); });
window.addEventListener('resize', () => requestDraw());
document.addEventListener('visibilitychange', () => { if (!document.hidden) requestDraw(); });

// ---------- Accueil ----------
const dlg = $('welcome');
function openWelcome() {
  $('nameInput').value = playerName;
  dlg.showModal();
  setTimeout(() => $('nameInput').focus(), 50);
}
$('welcomeForm').addEventListener('submit', () => {
  const v = $('nameInput').value.trim().slice(0, 16);
  if (!v) return;
  playerName = v;
  store.set('bab:name', v);
  $('meName').textContent = v;
  send({ t: 'hello', id: playerId, name: v });
});
$('meBtn').onclick = openWelcome;
$('helpBtn').onclick = openWelcome;

$('meName').textContent = playerName || 'Invité';
connect();
if (!playerName) openWelcome();

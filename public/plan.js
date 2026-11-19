// Plan de montage — client
import { SHAPES, cellsOf, checkPlacement, canRemove, solve, REASONS } from '/lib/puzzle.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ---------- Joueur ----------
let playerId = store.get('bab:id');
if (!playerId) { playerId = crypto.randomUUID ? crypto.randomUUID() : `p-${Math.random().toString(36).slice(2)}${Date.now()}`; store.set('bab:id', playerId); }
let playerName = store.get('bab:name') || '';
$('meName').textContent = playerName || 'Invité';
let progress = {};
try { progress = JSON.parse(store.get('bab:plan:progress') || '{}') || {}; } catch {}

// ---------- Données ----------
let PALETTE = [];
let LEVELS = [];
let DAILY = null;
const hex = (c) => PALETTE[c]?.hex || '#888';
const colorName = (c) => PALETTE[c]?.name || '?';

// ---------- Sons ----------
let soundOn = store.get('bab:sound') !== 'off';
let actx;
function beep(f, d = .06, type = 'square', v = .05, w = 0) {
  if (!soundOn) return;
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); const t = actx.currentTime + w, o = actx.createOscillator(), g = actx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d); } catch {}
}
const sfx = {
  place: () => { beep(200, .05, 'square', .05); beep(95, .07, 'triangle', .09, .01); },
  pick: () => beep(420, .05, 'triangle', .05),
  bad: () => beep(110, .12, 'sawtooth', .04),
  hint: () => { beep(880, .08, 'sine', .05); beep(1320, .1, 'sine', .04, .07); },
  win: () => [523, 659, 784, 1046, 784, 1046].forEach((f, k) => beep(f, .18, 'triangle', .07, k * .12)),
};
const renderSound = () => ($('soundBtn').textContent = soundOn ? '🔊' : '🔇');
$('soundBtn').onclick = () => { soundOn = !soundOn; store.set('bab:sound', soundOn ? 'on' : 'off'); renderSound(); };
renderSound();

let toastT;
function toast(msg, kind = '') {
  const el = $('toast'); el.textContent = msg; el.className = `toast show ${kind}`;
  clearTimeout(toastT); toastT = setTimeout(() => (el.className = 'toast'), 2400);
}

// ---------- Dessin des briques (vue de face, tenons au-dessus) ----------
function shade(h, a) { const n = parseInt(h.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v + a * 255))); return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`; }
function drawBrick(g, px, py, wc, hc, C, color, { alpha = 1, outline = null } = {}) {
  const sh = Math.round(C * 0.17), sw = Math.round(C * 0.52);
  g.save();
  g.globalAlpha = alpha;
  // tenons
  for (let i = 0; i < wc; i++) {
    const sx = px + i * C + (C - sw) / 2;
    g.fillStyle = shade(color, -0.12); g.fillRect(sx, py - sh, sw, sh + 1);
    g.fillStyle = shade(color, 0.12); g.fillRect(sx + 2, py - sh, Math.max(2, sw * .22), sh);
  }
  // corps
  const bw = wc * C, bh = hc * C;
  g.fillStyle = color; g.fillRect(px + 1, py, bw - 2, bh - 1);
  g.fillStyle = shade(color, 0.16); g.fillRect(px + 1, py, bw - 2, Math.max(2, C * .07));
  g.fillStyle = shade(color, -0.2); g.fillRect(px + 1, py + bh - Math.max(3, C * .1) - 1, bw - 2, Math.max(3, C * .1));
  g.fillStyle = shade(color, -0.1); g.fillRect(px + bw - Math.max(2, C * .06) - 1, py, Math.max(2, C * .06), bh - 1);
  if (outline) { g.globalAlpha = 1; g.strokeStyle = outline; g.lineWidth = 2; g.strokeRect(px + 1, py - sh, bw - 2, bh + sh - 1); }
  g.restore();
}

// Aperçu miniature d'un modèle
function drawPreview(canvas, L, maxW = 220, maxH = 94) {
  const s = Math.max(4, Math.min(Math.floor(maxW / L.w), Math.floor(maxH / L.h), 16));
  canvas.width = L.w * s; canvas.height = L.h * s;
  const g = canvas.getContext('2d');
  for (let i = 0; i < L.target.length; i++) {
    if (!L.target[i]) continue;
    g.fillStyle = hex(L.target[i]);
    g.fillRect((i % L.w) * s, Math.floor(i / L.w) * s, s - (s > 6 ? 1 : 0), s - (s > 6 ? 1 : 0));
  }
}

// ---------- Menu ----------
function stars(n) { return `${'★'.repeat(n)}<span class="off">${'★'.repeat(3 - n)}</span>`; }
const DIFF = { easy: 'Facile', medium: 'Moyen', hard: 'Difficile', daily: 'Défi' };

function renderMenu() {
  const el = $('levels');
  el.innerHTML = '';
  for (const L of LEVELS) {
    const p = progress[L.id];
    const b = document.createElement('button');
    b.className = 'level';
    b.innerHTML = `<div class="pv"><canvas></canvas></div>
      <div class="row"><span class="n">Niveau ${L.n}</span><span class="diff ${L.difficulty}">${DIFF[L.difficulty]}</span></div>
      <div class="row"><span class="nm">${esc(L.name)}</span></div>
      <div class="row"><span class="st">${stars(p?.stars || 0)}</span><span class="n">${p ? fmt(p.timeMs) : `${L.pieces.length} briques`}</span></div>`;
    drawPreview(b.querySelector('canvas'), L);
    b.onclick = () => startLevel(L);
    el.appendChild(b);
  }
}

function renderDaily(top) {
  if (!DAILY) return;
  $('dailyName').textContent = DAILY.name;
  drawPreview($('dailyPreview'), DAILY, 236, 180);
  $('dailyBtn').disabled = false;
  const p = progress[DAILY.id];
  $('dailyBtn').textContent = p ? `Rejouer (votre temps : ${fmt(p.timeMs)})` : 'Relever le défi';
  $('dailyTop').innerHTML = top?.length
    ? top.slice(0, 3).map((e, k) => `<li>${['🥇', '🥈', '🥉'][k]} ${esc(e.name)} · ${fmt(e.timeMs)}${e.hints ? ` · ${e.hints}💡` : ''}</li>`).join('')
    : '<li>Personne ne l\'a encore réussi aujourd\'hui</li>';
}
$('dailyBtn').onclick = () => DAILY && startLevel(DAILY);

function showMenu() {
  stopTimer();
  $('play').hidden = true; $('menu').hidden = false; $('win').hidden = true;
  stopConfetti();
  renderMenu();
  fetch('/api/plan/daily').then((r) => r.json()).then((d) => { DAILY = d.level; renderDaily(d.top); }).catch(() => {});
  history.replaceState(null, '', '#');
}
$('backBtn').onclick = showMenu;
$('menuBtn').onclick = showMenu;
$('homeLink').onclick = (e) => { e.preventDefault(); showMenu(); };

// ---------- Partie ----------
let L = null;          // niveau courant
let board = [];        // index pièce + 1, 0 = vide
let placed = new Map(); // index pièce -> { shape, color, x, y }
let ops = [];          // historique rejouable par le serveur
let undoStack = [];
let selected = null;   // clé de groupe "couleur:forme"
let hover = null;      // { x, y } coordonnées « continues » en cases
let hint = null;       // { shape, color, x, y, until }
let hints = 0, removals = 0, startAt = 0, endAt = 0, timer = null, won = false;
let C = 40, PAD = 8;

const canvas = $('board');
const ctx = canvas.getContext('2d');

function groups() {
  const m = new Map();
  L.pieces.forEach((p, i) => {
    const k = `${p.color}:${p.shape}`;
    if (!m.has(k)) m.set(k, { key: k, color: p.color, shape: p.shape, ids: [] });
    m.get(k).ids.push(i);
  });
  return [...m.values()];
}
let GROUPS = [];
const freeIn = (g) => g.ids.filter((i) => !placed.has(i));

function startLevel(level) {
  L = level;
  GROUPS = groups();
  board = new Array(L.w * L.h).fill(0);
  placed = new Map(); ops = []; undoStack = [];
  selected = null; hover = null; hint = null;
  hints = 0; removals = 0; startAt = 0; endAt = 0; won = false;
  stopTimer();
  $('menu').hidden = true; $('play').hidden = false; $('win').hidden = true;
  stopConfetti();
  $('lvlEyebrow').textContent = L.n ? `Niveau ${L.n} · ${DIFF[L.difficulty]}` : 'Défi du jour';
  $('lvlName').textContent = L.name;
  $('tipPanel').hidden = !L.tip;
  $('tipTxt').textContent = L.tip || '';
  $('info').innerHTML = 'Choisissez une brique dans le stock, puis posez-la sur la notice.';
  history.replaceState(null, '', `#${L.id}`);
  layout();
  renderStock(); renderStats(); loadTop();
  if (GROUPS.length === 1) select(GROUPS[0].key);
  window.scrollTo({ top: 0 });
}

function layout() {
  const wrap = $('boardWrap');
  const avail = Math.max(240, wrap.clientWidth - 32);
  C = Math.max(24, Math.min(64, Math.floor(avail / L.w), Math.floor((window.innerHeight * 0.62) / (L.h + 0.6))));
  PAD = Math.round(C * 0.2);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = L.w * C, H = L.h * C + PAD + Math.round(C * 0.45);
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}
window.addEventListener('resize', () => L && !$('play').hidden && layout());

function renderStock() {
  const el = $('stock');
  el.innerHTML = '';
  GROUPS.forEach((g, k) => {
    const left = freeIn(g).length;
    const s = SHAPES[g.shape];
    const b = document.createElement('button');
    b.className = 'piece' + (selected === g.key ? ' sel' : '');
    b.disabled = left === 0;
    b.title = `${colorName(g.color)} ${s.name}`;
    const cv = document.createElement('canvas');
    const pc = 16, dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = s.w * pc + 2, ch = s.h * pc + 6;
    cv.width = cw * dpr; cv.height = ch * dpr; cv.style.width = `${cw}px`; cv.style.height = `${ch}px`;
    const g2 = cv.getContext('2d'); g2.scale(dpr, dpr);
    drawBrick(g2, 1, 4, s.w, s.h, pc, hex(g.color));
    b.innerHTML = k < 9 ? `<span class="key">${k + 1}</span>` : '';
    b.appendChild(cv);
    const cnt = document.createElement('span');
    cnt.className = 'cnt'; cnt.textContent = `× ${left}`;
    b.appendChild(cnt);
    b.onclick = () => select(selected === g.key ? null : g.key);
    el.appendChild(b);
  });
}

function select(key) {
  const g = GROUPS.find((x) => x.key === key);
  selected = g && freeIn(g).length ? key : null;
  renderStock(); draw();
  if (selected) {
    const s = SHAPES[g.shape];
    $('info').innerHTML = `En main : brique <b>${colorName(g.color).toLowerCase()} ${s.name}</b>. Cliquez sur la notice pour la poser.`;
  }
}

function renderStats() {
  $('movesTxt').textContent = ops.length;
  $('leftTxt').textContent = L.pieces.length - placed.size;
  $('timeTxt').textContent = fmt(startAt ? (endAt || Date.now()) - startAt : 0);
  $('undoBtn').disabled = !undoStack.length || won;
  $('resetBtn').disabled = !placed.size || won;
  $('hintBtn').disabled = won;
}
function startTimer() {
  if (startAt) return;
  startAt = Date.now();
  timer = setInterval(renderStats, 250);
}
function stopTimer() { clearInterval(timer); timer = null; }

// ---------- Actions ----------
function anchorFor(shape) {
  if (!hover) return null;
  const s = SHAPES[shape];
  return { x: Math.round(hover.x - s.w / 2), y: Math.round(hover.y - s.h / 2) };
}

function doPlace(id, x, y, record = true) {
  const p = L.pieces[id];
  placed.set(id, { ...p, x, y });
  for (const [cx, cy] of cellsOf(p.shape, x, y)) board[cy * L.w + cx] = id + 1;
  ops.push({ p: id, x, y });
  if (record) undoStack.push({ type: 'place', id });
}
function doRemove(id, record = true) {
  const q = placed.get(id);
  for (const [cx, cy] of cellsOf(q.shape, q.x, q.y)) board[cy * L.w + cx] = 0;
  placed.delete(id);
  ops.push({ r: id });
  if (record) undoStack.push({ type: 'remove', id, x: q.x, y: q.y });
}

function tryPlace() {
  const g = GROUPS.find((x) => x.key === selected);
  if (!g) return;
  const a = anchorFor(g.shape);
  if (!a) return;
  const r = checkPlacement(L, board, g, a.x, a.y);
  if (r !== 'ok') { toast(REASONS[r], 'bad'); sfx.bad(); return; }
  startTimer();
  doPlace(freeIn(g)[0], a.x, a.y);
  if (hint && hint.shape === g.shape && hint.color === g.color && hint.x === a.x && hint.y === a.y) hint = null;
  sfx.place();
  if (!freeIn(g).length) selected = null;
  afterChange();
}

function pickUp(id) {
  if (!canRemove(L, board, placed, id)) { toast(REASONS.supports, 'bad'); sfx.bad(); return; }
  const q = placed.get(id);
  doRemove(id);
  removals++;
  sfx.pick();
  selected = `${q.color}:${q.shape}`;
  afterChange();
  $('info').innerHTML = 'Brique reprise : elle est de nouveau en main.';
}

function undo() {
  const last = undoStack.pop();
  if (!last || won) return;
  if (last.type === 'place') doRemove(last.id, false);
  else doPlace(last.id, last.x, last.y, false);
  removals++;
  afterChange();
}

function reset() {
  if (!placed.size || won) return;
  // on retire du haut vers le bas pour que chaque retrait reste valide (rejouable par le serveur)
  const order = [...placed.entries()].sort((a, b) => a[1].y - b[1].y).map(([id]) => id);
  for (const id of order) doRemove(id, false);
  undoStack = [];
  removals++;
  selected = null; hint = null;
  afterChange();
  $('info').textContent = 'Plan vidé. On recommence !';
}

function afterChange() {
  renderStock(); renderStats(); draw();
  if (placed.size === L.pieces.length) win();
}

// Indice : vérifie si la construction actuelle peut encore aboutir et propose une brique.
function giveHint() {
  if (won) return;
  const covered = board.map((v) => v !== 0);
  const remaining = L.pieces.filter((_, i) => !placed.has(i));
  const res = solve(L, remaining, { cap: 1, covered, maxNodes: 600000 });
  hints++;
  renderStats();
  if (!res.count && res.complete) {
    $('info').innerHTML = '<span class="bad">⚠️ Impasse : avec les briques restantes, cette construction ne peut pas être terminée. Reprenez des briques.</span>';
    toast('Impasse ! Il faut reprendre des briques.', 'bad');
    sfx.bad();
    return;
  }
  if (!res.count) { toast('Trop de possibilités pour l\'instant : posez quelques briques et réessayez.'); return; }
  const tmp = board.slice();
  const cand = res.first
    .filter((b) => checkPlacement(L, tmp, b, b.x, b.y) === 'ok')
    .sort((a, b) => b.y - a.y)[0];
  if (!cand) return;
  hint = { ...cand, until: Date.now() + 8000 };
  select(`${cand.color}:${cand.shape}`);
  $('info').innerHTML = `<span class="good">💡 Encore possible !</span> Essayez la brique ${colorName(cand.color).toLowerCase()} ${SHAPES[cand.shape].name} à l'endroit qui clignote.`;
  sfx.hint();
  draw();
}

$('undoBtn').onclick = undo;
$('resetBtn').onclick = reset;
$('hintBtn').onclick = giveHint;

// ---------- Rendu du plan ----------
function cellXY(cx, cy) { return [cx * C, PAD + cy * C]; }

function draw() {
  if (!L) return;
  const W = L.w * C, H = L.h * C;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // fond + plaque de base
  ctx.fillStyle = '#141b2e'; ctx.fillRect(0, 0, W, PAD + H);
  const baseY = PAD + H;
  ctx.fillStyle = '#3c6e47'; ctx.fillRect(0, baseY, W, Math.round(C * 0.45));
  ctx.fillStyle = '#2f5a39'; ctx.fillRect(0, baseY + Math.round(C * 0.32), W, Math.round(C * 0.13));
  // notice (modèle en transparence)
  for (let i = 0; i < L.target.length; i++) {
    const t = L.target[i];
    const [x, y] = cellXY(i % L.w, Math.floor(i / L.w));
    if (!t) {
      ctx.fillStyle = '#ffffff06'; ctx.beginPath(); ctx.arc(x + C / 2, y + C / 2, C * .08, 0, 7); ctx.fill();
      continue;
    }
    if (board[i]) continue;
    ctx.globalAlpha = 0.34; ctx.fillStyle = hex(t); ctx.fillRect(x + 2, y + 2, C - 4, C - 4); ctx.globalAlpha = 1;
    ctx.strokeStyle = hex(t); ctx.globalAlpha = 0.8; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 2.5, y + 2.5, C - 5, C - 5); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  // briques posées : du bas vers le haut (les tenons s'emboîtent sous la brique du dessus)
  const list = [...placed.entries()].sort((a, b) => (b[1].y + SHAPES[b[1].shape].h) - (a[1].y + SHAPES[a[1].shape].h));
  const hoverId = !selected && hover ? board[Math.floor(hover.y) * L.w + Math.floor(hover.x)] - 1 : -1;
  for (const [id, q] of list) {
    const s = SHAPES[q.shape];
    const [x, y] = cellXY(q.x, q.y);
    drawBrick(ctx, x, y, s.w, s.h, C, hex(q.color), { outline: id === hoverId ? '#ffffff' : null });
  }
  // indice
  if (hint && Date.now() < hint.until && !won) {
    const s = SHAPES[hint.shape];
    const [x, y] = cellXY(hint.x, hint.y);
    const a = 0.45 + 0.35 * Math.sin(Date.now() / 180);
    drawBrick(ctx, x, y, s.w, s.h, C, hex(hint.color), { alpha: a * .6, outline: `rgba(242,205,55,${a + .3})` });
    requestAnimationFrame(draw);
  }
  // aperçu de la brique en main
  if (selected && hover && !won) {
    const g = GROUPS.find((x) => x.key === selected);
    const a = anchorFor(g.shape);
    const r = checkPlacement(L, board, g, a.x, a.y);
    const s = SHAPES[g.shape];
    const [x, y] = cellXY(a.x, a.y);
    drawBrick(ctx, x, y, s.w, s.h, C, hex(g.color), { alpha: r === 'ok' ? .8 : .35, outline: r === 'ok' ? '#ffffff' : '#ff4d3a' });
    $('info').innerHTML = r === 'ok'
      ? `Brique ${colorName(g.color).toLowerCase()} ${s.name} : <span class="good">pose possible</span>.`
      : `<span class="bad">${REASONS[r]}</span>`;
  } else if (hoverId >= 0 && !won) {
    $('info').innerHTML = 'Cliquez pour <b>reprendre</b> cette brique.';
  }
}

// ---------- Interactions ----------
function pointerCell(ev) {
  const r = canvas.getBoundingClientRect();
  const x = ((ev.clientX - r.left) / r.width) * (L.w * C) / C;
  const y = ((ev.clientY - r.top) / r.height) * (L.h * C + PAD + Math.round(C * .45)) / C - PAD / C;
  return { x, y };
}
canvas.addEventListener('pointermove', (ev) => { if (!L) return; hover = pointerCell(ev); draw(); });
canvas.addEventListener('pointerleave', () => { hover = null; draw(); });
canvas.addEventListener('pointerup', (ev) => {
  if (!L || won || ev.button !== 0) return;
  hover = pointerCell(ev);
  if (selected) { tryPlace(); return; }
  const cx = Math.floor(hover.x), cy = Math.floor(hover.y);
  if (cx >= 0 && cy >= 0 && cx < L.w && cy < L.h && board[cy * L.w + cx]) pickUp(board[cy * L.w + cx] - 1);
  else toast('Choisissez d\'abord une brique dans le stock.');
});
canvas.addEventListener('contextmenu', (ev) => {
  ev.preventDefault();
  if (!L || won) return;
  const h = pointerCell(ev), cx = Math.floor(h.x), cy = Math.floor(h.y);
  if (cx >= 0 && cy >= 0 && cx < L.w && cy < L.h && board[cy * L.w + cx]) pickUp(board[cy * L.w + cx] - 1);
});
window.addEventListener('keydown', (ev) => {
  if ($('play').hidden || ev.target.tagName === 'INPUT') return;
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z') { ev.preventDefault(); undo(); return; }
  if (ev.key === 'Escape') { select(null); $('info').textContent = 'Main vide.'; return; }
  const n = Number(ev.key);
  if (n >= 1 && n <= 9 && GROUPS[n - 1]) select(GROUPS[n - 1].key);
});

// ---------- Victoire & classement ----------
function starCount() { return hints ? 1 : removals ? 2 : 3; }

async function win() {
  won = true;
  endAt = Date.now();
  stopTimer(); renderStats(); draw();
  const time = endAt - startAt, n = starCount();
  const prev = progress[L.id];
  progress[L.id] = { stars: Math.max(n, prev?.stars || 0), timeMs: prev ? Math.min(prev.timeMs, time) : time };
  store.set('bab:plan:progress', JSON.stringify(progress));
  $('winStars').innerHTML = stars(n);
  $('winTitle').textContent = `${L.name} : terminé !`;
  $('winStats').innerHTML = `Temps : <b>${fmt(time)}</b> · Coups : <b>${ops.length}</b> (minimum ${L.pieces.length})${hints ? ` · Indices : <b>${hints}</b>` : ''}`;
  $('winStarsHelp').textContent = n === 3 ? 'Parfait : sans indice et sans reprendre une seule brique !' : n === 2 ? '3 étoiles : terminez sans reprendre de brique.' : '2 étoiles : terminez sans indice.';
  const idx = LEVELS.findIndex((x) => x.id === L.id);
  $('nextBtn').hidden = idx < 0 || idx === LEVELS.length - 1;
  $('winRank').textContent = '';
  $('nameForm').hidden = !!playerName;
  $('win').hidden = false;
  sfx.win();
  startConfetti();
  if (playerName) submitScore(time);
  else setTimeout(() => $('nameInput').focus(), 100);
}

let lastTime = 0;
async function submitScore(time = lastTime) {
  lastTime = time;
  try {
    const r = await fetch('/api/plan/scores', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level: L.id, playerId, name: playerName, ops, timeMs: time, hints }),
    });
    const d = await r.json();
    if (!r.ok) { $('winRank').textContent = d.error || 'Score non enregistré.'; return; }
    $('winRank').textContent = d.rank ? `🏆 ${d.rank === 1 ? '1re' : `${d.rank}e`} place au classement de ce niveau !` : 'Score enregistré (hors top 20).';
    renderTop(d.top);
  } catch {
    $('winRank').textContent = 'Classement indisponible (hors ligne ?).';
  }
}
$('nameForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('nameInput').value.trim().slice(0, 16);
  if (!v) return;
  playerName = v; store.set('bab:name', v); $('meName').textContent = v;
  $('nameForm').hidden = true;
  submitScore();
});
$('nextBtn').onclick = () => { const i = LEVELS.findIndex((x) => x.id === L.id); if (LEVELS[i + 1]) startLevel(LEVELS[i + 1]); };
$('replayBtn').onclick = () => startLevel(L);
$('nameBtn').onclick = () => { $('nameInput2').value = playerName; $('nameDlg').showModal(); };
$('nameDlgForm').addEventListener('submit', () => {
  const v = $('nameInput2').value.trim().slice(0, 16);
  if (!v) return;
  playerName = v; store.set('bab:name', v); $('meName').textContent = v;
});

async function loadTop() {
  try { const d = await (await fetch(`/api/plan/scores?level=${encodeURIComponent(L.id)}`)).json(); renderTop(d.top); } catch {}
}
function renderTop(top) {
  $('lvlTop').innerHTML = top?.length
    ? top.map((e) => `<li class="${e.name === playerName ? 'me' : ''}"><span class="nm">${esc(e.name)}</span><span class="sub">${e.moves} coups${e.hints ? ` · ${e.hints}💡` : ''}</span><b>${fmt(e.timeMs)}</b></li>`).join('')
    : '<li class="muted">Personne n\'a encore terminé ce niveau.</li>';
}

// ---------- Confettis ----------
let confettiAlive = false;
function startConfetti() {
  const c = $('confetti'), g = c.getContext('2d');
  c.width = innerWidth; c.height = innerHeight;
  const cols = PALETTE.filter(Boolean).map((p) => p.hex);
  const parts = Array.from({ length: 150 }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * .5, vx: (Math.random() - .5) * 3, vy: 2 + Math.random() * 4, r: Math.random() * 3, vr: (Math.random() - .5) * .2, col: cols[Math.floor(Math.random() * cols.length)], w: 10 + Math.random() * 6 }));
  confettiAlive = true;
  (function f() {
    if (!confettiAlive) return g.clearRect(0, 0, c.width, c.height);
    g.clearRect(0, 0, c.width, c.height);
    for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vy += .05; p.r += p.vr; if (p.y > c.height + 20) { p.y = -20; p.vy = 2 + Math.random() * 3; } g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.col; g.fillRect(-p.w / 2, -p.w * .35, p.w, p.w * .7); g.restore(); }
    requestAnimationFrame(f);
  })();
}
function stopConfetti() { confettiAlive = false; }

// ---------- Démarrage ----------
(async function boot() {
  const d = await (await fetch('/api/plan/levels')).json();
  PALETTE = d.palette; LEVELS = d.levels;
  const want = location.hash.slice(1);
  showMenu();
  if (want) {
    const L0 = LEVELS.find((x) => x.id === want);
    if (L0) startLevel(L0);
    else if (want.startsWith('daily-')) {
      const dd = await (await fetch('/api/plan/daily')).json();
      if (dd.level.id === want) { DAILY = dd.level; startLevel(DAILY); }
    }
  }
})();

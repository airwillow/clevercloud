// Brique à Brique — serveur HTTP + WebSocket.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game } from './src/game.js';
import { createStore } from './src/store.js';
import * as plan from './src/plan.js';

const PORT = Number(process.env.PORT || 8080);
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const SCORES_KEY = 'brique-a-brique:plan-scores:v1';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

// ---------- État & persistance ----------
const store = await createStore();
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    try {
      await store.save(game.state);
    } catch (err) {
      console.error('[store] Sauvegarde impossible :', err.message);
    }
  }, 1000);
}

const clients = new Set();
function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(data);
}

const game = new Game({ onBroadcast: broadcast, onChange: scheduleSave });
try {
  game.load(await store.load());
} catch (err) {
  console.error('[store] Lecture impossible, nouveau mur :', err.message);
}

// Classements du Plan de montage
let scores = new plan.Scores(null);
try {
  scores = new plan.Scores(await store.load(SCORES_KEY));
} catch (err) {
  console.error('[store] Classements illisibles :', err.message);
}
let scoresTimer = null;
function saveScores() {
  clearTimeout(scoresTimer);
  scoresTimer = setTimeout(() => store.save(scores.data, SCORES_KEY).catch((e) => console.error('[store]', e.message)), 500);
}
// Pré-calcul du défi du jour (quelques secondes au plus)
setTimeout(() => { try { plan.daily(); } catch (e) { console.error('[plan] défi du jour :', e.message); } }, 100);

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

// ---------- HTTP ----------
function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/health') return json(res, 200, { ok: true, store: store.kind, players: onlineCount() });
  if (url.pathname === '/api/state') return json(res, 200, game.snapshot());

  // --- Plan de montage ---
  if (url.pathname === '/api/plan/levels') return json(res, 200, { palette: plan.palette, levels: plan.campaign() });
  if (url.pathname === '/api/plan/daily') return json(res, 200, { palette: plan.palette, level: plan.daily(), top: scores.top(`daily-${plan.today()}`) });
  if (url.pathname === '/api/plan/scores' && req.method === 'GET') {
    const id = String(url.searchParams.get('level') || '');
    return json(res, 200, { top: scores.top(id) });
  }
  if (url.pathname === '/api/plan/scores' && req.method === 'POST') {
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Requête invalide.' }); }
    const level = plan.findLevel(String(body.level || ''));
    if (!level) return json(res, 404, { error: 'Niveau inconnu (le défi du jour a peut-être changé).' });
    const id = String(body.playerId || '');
    if (!/^[a-zA-Z0-9-]{8,40}$/.test(id)) return json(res, 400, { error: 'Joueur invalide.' });
    const check = plan.verify(level, body.ops);
    if (!check.ok) return json(res, 400, { error: check.error });
    const timeMs = Math.max(Math.round(Number(body.timeMs) || 0), level.pieces.length * 250);
    const hints = Math.max(0, Math.min(99, Math.round(Number(body.hints) || 0)));
    const rank = scores.submit(level.id, { id, name: cleanName(body.name), timeMs, moves: check.moves, hints, at: Date.now() });
    saveScores();
    return json(res, 200, { ok: true, rank, top: scores.top(level.id) });
  }

  if (url.pathname.startsWith('/api/admin/')) {
    if (!ADMIN_KEY || url.searchParams.get('key') !== ADMIN_KEY) return json(res, 403, { error: 'forbidden' });
    const action = url.pathname.slice('/api/admin/'.length);
    if (action === 'next') game.nextPlate();
    else if (action === 'almost') game.almost(Number(url.searchParams.get('left') || 5));
    else return json(res, 404, { error: 'unknown action' });
    return json(res, 200, { ok: true, progress: game.progress() });
  }

  // Fichiers statiques
  if (url.pathname === '/lib/puzzle.js') {
    res.writeHead(200, { 'content-type': MIME['.js'], 'cache-control': 'no-cache' });
    return res.end(await readFile(path.join(ROOT, 'src', 'puzzle.js')));
  }
  const ALIASES = { '/': '/index.html', '/tuto': '/tuto.html', '/mur': '/mur.html' };
  let file = ALIASES[url.pathname] || url.pathname;
  file = path.normalize(file).replace(/^(\.\.[/\\])+/, '');
  const full = path.join(PUBLIC_DIR, file);
  if (!full.startsWith(PUBLIC_DIR)) return json(res, 400, { error: 'bad path' });
  try {
    const body = await readFile(full);
    res.writeHead(200, {
      'content-type': MIME[path.extname(full)] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Introuvable');
  }
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });

function onlineCount() {
  return new Set([...clients].map((ws) => ws.playerId).filter(Boolean)).size;
}
function broadcastOnline() {
  broadcast({ t: 'online', n: onlineCount() });
}

function cleanName(raw) {
  const name = String(raw || '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, 16);
  return name || `Bâtisseur-${Math.floor(Math.random() * 9000 + 1000)}`;
}

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.isAlive = true;
  ws.msgWindow = { start: Date.now(), count: 0 };
  ws.on('pong', () => (ws.isAlive = true));

  ws.send(JSON.stringify({ t: 'init', state: game.snapshot() }));

  ws.on('message', (raw) => {
    // Limite simple : 30 messages / seconde par connexion
    const now = Date.now();
    if (now - ws.msgWindow.start > 1000) ws.msgWindow = { start: now, count: 0 };
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (++ws.msgWindow.count > 30) {
      if (msg.t === 'place') ws.send(JSON.stringify({ t: 'placed', ok: false, error: 'Doucement ! Trop de clics.', tokens: ws.playerId ? game.tokensInfo(ws.playerId) : undefined }));
      return;
    }

    if (msg.t === 'hello') {
      const id = String(msg.id || '');
      if (!/^[a-zA-Z0-9-]{8,40}$/.test(id)) return;
      ws.playerId = id;
      ws.playerName = cleanName(msg.name);
      game.touchPlayer(id, ws.playerName);
      ws.send(JSON.stringify({ t: 'welcome', name: ws.playerName, tokens: game.tokensInfo(id) }));
      broadcastOnline();
      return;
    }

    if (msg.t === 'place') {
      if (!ws.playerId) return ws.send(JSON.stringify({ t: 'error', error: 'Choisissez un pseudo pour jouer.' }));
      const result = game.place(ws.playerId, ws.playerName, msg.x, msg.y, msg.c);
      const reply = { t: 'placed', ok: result.ok, tokens: game.tokensInfo(ws.playerId) };
      if (!result.ok) reply.error = result.error;
      ws.send(JSON.stringify(reply));
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    broadcastOnline();
  });
});

// Détection des connexions mortes
const heartbeat = setInterval(() => {
  for (const ws of clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🧱 Brique à Brique en écoute sur http://localhost:${PORT} (stockage : ${store.kind})`);
});

async function shutdown() {
  clearInterval(heartbeat);
  clearTimeout(saveTimer);
  try {
    await store.save(game.state);
    await store.save(scores.data, SCORES_KEY);
  } catch {}
  await store.close();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Tests du Plan de montage : niveaux solubles, vérification serveur des parties, classement.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { solve, SHAPES } from '../src/puzzle.js';

const PORT = 8124;
const srv = spawn(process.execPath, ['server.js'], { env: { ...process.env, PORT: String(PORT), REDIS_URL: '' }, stdio: 'inherit' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = (p, body) => fetch(`http://localhost:${PORT}${p}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);

// Transforme une solution en suite de poses, de bas en haut (gravité respectée).
function toOps(level, sol) {
  const used = new Set();
  return sol
    .slice()
    .sort((a, b) => b.y + SHAPES[b.shape].h - (a.y + SHAPES[a.shape].h))
    .map((s) => {
      const p = level.pieces.findIndex((q, i) => !used.has(i) && q.color === s.color && q.shape === s.shape);
      used.add(p);
      return { p, x: s.x, y: s.y };
    });
}

try {
  await sleep(1500);
  const { levels } = await (await api('/api/plan/levels')).json();
  assert.equal(levels.length, 10);
  for (const L of levels) {
    const r = solve(L, L.pieces, { cap: 1, maxNodes: 2e6 });
    assert.ok(r.count >= 1, `niveau ${L.id} sans solution`);
  }
  console.log('✔ les 10 niveaux ont une solution');

  const { level: daily } = await (await api('/api/plan/daily')).json();
  assert.ok(solve(daily, daily.pieces, { cap: 1 }).count >= 1);
  console.log('✔ défi du jour soluble :', daily.name);

  const L = levels[2];
  const ops = toOps(L, solve(L, L.pieces, { cap: 1 }).first);
  let res = await api('/api/plan/scores', { level: L.id, playerId: 'test-player-0001', name: 'Testeur', ops, timeMs: 42000, hints: 0 });
  let d = await res.json();
  assert.equal(res.status, 200, d.error);
  assert.equal(d.rank, 1);
  console.log('✔ partie valide acceptée, rang', d.rank);

  // pose dans le vide refusée
  const bad = [ops[ops.length - 1], ...ops.slice(0, -1)];
  res = await api('/api/plan/scores', { level: L.id, playerId: 'test-player-0002', name: 'Tricheur', ops: bad, timeMs: 1000 });
  assert.equal(res.status, 400);
  // partie incomplète refusée
  res = await api('/api/plan/scores', { level: L.id, playerId: 'test-player-0002', name: 'Tricheur', ops: ops.slice(0, 3), timeMs: 1000 });
  assert.equal(res.status, 400);
  console.log('✔ parties truquées refusées');

  // retrait puis repose : toujours valide, plus de coups
  const withUndo = [ops[0], { r: ops[0].p }, ...ops];
  res = await api('/api/plan/scores', { level: L.id, playerId: 'test-player-0003', name: 'Hésitant', ops: withUndo, timeMs: 50000 });
  d = await res.json();
  assert.equal(res.status, 200, d.error);
  assert.equal(d.top[1].moves, ops.length + 2);
  console.log('✔ retraits rejoués, classement :', d.top.map((e) => `${e.name} ${e.timeMs / 1000}s`).join(', '));
  srv.kill();
  process.exit(0);
} catch (err) {
  console.error('✘', err);
  srv.kill();
  process.exit(1);
}

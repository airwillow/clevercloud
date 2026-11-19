// Test de bout en bout : lance le serveur, fait construire la notice par des bots.
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import assert from 'node:assert/strict';

const PORT = 8123;
const srv = spawn(process.execPath, ['server.js'], {
  env: { ...process.env, PORT: String(PORT), BRICK_REGEN_MS: '5', BRICK_MAX: '1000', NEXT_PLATE_DELAY_MS: '300', REDIS_URL: '', ADMIN_KEY: 'k' },
  stdio: 'inherit',
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function bot(name) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    const b = { ws, inbox: [], state: null, waiters: [] };
    ws.on('message', (raw) => {
      const m = JSON.parse(raw);
      if (m.t === 'init') b.state = m.state;
      if (m.t === 'brick') { b.state.grid[m.y * b.state.w + m.x] = m.c; b.state.progress = m.progress; }
      b.inbox.push(m);
      b.waiters = b.waiters.filter((w) => !(w.pred(m) && (w.res(m), true)));
    });
    b.next = (pred) => new Promise((res) => b.waiters.push({ pred, res }));
    b.place = async (x, y, c) => { await sleep(40); ws.send(JSON.stringify({ t: 'place', x, y, c })); return b.next((m) => m.t === 'placed'); };
    ws.on('open', () => { ws.send(JSON.stringify({ t: 'hello', id: `bot-${name}-12345678`, name })); b.next((m) => m.t === 'welcome').then(() => resolve(b)); });
  });
}

try {
  await sleep(500);
  const a = await bot('Alice');
  const b = await bot('Bob');
  const S = a.state;
  const bp = S.blueprint;

  // Gravité : impossible de poser en l'air
  let r = await a.place(0, 0, 3);
  assert.equal(r.ok, false, 'gravité non respectée');
  // Sol : OK
  r = await a.place(0, S.h - 1, 3);
  assert.equal(r.ok, true, r.error);

  // Construction de la notice, de bas en haut, en alternant les bots
  let n = 0;
  const done = a.next((m) => m.t === 'complete');
  for (let by = bp.h - 1; by >= 0; by--) {
    for (let bx = 0; bx < bp.w; bx++) {
      const who = n++ % 2 ? a : b;
      const c = bp.data[by * bp.w + bx];
      if (by === bp.h - 1 && bx === 0) {
        // une erreur puis correction
        assert.equal((await who.place(bp.x0, bp.y0 + by, c === 1 ? 2 : 1)).ok, true);
      }
      r = await who.place(bp.x0 + bx, bp.y0 + by, c);
      assert.equal(r.ok, true, `pose (${bx},${by}) : ${r.error}`);
    }
  }
  // Verrou : une brique conforme ne peut plus être remplacée
  const entry = await done;
  assert.equal(entry.entry.name, bp.name);
  console.log('✔ modèle terminé :', entry.entry.name, entry.entry.top);

  const next = await a.next((m) => m.t === 'init');
  assert.equal(next.state.plate, 2);
  assert.notEqual(next.state.blueprint.name, bp.name);
  assert.equal(next.state.gallery.length, 1);
  console.log('✔ nouvelle plaque :', next.state.blueprint.name);

  // Verrou sur la nouvelle plaque
  const nb = next.state.blueprint;
  const c0 = nb.data[(nb.h - 1) * nb.w];
  assert.equal((await a.place(nb.x0, nb.y0 + nb.h - 1, c0)).ok, true);
  r = await b.place(nb.x0, nb.y0 + nb.h - 1, c0 === 1 ? 2 : 1);
  assert.equal(r.ok, false, 'verrou non respecté');
  console.log('✔ gravité, verrou, points, galerie : OK');

  const lb = next.state.leaderboard;
  assert.ok(lb.length >= 2 && lb[0].points > 0);
  console.log('✔ classement :', lb.map((p) => `${p.name}=${p.points}`).join(', '));
  a.ws.close(); b.ws.close();
  srv.kill();
  process.exit(0);
} catch (err) {
  console.error('✘', err);
  srv.kill();
  process.exit(1);
}

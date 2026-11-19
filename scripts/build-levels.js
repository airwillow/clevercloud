// Génère src/levels.json : pour chaque modèle, un stock de briques avec solution vérifiée.
// Usage : node scripts/build-levels.js
import { writeFileSync } from 'node:fs';
import { PALETTE } from '../src/blueprints.js';
import { LEVELS } from '../src/levels-data.js';
import { parseTarget, generate, solve } from '../src/puzzle.js';

const KEY = Object.fromEntries(PALETTE.map((p, i) => (p ? [p.key, i] : null)).filter(Boolean));
const out = [];
for (const [n, L] of LEVELS.entries()) {
  const level = parseTarget(L.rows, KEY);
  const t0 = Date.now();
  const g = generate(level, { seed: `${L.id}-v1`, tries: L.difficulty === 'easy' ? 120 : 400, blocks: L.blocks || 0, difficulty: L.difficulty });
  const check = solve(level, g.pieces, { cap: 1000, maxNodes: 2e6 });
  const shapes = g.pieces.reduce((m, p) => ((m[p.shape] = (m[p.shape] || 0) + 1), m), {});
  console.log(`${String(n + 1).padStart(2)} ${L.name.padEnd(14)} ${level.w}x${level.h} pièces=${String(g.pieces.length).padStart(2)} solutions=${check.complete ? check.count : '≥' + check.count} hasard=${(g.rate * 100).toFixed(0)}% formes=${JSON.stringify(shapes)} (${Date.now() - t0} ms)`);
  out.push({ id: L.id, n: n + 1, name: L.name, tip: L.tip || null, difficulty: L.difficulty, w: level.w, h: level.h, target: level.target, pieces: g.pieces, solutions: check.complete ? check.count : null, randomRate: g.rate });
}
writeFileSync(new URL('../src/levels.json', import.meta.url), JSON.stringify(out));
console.log('→ src/levels.json écrit');

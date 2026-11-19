// Plan de montage : règles, solveur et générateur de puzzles.
// Module « isomorphe » : utilisé par le serveur ET par le navigateur.

// Formes (vue de face) : largeur × hauteur.
export const SHAPES = {
  1: { w: 1, h: 1, name: '1×1' },
  2: { w: 2, h: 1, name: '1×2' },
  3: { w: 3, h: 1, name: '1×3' },
  4: { w: 4, h: 1, name: '1×4' },
  B: { w: 2, h: 2, name: 'Haute 2×2' },
};

export function cellsOf(shape, x, y) {
  const s = SHAPES[shape];
  const out = [];
  for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) out.push([x + dx, y + dy]);
  return out;
}

// Une brique « tient » si au moins une case de sa rangée du bas est posée sur le sol
// ou sur une case occupée juste en dessous (occupied(x, y) -> bool).
export function isSupported(shape, x, y, H, occupied) {
  const s = SHAPES[shape];
  const by = y + s.h - 1;
  for (let dx = 0; dx < s.w; dx++) {
    if (by === H - 1 || occupied(x + dx, by + 1)) return true;
  }
  return false;
}

// Vérifie une pose pendant la partie.
// level: { w, h, target }  board: tableau (0 = vide, sinon id de pièce + 1)
export function checkPlacement(level, board, piece, x, y) {
  const { w, h, target } = level;
  const s = SHAPES[piece.shape];
  if (x < 0 || y < 0 || x + s.w > w || y + s.h > h) return 'bounds';
  for (const [cx, cy] of cellsOf(piece.shape, x, y)) {
    const t = target[cy * w + cx];
    if (!t) return 'outside';
    if (t !== piece.color) return 'color';
    if (board[cy * w + cx]) return 'occupied';
  }
  if (!isSupported(piece.shape, x, y, h, (cx, cy) => board[cy * w + cx] !== 0)) return 'gravity';
  return 'ok';
}

// Après retrait d'une brique, toutes les autres doivent encore tenir.
export function canRemove(level, board, placed, pieceId) {
  const { w, h } = level;
  const b2 = board.slice();
  const p = placed.get(pieceId);
  if (!p) return false;
  for (const [cx, cy] of cellsOf(p.shape, p.x, p.y)) b2[cy * w + cx] = 0;
  for (const [id, q] of placed) {
    if (id === pieceId) continue;
    if (!isSupported(q.shape, q.x, q.y, h, (cx, cy) => b2[cy * w + cx] !== 0)) return false;
  }
  return true;
}

export const REASONS = {
  bounds: 'La brique dépasse du plan.',
  outside: 'Hors du modèle : cette case doit rester vide.',
  color: 'Mauvaise couleur pour cet endroit de la notice.',
  occupied: 'Il y a déjà une brique ici.',
  gravity: 'Gravité ! Au moins un tenon doit reposer sur le sol ou sur une brique.',
  supports: 'Impossible : cette brique en soutient d\'autres.',
};

// ---------- Solveur ----------
// Une position est « légale » si elle couvre des cases du modèle de la même couleur
// et qu'au moins une case du bas repose sur le sol ou sur une case du modèle.
// (Le support ne dépend que du modèle final : on peut toujours construire de bas en haut.)
function legalAt(level, shape, color, x, y) {
  const { w, h, target } = level;
  const s = SHAPES[shape];
  if (x < 0 || y < 0 || x + s.w > w || y + s.h > h) return false;
  for (const [cx, cy] of cellsOf(shape, x, y)) if (target[cy * w + cx] !== color) return false;
  return isSupported(shape, x, y, h, (cx, cy) => target[cy * w + cx] !== 0);
}

export function inventoryCounts(pieces) {
  const counts = new Map();
  for (const p of pieces) {
    const k = `${p.color}:${p.shape}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return counts;
}

// Compte les solutions (jusqu'à `cap`), avec des cases déjà couvertes en option.
// Retourne { count, first, complete } — first = liste de {shape, color, x, y}.
export function solve(level, pieces, { cap = 2, covered = null, maxNodes = 400000 } = {}) {
  const { w, h, target } = level;
  const cov = covered ? covered.slice() : new Array(w * h).fill(false);
  const counts = inventoryCounts(pieces);
  const order = [];
  for (let i = 0; i < w * h; i++) if (target[i]) order.push(i);
  const shapesFor = Object.keys(SHAPES);
  let count = 0, nodes = 0, first = null, aborted = false;
  const stack = [];

  function rec(k) {
    if (aborted) return;
    if (++nodes > maxNodes) { aborted = true; return; }
    while (k < order.length && cov[order[k]]) k++;
    if (k === order.length) {
      count++;
      if (!first) first = stack.slice();
      if (count >= cap) aborted = true;
      return;
    }
    const i = order[k], x = i % w, y = Math.floor(i / w), color = target[i];
    for (const shape of shapesFor) {
      const key = `${color}:${shape}`;
      if (!counts.get(key)) continue;
      if (!legalAt(level, shape, color, x, y)) continue;
      const cells = cellsOf(shape, x, y);
      if (cells.some(([cx, cy]) => cov[cy * w + cx])) continue;
      for (const [cx, cy] of cells) cov[cy * w + cx] = true;
      counts.set(key, counts.get(key) - 1);
      stack.push({ shape, color, x, y });
      rec(k + 1);
      stack.pop();
      counts.set(key, counts.get(key) + 1);
      for (const [cx, cy] of cells) cov[cy * w + cx] = false;
      if (aborted) return;
    }
  }
  rec(0);
  return { count, first, complete: !aborted || count >= cap };
}

// ---------- Générateur ----------
export function rng(seed) {
  let a = typeof seed === 'number' ? seed : [...String(seed)].reduce((s, c) => (Math.imul(s, 31) + c.charCodeAt(0)) | 0, 7);
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function parseTarget(rows, keyToIndex) {
  const h = rows.length, w = rows[0].length;
  const target = [];
  rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`ligne ${y} : longueur ${row.length} au lieu de ${w}`);
    for (const ch of row) {
      if (ch === '.') target.push(0);
      else if (keyToIndex[ch]) target.push(keyToIndex[ch]);
      else throw new Error(`couleur inconnue « ${ch} »`);
    }
  });
  return { w, h, target };
}

// Découpe aléatoire du modèle en briques légales.
function randomTiling(level, rand, { blocks = 0, weights = { 1: 1, 2: 3, 3: 3, 4: 3 } }) {
  const { w, h, target } = level;
  const cov = new Array(w * h).fill(false);
  const out = [];
  if (blocks > 0) {
    const cells = [];
    for (let i = 0; i < w * h; i++) if (target[i]) cells.push(i);
    for (let k = cells.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [cells[k], cells[j]] = [cells[j], cells[k]]; }
    for (const i of cells) {
      if (rand() > blocks) continue;
      const x = i % w, y = Math.floor(i / w), color = target[i];
      if (!legalAt(level, 'B', color, x, y)) continue;
      const cs = cellsOf('B', x, y);
      if (cs.some(([cx, cy]) => cov[cy * w + cx])) continue;
      cs.forEach(([cx, cy]) => (cov[cy * w + cx] = true));
      out.push({ shape: 'B', color, x, y });
    }
  }
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const i = y * w + x;
      if (!target[i] || cov[i]) { x++; continue; }
      const color = target[i];
      let len = 0;
      while (x + len < w && target[y * w + x + len] === color && !cov[y * w + x + len]) len++;
      // découpe de la séquence [x, x+len)
      let ok = false;
      for (let attempt = 0; attempt < 30 && !ok; attempt++) {
        const segs = [];
        let pos = 0;
        while (pos < len) {
          const opts = [1, 2, 3, 4].filter((n) => n <= len - pos);
          const total = opts.reduce((s, n) => s + weights[n], 0);
          let r = rand() * total, n = opts[0];
          for (const o of opts) { r -= weights[o]; if (r <= 0) { n = o; break; } }
          segs.push([x + pos, n]);
          pos += n;
        }
        if (segs.every(([sx, n]) => legalAt(level, String(n), color, sx, y))) {
          segs.forEach(([sx, n]) => out.push({ shape: String(n), color, x: sx, y }));
          ok = true;
        }
      }
      if (!ok) return null;
      for (let k = 0; k < len; k++) cov[y * w + x + k] = true;
      x += len;
    }
  }
  return out;
}

// Simule un joueur qui pose des briques au hasard (en respectant les règles) :
// renvoie la proportion de parties terminées. Bas = beaucoup de pièges = difficile.
export function randomSuccessRate(level, pieces, runs, rand) {
  const { w, h, target } = level;
  const shapes = Object.keys(SHAPES);
  let wins = 0;
  for (let r = 0; r < runs; r++) {
    const board = new Array(w * h).fill(0);
    const counts = inventoryCounts(pieces);
    let left = pieces.length;
    while (left > 0) {
      const moves = [];
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = target[y * w + x];
        if (!c || board[y * w + x]) continue;
        for (const shape of shapes) {
          if (!counts.get(`${c}:${shape}`)) continue;
          if (checkPlacement(level, board, { shape, color: c }, x, y) === 'ok') moves.push([shape, c, x, y]);
        }
      }
      if (!moves.length) break;
      const [shape, c, x, y] = moves[Math.floor(rand() * moves.length)];
      for (const [cx, cy] of cellsOf(shape, x, y)) board[cy * w + cx] = 1;
      counts.set(`${c}:${shape}`, counts.get(`${c}:${shape}`) - 1);
      left--;
    }
    if (left === 0) wins++;
  }
  return wins / runs;
}

const WEIGHTS = {
  easy: { 1: 0.6, 2: 3, 3: 3, 4: 2 },
  medium: { 1: 0.4, 2: 3, 3: 3, 4: 3 },
  hard: { 1: 0.3, 2: 2, 3: 3, 4: 4 },
};
const TARGET_RATE = { easy: 0.5, medium: 0.15, hard: 0 };

// Cherche un stock de briques qui rend le puzzle intéressant.
// On garde les meilleurs découpages (peu de solutions, peu de 1×1),
// puis on choisit celui dont le « taux de réussite au hasard » colle à la difficulté visée.
export function generate(level, { seed = 1, tries = 250, blocks = 0, difficulty = 'medium', weights, keep = 12, runs = 150 } = {}) {
  const rand = rng(seed);
  const cands = [];
  const seen = new Set();
  for (let t = 0; t < tries; t++) {
    const tiling = randomTiling(level, rand, { blocks, weights: weights || WEIGHTS[difficulty] });
    if (!tiling) continue;
    const pieces = tiling.map(({ shape, color }) => ({ shape, color }));
    const sig = [...inventoryCounts(pieces)].sort().join('|');
    if (seen.has(sig)) continue;
    seen.add(sig);
    const res = solve(level, pieces, { cap: 50, maxNodes: 120000 });
    if (!res.count) continue;
    const sols = res.complete ? res.count : 50;
    const singles = pieces.filter((p) => p.shape === '1').length;
    cands.push({ pieces, solution: tiling, solutions: sols, pre: sols + singles * 2 });
  }
  if (!cands.length) throw new Error('Aucun découpage valide trouvé');
  cands.sort((a, b) => a.pre - b.pre);
  const short = cands.slice(0, keep);
  for (const c of short) c.rate = randomSuccessRate(level, c.pieces, runs, rand);
  const goal = TARGET_RATE[difficulty] ?? 0.15;
  short.sort((a, b) => Math.abs(a.rate - goal) - Math.abs(b.rate - goal) || a.pre - b.pre);
  const best = short[0];
  best.pieces.sort((a, b) => a.color - b.color || String(a.shape).localeCompare(String(b.shape)));
  return best;
}

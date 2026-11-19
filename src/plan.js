// Plan de montage côté serveur : niveaux, défi du jour, classements vérifiés.
import { readFileSync } from 'node:fs';
import { PALETTE } from './blueprints.js';
import { LEVELS } from './levels-data.js';
import { parseTarget, generate, checkPlacement, canRemove, SHAPES } from './puzzle.js';

const CAMPAIGN = JSON.parse(readFileSync(new URL('./levels.json', import.meta.url)));
const KEY = Object.fromEntries(PALETTE.map((p, i) => (p ? [p.key, i] : null)).filter(Boolean));
const MAX_SCORES = 20;
const publicLevel = ({ id, n, name, tip, difficulty, w, h, target, pieces }) => ({ id, n, name, tip, difficulty, w, h, target, pieces });

export const palette = PALETTE.map((p, i) => (p ? { index: i, name: p.name, hex: p.hex } : null));

export function campaign() {
  return CAMPAIGN.map(publicLevel);
}

// Date du jour à Paris (AAAA-MM-JJ)
export function today() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris' }).format(new Date());
}

const dailyCache = new Map();
export function daily(date = today()) {
  if (dailyCache.has(date)) return dailyCache.get(date);
  // Choix du modèle selon la date, stock de briques généré en mode difficile
  const days = Math.floor(Date.parse(`${date}T12:00:00Z`) / 86400000);
  const pool = LEVELS.filter((l) => l.difficulty !== 'easy');
  const model = pool[days % pool.length];
  const level = parseTarget(model.rows, KEY);
  const g = generate(level, { seed: `daily-${date}`, tries: 250, blocks: model.blocks ?? 0.25, difficulty: 'hard' });
  const result = {
    id: `daily-${date}`, n: null, name: `${model.name} du ${date.split('-').reverse().join('/')}`,
    tip: 'Le même puzzle pour tout le monde aujourd\'hui. Le plus rapide gagne !', difficulty: 'daily',
    w: level.w, h: level.h, target: level.target, pieces: g.pieces,
  };
  dailyCache.clear();
  dailyCache.set(date, result);
  return result;
}

export function findLevel(id) {
  if (id.startsWith('daily-')) return id === `daily-${today()}` ? daily() : null;
  return CAMPAIGN.find((l) => l.id === id) || null;
}

// Rejoue la partie envoyée par le client et vérifie qu'elle reconstruit bien le modèle.
// ops : [{ p: indexPièce, x, y }] (pose) ou [{ r: indexPièce }] (retrait)
export function verify(level, ops) {
  if (!Array.isArray(ops) || ops.length > 2000) return { ok: false, error: 'Partie invalide.' };
  const board = new Array(level.w * level.h).fill(0);
  const placed = new Map();
  for (const op of ops) {
    if (op && Number.isInteger(op.p) && level.pieces[op.p] && !placed.has(op.p)) {
      const piece = level.pieces[op.p];
      if (checkPlacement(level, board, piece, op.x, op.y) !== 'ok') return { ok: false, error: 'Pose impossible rejouée.' };
      placed.set(op.p, { ...piece, x: op.x, y: op.y });
      const s = SHAPES[piece.shape];
      for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) board[(op.y + dy) * level.w + op.x + dx] = op.p + 1;
    } else if (op && Number.isInteger(op.r) && placed.has(op.r)) {
      if (!canRemove(level, board, placed, op.r)) return { ok: false, error: 'Retrait impossible rejoué.' };
      const q = placed.get(op.r);
      const s = SHAPES[q.shape];
      for (let dy = 0; dy < s.h; dy++) for (let dx = 0; dx < s.w; dx++) board[(q.y + dy) * level.w + q.x + dx] = 0;
      placed.delete(op.r);
    } else return { ok: false, error: 'Coup invalide.' };
  }
  if (placed.size !== level.pieces.length) return { ok: false, error: 'Modèle incomplet.' };
  return { ok: true, moves: ops.length };
}

export class Scores {
  constructor(saved) {
    this.data = saved && typeof saved === 'object' ? saved : {};
  }
  top(levelId, n = 10) {
    return (this.data[levelId] || []).slice(0, n).map(({ name, timeMs, moves, hints }) => ({ name, timeMs, moves, hints }));
  }
  submit(levelId, entry) {
    const list = (this.data[levelId] || []).filter((e) => e.id !== entry.id || better(e, entry));
    if (!list.some((e) => e.id === entry.id)) list.push(entry);
    list.sort(compare);
    this.data[levelId] = list.slice(0, MAX_SCORES);
    // ménage des anciens défis du jour (on garde 14 jours)
    const dailies = Object.keys(this.data).filter((k) => k.startsWith('daily-')).sort();
    for (const k of dailies.slice(0, Math.max(0, dailies.length - 14))) delete this.data[k];
    const rank = this.data[levelId].findIndex((e) => e.id === entry.id);
    return rank >= 0 ? rank + 1 : null;
  }
}

// classement : moins d'indices, puis temps, puis nombre de coups
function compare(a, b) {
  return a.hints - b.hints || a.timeMs - b.timeMs || a.moves - b.moves;
}
function better(existing, incoming) {
  return compare(existing, incoming) <= 0;
}

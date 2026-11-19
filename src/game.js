// Logique du jeu « Brique à Brique » : mur, notice de montage, gravité, points.
import { BLUEPRINTS, PALETTE } from './blueprints.js';

export const W = 48;
export const H = 28;
const COLORS = PALETTE.length - 1; // 1..15
const BRICK_MAX = Number(process.env.BRICK_MAX || 10); // briques en réserve max
const BRICK_REGEN_MS = Number(process.env.BRICK_REGEN_MS || 1000); // 1 brique / seconde
const NEXT_PLATE_DELAY_MS = Number(process.env.NEXT_PLATE_DELAY_MS || 10000);
const GALLERY_SIZE = 12;

function emptyGrid() {
  return new Array(W * H).fill(0);
}

function blueprintPlacement(bp) {
  return { x0: Math.floor((W - bp.w) / 2), y0: H - bp.h };
}

export class Game {
  constructor({ onBroadcast, onChange }) {
    this.broadcast = onBroadcast;
    this.onChange = onChange;
    this.buckets = new Map(); // id -> { tokens, last }
    this.state = this.freshState(0, 1);
    this.nextPlateTimer = null;
  }

  freshState(bpIndex, plate, keep = {}) {
    return {
      version: 1,
      plate,
      bpIndex: bpIndex % BLUEPRINTS.length,
      grid: emptyGrid(),
      owners: new Array(W * H).fill(null),
      startedAt: Date.now(),
      plateScores: {},
      completedAt: null,
      players: keep.players || {},
      gallery: keep.gallery || [],
    };
  }

  load(saved) {
    if (!saved || saved.version !== 1 || saved.grid?.length !== W * H) return;
    this.state = { ...this.freshState(saved.bpIndex || 0, saved.plate || 1), ...saved };
    if (this.state.completedAt) this.scheduleNextPlate();
  }

  get blueprint() {
    return BLUEPRINTS[this.state.bpIndex];
  }

  // Couleur attendue par la notice à la case (x, y), ou 0 si hors notice.
  expectedAt(x, y) {
    const bp = this.blueprint;
    const { x0, y0 } = blueprintPlacement(bp);
    const bx = x - x0;
    const by = y - y0;
    if (bx < 0 || by < 0 || bx >= bp.w || by >= bp.h) return 0;
    return bp.data[by * bp.w + bx];
  }

  progress() {
    const bp = this.blueprint;
    const { x0, y0 } = blueprintPlacement(bp);
    let done = 0;
    for (let by = 0; by < bp.h; by++) {
      for (let bx = 0; bx < bp.w; bx++) {
        if (this.state.grid[(y0 + by) * W + (x0 + bx)] === bp.data[by * bp.w + bx]) done++;
      }
    }
    return { done, total: bp.w * bp.h };
  }

  bucket(id) {
    const now = Date.now();
    let b = this.buckets.get(id);
    if (!b) {
      b = { tokens: BRICK_MAX, last: now };
      this.buckets.set(id, b);
    }
    const regen = Math.floor((now - b.last) / BRICK_REGEN_MS);
    if (regen > 0) {
      b.tokens = Math.min(BRICK_MAX, b.tokens + regen);
      b.last = b.tokens === BRICK_MAX ? now : b.last + regen * BRICK_REGEN_MS;
    }
    return b;
  }

  tokensInfo(id) {
    const b = this.bucket(id);
    return { tokens: b.tokens, max: BRICK_MAX, regenMs: BRICK_REGEN_MS, nextIn: b.tokens >= BRICK_MAX ? 0 : BRICK_REGEN_MS - (Date.now() - b.last) };
  }

  touchPlayer(id, name) {
    const p = this.state.players[id] || { name, points: 0, bricks: 0 };
    p.name = name;
    this.state.players[id] = p;
    return p;
  }

  leaderboard(limit = 10) {
    return Object.values(this.state.players)
      .filter((p) => p.points > 0 || p.bricks > 0)
      .sort((a, b) => b.points - a.points || b.bricks - a.bricks)
      .slice(0, limit)
      .map(({ name, points, bricks }) => ({ name, points, bricks }));
  }

  snapshot() {
    const bp = this.blueprint;
    return {
      w: W,
      h: H,
      plate: this.state.plate,
      grid: this.state.grid,
      owners: this.state.owners,
      palette: PALETTE.slice(1).map((p, i) => ({ index: i + 1, name: p.name, hex: p.hex })),
      blueprint: { name: bp.name, ...blueprintPlacement(bp), w: bp.w, h: bp.h, data: bp.data },
      progress: this.progress(),
      leaderboard: this.leaderboard(),
      gallery: this.state.gallery,
      completedAt: this.state.completedAt,
      nextPlateAt: this.state.completedAt ? this.state.completedAt + NEXT_PLATE_DELAY_MS : null,
      upcoming: BLUEPRINTS[(this.state.bpIndex + 1) % BLUEPRINTS.length].name,
    };
  }

  // Tente de poser une brique. Retourne { ok, error?, tokens }.
  place(id, name, x, y, c) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(c)) return { ok: false, error: 'Coup invalide.' };
    if (x < 0 || y < 0 || x >= W || y >= H || c < 1 || c > COLORS) return { ok: false, error: 'Hors du mur.' };
    if (this.state.completedAt) return { ok: false, error: 'Modèle terminé ! Nouvelle plaque dans un instant…' };

    const i = y * W + x;
    const grid = this.state.grid;
    const current = grid[i];
    if (current === c) return { ok: false, error: 'Cette brique est déjà là.' };

    // Gravité : une brique doit reposer sur le sol ou sur une autre brique.
    if (current === 0 && y < H - 1 && grid[i + W] === 0) {
      return { ok: false, error: 'Gravité ! Une brique doit reposer sur le sol ou sur une autre brique.' };
    }

    // Les briques correctes de la notice sont verrouillées (anti-vandalisme).
    const expected = this.expectedAt(x, y);
    if (expected && current === expected) return { ok: false, error: 'Brique conforme à la notice : elle est verrouillée 🔒' };

    const bucket = this.bucket(id);
    if (bucket.tokens <= 0) return { ok: false, error: 'Plus de briques en réserve, patience…' };
    bucket.tokens -= 1;

    grid[i] = c;
    this.state.owners[i] = name;
    const player = this.touchPlayer(id, name);
    player.bricks += 1;
    let gained = 0;
    if (expected && c === expected) {
      gained = 1;
      player.points += 1;
      this.state.plateScores[id] = (this.state.plateScores[id] || 0) + 1;
    }

    const progress = this.progress();
    this.broadcast({ t: 'brick', x, y, c, by: name, good: gained > 0, progress });
    if (gained) this.broadcast({ t: 'leaderboard', leaderboard: this.leaderboard() });

    if (progress.done === progress.total) this.complete();
    this.onChange();
    return { ok: true, gained };
  }

  complete() {
    const s = this.state;
    s.completedAt = Date.now();
    const top = Object.entries(s.plateScores)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([pid, points]) => ({ name: s.players[pid]?.name || '?', points }));
    const entry = {
      plate: s.plate,
      name: this.blueprint.name,
      completedAt: s.completedAt,
      durationMs: s.completedAt - s.startedAt,
      builders: Object.keys(s.plateScores).length,
      top,
      grid: s.grid.map((v) => v.toString(16)).join(''),
    };
    s.gallery = [entry, ...s.gallery].slice(0, GALLERY_SIZE);
    this.broadcast({ t: 'complete', entry, nextPlateAt: s.completedAt + NEXT_PLATE_DELAY_MS, gallery: s.gallery });
    this.scheduleNextPlate();
  }

  scheduleNextPlate() {
    clearTimeout(this.nextPlateTimer);
    const wait = Math.max(0, this.state.completedAt + NEXT_PLATE_DELAY_MS - Date.now());
    this.nextPlateTimer = setTimeout(() => this.nextPlate(), wait);
  }

  nextPlate() {
    clearTimeout(this.nextPlateTimer);
    const s = this.state;
    this.state = this.freshState(s.bpIndex + 1, s.plate + 1, { players: s.players, gallery: s.gallery });
    this.broadcast({ t: 'init', state: this.snapshot() });
    this.onChange();
  }

  // Outil de démo : remplit la notice correctement sauf `left` briques.
  almost(left = 5) {
    const bp = this.blueprint;
    const { x0, y0 } = blueprintPlacement(bp);
    const cells = [];
    for (let by = 0; by < bp.h; by++) for (let bx = 0; bx < bp.w; bx++) cells.push([bx, by]);
    // On laisse vides les cases du haut (pour respecter la gravité).
    const keepEmpty = new Set(cells.slice(0, Math.max(0, left)).map(([bx, by]) => `${bx},${by}`));
    for (const [bx, by] of cells) {
      const i = (y0 + by) * W + (x0 + bx);
      if (keepEmpty.has(`${bx},${by}`)) {
        this.state.grid[i] = 0;
        this.state.owners[i] = null;
      } else {
        this.state.grid[i] = bp.data[by * bp.w + bx];
        this.state.owners[i] = this.state.owners[i] || 'Robot de démo';
      }
    }
    this.broadcast({ t: 'init', state: this.snapshot() });
    const { done, total } = this.progress();
    if (done === total && !this.state.completedAt) this.complete();
    this.onChange();
  }
}

import { MARBLES, type MarblesConfig } from './config';

const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
import { PLAYERS, type PlayerId } from '../../core/types';

export interface Marble {
  id: number;
  owner: PlayerId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
}

export interface Peg {
  x: number;
  y: number;
}

export interface World {
  marbles: Marble[];
  /** Bumper pegs (none at the start). */
  pegs?: Peg[];
}

export interface Shot {
  dirX: number;
  dirY: number;
  speed: number;
  /** 0..1 */
  power: number;
}

export interface StepResult {
  /** Marbles that left the arena during this step. */
  out: Marble[];
  /** Strongest marble-marble impact speed (px/s) this step, 0 if none. */
  impact: number;
}

/** The knobs the physics reads. Same shape as MARBLES, but the per-level ones (arenaRadius, damping) are plain numbers. */
export type Cfg = { -readonly [K in keyof MarblesConfig]: MarblesConfig[K] extends number ? number : MarblesConfig[K] };

/** The difficulty level for a leader's score. */
export const levelFor = (leaderScore: number, cfg: Cfg = MARBLES): number => clampN(Math.floor(leaderScore / cfg.pointsPerLevel), 0, cfg.levels.length - 1);

/** The physics knobs for a level: the base config with that level's arena size and friction. */
export function cfgForLevel(level: number, cfg: Cfg = MARBLES): Cfg {
  const row = cfg.levels[clampN(Math.floor(level), 0, cfg.levels.length - 1)];
  return { ...cfg, arenaRadius: row.arenaRadius, damping: row.damping };
}

/**
 * Peg positions for a level: `levels[level].pegs` bumpers in the middle band, spread apart and never touching a starting
 * spot. `rand` returns [0,1).
 */
export function placePegs(level: number, rand: () => number = Math.random, cfg: Cfg = MARBLES): Peg[] {
  const n = cfg.levels[clampN(Math.floor(level), 0, cfg.levels.length - 1)].pegs;
  const radius = cfgForLevel(level, cfg).arenaRadius;
  const out: Peg[] = [];
  for (let tries = 0; out.length < n && tries < 200; tries++) {
    const side = rand() < 0.5 ? -1 : 1;
    const peg = { x: cfg.centerX + side * (cfg.pegMinX + rand() * (cfg.pegMaxX - cfg.pegMinX)), y: cfg.centerY + (rand() * 2 - 1) * (radius - 190) };
    if (Math.hypot(peg.x - cfg.centerX, peg.y - cfg.centerY) > radius - 130) continue;
    if (out.every((o) => Math.hypot(o.x - peg.x, o.y - peg.y) > 170)) out.push(peg);
  }
  return out;
}

/** Fresh board: each player's marbles in a column on their own side (player 0 left, player 1 right). */
export function createWorld(cfg: Cfg = MARBLES, pegs: Peg[] = []): World {
  const marbles: Marble[] = [];
  let id = 0;
  for (const owner of PLAYERS) {
    for (let i = 0; i < cfg.perPlayer; i++) {
      const x = cfg.centerX + (owner === 0 ? -1 : 1) * cfg.startOffsetX;
      const y = cfg.centerY + (i - (cfg.perPlayer - 1) / 2) * cfg.startSpacing;
      marbles.push({ id: id++, owner, x, y, vx: 0, vy: 0, alive: true });
    }
  }
  return { marbles, pegs };
}

export const aliveOf = (w: World, p: PlayerId): Marble[] => w.marbles.filter((m) => m.alive && m.owner === p);
export const aliveCount = (w: World, p: PlayerId): number => aliveOf(w, p).length;
/** The board is refilled when either side has run out of marbles. */
export const needsRefill = (w: World): boolean => aliveCount(w, 0) === 0 || aliveCount(w, 1) === 0;

export const speedOf = (m: Marble): number => Math.hypot(m.vx, m.vy);
export const isSettled = (w: World): boolean => w.marbles.every((m) => !m.alive || (m.vx === 0 && m.vy === 0));

/** Forces every marble to rest (shot timeout). */
export function freeze(w: World): void {
  for (const m of w.marbles) {
    m.vx = 0;
    m.vy = 0;
  }
}

/** The player's marble nearest the touch point (any distance: the touch already belongs to their half). */
export function pickMarble(w: World, p: PlayerId, x: number, y: number): Marble | null {
  let best: Marble | null = null;
  let bd = Infinity;
  for (const m of aliveOf(w, p)) {
    const d = Math.hypot(m.x - x, m.y - y);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}

/** Slingshot: `pull` = anchor - finger (the way you drag back). Returns null if the pull is too short. */
export function aimFromPull(pull: { x: number; y: number }, cfg: Cfg = MARBLES, maxPower = 1): Shot | null {
  const len = Math.hypot(pull.x, pull.y);
  if (len < cfg.minPull) return null;
  const power = Math.min(maxPower, (len - cfg.minPull) / (cfg.maxPull - cfg.minPull));
  return { dirX: pull.x / len, dirY: pull.y / len, speed: cfg.minShotSpeed + power * (cfg.maxShotSpeed - cfg.minShotSpeed), power };
}

export function shoot(m: Marble, s: Shot, cfg: Cfg = MARBLES): void {
  const v = Math.min(s.speed, cfg.maxSpeed);
  m.vx = s.dirX * v;
  m.vy = s.dirY * v;
}

/** How far a marble launched at `speed` rolls before resting (exponential friction). */
export const travelDistance = (speed: number, cfg: Cfg = MARBLES): number => Math.max(0, (speed - cfg.stopSpeed) / cfg.damping);

const outside = (m: Marble, cfg: Cfg): boolean => Math.hypot(m.x - cfg.centerX, m.y - cfg.centerY) > cfg.arenaRadius;

/** Advance the world by dt seconds (sub-stepped so fast marbles cannot tunnel). */
export function stepWorld(w: World, dt: number, cfg: Cfg = MARBLES): StepResult {
  const res: StepResult = { out: [], impact: 0 };
  let fastest = 0;
  for (const m of w.marbles) if (m.alive) fastest = Math.max(fastest, speedOf(m));
  const n = Math.max(1, Math.ceil((fastest * dt) / (cfg.marbleRadius * 0.25)));
  const h = dt / n;
  const decay = Math.exp(-cfg.damping * h);
  const r2 = 2 * cfg.marbleRadius;
  for (let s = 0; s < n; s++) {
    for (const m of w.marbles) {
      if (!m.alive) continue;
      m.x += m.vx * h;
      m.y += m.vy * h;
      m.vx *= decay;
      m.vy *= decay;
      const sp = Math.hypot(m.vx, m.vy);
      if (sp < cfg.stopSpeed) {
        m.vx = 0;
        m.vy = 0;
      } else if (sp > cfg.maxSpeed) {
        m.vx *= cfg.maxSpeed / sp;
        m.vy *= cfg.maxSpeed / sp;
      }
    }
    const ms = w.marbles;
    for (let i = 0; i < ms.length; i++) {
      const a = ms[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < ms.length; j++) {
        const b = ms[j];
        if (!b.alive) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= r2) continue;
        if (d < 1e-6) {
          dx = 1;
          dy = 0;
          d = 1e-6;
        }
        const nx = dx / d;
        const ny = dy / d;
        const push = (r2 - d) / 2; // un-overlap, equal masses
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny; // closing speed
        if (vn > 0) {
          const j2 = ((1 + cfg.restitution) / 2) * vn;
          a.vx -= j2 * nx;
          a.vy -= j2 * ny;
          b.vx += j2 * nx;
          b.vy += j2 * ny;
          res.impact = Math.max(res.impact, vn);
        }
      }
    }
    if (w.pegs) {
      const pr = cfg.marbleRadius + cfg.pegRadius;
      for (const peg of w.pegs) {
        for (const m of ms) {
          if (!m.alive) continue;
          const dx = m.x - peg.x;
          const dy = m.y - peg.y;
          const d = Math.hypot(dx, dy);
          if (d >= pr) continue;
          const nx = d > 1e-6 ? dx / d : 1;
          const ny = d > 1e-6 ? dy / d : 0;
          m.x = peg.x + nx * pr;
          m.y = peg.y + ny * pr;
          const vn = m.vx * nx + m.vy * ny;
          if (vn < 0) {
            m.vx -= (1 + cfg.pegRestitution) * vn * nx;
            m.vy -= (1 + cfg.pegRestitution) * vn * ny;
            res.impact = Math.max(res.impact, -vn);
          }
        }
      }
    }
    for (const m of ms) {
      if (m.alive && outside(m, cfg)) {
        m.alive = false;
        res.out.push(m);
      }
    }
  }
  return res;
}

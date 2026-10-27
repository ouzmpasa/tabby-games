import { CURLING, type CurlingConfig } from './config';
import { other, PLAYERS, type PlayerId } from '../../core/types';

export interface Stone {
  id: number;
  owner: PlayerId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
  /** Sideways turn of the velocity, -1..1 (sign = side, fixed per throw). 0 for stones that were not thrown. */
  curl?: number;
  /** Launch speed, the reference for how much the stone has slowed (curl grows with it). */
  curlRef?: number;
  /** Current sweep effort 0..1 applied to this stone (set by the view each tick; reduces friction and curl). */
  sweep?: number;
}

export interface World {
  stones: Stone[];
  nextId: number;
}

export interface Shot {
  dirX: number;
  dirY: number;
  speed: number;
  /** 0..1 */
  power: number;
}

export interface StepResult {
  /** Stones that left the sheet during this step. */
  out: Stone[];
  /** Strongest stone-stone impact speed (px/s) this step, 0 if none. */
  impact: number;
}

type Cfg = CurlingConfig;

export const createWorld = (): World => ({ stones: [], nextId: 0 });

/** Where a player's next stone waits: their end of the sheet, on the centre line. */
export const launchSpot = (p: PlayerId, cfg: Cfg = CURLING): { x: number; y: number } => ({
  x: cfg.centerX + (p === 0 ? -1 : 1) * cfg.launchOffsetX,
  y: cfg.centerY,
});

export function addStone(w: World, owner: PlayerId, x: number, y: number): Stone {
  const s: Stone = { id: w.nextId++, owner, x, y, vx: 0, vy: 0, alive: true };
  w.stones.push(s);
  return s;
}

export const aliveStones = (w: World): Stone[] => w.stones.filter((s) => s.alive);
export const speedOf = (s: Stone): number => Math.hypot(s.vx, s.vy);
export const isSettled = (w: World): boolean => w.stones.every((s) => !s.alive || (s.vx === 0 && s.vy === 0));

/** Forces every stone to rest (slide timeout). */
export function freeze(w: World): void {
  for (const s of w.stones) {
    s.vx = 0;
    s.vy = 0;
  }
}

/**
 * Slingshot: `pull` = anchor - finger (the way you drag back). Returns null if the pull is too short.
 * The direction is kept within maxAimAngle of the line towards the house, so a sloppy pull never throws backwards.
 */
export function aimFromPull(pull: { x: number; y: number }, p: PlayerId, cfg: Cfg = CURLING): Shot | null {
  const len = Math.hypot(pull.x, pull.y);
  if (len < cfg.minPull) return null;
  const fwd = p === 0 ? 0 : Math.PI; // angle pointing at the house
  let a = Math.atan2(pull.y, pull.x) - fwd;
  a = Math.atan2(Math.sin(a), Math.cos(a)); // wrap to -PI..PI
  a = Math.max(-cfg.maxAimAngle, Math.min(cfg.maxAimAngle, a));
  const power = Math.min(1, (len - cfg.minPull) / (cfg.maxPull - cfg.minPull));
  return { dirX: Math.cos(a + fwd), dirY: Math.sin(a + fwd), speed: cfg.minShotSpeed + power * (cfg.maxShotSpeed - cfg.minShotSpeed), power };
}

export function throwStone(s: Stone, shot: Shot, cfg: Cfg = CURLING, curl = 0): void {
  const v = Math.min(shot.speed, cfg.maxSpeed);
  s.vx = shot.dirX * v;
  s.vy = shot.dirY * v;
  s.curl = curl;
  s.curlRef = v;
}

/** Small seedable RNG (mulberry32) returning 0..1, so tests and replays are deterministic. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The curl of one throw: random side, random magnitude curlMinFrac..1. Fixed for the whole throw. */
export function rollCurl(rng: () => number, cfg: Cfg = CURLING): number {
  const mag = cfg.curlMinFrac + (1 - cfg.curlMinFrac) * rng();
  return rng() < 0.5 ? -mag : mag;
}

/** Sweep effort 0..1 for a stroke rate (strokes/s): smoothstep from sweepMinRate to sweepFullRate, flat above. */
export function sweepEffort(rate: number, cfg: Cfg = CURLING): number {
  const t = Math.max(0, Math.min(1, (rate - cfg.sweepMinRate) / (cfg.sweepFullRate - cfg.sweepMinRate)));
  return t * t * (3 - 2 * t);
}

/** Factor on the damping for a sweep level 0..1 (1 = no sweeping, sweepDamping at full effort). Always in (0, 1]. */
export const frictionFactor = (level: number, cfg: Cfg = CURLING): number => 1 - Math.max(0, Math.min(1, level)) * (1 - cfg.sweepDamping);

/**
 * Turns finger movement into a sweep level. Feed it `move(x, y)` for the sweeping finger and `update(dtMs)` every tick.
 * A stroke is a direction reversal after at least sweepMinStroke px of travel.
 */
export class SweepMeter {
  /** Smoothed effort 0..1 (what is applied and shown). */
  level = 0;
  /** Strokes per second over the recent window. */
  rate = 0;
  private clock = 0;
  private strokes: number[] = [];
  private peak: { x: number; y: number } | null = null;
  private dir: { x: number; y: number } | null = null;

  constructor(private cfg: Cfg = CURLING) {}

  reset(): void {
    this.level = 0;
    this.rate = 0;
    this.clock = 0;
    this.strokes = [];
    this.peak = null;
    this.dir = null;
  }

  /** Finger touched down / lifted: start a fresh stroke (no stroke is counted for the jump). */
  begin(x: number, y: number): void {
    this.peak = { x, y };
    this.dir = null;
  }
  end(): void {
    this.peak = null;
    this.dir = null;
  }

  move(x: number, y: number): void {
    if (!this.peak) return this.begin(x, y);
    const minD = this.cfg.sweepMinStroke;
    const dx = x - this.peak.x;
    const dy = y - this.peak.y;
    if (!this.dir) {
      const d = Math.hypot(dx, dy);
      if (d >= minD) {
        this.dir = { x: dx / d, y: dy / d };
        this.peak = { x, y };
        this.strokes.push(this.clock); // the first stroke
      }
      return;
    }
    const along = dx * this.dir.x + dy * this.dir.y;
    if (along > 0) this.peak = { x, y };
    else if (-along >= minD) {
      const d = Math.hypot(dx, dy);
      this.dir = { x: dx / d, y: dy / d };
      this.peak = { x, y };
      this.strokes.push(this.clock);
    }
  }

  update(dtMs: number): void {
    this.clock += dtMs;
    const win = this.cfg.sweepWindowMs;
    while (this.strokes.length && this.clock - this.strokes[0] > win) this.strokes.shift();
    this.rate = this.strokes.length / (win / 1000);
    const target = sweepEffort(this.rate, this.cfg);
    const dt = dtMs / 1000;
    if (target > this.level) this.level = Math.min(target, this.level + this.cfg.sweepRise * dt);
    else this.level = Math.max(target, this.level - this.cfg.sweepFall * dt);
  }
}

/** How far a stone launched at `speed` slides before resting (exponential friction). */
export const travelDistance = (speed: number, cfg: Cfg = CURLING): number => Math.max(0, (speed - cfg.stopSpeed) / cfg.damping);

const outside = (s: Stone, cfg: Cfg): boolean => {
  const sh = cfg.sheet;
  return s.x < sh.left || s.x > sh.right || s.y < sh.top || s.y > sh.bottom;
};

/** Advance the world by dt seconds (sub-stepped so fast stones cannot tunnel). */
export function stepWorld(w: World, dt: number, cfg: Cfg = CURLING): StepResult {
  const res: StepResult = { out: [], impact: 0 };
  let fastest = 0;
  for (const s of w.stones) if (s.alive) fastest = Math.max(fastest, speedOf(s));
  const n = Math.max(1, Math.ceil((fastest * dt) / (cfg.stoneRadius * 0.25)));
  const h = dt / n;
  const r2 = 2 * cfg.stoneRadius;
  for (let step = 0; step < n; step++) {
    for (const s of w.stones) {
      if (!s.alive) continue;
      s.x += s.vx * h;
      s.y += s.vy * h;
      const sweep = s.sweep ?? 0;
      const decay = Math.exp(-cfg.damping * frictionFactor(sweep, cfg) * h);
      s.vx *= decay;
      s.vy *= decay;
      if (s.curl && s.curlRef) {
        // curl: turn the velocity (speed unchanged); stronger the slower the stone, weaker while sweeping
        const frac = Math.max(0, Math.min(1, 1 - Math.hypot(s.vx, s.vy) / s.curlRef));
        const ang = s.curl * cfg.curlRate * frac * (1 - cfg.curlSweepCut * sweep) * h;
        const c = Math.cos(ang);
        const sn = Math.sin(ang);
        const vx = s.vx * c - s.vy * sn;
        s.vy = s.vx * sn + s.vy * c;
        s.vx = vx;
      }
      const sp = Math.hypot(s.vx, s.vy);
      if (sp < cfg.stopSpeed) {
        s.vx = 0;
        s.vy = 0;
      } else if (sp > cfg.maxSpeed) {
        s.vx *= cfg.maxSpeed / sp;
        s.vy *= cfg.maxSpeed / sp;
      }
    }
    const ss = w.stones;
    for (let i = 0; i < ss.length; i++) {
      const a = ss[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < ss.length; j++) {
        const b = ss[j];
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
    for (const s of ss) {
      if (s.alive && outside(s, cfg)) {
        s.alive = false; // keeps its velocity so the view can slide it off
        res.out.push(s);
      }
    }
  }
  return res;
}

// ---- ends and scoring --------------------------------------------------------------------------

export interface EndScore {
  /** The player who scores this end, or null for a blank end. */
  scorer: PlayerId | null;
  points: number;
  /** Ids of the scoring stones, closest to the button first. */
  scoring: number[];
}

/** Distance of a stone's centre from the button. */
export const distToButton = (s: Stone, cfg: Cfg = CURLING): number => Math.hypot(s.x - cfg.centerX, s.y - cfg.centerY);

/** A stone counts when any part of it touches the outermost ring. */
export const inHouse = (s: Stone, cfg: Cfg = CURLING): boolean => distToButton(s, cfg) - cfg.stoneRadius < cfg.rings[0];

/**
 * Real curling scoring: the owner of the stone closest to the button scores one point for each of their stones in the
 * house that is closer than the opponent's closest stone in the house (capped at maxEndPoints).
 */
export function scoreEnd(w: World, cfg: Cfg = CURLING): EndScore {
  const inside = w.stones
    .filter((s) => s.alive && inHouse(s, cfg))
    .map((s) => ({ s, d: distToButton(s, cfg) }))
    .sort((a, b) => a.d - b.d);
  const blank: EndScore = { scorer: null, points: 0, scoring: [] };
  if (inside.length === 0) return blank;
  const first = inside[0];
  const rival = inside.find((e) => e.s.owner !== first.s.owner);
  if (rival && Math.abs(rival.d - first.d) < 1e-6) return blank; // dead heat
  const limit = rival ? rival.d : Infinity;
  const mine = inside.filter((e) => e.s.owner === first.s.owner && e.d < limit).slice(0, cfg.maxEndPoints);
  return { scorer: first.s.owner, points: mine.length, scoring: mine.map((e) => e.s.id) };
}

/** Who throws the `index`-th stone (0-based) of an end. Players alternate, starting with `starter`. */
export const throwerFor = (starter: PlayerId, index: number): PlayerId => (index % 2 === 0 ? starter : other(starter));

/** Who starts the next end: the player who did NOT score; on a blank end the starter alternates. */
export function nextStarter(starter: PlayerId, scorer: PlayerId | null): PlayerId {
  return scorer === null ? other(starter) : other(scorer);
}

export const stonesPerEnd = (cfg: Cfg = CURLING): number => cfg.stonesPerEnd * PLAYERS.length;

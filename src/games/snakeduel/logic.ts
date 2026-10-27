import type { PlayerId } from '../../core/types';
import { ARENA, CENTER, SNAKE, type SnakeConfig } from './config';

type Widen<T> = { -readonly [K in keyof T]: T[K] extends number ? number : T[K] };

export interface Pt {
  x: number;
  y: number;
}

export interface Snake {
  x: number;
  y: number;
  /** Heading in radians (0 = right). */
  heading: number;
  /** Body segment centres, newest (closest to the head) first. */
  body: Pt[];
  /** Number of body segments the snake should have. */
  length: number;
  /** Fruits eaten this round. */
  eaten: number;
  /** Seconds of speed boost left (gold fruit). */
  boostT: number;
}

/** apple: grow. gold: grow + speed boost. trim: the OTHER snake gets shorter. */
export type FruitKind = 'apple' | 'gold' | 'trim';

export interface Fruit extends Pt {
  r: number;
  kind?: FruitKind;
}

/** Obstacle that lands in the arena during a round. Shown as a warning ring until `t0`, then solid. */
export interface Rock extends Pt {
  r: number;
  /** Round time (s) at which it lands. */
  t0: number;
  active: boolean;
}

export interface SnakeState {
  snakes: [Snake, Snake];
  fruits: Fruit[];
  /** Seconds of play since the round started. */
  time: number;
  rocks: Rock[];
  /** Set once a snake has crashed. */
  losers: PlayerId[];
  /** RNG state (mulberry32). */
  seed: number;
}

export type Target = Pt;
export type Targets = [Target | null, Target | null];

export type Params = Widen<
  Pick<
    SnakeConfig,
    | 'speed' | 'turnRate' | 'steerDeadzone' | 'startSegments' | 'growPerFruit' | 'maxSegments' | 'segSpacing' | 'headHit' | 'bodyHit'
    | 'fruitRadius' | 'eatRadius' | 'fruitCount' | 'spawnInvulnSec' | 'shrinkDelaySec' | 'shrinkPerSec' | 'maxInset' | 'startDx' | 'startDy'
    | 'rockRadius' | 'rockHit' | 'rockWarnSec' | 'speedRoundRamp' | 'speedRampSec' | 'boostFactor' | 'boostSec' | 'trimSegments'
  >
> & {
  /** Rocks this round (from the match progress), and the chances that a new fruit is gold / trim. */
  rockCount: number;
  goldChance: number;
  trimChance: number;
};
export const DEFAULT_PARAMS: Params = { ...SNAKE, rockCount: 0, goldChance: 0, trimChance: 0 };

export interface StepResult {
  /** Players that ate a fruit during this step. */
  ate: PlayerId[];
  /** What each of them ate (same order as `ate`). */
  kinds: FruitKind[];
  /** A rock landed during this step. */
  landed: boolean;
  /** Set when the round ended: the crashed players (both = draw). */
  losers: PlayerId[] | null;
}

/** Seedable RNG, returns a float in [0, 1). */
export function rand(s: { seed: number }): number {
  s.seed = (s.seed + 0x6d2b79f5) | 0;
  let t = Math.imul(s.seed ^ (s.seed >>> 15), 1 | s.seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const normAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

function newSnake(p: PlayerId, q: Params): Snake {
  const dir = p === 0 ? 1 : -1;
  const x = CENTER.x - dir * q.startDx;
  const y = CENTER.y + (p === 0 ? -1 : 1) * q.startDy;
  const heading = p === 0 ? 0 : Math.PI;
  const body: Pt[] = [];
  for (let i = 1; i <= q.startSegments; i++) body.push({ x: x - dir * i * q.segSpacing, y });
  return { x, y, heading, body, length: q.startSegments, eaten: 0, boostT: 0 };
}

export function createState(seed = (Math.random() * 2 ** 31) | 0, q: Params = DEFAULT_PARAMS): SnakeState {
  const s: SnakeState = { snakes: [newSnake(0, q), newSnake(1, q)], fruits: [], rocks: [], time: 0, losers: [], seed };
  planRocks(s, q);
  topUpFruits(s, q);
  return s;
}

// ---- difficulty ramp -------------------------------------------------------------------------------------------

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 0..1: how far into the match we are. Driven by the leader (match point = 1) or the total rounds, whichever is further. */
export function matchProgress(scores: readonly [number, number], target: number): number {
  const lead = Math.max(scores[0], scores[1]) / Math.max(1, target - 1);
  const total = (scores[0] + scores[1]) / Math.max(1, 2 * (target - 1));
  return clamp01(Math.max(lead, total));
}

/** Rules of a round from the match progress: faster snakes, rocks, special fruit. */
export function paramsFor(progress: number, base: Params = DEFAULT_PARAMS): Params {
  const t = clamp01(progress);
  const special = t < SNAKE.specialFruitFromProgress ? 0 : clamp01((t - SNAKE.specialFruitFromProgress) / (1 - SNAKE.specialFruitFromProgress));
  return {
    ...base,
    speed: Math.round(SNAKE.speed * (1 + SNAKE.speedMatchRamp * t)),
    rockCount: t < SNAKE.rocksFromProgress ? 0 : Math.max(1, Math.round(lerp(1, SNAKE.rocksMax, (t - SNAKE.rocksFromProgress) / (1 - SNAKE.rocksFromProgress)))),
    goldChance: lerp(0.08, SNAKE.goldChanceEnd, special) * (special > 0 ? 1 : 0),
    trimChance: lerp(0.06, SNAKE.trimChanceEnd, special) * (special > 0 ? 1 : 0),
  };
}

/** Speed multiplier from the in-round ramp (up to +speedRoundRamp after speedRampSec) and a gold boost. */
export function speedMul(sn: Snake, time: number, q: Params = DEFAULT_PARAMS): number {
  return (1 + q.speedRoundRamp * clamp01(time / q.speedRampSec)) * (sn.boostT > 0 ? q.boostFactor : 1);
}

/** Choose where and when this round's rocks land. Away from the start positions, from each other and inside the arena for good. */
export function planRocks(s: SnakeState, q: Params = DEFAULT_PARAMS): void {
  s.rocks = [];
  const a = arenaAt(150);
  const margin = 90;
  for (let i = 0; i < q.rockCount; i++) {
    for (let n = 0; n < 400; n++) {
      const x = a.x + margin + rand(s) * (a.w - 2 * margin);
      const y = a.y + margin + rand(s) * (a.h - 2 * margin);
      if (!insideArena(a, x, y, margin)) continue;
      if (s.snakes.some((sn) => Math.hypot(sn.x - x, sn.y - y) < 380)) continue;
      if (s.rocks.some((r) => Math.hypot(r.x - x, r.y - y) < 260)) continue;
      s.rocks.push({ x, y, r: q.rockRadius, t0: SNAKE.rockFirstSec + i * SNAKE.rockEverySec + rand(s) * SNAKE.rockJitterSec, active: false });
      break;
    }
  }
}

/** New round, keeping the RNG running. */
export function reset(s: SnakeState, q: Params = DEFAULT_PARAMS): void {
  Object.assign(s, createState(s.seed, q));
}

/** How far the arena has closed in (per side) after `t` seconds of play. */
export function arenaInset(t: number, q: Params = DEFAULT_PARAMS): number {
  return Math.min(q.maxInset, Math.max(0, t - q.shrinkDelaySec) * q.shrinkPerSec);
}

export interface ArenaRect {
  x: number;
  y: number;
  w: number;
  h: number;
  corner: number;
}

export function arenaAt(inset: number): ArenaRect {
  return { x: ARENA.x + inset, y: ARENA.y + inset, w: ARENA.w - 2 * inset, h: ARENA.h - 2 * inset, corner: Math.max(20, ARENA.corner - inset * 0.3) };
}

/** True when a circle of radius r centred at (x, y) lies fully inside the rounded rectangle. */
export function insideArena(a: ArenaRect, x: number, y: number, r: number): boolean {
  const hw = a.w / 2;
  const hh = a.h / 2;
  const dx = Math.abs(x - (a.x + hw)) - (hw - a.corner);
  const dy = Math.abs(y - (a.y + hh)) - (hh - a.corner);
  if (dx <= 0 || dy <= 0) return Math.abs(x - (a.x + hw)) <= hw - r && Math.abs(y - (a.y + hh)) <= hh - r;
  return Math.hypot(dx, dy) <= a.corner - r;
}

/** Turn a heading toward a target point, at most `maxTurn` radians. Ignores targets inside the dead zone. */
export function steer(heading: number, from: Pt, target: Target | null, maxTurn: number, deadzone: number): number {
  if (!target) return heading;
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  if (Math.hypot(dx, dy) < deadzone) return heading;
  const diff = normAngle(Math.atan2(dy, dx) - heading);
  return heading + Math.max(-maxTurn, Math.min(maxTurn, diff));
}

/** Move one snake by dt seconds: steer, advance the head, extend/trim the body. */
export function moveSnake(sn: Snake, dt: number, target: Target | null, q: Params = DEFAULT_PARAMS, mul = 1): void {
  // Faster snakes turn a little faster too (but not proportionally), so they stay steerable.
  sn.heading = steer(sn.heading, sn, target, q.turnRate * Math.pow(mul, 0.8) * dt, q.steerDeadzone);
  sn.x += Math.cos(sn.heading) * q.speed * mul * dt;
  sn.y += Math.sin(sn.heading) * q.speed * mul * dt;
  // A new segment appears once the head is a full spacing away from the newest one.
  let last: Pt = sn.body[0] ?? sn;
  while (Math.hypot(sn.x - last.x, sn.y - last.y) >= q.segSpacing) {
    const d = Math.hypot(sn.x - last.x, sn.y - last.y);
    last = { x: last.x + ((sn.x - last.x) / d) * q.segSpacing, y: last.y + ((sn.y - last.y) / d) * q.segSpacing };
    sn.body.unshift(last);
  }
  if (sn.body.length > sn.length) sn.body.length = sn.length;
}

/** Whether the head of `a` touches any body segment of `b`. */
export function headHitsBody(a: Pt, b: Snake, q: Params = DEFAULT_PARAMS): boolean {
  const lim = q.headHit + q.bodyHit;
  return b.body.some((p) => Math.hypot(a.x - p.x, a.y - p.y) < lim);
}

const farFromEverything = (s: SnakeState, x: number, y: number): boolean =>
  s.snakes.every((sn) => Math.hypot(sn.x - x, sn.y - y) > 140 && sn.body.every((p) => Math.hypot(p.x - x, p.y - y) > 70)) &&
  s.fruits.every((f) => Math.hypot(f.x - x, f.y - y) > 200) &&
  s.rocks.every((r) => Math.hypot(r.x - x, r.y - y) > r.r + 110);

/** Spawn fruits at random free spots inside the current arena until there are `fruitCount`. */
export function topUpFruits(s: SnakeState, q: Params = DEFAULT_PARAMS): void {
  const a = arenaAt(arenaInset(s.time, q));
  const margin = 90;
  for (let n = 0; s.fruits.length < q.fruitCount && n < 200; n++) {
    const x = a.x + margin + rand(s) * (a.w - 2 * margin);
    const y = a.y + margin + rand(s) * (a.h - 2 * margin);
    if (insideArena(a, x, y, margin) && farFromEverything(s, x, y)) {
      const roll = rand(s);
      const kind: FruitKind = roll < q.goldChance ? 'gold' : roll < q.goldChance + q.trimChance ? 'trim' : 'apple';
      s.fruits.push({ x, y, r: q.fruitRadius, kind });
    }
  }
}

/**
 * Advance the simulation by dt ms. Snakes only collide once `spawnInvulnSec` has passed (they blink until then).
 * Own body is harmless; walls (the closing arena) and the other snake's body end the round; heads touching = both lose.
 */
export function step(s: SnakeState, dtMs: number, targets: Targets, q: Params = DEFAULT_PARAMS): StepResult {
  const res: StepResult = { ate: [], kinds: [], landed: false, losers: null };
  if (s.losers.length) return res;
  let left = Math.min(dtMs, 100) / 1000;
  while (left > 1e-6 && !res.losers) {
    const dt = Math.min(left, 0.016);
    left -= dt;
    s.time += dt;
    s.snakes.forEach((sn, i) => {
      moveSnake(sn, dt, targets[i], q, speedMul(sn, s.time, q));
      sn.boostT = Math.max(0, sn.boostT - dt);
    });
    // Rocks land (never on top of a snake: if one is close the rock waits a moment).
    for (const rk of s.rocks) {
      if (rk.active || s.time < rk.t0) continue;
      const busy = s.snakes.some((sn) => Math.hypot(sn.x - rk.x, sn.y - rk.y) < rk.r + 130 || sn.body.some((p) => Math.hypot(p.x - rk.x, p.y - rk.y) < rk.r + 60));
      if (busy) rk.t0 = s.time + 0.3;
      else {
        rk.active = true;
        res.landed = true;
      }
    }
    // Fruit.
    s.snakes.forEach((sn, i) => {
      for (let k = s.fruits.length - 1; k >= 0; k--) {
        const f = s.fruits[k];
        if (Math.hypot(sn.x - f.x, sn.y - f.y) < q.eatRadius) {
          s.fruits.splice(k, 1);
          const kind = f.kind ?? 'apple';
          const foe = s.snakes[1 - i];
          if (kind === 'trim' && foe.length > q.startSegments) {
            foe.length = Math.max(q.startSegments, foe.length - q.trimSegments);
            foe.body.length = Math.min(foe.body.length, foe.length);
          } else {
            sn.length = Math.min(q.maxSegments, sn.length + (kind === 'trim' ? 1 : q.growPerFruit));
          }
          if (kind === 'gold') sn.boostT = q.boostSec;
          sn.eaten++;
          res.ate.push(i as PlayerId);
          res.kinds.push(kind);
        }
      }
    });
    const a = arenaAt(arenaInset(s.time, q));
    s.fruits = s.fruits.filter((f) => insideArena(a, f.x, f.y, 60)); // swallowed by the closing border
    topUpFruits(s, q);
    if (s.time < q.spawnInvulnSec) continue;
    const [s0, s1] = s.snakes;
    const crashed: PlayerId[] = [];
    const hitsRock = (sn: Snake): boolean => s.rocks.some((rk) => rk.active && Math.hypot(sn.x - rk.x, sn.y - rk.y) < q.headHit + q.rockHit);
    if (Math.hypot(s0.x - s1.x, s0.y - s1.y) < 2 * q.headHit) crashed.push(0, 1);
    else {
      if (!insideArena(a, s0.x, s0.y, q.headHit) || headHitsBody(s0, s1, q) || hitsRock(s0)) crashed.push(0);
      if (!insideArena(a, s1.x, s1.y, q.headHit) || headHitsBody(s1, s0, q) || hitsRock(s1)) crashed.push(1);
    }
    if (crashed.length) {
      s.losers = crashed;
      res.losers = crashed;
    }
  }
  return res;
}

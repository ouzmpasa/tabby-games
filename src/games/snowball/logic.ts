import { H, W } from '../../core/layout';
import type { PlayerId } from '../../core/types';
import { SNOWBALL } from './config';

export interface Pt {
  x: number;
  y: number;
}

export interface LevelDef {
  kidSpeed: number;
  eventEveryMs: number;
  stopShare: number;
  splatRadius: number;
  reloadMs: number;
  warnMs: number;
  staminaRegen: number;
  coverPerSide: number;
}

export interface Params {
  levels: readonly LevelDef[];
  pointsPerLevel: number;
  catchUpGap: number;
  catchUpSplat: number;
  mercyAfterMs: number;
  mercyEveryMs: number;
  mercyStep: number;
  mercyMax: number;
  duckCost: number;
  tellMs: number;
  stopMs: number;
  coverRadius: number;
  coverLift: number;
  coverNear: number;
  coverFar: number;
  aimDots: number;
  aimDotGap: number;
  warnMs: number;
  staminaRegen: number;
  coverPerSide: number;
  eventEveryMs: number;
  stopShare: number;
  laneInset: number;
  laneMinY: number;
  laneMaxY: number;
  kidSpeed: number;
  splatRadius: number;
  reloadMs: number;
  duckMs: number;
  tapMaxMs: number;
  tapMaxMove: number;
  minPull: number;
  pullScale: number;
  minRange: number;
  maxRange: number;
  fieldMargin: number;
  flightBaseMs: number;
  flightSpeed: number;
}

export const DEFAULT_PARAMS: Params = { ...SNOWBALL, ...SNOWBALL.levels[0] };

/** The difficulty level for a leader's score. */
export const levelFor = (leaderScore: number, base: Params = DEFAULT_PARAMS): number =>
  Math.min(base.levels.length - 1, Math.max(0, Math.floor(leaderScore / base.pointsPerLevel)));

/** The rules in force at a level: the base knobs with that level's row laid over them. */
export function paramsForLevel(level: number, base: Params = DEFAULT_PARAMS): Params {
  return { ...base, ...base.levels[Math.min(base.levels.length - 1, Math.max(0, Math.floor(level)))] };
}

/** Splat radius multiplier from the safety net: 1 until mercyAfterMs of play, then growing in steps. */
export function mercy(playMs: number, base: Params = DEFAULT_PARAMS): number {
  if (playMs < base.mercyAfterMs) return 1;
  return 1 + Math.min(base.mercyMax, base.mercyStep * (1 + Math.floor((playMs - base.mercyAfterMs) / base.mercyEveryMs)));
}

/** Splat radius multiplier for a player `behind` points behind (catch-up help for a close match). */
export const catchUp = (behind: number, base: Params = DEFAULT_PARAMS): number => (behind >= base.catchUpGap ? base.catchUpSplat : 1);

export interface Kid {
  /** Screen y along the lane (x is fixed per player). */
  y: number;
  /** +1 = walking down the screen, -1 = up. */
  dir: 1 | -1;
  /** ms left crouching behind the mound (0 = standing). */
  duckLeft: number;
  /** Duck stamina, 0..1. */
  stamina: number;
  /** ms left standing still in a stop (0 = walking). */
  pause: number;
  /** ms until the next unexpected turn / stop (Infinity when the level has none). */
  nextEvent: number;
  /** ms until the next throw is allowed. */
  reload: number;
}

/** Player 0 starts at the top going down, player 1 at the bottom going up (point-symmetric = fair). */
export function createKid(p: PlayerId, P: Params = DEFAULT_PARAMS): Kid {
  return { y: p === 0 ? P.laneMinY : P.laneMaxY, dir: p === 0 ? 1 : -1, duckLeft: 0, stamina: 1, pause: 0, nextEvent: Infinity, reload: 0 };
}

export const laneX = (p: PlayerId, P: Params = DEFAULT_PARAMS): number => (p === 0 ? P.laneInset : W - P.laneInset);

export const kidPos = (p: PlayerId, k: Kid, P: Params = DEFAULT_PARAMS): Pt => ({ x: laneX(p, P), y: k.y });

/** Walk `dist` px along the lane from y in direction dir, turning around at the lane ends. */
export function walk(y: number, dir: 1 | -1, dist: number, P: Params = DEFAULT_PARAMS): { y: number; dir: 1 | -1 } {
  let yy = y;
  let d = dir;
  let left = dist;
  const span = P.laneMaxY - P.laneMinY;
  for (let guard = 0; left > 0 && guard < 1000; guard++) {
    const room = d === 1 ? P.laneMaxY - yy : yy - P.laneMinY;
    if (left <= room) {
      yy += d * left;
      left = 0;
    } else {
      yy += d * room;
      left -= room;
      d = d === 1 ? -1 : 1;
      if (span <= 0) break;
    }
  }
  return { y: yy, dir: d };
}

/** Where a kid that keeps walking (no ducking) will be after `ms`. */
export const kidYAfter = (k: Kid, ms: number, P: Params = DEFAULT_PARAMS): number => walk(k.y, k.dir, (P.kidSpeed * ms) / 1000, P).y;

/** True in the last tellMs before an unexpected turn / stop: the kid wobbles so careful players can see it coming. */
export const isTelling = (k: Kid, P: Params = DEFAULT_PARAMS): boolean => k.pause <= 0 && k.duckLeft <= 0 && k.nextEvent <= P.tellMs;

/** Time until a kid's next unexpected event: eventEveryMs * (0.6..1.4). Infinity when the level has none. */
export const rollEvent = (rand: () => number, P: Params = DEFAULT_PARAMS): number => (P.eventEveryMs > 0 ? P.eventEveryMs * (0.6 + 0.8 * rand()) : Infinity);

/**
 * Advance one kid by dt ms: timers tick, stamina refills, and it walks unless it is crouching or stopped. From the middle
 * levels on, a kid sometimes turns round or stops for a moment (after a short wobble).
 */
export function stepKid(k: Kid, dt: number, P: Params = DEFAULT_PARAMS, rand: () => number = Math.random): void {
  const wasDucking = k.duckLeft > 0;
  k.duckLeft = Math.max(0, k.duckLeft - dt);
  k.reload = Math.max(0, k.reload - dt);
  k.stamina = Math.min(1, k.stamina + (P.staminaRegen * dt) / 1000);
  if (wasDucking) return;
  if (k.pause > 0) {
    k.pause = Math.max(0, k.pause - dt);
    return;
  }
  if (P.eventEveryMs <= 0) k.nextEvent = Infinity;
  else if (k.nextEvent === Infinity) k.nextEvent = rollEvent(rand, P);
  else {
    k.nextEvent -= dt;
    if (k.nextEvent <= 0) {
      if (rand() < P.stopShare) k.pause = P.stopMs;
      else k.dir = k.dir === 1 ? -1 : 1;
      k.nextEvent = rollEvent(rand, P);
      if (k.pause > 0) return;
    }
  }
  const w = walk(k.y, k.dir, (P.kidSpeed * dt) / 1000, P);
  k.y = w.y;
  k.dir = w.dir;
}

export const isDucking = (k: Kid): boolean => k.duckLeft > 0;
export const canDuck = (k: Kid, P: Params = DEFAULT_PARAMS): boolean => k.duckLeft <= 0 && k.stamina >= P.duckCost - 1e-9;
export const canThrow = (k: Kid): boolean => k.reload <= 0 && k.duckLeft <= 0;

export function startDuck(k: Kid, P: Params = DEFAULT_PARAMS): boolean {
  if (!canDuck(k, P)) return false;
  k.duckLeft = P.duckMs;
  k.stamina = Math.max(0, k.stamina - P.duckCost);
  return true;
}

/** A quick press that hardly moved is a tap (duck); anything else is an aim gesture. */
export const isTap = (pressMs: number, maxMovePx: number, P: Params = DEFAULT_PARAMS): boolean =>
  pressMs <= P.tapMaxMs && maxMovePx <= P.tapMaxMove;

export interface Throw {
  target: Pt;
  /** Distance from the thrower to the landing spot. */
  range: number;
  /** 0..1 for the power bar. */
  power: number;
  durationMs: number;
}

/** Slingshot: `pull` = start - finger (the throw goes the way the finger was pulled FROM). Null when the pull is too short. */
export function computeThrow(origin: Pt, pull: Pt, P: Params = DEFAULT_PARAMS): Throw | null {
  const len = Math.hypot(pull.x, pull.y);
  if (len < P.minPull) return null;
  const want = Math.min(P.maxRange, Math.max(P.minRange, len * P.pullScale));
  const tx = Math.min(W - P.fieldMargin, Math.max(P.fieldMargin, origin.x + (pull.x / len) * want));
  const ty = Math.min(H - P.fieldMargin, Math.max(P.fieldMargin, origin.y + (pull.y / len) * want));
  const range = Math.hypot(tx - origin.x, ty - origin.y);
  const power = Math.min(1, Math.max(0, (range - P.minRange) / (P.maxRange - P.minRange)));
  return { target: { x: tx, y: ty }, range, power, durationMs: P.flightBaseMs + (range / P.flightSpeed) * 1000 };
}

export interface Ball {
  owner: PlayerId;
  from: Pt;
  to: Pt;
  range: number;
  elapsed: number;
  duration: number;
  /** Share (0..1) of the flight after which the ball is stopped early by cover (1 = flies the whole way). */
  stopU: number;
}

export function makeBall(owner: PlayerId, from: Pt, th: Throw, stopU = 1): Ball {
  return { owner, from: { ...from }, to: { ...th.target }, range: th.range, elapsed: 0, duration: th.durationMs, stopU };
}

/** Advance a ball; true when it has landed. */
export function stepBall(b: Ball, dt: number): boolean {
  b.elapsed = Math.min(b.duration * b.stopU, b.elapsed + dt);
  return b.elapsed >= b.duration * b.stopU;
}

/** Milliseconds until a ball lands (or is stopped). */
export const timeLeft = (b: Ball): number => Math.max(0, b.duration * b.stopU - b.elapsed);

export const ballProgress = (b: Ball): number => (b.duration > 0 ? b.elapsed / b.duration : 1);

export function ballGround(b: Ball): Pt {
  const u = ballProgress(b);
  return { x: b.from.x + (b.to.x - b.from.x) * u, y: b.from.y + (b.to.y - b.from.y) * u };
}

/** Arc height (0..1) of a throw of `range` px, `u` (0..1) of the way through its flight. Longer throws fly higher. */
export const liftAt = (u: number, range: number, P: Params = DEFAULT_PARAMS): number => Math.sin(Math.PI * u) * (0.4 + 0.6 * Math.min(1, range / P.maxRange));

/** 0 on the ground .. 1 at the top of the arc (longer throws fly higher). */
export function ballLift(b: Ball, P: Params = DEFAULT_PARAMS): number {
  return liftAt(ballProgress(b), b.range, P);
}

export interface Mound {
  x: number;
  y: number;
  r: number;
}

/**
 * Where a ball is stopped by cover: the first share `u` of the flight at which it is still low (under coverLift) and
 * passes through a mound. Null when it flies clear. Balls thrown far fly high and clear cover near the ends.
 */
export function coverStop(from: Pt, to: Pt, range: number, cover: readonly Mound[], P: Params = DEFAULT_PARAMS): number | null {
  if (cover.length === 0) return null;
  for (let i = 1; i <= 100; i++) {
    const u = i / 100;
    if (liftAt(u, range, P) >= P.coverLift) continue; // flying high: clears cover
    const x = from.x + (to.x - from.x) * u;
    const y = from.y + (to.y - from.y) * u;
    for (const m of cover) if (Math.hypot(x - m.x, y - m.y) <= m.r) return u;
  }
  return null;
}

/** Random cover mounds for one side: `count` mounds in front of a lane, spaced apart. `rand` returns [0,1). */
export function placeCover(p: PlayerId, count: number, rand: () => number = Math.random, P: Params = DEFAULT_PARAMS): Mound[] {
  const out: Mound[] = [];
  const fwd = p === 0 ? 1 : -1;
  for (let tries = 0; out.length < count && tries < 60; tries++) {
    const m: Mound = {
      x: laneX(p, P) + fwd * (P.coverNear + rand() * (P.coverFar - P.coverNear)),
      y: P.laneMinY + rand() * (P.laneMaxY - P.laneMinY),
      r: P.coverRadius * (0.85 + 0.3 * rand()),
    };
    if (out.every((o) => Math.hypot(o.x - m.x, o.y - m.y) > o.r + m.r + 60)) out.push(m);
  }
  return out;
}

/** Dots for the direction cue: fixed count and spacing from the thrower along the throw (never the distance). */
export function cueDots(from: Pt, to: Pt, count: number, gap: number): Pt[] {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  if (len < 1e-6) return [];
  return Array.from({ length: count }, (_, i) => ({ x: from.x + ((to.x - from.x) / len) * gap * (i + 1.5), y: from.y + ((to.y - from.y) / len) * gap * (i + 1.5) }));
}

export type Landing = 'hit' | 'blocked' | 'mound' | 'miss';

/**
 * What a landing snowball does. `victim` = the opponent's position at the moment of landing.
 * A ducking victim is 'blocked' (no point), a snowball on a mound makes a puff.
 */
export function resolveLanding(
  target: Pt,
  victim: Pt,
  victimDucking: boolean,
  mounds: ReadonlyArray<{ x: number; y: number; r: number }> = SNOWBALL.mounds,
  P: Params = DEFAULT_PARAMS,
  splatScale = 1,
): Landing {
  if (Math.hypot(target.x - victim.x, target.y - victim.y) <= P.splatRadius * splatScale) return victimDucking ? 'blocked' : 'hit';
  if (mounds.some((m) => Math.hypot(target.x - m.x, target.y - m.y) <= m.r)) return 'mound';
  return 'miss';
}

/** Dots along a straight line, `gap` px apart (not including the start point). */
export function dotsAlong(a: Pt, b: Pt, gap: number): Pt[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const out: Pt[] = [];
  for (let d = gap; d < len - gap * 0.4; d += gap) out.push({ x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len });
  return out;
}

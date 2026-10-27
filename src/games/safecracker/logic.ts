import { roundRules, SAFECRACKER as C, type RoundRules } from './config';

/** Pure Safe Cracker rules: angle maths, hot/cold, seedable RNG, lock state machine. No Phaser. Angles are degrees, clockwise on screen. */

export type Dir = 1 | -1; // 1 = clockwise, -1 = counter-clockwise

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wraps to [0, 360). */
export const normDeg = (a: number): number => ((a % 360) + 360) % 360;

/** Signed shortest difference a - b, wrapped to (-180, 180]. */
export function angDiff(a: number, b: number): number {
  const d = normDeg(a - b);
  return d > 180 ? d - 360 : d;
}

export interface Params {
  locks: number;
  tolerancesDeg: readonly number[];
  holdMs: number;
  /** One value for every lock, or one per lock (the last repeats). */
  heatFalloffDeg: number | readonly number[];
  minTravelDeg: number;
  maxTravelDeg: number;
  dirHysteresisDeg: number;
  /** Number of locks (never the first) that hide a decoy. */
  decoys: number;
  /** Dial lag in ms; 0 = follows the finger exactly. */
  inertiaMs: number;
  /** Time limit per lock (ms), 0 = none. */
  lockTimeMs: number;
  randomDirs: boolean;
}

export const DEFAULT_PARAMS: Params = {
  locks: 3,
  tolerancesDeg: [9, 7, 5],
  holdMs: 500,
  heatFalloffDeg: 110,
  minTravelDeg: 110,
  maxTravelDeg: 250,
  dirHysteresisDeg: 14,
  decoys: 0,
  inertiaMs: 0,
  lockTimeMs: 0,
  randomDirs: false,
};

/** Params for a 0-based round number (rounds beyond the table repeat the last row). */
export function paramsForRound(round: number): Params {
  const r: RoundRules = roundRules(round);
  return {
    locks: r.locks,
    tolerancesDeg: r.tolerancesDeg,
    holdMs: r.holdMs,
    heatFalloffDeg: r.heatFalloffDegs,
    minTravelDeg: r.travelDeg[0],
    maxTravelDeg: r.travelDeg[1],
    dirHysteresisDeg: C.dirHysteresisDeg,
    decoys: r.decoys,
    inertiaMs: r.inertiaMs,
    lockTimeMs: r.lockTimeMs,
    randomDirs: r.randomDirs,
  };
}

/** Heat falloff distance (degrees) for lock `index`. */
export function falloffAt(p: Params, index: number): number {
  const f = p.heatFalloffDeg;
  return typeof f === 'number' ? f : f[Math.min(index, f.length - 1)];
}

export interface Plan {
  /** Where the dial starts. */
  start: number;
  /** Secret angle per lock (wrapped to [0, 360)). */
  secrets: number[];
  /** Direction the dial must be travelling when it reaches each secret. */
  dirs: Dir[];
  tols: number[];
  /** Travel (degrees) from the previous secret (or the start) to each secret; same for both safes of a round. */
  travels?: number[];
  /** Where on that travel a decoy sits (fraction 0..1), or null for no decoy. Same for both safes. */
  decoyFracs?: (number | null)[];
  /** Decoy angle per lock, or null. Derived from decoyFracs. */
  decoys?: (number | null)[];
}

/** Lock directions: alternate starting clockwise, or random (clockwise first, never 3 equal in a row, at least one flip). */
export function makeDirs(rng: () => number, locks: number, randomDirs: boolean): Dir[] {
  if (!randomDirs) return Array.from({ length: locks }, (_, i): Dir => (i % 2 === 0 ? 1 : -1));
  const dirs: Dir[] = [1];
  while (dirs.length < locks) {
    const n = dirs.length;
    let d: Dir = rng() < 0.5 ? 1 : -1;
    if (n >= 2 && dirs[n - 1] === dirs[n - 2] && d === dirs[n - 1]) d = (d === 1 ? -1 : 1) as Dir;
    dirs.push(d);
  }
  if (locks > 1 && !dirs.some((d) => d === -1)) dirs[1] = -1;
  return dirs;
}

/** Lays out secrets and decoys from lock `from` on. The first lock laid out starts from `anchor` (default: the previous secret / start). */
function layOut(plan: Plan, from: number, anchor?: number): void {
  const travels = plan.travels!;
  const fracs = plan.decoyFracs!;
  for (let i = from; i < plan.secrets.length; i++) {
    const prev = i === from && anchor !== undefined ? anchor : i === 0 ? plan.start : plan.secrets[i - 1];
    plan.secrets[i] = normDeg(prev + plan.dirs[i] * travels[i]);
    const f = fracs[i];
    plan.decoys![i] = f === null ? null : normDeg(prev + plan.dirs[i] * travels[i] * f);
  }
}

/**
 * Plans for both safes of one round. Both get the SAME travel distances, directions and decoy places (so the race is fair) but a
 * different starting angle, hence different secret angles.
 */
export function makePlans(rng: () => number, p: Params = DEFAULT_PARAMS): [Plan, Plan] {
  const dirs = makeDirs(rng, p.locks, p.randomDirs);
  const travels = dirs.map(() => p.minTravelDeg + rng() * (p.maxTravelDeg - p.minTravelDeg));
  // decoys sit on locks 2..n (the first lock stays honest), chosen at random
  const candidates = Array.from({ length: Math.max(0, p.locks - 1) }, (_, i) => i + 1);
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  const decoyLocks = new Set(candidates.slice(0, Math.min(p.decoys, candidates.length)));
  const decoyFracs = dirs.map((_, i) => (decoyLocks.has(i) ? C.decoyFracMin + rng() * (C.decoyFracMax - C.decoyFracMin) : null));
  const starts = [rng() * 360, 0];
  starts[1] = normDeg(starts[0] + 60 + rng() * 240); // clearly different from the other safe
  const build = (start: number): Plan => {
    const plan: Plan = {
      start: normDeg(start),
      secrets: dirs.map(() => 0),
      dirs: [...dirs],
      tols: dirs.map((_, i) => p.tolerancesDeg[Math.min(i, p.tolerancesDeg.length - 1)]),
      travels: [...travels],
      decoyFracs: [...decoyFracs],
      decoys: dirs.map(() => null),
    };
    layOut(plan, 0);
    return plan;
  };
  return [build(starts[0]), build(starts[1])];
}

export interface SafeState {
  plan: Plan;
  /** Index of the lock being picked; === plan.secrets.length once open. */
  index: number;
  /** Unwrapped dial angle as drawn (degrees). Lags behind `target` when the dial has inertia. */
  angle: number;
  /** Where the finger wants the dial (same as `angle` without inertia). */
  target: number;
  /** Direction the dial last travelled (with hysteresis). */
  dir: Dir;
  dirAccum: number;
  /** Time spent inside the sweet spot (ms). */
  hold: number;
  /** Time spent on the current lock with the dial cold (ms); drives the lock time limit. */
  lockMs: number;
  /** Time spent inside the current lock's decoy spot (ms). */
  decoyHold: number;
  /** Decoys already revealed as fake (they never come back). */
  decoyDone: boolean[];
  /** Remaining time the dial is stuck after a fake click (ms). */
  jam: number;
}

export function createSafe(plan: Plan): SafeState {
  return {
    plan,
    index: 0,
    angle: plan.start,
    target: plan.start,
    dir: plan.dirs[0],
    dirAccum: 0,
    hold: 0,
    lockMs: 0,
    decoyHold: 0,
    decoyDone: plan.secrets.map(() => false),
    jam: 0,
  };
}

export const isOpen = (s: SafeState): boolean => s.index >= s.plan.secrets.length;

/** Turns the dial by `delta` degrees and updates the travel direction (flips only after a real turn the other way). */
export function turnDial(s: SafeState, delta: number, p: Params = DEFAULT_PARAMS): void {
  if (isOpen(s) || s.jam > 0) return;
  if (p.inertiaMs > 0) s.target += delta;
  else {
    s.angle += delta;
    s.target = s.angle;
  }
  const h = p.dirHysteresisDeg;
  s.dirAccum = Math.max(-h, Math.min(h, s.dirAccum + delta));
  if (s.dirAccum >= h) s.dir = 1;
  else if (s.dirAccum <= -h) s.dir = -1;
}

/** Lets a heavy dial catch up with the finger (no-op without inertia) and holds it still while jammed. */
export function stepDial(s: SafeState, dtMs: number, p: Params = DEFAULT_PARAMS): void {
  if (isOpen(s)) return;
  if (s.jam > 0) {
    s.target = s.angle;
    return;
  }
  if (p.inertiaMs <= 0) return;
  const diff = s.target - s.angle;
  if (Math.abs(diff) < 0.02) s.angle = s.target;
  else s.angle += diff * (1 - Math.exp(-dtMs / p.inertiaMs));
}

/** Signed distance from the dial to the current secret (degrees, wrapped). */
export const offBy = (s: SafeState): number => (isOpen(s) ? 0 : angDiff(s.angle, s.plan.secrets[s.index]));

/** Within the sweet spot by angle alone. */
export const nearSpot = (s: SafeState): boolean => !isOpen(s) && Math.abs(offBy(s)) <= s.plan.tols[s.index];

/** In the sweet spot, but travelling the wrong way (the arrow tells the child to turn the other way). */
export const wrongWay = (s: SafeState): boolean => nearSpot(s) && s.dir !== s.plan.dirs[s.index];

/** The lock counts only in the sweet spot while travelling the required direction. */
export const inZone = (s: SafeState): boolean => nearSpot(s) && !wrongWay(s);

/** Angle of the current lock's decoy while it is still hidden, else null. */
export function activeDecoy(s: SafeState): number | null {
  if (isOpen(s) || s.decoyDone[s.index]) return null;
  return s.plan.decoys?.[s.index] ?? null;
}

/** In the decoy's spot, travelling the required direction (this is what a fake click needs a full hold of). */
export function inDecoyZone(s: SafeState): boolean {
  const d = activeDecoy(s);
  return d !== null && Math.abs(angDiff(s.angle, d)) <= s.plan.tols[s.index] && s.dir === s.plan.dirs[s.index];
}

/** Heat the decoy gives off: like the real spot but never above this, so it never glows green. */
export const DECOY_MAX_HEAT = 0.9;

/** 0 (cold) .. 1 (in the sweet spot, right way). Wrong way inside the spot is capped just below 1. Decoys glow up to DECOY_MAX_HEAT. */
export function heat(s: SafeState, p: Params = DEFAULT_PARAMS): number {
  if (isOpen(s)) return 1;
  const tol = s.plan.tols[s.index];
  const fall = falloffAt(p, s.index);
  const d = Math.abs(offBy(s));
  let real: number;
  if (d <= tol) real = wrongWay(s) ? 0.92 : 1;
  else real = Math.max(0, Math.min(0.95, 1 - (d - tol) / fall));
  const decoy = activeDecoy(s);
  if (decoy !== null) {
    const d2 = Math.abs(angDiff(s.angle, decoy));
    const h2 = d2 <= tol ? DECOY_MAX_HEAT : Math.max(0, Math.min(DECOY_MAX_HEAT, DECOY_MAX_HEAT * (1 - (d2 - tol) / fall)));
    return Math.max(real, h2);
  }
  return real;
}

const STOPS: Array<[number, number]> = [
  [0, 0x3a6ff7], // blue
  [0.4, 0xffd84d], // yellow
  [0.8, 0xff8a3d], // orange
  [0.97, 0xff8a3d],
  [1, 0x3ddc84], // green
];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** blue -> yellow -> orange -> green. */
export function heatColor(h: number): number {
  const x = Math.max(0, Math.min(1, h));
  for (let i = 1; i < STOPS.length; i++) {
    const [x1, c1] = STOPS[i];
    if (x <= x1) {
      const [x0, c0] = STOPS[i - 1];
      const t = x1 === x0 ? 1 : (x - x0) / (x1 - x0);
      const r = Math.round(lerp((c0 >> 16) & 255, (c1 >> 16) & 255, t));
      const g = Math.round(lerp((c0 >> 8) & 255, (c1 >> 8) & 255, t));
      const b = Math.round(lerp(c0 & 255, c1 & 255, t));
      return (r << 16) | (g << 8) | b;
    }
  }
  return STOPS[STOPS.length - 1][1];
}

/** Gap between ticks in ms, or null when too cold to tick. */
export function tickIntervalMs(h: number, minHeat: number, slowMs: number, fastMs: number): number | null {
  if (h < minHeat) return null;
  const t = Math.min(1, (h - minHeat) / (1 - minHeat));
  return lerp(slowMs, fastMs, t);
}

/**
 * 'click' a lock opened, 'open' the last one did, 'fake' a decoy was held to the end (it was a fake click: the dial sticks briefly),
 * 'reset' the lock's time limit ran out (the caller re-hides that lock with rerollLock).
 */
export type TickResult = 'click' | 'open' | 'fake' | 'reset' | null;

/** Advances the hold, decoy and lock timers. */
export function tickSafe(s: SafeState, dtMs: number, p: Params = DEFAULT_PARAMS): TickResult {
  if (isOpen(s)) return null;
  if (s.jam > 0) {
    s.jam = Math.max(0, s.jam - dtMs);
    s.hold = 0;
    return null;
  }
  if (activeDecoy(s) !== null) {
    if (inDecoyZone(s)) {
      s.decoyHold += dtMs;
      if (s.decoyHold >= p.holdMs) {
        s.decoyHold = 0;
        s.decoyDone[s.index] = true;
        s.hold = 0;
        s.jam = C.jamMs;
        return 'fake';
      }
    } else s.decoyHold = 0;
  }
  // The lock time limit only runs while the dial is cold: a child who is nearly there is never reset.
  if (p.lockTimeMs > 0 && heat(s, p) < C.timerPauseHeat) {
    s.lockMs += dtMs;
    if (s.lockMs >= p.lockTimeMs) {
      s.lockMs = 0;
      s.hold = 0;
      return 'reset';
    }
  }
  if (!inZone(s)) {
    s.hold = 0;
    return null;
  }
  s.hold += dtMs;
  if (s.hold < p.holdMs) return null;
  s.hold = 0;
  s.lockMs = 0;
  s.decoyHold = 0;
  s.index++;
  return isOpen(s) ? 'open' : 'click';
}

/** Fraction (1 -> 0) of the current lock's time limit left, or null when there is no limit. */
export function lockTimeLeft(s: SafeState, p: Params): number | null {
  if (p.lockTimeMs <= 0 || isOpen(s)) return null;
  return Math.max(0, 1 - s.lockMs / p.lockTimeMs);
}

/**
 * The time limit ran out: THIS lock's spot (and decoy) are re-hidden somewhere new, measured from where the dial is now, and the
 * later locks follow on from it. Locks already open stay open.
 */
export function rerollLock(s: SafeState, rng: () => number, p: Params = DEFAULT_PARAMS): void {
  const plan = s.plan;
  if (isOpen(s) || !plan.travels || !plan.decoyFracs || !plan.decoys) return;
  plan.travels[s.index] = p.minTravelDeg + rng() * (p.maxTravelDeg - p.minTravelDeg);
  layOut(plan, s.index, normDeg(s.angle));
  s.hold = 0;
  s.lockMs = 0;
  s.decoyHold = 0;
}

export type RoundNote = 'locks' | 'narrow' | 'hint' | 'decoy' | 'heavy' | 'timer' | 'dirs';

/** What is new in `cur` compared with the previous round (round 1 announces nothing). */
export function roundNotes(prev: RoundRules | null, cur: RoundRules): RoundNote[] {
  const p = prev ?? roundRules(0);
  const out: RoundNote[] = [];
  if (cur.locks > p.locks) out.push('locks');
  if (cur.decoys > 0 && p.decoys === 0) out.push('decoy');
  if (cur.inertiaMs > 0 && p.inertiaMs === 0) out.push('heavy');
  if (cur.lockTimeMs > 0 && p.lockTimeMs === 0) out.push('timer');
  if (cur.randomDirs && !p.randomDirs) out.push('dirs');
  const sum = (a: readonly number[]) => a.reduce((x, y) => x + y, 0);
  if (sum(cur.tolerancesDeg) < sum(p.tolerancesDeg) && cur.locks === p.locks) out.push('narrow');
  if (sum(cur.heatFalloffDegs) < sum(p.heatFalloffDegs) && cur.locks === p.locks) out.push('hint');
  return out;
}

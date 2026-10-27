import { BALLOONPOP as C } from './config';

export type BalloonKind = 'normal' | 'small' | 'star' | 'chain' | 'grumpy' | 'bomb';
export type MoveKind = 'sine' | 'zigzag' | 'dart';

/** Seedable RNG returning [0,1). */
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

/** A spawn from the shared schedule. `lane` is measured from the player's own screen edge, so both sides get the same one. */
export interface SpawnEvent {
  id: number;
  at: number;
  kind: BalloonKind;
  lane: number;
  r: number;
  vy: number;
  move: MoveKind;
  /** Lateral amplitude (px) of the pattern: the body never leaves lane +- amp. */
  amp: number;
  /** sine: rad/s. zigzag: cycles/s. dart: seconds between dashes. */
  freq: number;
  /** sine: radians. zigzag: cycles (0..1). dart: any, seeds the dash targets. */
  phase: number;
  /** Extra speed fraction per second of age (0 = constant speed). */
  accel: number;
  /** Index into the colour palette (view only). */
  colour: number;
}

export interface Spawner {
  rng: () => number;
  nextAt: number;
  nextId: number;
  lastLane: number;
}

export const createSpawner = (seed = 1): Spawner => ({ rng: mulberry32(seed), nextAt: C.firstSpawnMs, nextId: 0, lastLane: -1 });

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const range = (rng: () => number, [a, b]: readonly [number, number] | readonly number[]): number => lerp(a, b, rng());

export const rampAt = (t: number): number => clamp01(t / C.rampMs);
export const gapAt = (t: number): number => lerp(C.gapStartMs, C.gapEndMs, rampAt(t));
export const speedAt = (t: number): number => lerp(C.speedStart, C.speedEnd, rampAt(t));

/** Kind odds at time t (gated kinds are 0 before their start). */
export function weightsAt(t: number): Record<BalloonKind, number> {
  const k = rampAt(t);
  const w = (key: keyof typeof C.weightsStart): number => lerp(C.weightsStart[key], C.weightsEnd[key], k);
  return {
    normal: w('normal'),
    small: w('small'),
    star: w('star'),
    chain: t >= C.chainAfterMs ? w('chain') : 0,
    grumpy: t >= C.grumpyAfterMs ? w('grumpy') : 0,
    bomb: t >= C.bombAfterMs ? w('bomb') : 0,
  };
}

export function pickKind(t: number, rng: () => number): BalloonKind {
  const w = weightsAt(t);
  const opts = Object.entries(w) as [BalloonKind, number][];
  const total = opts.reduce((s, [, x]) => s + x, 0);
  let roll = rng() * total;
  for (const [k, x] of opts) {
    if (roll < x) return k;
    roll -= x;
  }
  return 'normal';
}

export function radiusOf(kind: BalloonKind, rng: () => number, t = 0): number {
  const shrink = lerp(1, C.shrinkEnd, rampAt(t));
  switch (kind) {
    case 'small': return range(rng, C.smallRadius);
    case 'star': return C.starRadius;
    case 'chain': return C.chainRadius;
    case 'grumpy': return C.grumpyRadius;
    case 'bomb': return C.bombRadius;
    default: return range(rng, C.normalRadius) * shrink;
  }
}

export function pickMove(t: number, rng: () => number): MoveKind {
  const w = C.moveWeights;
  const opts: [MoveKind, number][] = [['sine', w.sine], ['zigzag', w.zigzag], ['dart', t >= C.dartAfterMs ? w.dart : 0]];
  const total = opts.reduce((s, [, x]) => s + x, 0);
  let roll = rng() * total;
  for (const [k, x] of opts) {
    if (roll < x) return k;
    roll -= x;
  }
  return 'sine';
}

const clampTo = (v: number, lo: number, hi: number): number => (lo >= hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

/** Half the screen width (a lane is measured inside one half). */
const HALF = 960;

/** Builds one event (RNG consumption order is fixed so a seed always gives the same schedule). */
export function buildEvent(rng: () => number, id: number, at: number, kind: BalloonKind, lastLane = -1): SpawnEvent {
  const r = radiusOf(kind, rng, at);
  const move = pickMove(at, rng);
  let amp: number;
  let freq: number;
  let phase: number;
  if (move === 'sine') {
    amp = range(rng, C.sineAmp);
    freq = range(rng, C.sineFreq);
    phase = rng() * Math.PI * 2;
  } else if (move === 'zigzag') {
    amp = range(rng, C.zigzagAmp);
    freq = 1 / range(rng, C.zigzagPeriod);
    phase = rng();
  } else {
    amp = range(rng, C.dartAmp);
    freq = range(rng, C.dartEvery);
    phase = rng() * Math.PI * 2;
  }
  // Keep the whole sweep (body + amplitude) inside this half's lanes.
  const lo = C.edgeMargin + r + amp;
  const hi = HALF - C.centreMargin - r - amp;
  let lane = lo >= hi ? (lo + hi) / 2 : lerp(lo, hi, rng());
  // Avoid putting two balloons in (nearly) the same lane in a row.
  if (lastLane >= 0 && Math.abs(lane - lastLane) < 110) lane = clampTo(lane + 130 > hi ? lane - 130 : lane + 130, lo, hi);
  const jitter = 1 + (rng() * 2 - 1) * C.speedJitter;
  const vy = speedAt(at) * jitter * (kind === 'small' ? C.smallSpeedFactor : 1);
  const k = rampAt(at);
  const accel = rng() < lerp(C.accelChance[0], C.accelChance[1], k) ? range(rng, C.accel) : 0;
  return { id, at, kind, lane, r, vy, move, amp, freq, phase, accel, colour: Math.floor(rng() * 6) };
}

/** Returns all spawn events due up to time `t` (ms since GO). Pure given the spawner's RNG. */
export function spawnUntil(sp: Spawner, t: number): SpawnEvent[] {
  const out: SpawnEvent[] = [];
  while (sp.nextAt <= t) {
    const at = sp.nextAt;
    const e = buildEvent(sp.rng, sp.nextId++, at, pickKind(at, sp.rng), sp.lastLane);
    sp.lastLane = e.lane;
    out.push(e);
    sp.nextAt = at + gapAt(at) * (0.75 + sp.rng() * 0.5);
  }
  return out;
}

/** The balloons a popped bomb drops on the opponent: normal balloons with their own movement, staggered below the screen. */
export function giftEvents(rng: () => number, t: number, firstId: number): SpawnEvent[] {
  const out: SpawnEvent[] = [];
  let last = -1;
  for (let i = 0; i < C.bombGift; i++) {
    const e = buildEvent(rng, firstId + i, t, 'normal', last);
    last = e.lane;
    out.push(e);
  }
  return out;
}

/** A balloon in play. x/y are the CURRENT centre (screen coordinates). */
export interface Balloon {
  id: number;
  kind: BalloonKind;
  r: number;
  vy: number;
  cx: number;
  move: MoveKind;
  amp: number;
  freq: number;
  phase: number;
  accel: number;
  colour: number;
  age: number;
  x: number;
  y: number;
}

/** `side` 0 = left half (lane measured from x=0), 1 = right half (mirrored). */
export function makeBalloon(e: SpawnEvent, side: 0 | 1, screenW: number): Balloon {
  const cx = side === 0 ? e.lane : screenW - e.lane;
  const b: Balloon = { id: e.id, kind: e.kind, r: e.r, vy: e.vy, cx, move: e.move, amp: e.amp, freq: e.freq, phase: e.phase, accel: e.accel, colour: e.colour, age: 0, x: cx, y: 0 };
  b.y = C.spawnY + e.r * 1.2;
  return b;
}

const smooth = (u: number): number => u * u * (3 - 2 * u);
const frac = (v: number): number => v - Math.floor(v);

/** Sideways offset (px, side 0 orientation) of a balloon of this age. Always within +- amp. */
export function lateralOffset(b: Pick<Balloon, 'move' | 'amp' | 'freq' | 'phase'>, age: number): number {
  switch (b.move) {
    case 'zigzag': {
      // Triangle wave: constant sideways speed, sharp turns.
      const f = frac(age * b.freq + b.phase);
      return b.amp * (4 * Math.abs(f - 0.5) - 1);
    }
    case 'dart': {
      // Rests, then dashes to a new spot every `freq` seconds (alternating sides, never beyond amp).
      const k = Math.floor(age / b.freq);
      const target = (n: number): number => (n < 0 ? 0 : b.amp * (((n + (b.phase < Math.PI ? 0 : 1)) % 2 === 0 ? 1 : -1) * (0.55 + 0.45 * frac(Math.sin((n + 1) * 12.9898 + b.phase * 78.233) * 43758.5453))));
      const u = Math.min(1, (age - k * b.freq) / C.dartDashS);
      return lerp(target(k - 1), target(k), smooth(u));
    }
    default:
      return b.amp * Math.sin(b.phase + b.freq * age);
  }
}

/** Moves a balloon by dt ms: rises (some speed up) and moves sideways. Mirroring the offset keeps the two halves symmetric. */
export function advance(b: Balloon, dt: number, side: 0 | 1 = 0): void {
  const mult = b.accel > 0 ? Math.min(C.accelCap, 1 + b.accel * b.age) : 1;
  b.age += dt / 1000;
  b.y -= (b.vy * mult * dt) / 1000;
  const off = lateralOffset(b, b.age);
  b.x = b.cx + (side === 0 ? off : -off);
}

export const isGone = (b: Balloon): boolean => b.y + b.r * 1.3 < 0;

export const hitRadius = (b: Balloon): number => b.r * C.hitScale + C.hitExtra;

/**
 * Which balloon does a tap at (x, y) hit? Generous radius; among candidates the one the finger is closest to
 * (distance beyond its body), ties going to the topmost (smallest y). Returns -1 for none.
 */
export function pickBalloon(list: readonly Balloon[], x: number, y: number): number {
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    const d = Math.hypot(b.x - x, b.y - y);
    if (d > hitRadius(b)) continue;
    const s = d - b.r;
    if (s < bestScore - 1e-6 || (Math.abs(s - bestScore) <= 1e-6 && best >= 0 && b.y < list[best].y)) {
      best = i;
      bestScore = s;
    }
  }
  return best;
}

export function pointsFor(kind: BalloonKind): number {
  switch (kind) {
    case 'small': return C.smallPoints;
    case 'star': return C.starPoints;
    case 'chain': return C.chainPoints;
    case 'grumpy':
    case 'bomb': return 0;
    default: return C.normalPoints;
  }
}

/** Indices of balloons (other than `centre`) a chain pop at the balloon `list[centre]` takes with it. */
export function chainVictims(list: readonly Balloon[], centre: number): number[] {
  const c = list[centre];
  const out: number[] = [];
  list.forEach((b, i) => {
    if (i !== centre && list[i].kind !== 'bomb' && Math.hypot(b.x - c.x, b.y - c.y) <= C.chainRadiusPx) out.push(i);
  });
  return out;
}

/** Freeze rule: tapping is blocked until `until` (ms on the scene clock). */
export const isFrozen = (until: number, now: number): boolean => now < until;
export const freezeEnd = (now: number): number => now + C.freezeMs;

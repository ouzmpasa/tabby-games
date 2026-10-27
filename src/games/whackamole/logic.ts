import { WHACKAMOLE as C } from './config';

export type MoleKind = 'normal' | 'golden' | 'friend' | 'boss';

export interface Mole {
  kind: MoleKind;
  spawnedAt: number;
  expiresAt: number;
  /** Hits left (bosses only; 1 for everything else). */
  hp: number;
}

/** One player's field. `holes[i]` is the mole currently up in hole i (or null). */
export interface SideState {
  holes: (Mole | null)[];
  /** Earliest time (ms) hole i may get a new mole. */
  freeAt: number[];
  nextSpawnAt: number;
  lastHole: number;
  /** Play time (ms) when the next boss is due on this side. */
  nextBossAt: number;
  /** Whacking is blocked until this time (after whacking a friendly bunny). */
  stunUntil: number;
}

export interface Difficulty {
  upMs: number;
  gapMs: number;
  maxActive: number;
  /** Chance that a spawned mole is a friendly bunny. */
  decoyChance: number;
  /** Bosses may appear. */
  bossOn: boolean;
}

export interface DifficultyParams {
  upStartMs: number;
  upEndMs: number;
  gapStartMs: number;
  gapEndMs: number;
  rampMs: number;
  maxActiveStart: number;
  moreMolesAfterMs: readonly number[];
  holeCooldownMs: number;
  goldenChance: number;
  goldenUpFactor: number;
  decoyAfterMs: number;
  decoyChanceMax: number;
  decoyRampMs: number;
  stunMs: number;
  bossAfterMs: number;
  bossEveryMs: number;
  bossUpMs: number;
  bossHp: number;
}

export const DEFAULT_PARAMS: DifficultyParams = {
  upStartMs: C.upStartMs,
  upEndMs: C.upEndMs,
  gapStartMs: C.gapStartMs,
  gapEndMs: C.gapEndMs,
  rampMs: C.rampMs,
  maxActiveStart: C.maxActiveStart,
  moreMolesAfterMs: C.moreMolesAfterMs,
  holeCooldownMs: C.holeCooldownMs,
  goldenChance: C.goldenChance,
  goldenUpFactor: C.goldenUpFactor,
  decoyAfterMs: C.decoyAfterMs,
  decoyChanceMax: C.decoyChanceMax,
  decoyRampMs: C.decoyRampMs,
  stunMs: C.stunMs,
  bossAfterMs: C.bossAfterMs,
  bossEveryMs: C.bossEveryMs,
  bossUpMs: C.bossUpMs,
  bossHp: C.bossHp,
};

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

const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** Difficulty after `elapsedMs` of play (the clock runs through the whole match): a steady ramp, then flat. */
export function difficultyAt(elapsedMs: number, p: DifficultyParams = DEFAULT_PARAMS): Difficulty {
  const k = Math.max(0, Math.min(1, elapsedMs / p.rampMs));
  const decoyK = Math.max(0, Math.min(1, (elapsedMs - p.decoyAfterMs) / p.decoyRampMs));
  return {
    upMs: lerp(p.upStartMs, p.upEndMs, k),
    gapMs: lerp(p.gapStartMs, p.gapEndMs, k),
    maxActive: p.maxActiveStart + p.moreMolesAfterMs.filter((t) => elapsedMs >= t).length,
    decoyChance: elapsedMs >= p.decoyAfterMs ? 0.05 + (p.decoyChanceMax - 0.05) * decoyK : 0,
    bossOn: elapsedMs >= p.bossAfterMs,
  };
}

export function createSide(holeCount: number, firstSpawnAt: number = C.firstSpawnMs, firstBossAt: number = C.bossAfterMs): SideState {
  return {
    holes: Array<Mole | null>(holeCount).fill(null),
    freeAt: Array<number>(holeCount).fill(0),
    nextSpawnAt: firstSpawnAt,
    lastHole: -1,
    nextBossAt: firstBossAt,
    stunUntil: 0,
  };
}

export const activeCount = (s: SideState): number => s.holes.filter((m) => m !== null).length;
const has = (s: SideState, kind: MoleKind): boolean => s.holes.some((m) => m?.kind === kind);

export interface StepResult {
  expired: number[];
  spawned: { hole: number; kind: MoleKind; upMs: number }[];
}

/**
 * Advance one side to time `now` (ms of play): retire moles whose time ran out, then spawn at most one new mole.
 * Pass the same params for both players so the game is fair.
 */
export function step(s: SideState, now: number, rng: () => number, p: DifficultyParams = DEFAULT_PARAMS): StepResult {
  const out: StepResult = { expired: [], spawned: [] };
  s.holes.forEach((m, i) => {
    if (m && now >= m.expiresAt) {
      s.holes[i] = null;
      s.freeAt[i] = now + p.holeCooldownMs;
      out.expired.push(i);
      if (m.kind === 'boss') s.nextBossAt = now + p.bossEveryMs; // a boss that got away comes back later
    }
  });
  if (now < s.nextSpawnAt) return out;
  const d = difficultyAt(now, p);
  if (activeCount(s) >= d.maxActive) {
    s.nextSpawnAt = now + 100;
    return out;
  }
  let free: number[] = [];
  s.holes.forEach((m, i) => {
    if (!m && now >= s.freeAt[i]) free.push(i);
  });
  if (free.length > 1) free = free.filter((i) => i !== s.lastHole);
  if (free.length === 0) {
    s.nextSpawnAt = now + 100;
    return out;
  }
  const hole = free[Math.min(free.length - 1, Math.floor(rng() * free.length))];
  let kind: MoleKind;
  if (d.bossOn && now >= s.nextBossAt && !has(s, 'boss')) kind = 'boss';
  else if (rng() < d.decoyChance && !has(s, 'friend')) kind = 'friend';
  else kind = rng() < p.goldenChance ? 'golden' : 'normal';
  const upMs = kind === 'boss' ? p.bossUpMs : kind === 'golden' ? d.upMs * p.goldenUpFactor : kind === 'friend' ? d.upMs * 0.9 : d.upMs;
  s.holes[hole] = { kind, spawnedAt: now, expiresAt: now + upMs, hp: kind === 'boss' ? p.bossHp : 1 };
  if (kind === 'boss') s.nextBossAt = Infinity; // set again when it leaves or is defeated
  s.lastHole = hole;
  s.nextSpawnAt = now + d.gapMs * (0.7 + 0.6 * rng());
  out.spawned.push({ hole, kind, upMs });
  return out;
}

export const pointsFor = (k: MoleKind): number => (k === 'golden' ? C.goldenPoints : k === 'boss' ? C.bossPoints : k === 'friend' ? 0 : C.normalPoints);

export type WhackResult =
  | { kind: 'none' }
  /** Blocked: still stunned from whacking a friendly bunny. */
  | { kind: 'stunned' }
  | { kind: 'score'; mole: Mole; points: number }
  /** A friendly bunny: no points, no loss, but this player is stunned for a moment. */
  | { kind: 'friend'; mole: Mole }
  /** A boss that took a hit and is still up. */
  | { kind: 'bossHit'; mole: Mole; hpLeft: number };

/** Whack hole `i`. An empty hole costs nothing. Normal / golden moles score and leave; a boss needs several hits; a friend stuns. */
export function whack(s: SideState, i: number, now: number, p: DifficultyParams = DEFAULT_PARAMS): WhackResult {
  if (now < s.stunUntil) return { kind: 'stunned' };
  const m = s.holes[i];
  if (!m) return { kind: 'none' };
  if (m.kind === 'boss' && m.hp > 1) {
    m.hp--;
    return { kind: 'bossHit', mole: m, hpLeft: m.hp };
  }
  s.holes[i] = null;
  s.freeAt[i] = now + p.holeCooldownMs;
  if (m.kind === 'boss') s.nextBossAt = now + p.bossEveryMs;
  if (m.kind === 'friend') {
    s.stunUntil = now + p.stunMs;
    return { kind: 'friend', mole: m };
  }
  return { kind: 'score', mole: m, points: pointsFor(m.kind) };
}

/** Index of the nearest hole holding a mole within `radius` of (x,y), or -1. */
export function pickHole(s: SideState, centres: { x: number; y: number }[], x: number, y: number, radius: number): number {
  let best = -1;
  let bd = radius * radius;
  centres.forEach((c, i) => {
    if (!s.holes[i]) return;
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d <= bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

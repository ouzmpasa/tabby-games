import { tierIndex, tierOf, YARNCATCH as C, type Cue, type Tier } from './config';
import type { PlayerId } from '../../core/types';

/** Seedable RNG (mulberry32). */
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

/** What happened to one yarn ball. */
export type Verdict = 'perfect' | 'good' | 'early' | 'late' | 'none' | 'foul';

export interface Params {
  perfectMs: number;
  goodMs: number;
}
export const DEFAULT_PARAMS: Params = { perfectMs: C.perfectMs, goodMs: C.goodMs };

/** Catch windows of a swing (they narrow tier by tier). */
export const paramsFor = (tier: Tier): Params => ({ perfectMs: tier.perfectMs, goodMs: tier.goodMs });

/** Judge a tap against the ideal moment (both in the same ms clock). */
export function judge(tapMs: number, idealMs: number, p: Params = DEFAULT_PARAMS): 'perfect' | 'good' | 'early' | 'late' {
  const d = tapMs - idealMs;
  const a = Math.abs(d);
  if (a <= p.perfectMs) return 'perfect';
  if (a <= p.goodMs) return 'good';
  return d < 0 ? 'early' : 'late';
}

/** A tap before the yarn has started is a foul; afterwards it is judged against the ideal moment (a fake-out pause delays it). */
export function judgeTap(tapMs: number, startMs: number, descentMs: number, p: Params = DEFAULT_PARAMS, pauseMs = 0): Verdict {
  if (tapMs < startMs) return 'foul';
  return judge(tapMs, startMs + pauseMs + descentMs, p);
}

export const isCatch = (v: Verdict): boolean => v === 'perfect' || v === 'good';

/** Points of a verdict, times the tier's multiplier. */
export function pointsFor(v: Verdict, multiplier = 1): number {
  return (v === 'perfect' ? C.perfectPoints : v === 'good' ? C.goodPoints : 0) * multiplier;
}

/** After this moment with no tap the yarn is a miss (it is past the paws). */
export const missDeadline = (startMs: number, descentMs: number, p: Params = DEFAULT_PARAMS, pauseMs = 0): number =>
  startMs + pauseMs + descentMs + p.goodMs;

/** One yarn ball's flight. */
export interface BallPlan {
  /** Start, ms after 'Ready...' began. */
  startMs: number;
  descentMs: number;
  /** Fake-out: the ball stops at this fraction of its way (0 = no fake-out) ... */
  pauseAtU: number;
  /** ... for this long (ms). */
  pauseMs: number;
  /** Sliding in from the side: starting x offset in lane px (0 = straight down the middle). */
  sideX: number;
  /** Hops on the way in; the last one lands in the paws. */
  bounces: number;
}

export interface SwingPlan {
  /** 0-based tier of this swing and its multiplier / cue / windows. */
  tier: number;
  multiplier: number;
  cue: Cue;
  params: Params;
  /** The balls of each player (1 or 2, the same count for both so the swing is fair). */
  balls: [BallPlan[], BallPlan[]];
  /** Announce the tier on this swing (its first one). */
  announce: Tier['hint'];
}

/** The ideal tap moment of a ball (ms, same clock as startMs). */
export const idealMs = (b: BallPlan): number => b.startMs + b.pauseMs + b.descentMs;

const randIn = (rng: () => number, r: readonly [number, number]): number => r[0] + rng() * (r[1] - r[0]);

/**
 * Plan a swing from the tier its index belongs to. The first swings are slow and plain. Both players get the same KIND of swing
 * (same number of balls, same fake-out and hops) but their own start times, at least minGapMs apart, and their own sliding side.
 */
export function planSwing(rng: () => number, index: number): SwingPlan {
  const tier = tierOf(index);
  const first = index === 0;
  const descentMs = first ? C.firstDescentMs : index === 1 ? C.secondDescentMs : tier.descentMs;
  const base = first ? C.firstWaitMs : tier.waitMinMs + rng() * (tier.waitMaxMs - tier.waitMinMs);
  const jit = first ? C.firstJitterMs : C.jitterMs;
  // the shape of the swing (shared by both players)
  const twoBalls = !first && index > 1 && rng() < tier.doubleBall;
  const feint = !first && index > 1 && rng() < tier.feint;
  const pauseAtU = feint ? randIn(rng, C.feintAtU) : 0;
  const pauseMs = feint ? Math.round(randIn(rng, C.feintPauseMs)) : 0;
  const bounces = Math.round(randIn(rng, tier.bounces));
  const gapMs = Math.round(randIn(rng, C.doubleGapMs));
  const slides = index > 1 && rng() < tier.slide;

  const starts = [0, 1].map(() => Math.max(C.minStartMs, base + (rng() * 2 - 1) * jit));
  if (Math.abs(starts[0] - starts[1]) < C.minGapMs) {
    // Push the later one away; which player is later is random.
    if (rng() < 0.5) starts[0] = starts[1] + C.minGapMs;
    else starts[1] = starts[0] + C.minGapMs;
  }
  const build = (start: number): BallPlan[] => {
    const side = slides ? (rng() < 0.5 ? -1 : 1) * Math.round(randIn(rng, C.slidePx)) : 0;
    const a: BallPlan = { startMs: Math.round(start), descentMs, pauseAtU, pauseMs, sideX: side, bounces };
    if (!twoBalls) return [a];
    // the second ball reaches the paws gapMs after the first one (straight in, no fake-out), so its start follows from that
    const b: BallPlan = { startMs: Math.round(idealMs(a) + gapMs - descentMs), descentMs, pauseAtU: 0, pauseMs: 0, sideX: slides ? -side : 0, bounces };
    return [a, b];
  };
  const balls: [BallPlan[], BallPlan[]] = [build(starts[0]), build(starts[1])];
  return {
    tier: tierIndex(index),
    multiplier: tier.multiplier,
    cue: tier.cue,
    params: paramsFor(tier),
    balls,
    announce: index === tier.from ? tier.hint : null,
  };
}

/**
 * Which ball a tap belongs to: the nearest (to its ideal moment) not-yet-judged ball that has already started. A tap before
 * any unjudged ball started is a foul and uses up the first unjudged ball. -1 when there is nothing left to tap for.
 */
export function assignTap(balls: readonly BallPlan[], judged: readonly boolean[], tapMs: number): { ball: number; foul: boolean } {
  let best = -1;
  let bestD = Infinity;
  balls.forEach((b, i) => {
    if (judged[i] || tapMs < b.startMs) return;
    const d = Math.abs(tapMs - idealMs(b));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  if (best >= 0) return { ball: best, foul: false };
  const first = balls.findIndex((_, i) => !judged[i]);
  return { ball: first, foul: first >= 0 };
}

/**
 * Yarn progress: 0 at its start, 1 at the paws (ideal moment), >1 afterwards. A fake-out holds it at `pauseAtU` for `pauseMs`.
 */
export function yarnProgress(nowMs: number, startMs: number, descentMs: number, pauseAtU = 0, pauseMs = 0): number {
  const e = nowMs - startMs;
  if (e <= 0) return 0;
  if (pauseMs > 0) {
    const t0 = pauseAtU * descentMs;
    if (e <= t0) return e / descentMs;
    if (e <= t0 + pauseMs) return pauseAtU;
    return (e - pauseMs) / descentMs;
  }
  return e / descentMs;
}

/** True while a fake-out holds the ball still. */
export function inFeint(nowMs: number, b: BallPlan): boolean {
  if (b.pauseMs <= 0) return false;
  const e = nowMs - b.startMs;
  const t0 = b.pauseAtU * b.descentMs;
  return e > t0 && e < t0 + b.pauseMs;
}

/** Yarn position 0..1+ along its path (0 start, 1 at the hands). Accelerates (fast at the end) and keeps its speed after 1. */
export function yarnPath(u: number): number {
  const k = 1.7;
  return u <= 1 ? Math.pow(u, k) : 1 + k * (u - 1);
}

/** Winner after `played` swings, or null while the match goes on (unfinished, or tied -> sudden-death swings). */
export function matchWinner(scores: readonly [number, number], played: number): PlayerId | null {
  if (played < C.swings) return null;
  if (scores[0] === scores[1]) return null;
  return scores[0] > scores[1] ? 0 : 1;
}

/** Hop height 0..1 of the tumbling ball: `n` little bounces while it comes in, landing at u = k/n (the last one at u = 1), flat afterwards. */
export function yarnHop(u: number, n = 2): number {
  if (u <= 0 || u >= 1) return 0;
  return Math.abs(Math.sin(u * n * Math.PI)) * (1 - 0.35 * u);
}

/** Progress values (0..1) at which the ball touches down, in order: the launch, the bounces and the landing in the paws. */
export const landings = (bounces: number): number[] => Array.from({ length: bounces + 1 }, (_, k) => k / bounces);

/** Progress-time (ms since the ball's start) at which it is at progress u (the inverse of yarnProgress for u <= 1). */
export function timeAtU(b: BallPlan, u: number): number {
  return u * b.descentMs + (b.pauseMs > 0 && u > b.pauseAtU ? b.pauseMs : 0);
}

/**
 * How visible the shrinking ring is (0..1) for a ball at progress `u`: always for 'ring'; for 'fade' it fades out well before the
 * catch; for 'blink' it also flickers. The players then have to follow the rhythm of the hops and the sound.
 */
export function cueAlpha(cue: Cue, u: number, nowMs: number): number {
  if (cue === 'ring') return 1;
  const fade = Math.max(0, Math.min(1, 1 - (u - C.fadeFromU) / C.fadeSpanU));
  if (cue === 'fade') return fade;
  return Math.floor(nowMs / C.blinkMs) % 2 === 0 ? fade : fade * 0.12;
}

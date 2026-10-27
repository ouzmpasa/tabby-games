import { MILKRACE, ROUND_RAMP } from './config';

/** Small seedable RNG (same as the other games), so both players get the same bell schedule. */
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

export type Pad = 0 | 1; // 0 = pad A (starts on the player's left), 1 = pad B (starts on the right)
export type Stage = 0 | 1 | 2; // Warm-up, Rhythm, Frisky cow

export interface MilkParams {
  slowRate: number;
  fastRate: number;
  minSquirt: number;
  maxSquirt: number;
  rateSmoothing: number;
  idleResetMs: number;
  minTapGapMs: number;
  splatRateFactor: number;
  bellBonus: number;
  stages: number;
  beatSquirt: number;
  perfectFactor: number;
  offBeatSquirt: number;
  streakBonus: number;
  streakMax: number;
  beatLeadMs: number;
  beatQuietFrac: number;
}
export const DEFAULT_PARAMS: MilkParams = { ...MILKRACE };

/** Per-round difficulty (see ROUND_RAMP). */
export interface RoundDifficulty {
  beatPeriodMs: number;
  beatGoodMs: number;
  beatPerfectMs: number;
  shuffleMs: number;
  bellLifeMs: number;
}

const ramp = (arr: readonly number[], round: number): number => arr[Math.max(0, Math.min(arr.length - 1, round - 1))];

/** Difficulty of round `round` (1-based): later rounds have a faster beat, tighter windows, quicker shuffles, shorter bells. */
export function roundDifficulty(round: number): RoundDifficulty {
  return {
    beatPeriodMs: ramp(ROUND_RAMP.beatPeriodMs, round),
    beatGoodMs: ramp(ROUND_RAMP.beatGoodMs, round),
    beatPerfectMs: ramp(ROUND_RAMP.beatPerfectMs, round),
    shuffleMs: ramp(ROUND_RAMP.shuffleMs, round),
    bellLifeMs: ramp(ROUND_RAMP.bellLifeMs, round),
  };
}

export interface MilkState {
  /** Tank level 0..1 across all stages (stage s fills [s/3, (s+1)/3]). */
  level: number;
  /** Current stage 0..2. Each player advances through the stages on their own, with the same (seeded) events. */
  stage: Stage;
  /** ms since the current stage started (advance() keeps it going). */
  stageT: number;
  /** Pad of the last accepted tap (null = none yet, so either pad starts). */
  last: Pad | null;
  lastTime: number;
  /** Smoothed alternating-tap rate, taps per second. */
  rate: number;
  /** Rhythm stage: index of the beat being judged, whether it already got a tap, and the current on-beat streak. */
  beatIdx: number;
  beatHit: boolean;
  streak: number;
}

export const createState = (): MilkState => ({ level: 0, stage: 0, stageT: 0, last: null, lastTime: -Infinity, rate: 0, beatIdx: 0, beatHit: false, streak: 0 });

export function reset(s: MilkState): void {
  Object.assign(s, createState());
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** 0..1 where 0 is slowRate and 1 is fastRate. */
export const rateFactor = (rate: number, p: MilkParams = DEFAULT_PARAMS): number => clamp01((rate - p.slowRate) / (p.fastRate - p.slowRate));

/** Tank fraction one correct tap adds at a given tap rate (Warm-up and Frisky stages). */
export const squirtSize = (rate: number, p: MilkParams = DEFAULT_PARAMS): number => p.minSquirt + (p.maxSquirt - p.minSquirt) * rateFactor(rate, p);

/** Tank level at the end of stage `stage`. */
export const stageEnd = (stage: number, p: MilkParams = DEFAULT_PARAMS): number => (stage + 1) / p.stages;

/** Time (ms into the Rhythm stage) of beat `k`. */
export const beatTime = (k: number, d: RoundDifficulty, p: MilkParams = DEFAULT_PARAMS): number => p.beatLeadMs + k * d.beatPeriodMs;

/** Advance the per-stage clock (call every frame while playing). */
export function advance(s: MilkState, dtMs: number, d: RoundDifficulty = roundDifficulty(1), p: MilkParams = DEFAULT_PARAMS): void {
  s.stageT += dtMs;
  if (s.stage === 1) judgeBeats(s, d, p);
}

/** Beats whose window has passed without a tap are missed: the streak resets. */
function judgeBeats(s: MilkState, d: RoundDifficulty, p: MilkParams): void {
  while (beatTime(s.beatIdx, d, p) + d.beatGoodMs < s.stageT) {
    if (!s.beatHit) s.streak = 0;
    s.beatIdx++;
    s.beatHit = false;
  }
}

/** Rhythm ring progress toward the next beat: 0 just after a beat .. 1 on the beat (null before the first beat's approach). */
export function beatPhase(s: MilkState, d: RoundDifficulty, p: MilkParams = DEFAULT_PARAMS): number {
  const next = beatTime(s.beatIdx, d, p);
  const left = next - s.stageT;
  return clamp01(1 - left / d.beatPeriodMs);
}

export type BeatQuality = 'perfect' | 'good' | 'off';

export type TapResult =
  | { kind: 'ignored' }
  | { kind: 'splat' }
  | { kind: 'squirt'; amount: number; won: boolean; stageDone: boolean; beat: BeatQuality | null };

/** Adds `amount` to the tank, capped at the end of the current stage; moves on to the next stage when it is full. */
function fill(s: MilkState, amount: number, p: MilkParams): { won: boolean; stageDone: boolean } {
  const end = stageEnd(s.stage, p);
  s.level = Math.min(end, s.level + amount);
  if (s.level < end - 1e-9) return { won: false, stageDone: false };
  s.level = end;
  if (s.stage >= p.stages - 1) {
    s.level = 1;
    return { won: true, stageDone: false };
  }
  s.stage = (s.stage + 1) as Stage;
  s.stageT = 0;
  s.beatIdx = 0;
  s.beatHit = false;
  s.streak = 0;
  s.rate = 0;
  s.last = null;
  return { won: false, stageDone: true };
}

/**
 * A tap on `pad` at time `now` (ms). Alternating pads squirt; the same pad twice splats (no milk, combo drops).
 * In the Rhythm stage a tap near a beat squirts big (a PERFECT one bigger), any other tap only a little.
 */
export function tap(s: MilkState, pad: Pad, now: number, p: MilkParams = DEFAULT_PARAMS, d: RoundDifficulty = roundDifficulty(1)): TapResult {
  if (s.level >= 1) return { kind: 'ignored' };
  if (now - s.lastTime < p.minTapGapMs) return { kind: 'ignored' };
  const gap = now - s.lastTime;
  s.lastTime = now;
  if (s.last === pad) {
    s.rate *= p.splatRateFactor;
    if (s.stage === 1) s.streak = 0;
    return { kind: 'splat' };
  }
  const first = s.last === null || gap > p.idleResetMs;
  const inst = first ? p.slowRate : 1000 / gap;
  s.rate = first ? inst : s.rate * (1 - p.rateSmoothing) + inst * p.rateSmoothing;
  s.last = pad;
  let amount: number;
  let beat: BeatQuality | null = null;
  if (s.stage === 1) {
    judgeBeats(s, d, p);
    const off = Math.abs(s.stageT - beatTime(s.beatIdx, d, p));
    // A tap only counts as "on the beat" when it comes alone: mashing (taps closer than half a beat) never scores big.
    if (off <= d.beatGoodMs && !s.beatHit && gap >= d.beatPeriodMs * p.beatQuietFrac) {
      s.beatHit = true;
      s.streak++;
      beat = off <= d.beatPerfectMs ? 'perfect' : 'good';
      amount = p.beatSquirt * (beat === 'perfect' ? p.perfectFactor : 1) * (1 + p.streakBonus * Math.min(s.streak - 1, p.streakMax));
    } else {
      beat = 'off';
      amount = p.offBeatSquirt;
    }
  } else {
    amount = squirtSize(s.rate, p);
  }
  const r = fill(s, amount, p);
  return { kind: 'squirt', amount, won: r.won, stageDone: r.stageDone, beat };
}

/** The golden bell: an instant splash (never past the end of the stage). */
export function bell(s: MilkState, p: MilkParams = DEFAULT_PARAMS): { won: boolean; stageDone: boolean } {
  if (s.level >= 1) return { won: false, stageDone: false };
  return fill(s, p.bellBonus, p);
}

/** Combo meter 0..1 for display: the rate factor (Rhythm: the on-beat streak), fading out while the player is idle. */
export function combo(s: MilkState, now: number, p: MilkParams = DEFAULT_PARAMS): number {
  if (s.stage === 1) return s.streak / p.streakMax > 1 ? 1 : s.streak / p.streakMax;
  const idle = now - s.lastTime;
  if (idle > p.idleResetMs) return 0;
  const fade = idle < 400 ? 1 : 1 - (idle - 400) / (p.idleResetMs - 400);
  return rateFactor(s.rate, p) * fade;
}

export interface BellEvent {
  /** ms after the stage start when the bell pops up. */
  at: number;
  /** Index into LAYOUT.bellSpots. */
  spot: number;
  /** ms the bell stays. */
  life: number;
}

/** Deterministic bell schedule for one stage of one round (same for both players). */
export function makeBellSchedule(seed: number, count: number, spots: number, first: number = MILKRACE.bellFirstMs[0], every: number = MILKRACE.bellEveryMs[0], jitter: number = MILKRACE.bellJitterMs, life: number = MILKRACE.bellLifeMs): BellEvent[] {
  const rnd = mulberry32(seed);
  const out: BellEvent[] = [];
  let at = first;
  let prev = -1;
  for (let i = 0; i < count; i++) {
    let spot = Math.floor(rnd() * spots);
    if (spot === prev && spots > 1) spot = (spot + 1) % spots;
    prev = spot;
    out.push({ at: Math.round(at + (rnd() * 2 - 1) * jitter * (i === 0 ? 0.3 : 1)), spot, life });
    at += every;
  }
  return out;
}

/** Bell schedule of `stage` in round `round` for a given match seed: the Frisky stage gets many more bells. */
export function stageBellSchedule(seed: number, round: number, stage: Stage, spots: number, count = 10): BellEvent[] {
  const d = roundDifficulty(round);
  return makeBellSchedule(seed + round * 101 + stage * 17, count, spots, MILKRACE.bellFirstMs[stage], MILKRACE.bellEveryMs[stage], MILKRACE.bellJitterMs, d.bellLifeMs);
}

// ---------------------------------------------------------------- frisky cow

/** Seeded plan of pad layouts for the Frisky stage: at `times[i]` the pads slide to `slots[i + 1]` (slots[0] is the start layout). */
export interface FriskyPlan {
  times: number[];
  slots: number[];
}

export function makeFriskyPlan(seed: number, shuffleMs: number, slotCount: number, count = 24, firstMs: number = MILKRACE.firstShuffleMs): FriskyPlan {
  const rnd = mulberry32(seed);
  const times: number[] = [];
  const slots: number[] = [0];
  let t = firstMs;
  for (let i = 0; i < count; i++) {
    times.push(Math.round(t));
    let next = Math.floor(rnd() * slotCount);
    if (next === slots[i]) next = (next + 1 + Math.floor(rnd() * (slotCount - 1))) % slotCount;
    slots.push(next);
    t += shuffleMs * (0.8 + 0.4 * rnd());
  }
  return { times, slots };
}

export interface FriskyView {
  /** Layout slot the pads are leaving / going to (equal when still), and slide progress 0..1. */
  from: number;
  to: number;
  move: number;
  /** 0..1 wobble warning shortly before a shuffle. */
  warn: number;
}

export function friskyAt(plan: FriskyPlan, stageT: number, moveMs: number = MILKRACE.shuffleMoveMs, warnMs: number = MILKRACE.shuffleWarnMs): FriskyView {
  let i = -1;
  while (i + 1 < plan.times.length && plan.times[i + 1] <= stageT) i++;
  const cur = plan.slots[i + 1];
  const prev = plan.slots[Math.max(0, i)];
  if (i >= 0) {
    const m = clamp01((stageT - plan.times[i]) / moveMs);
    if (m < 1) return { from: prev, to: cur, move: m, warn: 0 };
  }
  const nextAt = plan.times[i + 1];
  const warn = nextAt === undefined ? 0 : clamp01(1 - (nextAt - stageT) / warnMs);
  return { from: cur, to: cur, move: 1, warn };
}

/** Frame transform: a player's local point (x right, y toward them) to screen, for the half centred at (cx, cy). */
export function localToScreen(player: 0 | 1, cx: number, cy: number, lx: number, ly: number): { x: number; y: number } {
  return player === 0 ? { x: cx - ly, y: cy + lx } : { x: cx + ly, y: cy - lx };
}

export function screenToLocal(player: 0 | 1, cx: number, cy: number, sx: number, sy: number): { x: number; y: number } {
  return player === 0 ? { x: sy - cy, y: -(sx - cx) } : { x: -(sy - cy), y: sx - cx };
}

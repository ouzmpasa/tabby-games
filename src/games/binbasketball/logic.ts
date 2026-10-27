import { H, W } from '../../core/layout';
import type { PlayerId } from '../../core/types';
import { BINBASKETBALL } from './config';

export type BinMode = 'sweep' | 'stop' | 'dart';

export interface LevelDef {
  radius: number;
  speed: number;
  mode: BinMode;
  drift: number;
  wind: number;
}

export interface Params {
  levels: readonly LevelDef[];
  pointsPerLevel: number;
  catchUpGap: number;
  catchUpHit: number;
  stopMs: number;
  stopSpeedUp: number;
  dartDepth: number;
  dartPeriodMs: number;
  driftPeriodMs: number;
  radiusChangeSpeed: number;
  driftChangeSpeed: number;
  comboEvery: number;
  mercyAfterMs: number;
  mercyEveryMs: number;
  mercyStep: number;
  mercyMax: number;
  binRadius: number;
  hitFactor: number;
  binSpeed: number;
  binMinY: number;
  binMaxY: number;
  binX: number;
  minPull: number;
  pullScale: number;
  minFlickSpeed: number;
  distancePerSpeed: number;
  minThrowDistance: number;
  maxThrowDistance: number;
  maxThrowAngleDeg: number;
  flickWindowMs: number;
  flickStaleMs: number;
  flightBaseMs: number;
  flightPerPx: number;
  arcHeight: number;
  restMs: number;
  returnMs: number;
  sinkMs: number;
  homeInset: number;
}

export const DEFAULT_PARAMS: Params = { ...BINBASKETBALL };

export interface Pt {
  x: number;
  y: number;
}

export interface Sample extends Pt {
  /** Timestamp in ms. */
  t: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Where a player's ball waits. Player 0 at the left end, player 1 at the right end. */
export function homePos(p: PlayerId, params: Params = DEFAULT_PARAMS): Pt {
  return { x: p === 0 ? params.homeInset : W - params.homeInset, y: H / 2 };
}

/** Bin centre after `timeMs` of steady (level 0, 'sweep') play: it bounces between binMinY and binMaxY (triangle wave). */
export function binPos(timeMs: number, params: Params = DEFAULT_PARAMS): Pt {
  const span = params.binMaxY - params.binMinY;
  const d = (Math.max(0, timeMs) / 1000) * params.binSpeed;
  return { x: params.binX, y: params.binMinY + fold(d, span) };
}

/** Fold a distance travelled along the track into a position 0..span (there and back). */
export function fold(d: number, span: number): number {
  const m = ((d % (2 * span)) + 2 * span) % (2 * span);
  return m <= span ? m : 2 * span - m;
}

/** The difficulty level for a leader's score. */
export function levelFor(leaderScore: number, params: Params = DEFAULT_PARAMS): number {
  return clamp(Math.floor(leaderScore / params.pointsPerLevel), 0, params.levels.length - 1);
}

export const levelDef = (level: number, params: Params = DEFAULT_PARAMS): LevelDef =>
  params.levels[clamp(Math.floor(level), 0, params.levels.length - 1)];

/** The moving bin: distance travelled along its track, play clock, remaining stop, current (eased) radius. */
export interface Bin {
  d: number;
  t: number;
  dwell: number;
  radius: number;
  /** Current (eased) sideways sway amplitude. */
  drift: number;
  level: number;
}

export function createBin(params: Params = DEFAULT_PARAMS): Bin {
  return { d: 0, t: 0, dwell: 0, radius: levelDef(0, params).radius, drift: levelDef(0, params).drift, level: 0 };
}

/** Advance the bin by dtMs at the given level. Level 0 'sweep' is exactly binPos(). */
export function stepBin(b: Bin, dtMs: number, level: number, params: Params = DEFAULT_PARAMS): void {
  const lv = levelDef(level, params);
  b.level = level;
  b.t += dtMs;
  const dt = dtMs / 1000;
  // ease toward the level's radius
  const dr = lv.radius - b.radius;
  const stepR = params.radiusChangeSpeed * dt;
  b.radius = Math.abs(dr) <= stepR ? lv.radius : b.radius + Math.sign(dr) * stepR;
  const dd = lv.drift - b.drift;
  const stepD = params.driftChangeSpeed * dt;
  b.drift = Math.abs(dd) <= stepD ? lv.drift : b.drift + Math.sign(dd) * stepD;
  if (b.dwell > 0) {
    b.dwell = Math.max(0, b.dwell - dtMs);
    return;
  }
  let v = lv.speed;
  if (lv.mode === 'stop') v *= params.stopSpeedUp;
  else if (lv.mode === 'dart') v *= 1 + params.dartDepth * Math.sin((2 * Math.PI * b.t) / params.dartPeriodMs);
  const before = b.d;
  b.d += v * dt;
  if (lv.mode === 'stop') {
    const half = (params.binMaxY - params.binMinY) / 2;
    if (Math.floor(b.d / half) !== Math.floor(before / half)) b.dwell = params.stopMs;
  }
}

/** Bin centre: along the track, plus the sideways sway of the current level. */
export function binCentre(b: Bin, params: Params = DEFAULT_PARAMS): Pt {
  const span = params.binMaxY - params.binMinY;
  return { x: params.binX + b.drift * Math.sin((2 * Math.PI * b.t) / params.driftPeriodMs), y: params.binMinY + fold(b.d, span) };
}

/** A new wind: a random direction, strength between 40% and 100% of the level's strongest gust. Level 0-1 have none. */
export function rollWind(level: number, rand: () => number = Math.random, params: Params = DEFAULT_PARAMS): Pt {
  const max = levelDef(level, params).wind;
  if (max <= 0) return { x: 0, y: 0 };
  const a = rand() * Math.PI * 2;
  const s = max * (0.4 + 0.6 * rand());
  return { x: Math.cos(a) * s, y: Math.sin(a) * s };
}

/** The wind pushes a ball for as long as it is in the air: shift the landing spot by wind * flight time. */
export function applyWind(th: Throw, wind: Pt): Throw {
  if (wind.x === 0 && wind.y === 0) return th;
  const k = th.durationMs / 1000;
  const to = { x: clamp(th.to.x + wind.x * k, 40, W - 40), y: clamp(th.to.y + wind.y * k, 40, H - 40) };
  return { ...th, to };
}

/** Scoring radius multiplier from the safety net: 1 until mercyAfterMs of play, then growing in steps. */
export function mercy(playMs: number, params: Params = DEFAULT_PARAMS): number {
  if (playMs < params.mercyAfterMs) return 1;
  return 1 + Math.min(params.mercyMax, params.mercyStep * (1 + Math.floor((playMs - params.mercyAfterMs) / params.mercyEveryMs)));
}

/** Streak bonus: true on every `comboEvery`-th hit in a row. */
export const comboBonus = (streak: number, params: Params = DEFAULT_PARAMS): boolean => streak > 0 && streak % params.comboEvery === 0;

/** Scoring radius multiplier for a player who is `behind` points behind (catch-up help for a close match). */
export const catchUp = (behind: number, params: Params = DEFAULT_PARAMS): number => (behind >= params.catchUpGap ? params.catchUpHit : 1);

/** Dots for the direction cue: fixed count and spacing, pointing along the throw. */
export function cueDots(from: Pt, to: Pt, count: number, gap: number): Pt[] {
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  if (len < 1e-6) return [];
  return Array.from({ length: count }, (_, i) => ({ x: from.x + ((to.x - from.x) / len) * gap * (i + 1.4), y: from.y + ((to.y - from.y) / len) * gap * (i + 1.4) }));
}

/** Finger velocity (px/s) from recent samples, or null if the finger had stopped/was barely tracked. */
export function flickVelocity(samples: readonly Sample[], nowMs: number, params: Params = DEFAULT_PARAMS): Pt | null {
  if (samples.length < 2) return null;
  const last = samples[samples.length - 1];
  if (nowMs - last.t > params.flickStaleMs) return null;
  let first = last;
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > params.flickWindowMs) break;
    first = samples[i];
  }
  const dt = (last.t - first.t) / 1000;
  if (dt <= 0) return null;
  return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt };
}

export interface Throw {
  to: Pt;
  distance: number;
  durationMs: number;
}

/**
 * Turn a flick velocity into a throw from `from`. Backward/slow flicks give null (ball stays).
 * The direction is clamped to maxThrowAngleDeg around "straight at the opponent"; distance grows with speed.
 */
export function computeThrow(p: PlayerId, from: Pt, v: Pt, params: Params = DEFAULT_PARAMS): Throw | null {
  const speed = Math.hypot(v.x, v.y);
  const fwd = p === 0 ? 1 : -1;
  if (speed < params.minFlickSpeed || v.x * fwd <= 0) return null;
  const maxA = (params.maxThrowAngleDeg * Math.PI) / 180;
  const angle = clamp(Math.atan2(v.y, v.x * fwd), -maxA, maxA);
  const distance = clamp(speed * params.distancePerSpeed, params.minThrowDistance, params.maxThrowDistance);
  const to = {
    x: clamp(from.x + Math.cos(angle) * distance * fwd, 40, W - 40),
    y: clamp(from.y + Math.sin(angle) * distance, 40, H - 40),
  };
  const real = Math.hypot(to.x - from.x, to.y - from.y);
  return { to, distance: real, durationMs: params.flightBaseMs + real * params.flightPerPx };
}

/**
 * Slingshot aiming: `pull` is (finger start - finger now). Pulling back toward your own end throws forward,
 * the throw lands pull length * pullScale away. Returns null while the pull is too short or points backward.
 */
export function computeAim(p: PlayerId, from: Pt, pull: Pt, params: Params = DEFAULT_PARAMS): Throw | null {
  const len = Math.hypot(pull.x, pull.y);
  const fwd = p === 0 ? 1 : -1;
  if (len < params.minPull || pull.x * fwd <= 0) return null;
  const maxA = (params.maxThrowAngleDeg * Math.PI) / 180;
  const angle = clamp(Math.atan2(pull.y, pull.x * fwd), -maxA, maxA);
  const distance = clamp(len * params.pullScale, params.minThrowDistance, params.maxThrowDistance);
  const to = {
    x: clamp(from.x + Math.cos(angle) * distance * fwd, 40, W - 40),
    y: clamp(from.y + Math.sin(angle) * distance, 40, H - 40),
  };
  const real = Math.hypot(to.x - from.x, to.y - from.y);
  return { to, distance: real, durationMs: params.flightBaseMs + real * params.flightPerPx };
}

/** True when a ball landing at `land` drops into a bin centred at `bin`. */
export function isHit(land: Pt, bin: Pt, params: Params = DEFAULT_PARAMS, radius: number = params.binRadius): boolean {
  return Math.hypot(land.x - bin.x, land.y - bin.y) <= radius * params.hitFactor;
}

export type BallPhase = 'ready' | 'flight' | 'sink' | 'rest' | 'return';

export interface Ball {
  player: PlayerId;
  phase: BallPhase;
  x: number;
  y: number;
  /** Visual scale (1 = resting size). */
  scale: number;
  /** Time spent in the current phase (ms). */
  t: number;
  from: Pt;
  to: Pt;
  durationMs: number;
  hit: boolean;
}

export function createBall(p: PlayerId, params: Params = DEFAULT_PARAMS): Ball {
  const h = homePos(p, params);
  return { player: p, phase: 'ready', x: h.x, y: h.y, scale: 1, t: 0, from: h, to: h, durationMs: 0, hit: false };
}

export function launch(b: Ball, th: Throw): void {
  b.phase = 'flight';
  b.t = 0;
  b.from = { x: b.x, y: b.y };
  b.to = th.to;
  b.durationMs = th.durationMs;
  b.hit = false;
}

export interface BallEvent {
  /** Set the frame a ball lands: 'hit' (in the bin) or 'miss'. */
  landed?: 'hit' | 'miss';
  /** Set the frame a ball is back at home and can be thrown again. */
  ready?: boolean;
}

/**
 * Advance a ball by dtMs. `bin` is the bin centre at the end of this step (used when the ball lands) and `binRadius` its
 * current radius (times the player's catch-up factor).
 */
export function stepBall(b: Ball, dtMs: number, bin: Pt, params: Params = DEFAULT_PARAMS, binRadius: number = params.binRadius): BallEvent {
  const ev: BallEvent = {};
  if (b.phase === 'ready') return ev;
  b.t += dtMs;
  const home = homePos(b.player, params);
  if (b.phase === 'flight') {
    const k = clamp(b.t / b.durationMs, 0, 1);
    b.x = lerp(b.from.x, b.to.x, k);
    b.y = lerp(b.from.y, b.to.y, k);
    b.scale = lerp(1, 0.8, k) + params.arcHeight * Math.sin(Math.PI * k);
    if (k >= 1) {
      b.hit = isHit(b.to, bin, params, binRadius);
      b.phase = b.hit ? 'sink' : 'rest';
      b.t = 0;
      ev.landed = b.hit ? 'hit' : 'miss';
    }
  } else if (b.phase === 'sink') {
    const k = clamp(b.t / params.sinkMs, 0, 1);
    b.x = bin.x;
    b.y = bin.y;
    b.scale = 0.8 * (1 - k);
    if (k >= 1) toReady(b, home, ev);
  } else if (b.phase === 'rest') {
    b.scale = 0.8;
    if (b.t >= params.restMs) {
      b.phase = 'return';
      b.t = 0;
      b.from = { x: b.x, y: b.y };
    }
  } else {
    const k = clamp(b.t / params.returnMs, 0, 1);
    b.x = lerp(b.from.x, home.x, k);
    b.y = lerp(b.from.y, home.y, k);
    b.scale = lerp(0.8, 1, k);
    if (k >= 1) toReady(b, home, ev);
  }
  return ev;
}

function toReady(b: Ball, home: Pt, ev: BallEvent): void {
  b.phase = 'ready';
  b.x = home.x;
  b.y = home.y;
  b.scale = 1;
  b.t = 0;
  ev.ready = true;
}

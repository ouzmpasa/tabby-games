import { H, W } from '../../core/layout';
import type { PlayerId } from '../../core/types';
import { PENALTY } from './config';

export interface LevelDef {
  goalHalfH: number;
  keeperHalf: number;
  keeperSpeed: number;
  overAt: number;
  blockerSpeed: number;
}

export interface Params {
  levels: readonly LevelDef[];
  levelEveryKicks: number;
  blockerHalf: number;
  blockerAt: number;
  overAt: number;
  blockerSpeed: number;
  aimDots: number;
  aimDotGap: number;
  goalInset: number;
  goalHalfH: number;
  spotInset: number;
  ballRadius: number;
  keeperHalf: number;
  keeperEdgeMargin: number;
  keeperSpeed: number;
  minPull: number;
  maxPull: number;
  maxAngleDeg: number;
  angleGain: number;
  slowFlightMs: number;
  fastFlightMs: number;
  arcHeight: number;
  saveSlack: number;
}

export const DEFAULT_PARAMS: Params = { ...PENALTY, ...PENALTY.levels[0] };

/** Difficulty level of a kick (every `levelEveryKicks` kicks goes one up, capped at the last row). */
export const levelOfKick = (kick: number, base: Params = DEFAULT_PARAMS): number =>
  Math.min(base.levels.length - 1, Math.floor(Math.max(0, kick) / base.levelEveryKicks));

/** The parameters in force for a level: the base knobs with that level's row laid over them. */
export function paramsForLevel(level: number, base: Params = DEFAULT_PARAMS): Params {
  const row = base.levels[Math.min(base.levels.length - 1, Math.max(0, Math.floor(level)))];
  return { ...base, ...row };
}

export interface Pt {
  x: number;
  y: number;
}

export type Outcome = 'goal' | 'save' | 'miss' | 'over' | 'blocked';

export interface Shot {
  from: Pt;
  /** Where the ball would cross the goal line. */
  to: Pt;
  /** 0..1 */
  power: number;
  /** Angle from straight at the goal (radians, + = toward larger y). */
  angle: number;
  flightMs: number;
  /** True when `to` is inside the goal mouth. */
  onTarget: boolean;
  /** True when the kick is so hard it flies over the bar. */
  over: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** The shooter is player 0 on even kicks, player 1 on odd kicks. */
export const shooterOf = (kick: number): PlayerId => (kick % 2 === 0 ? 0 : 1);
export const keeperOf = (kick: number): PlayerId => (kick % 2 === 0 ? 1 : 0);

/** x of the goal line the shooter aims at (the far end from the shooter). */
export function goalX(shooter: PlayerId, params: Params = DEFAULT_PARAMS): number {
  return shooter === 0 ? W - params.goalInset : params.goalInset;
}

/** Where the shooter's ball waits. */
export function spotPos(shooter: PlayerId, params: Params = DEFAULT_PARAMS): Pt {
  return { x: shooter === 0 ? params.spotInset : W - params.spotInset, y: H / 2 };
}

/** Allowed range of the keeper's centre (screen y). */
export function keeperRange(params: Params = DEFAULT_PARAMS): { min: number; max: number } {
  const r = params.goalHalfH - params.keeperEdgeMargin;
  return { min: H / 2 - r, max: H / 2 + r };
}

export const power = (pullLen: number, params: Params = DEFAULT_PARAMS): number =>
  clamp((pullLen - params.minPull) / (params.maxPull - params.minPull), 0, 1);

/**
 * Slingshot: `pull` = anchor - finger (the way the ball will go). Returns null when the pull is too short or points
 * away from the goal. The ball flies along the pull direction (angle clamped), power grows with the pull length.
 */
export function computeShot(shooter: PlayerId, pull: Pt, params: Params = DEFAULT_PARAMS): Shot | null {
  const len = Math.hypot(pull.x, pull.y);
  if (len < params.minPull) return null;
  const fwd = shooter === 0 ? pull.x : -pull.x;
  if (fwd <= 0) return null;
  const max = (params.maxAngleDeg * Math.PI) / 180;
  const angle = clamp(Math.atan2(pull.y, fwd) * params.angleGain, -max, max);
  const from = spotPos(shooter, params);
  const dx = Math.abs(goalX(shooter, params) - from.x);
  const to = { x: goalX(shooter, params), y: from.y + Math.tan(angle) * dx };
  const pw = power(len, params);
  return {
    from,
    to,
    power: pw,
    angle,
    flightMs: lerp(params.slowFlightMs, params.fastFlightMs, pw),
    onTarget: Math.abs(to.y - H / 2) <= params.goalHalfH,
    over: pw > params.overAt,
  };
}

/** Move the keeper toward `targetY` by at most keeperSpeed * dt. Result stays inside the keeper range. */
export function stepKeeper(y: number, targetY: number, dtMs: number, params: Params = DEFAULT_PARAMS): number {
  const { min, max } = keeperRange(params);
  const goal = clamp(targetY, min, max);
  const step = (params.keeperSpeed * dtMs) / 1000;
  const d = goal - y;
  return clamp(Math.abs(d) <= step ? goal : y + Math.sign(d) * step, min, max);
}

/** Ball position and scale `k` (0..1) of the way through the flight. Scale peaks mid-flight (a lofted ball). */
export function shotAt(shot: Shot, k: number, params: Params = DEFAULT_PARAMS): { x: number; y: number; scale: number } {
  const t = clamp(k, 0, 1);
  return {
    x: lerp(shot.from.x, shot.to.x, t),
    y: lerp(shot.from.y, shot.to.y, t),
    scale: 1 + params.arcHeight * Math.sin(Math.PI * t),
  };
}

/** What happens when the ball reaches the goal line and the keeper stands at `keeperY`. */
export function resolveShot(shot: Shot, keeperY: number, params: Params = DEFAULT_PARAMS): Outcome {
  if (shot.over) return 'over';
  if (!shot.onTarget) return 'miss';
  return Math.abs(shot.to.y - keeperY) <= params.keeperHalf + params.saveSlack ? 'save' : 'goal';
}

/** Where the defender cone stands (screen y) `clockMs` into the kick: a triangle wave across the goal's width. */
export function blockerY(clockMs: number, params: Params = DEFAULT_PARAMS): number {
  const amp = params.goalHalfH + 30;
  const span = 2 * amp;
  const m = (((clockMs / 1000) * params.blockerSpeed) % (2 * span) + 2 * span) % (2 * span);
  return H / 2 - amp + (m <= span ? m : 2 * span - m);
}

/** Screen x of the defender cone for a shooter. */
export function blockerX(shooter: PlayerId, params: Params = DEFAULT_PARAMS): number {
  const from = spotPos(shooter, params).x;
  return from + (goalX(shooter, params) - from) * params.blockerAt;
}

/** The share of the flight (0..1) at which the ball passes the cone (the ball moves in a straight line). */
export const blockerPassK = (params: Params = DEFAULT_PARAMS): number => params.blockerAt;

/** True when the ball, passing the cone at `clockMs`, is stopped by it. Always false when the level has no cone. */
export function isBlocked(shot: Shot, clockMs: number, params: Params = DEFAULT_PARAMS): boolean {
  if (params.blockerSpeed <= 0 || shot.over) return false;
  const y = lerp(shot.from.y, shot.to.y, params.blockerAt);
  return Math.abs(y - blockerY(clockMs, params)) <= params.blockerHalf + params.ballRadius * 0.5;
}

/** Dots for the direction cue: fixed count and spacing from the ball toward where it is going (never the distance). */
export function cueDots(shot: Shot, count: number, gap: number): Pt[] {
  const dx = shot.to.x - shot.from.x;
  const dy = shot.to.y - shot.from.y;
  const len = Math.hypot(dx, dy);
  return Array.from({ length: count }, (_, i) => ({ x: shot.from.x + (dx / len) * gap * (i + 1.5), y: shot.from.y + (dy / len) * gap * (i + 1.5) }));
}

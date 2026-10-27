import { PITCH, RODS, TABLEFOOTBALL, type PitchRect, type RodDef } from './config';

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Rod {
  player: 0 | 1;
  /** Index within the player's rods (0 = keeper). */
  k: number;
  x: number;
  /** Centre of the rod along the short axis (screen y). Figures sit at `y + offsets[i]`. */
  y: number;
  vy: number;
  offsets: number[];
}

export type PointMode = 'classic' | 'turbo' | 'sweep' | 'combo';

export interface TableFootballState {
  ball: Ball;
  /** player 0's rods first (keeper, defence, forward), then player 1's. */
  rods: Rod[];
  /** Centre y of each goal mouth (player 0's at the left, player 1's at the right). Moves in sweep points. */
  goalY: [number, number];
  /** Figure hits since the serve (drives the rally speed-up). */
  touches: number;
  /** Seconds since the serve. */
  time: number;
  /** Sweep amplitude (px, 0 = goals stand still) and phase offset of the second goal. */
  sweepAmp: number;
  sweepPhase: number;
}

export interface Params {
  pitch: PitchRect;
  rods: readonly RodDef[];
  ballRadius: number;
  figureRadius: number;
  goalWidth: number;
  ballMaxSpeed: number;
  wallRestitution: number;
  figureRestitution: number;
  friction: number;
  ballMinSpeed: number;
  kickSpeed: number;
  rodMaxSpeed: number;
  substeps: number;
  kickSpeedUp: number;
  kickSpeedMax: number;
}

export const DEFAULT_PARAMS: Params = { ...TABLEFOOTBALL, pitch: PITCH, rods: RODS };

export interface StepResult {
  /** The player who scored (ball went into the OTHER player's goal), or null. */
  goal: 0 | 1 | null;
}

/** Rod index for a player's k-th rod. */
export const rodIndex = (player: 0 | 1, k: number, p: Params = DEFAULT_PARAMS): number => player * p.rods.length + k;

export function createState(p: Params = DEFAULT_PARAMS): TableFootballState {
  const { pitch } = p;
  const cy = pitch.y + pitch.h / 2;
  const rods: Rod[] = [];
  for (const player of [0, 1] as const) {
    p.rods.forEach((d, k) => {
      const offsets = Array.from({ length: d.figures }, (_, i) => (i - (d.figures - 1) / 2) * d.spacing);
      rods.push({ player, k, x: player === 0 ? pitch.x + d.dx : pitch.x + pitch.w - d.dx, y: cy, vy: 0, offsets });
    });
  }
  return { ball: { x: pitch.x + pitch.w / 2, y: cy, vx: 0, vy: 0 }, rods, goalY: [cy, cy], touches: 0, time: 0, sweepAmp: 0, sweepPhase: 0 };
}

// ---- difficulty ramp -------------------------------------------------------------------------------------------

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 0..1: how far into the match we are. Driven by the leader (match point = 1) or the total goals, whichever is further. */
export function matchProgress(scores: readonly [number, number], target: number): number {
  const lead = Math.max(scores[0], scores[1]) / Math.max(1, target - 1);
  const total = (scores[0] + scores[1]) / Math.max(1, 2 * (target - 1));
  return clamp01(Math.max(lead, total));
}

/** Physics for the current progress and point mode: narrower goals, faster ball; turbo points kick harder. */
export function paramsFor(progress: number, mode: PointMode = 'classic', base: Params = DEFAULT_PARAMS): Params {
  const t = clamp01(progress);
  const turbo = mode === 'turbo' || mode === 'combo' ? TABLEFOOTBALL.turboFactor : 1;
  return {
    ...base,
    goalWidth: Math.round(lerp(TABLEFOOTBALL.goalWidth, TABLEFOOTBALL.goalWidthEnd, t)),
    ballMaxSpeed: Math.round(lerp(TABLEFOOTBALL.ballMaxSpeed, TABLEFOOTBALL.ballMaxSpeedEnd, t) * (turbo > 1 ? 1.1 : 1)),
    kickSpeed: Math.round(base.kickSpeed * turbo),
    kickSpeedMax: Math.round(base.kickSpeedMax * turbo),
  };
}

/** Speed of the serve for the current progress and point mode. */
export function serveSpeedFor(progress: number, mode: PointMode = 'classic'): number {
  const turbo = mode === 'turbo' || mode === 'combo' ? TABLEFOOTBALL.turboFactor : 1;
  return Math.round(lerp(TABLEFOOTBALL.serveSpeed, TABLEFOOTBALL.serveSpeedEnd, clamp01(progress)) * turbo);
}

/**
 * Mode of the next point: plain at first; then more and more often a special point. Turbo from the start of the ramp, moving
 * goals a bit later, and in the last third sometimes both.
 */
export function pickMode(progress: number, rnd: () => number = Math.random): PointMode {
  const from = TABLEFOOTBALL.modeFromProgress;
  if (progress < from) return 'classic';
  const chance = lerp(0.3, TABLEFOOTBALL.modeChanceEnd, clamp01((progress - from) / (1 - from)));
  if (rnd() >= chance) return 'classic';
  const roll = rnd();
  if (progress >= TABLEFOOTBALL.comboFromProgress && roll < 0.35) return 'combo';
  if (progress >= TABLEFOOTBALL.sweepFromProgress && roll < 0.7) return 'sweep';
  return 'turbo';
}

/** Set the goal sweep for a new point from its mode and the progress (amplitude grows with progress). */
export function setupPoint(s: TableFootballState, mode: PointMode, progress: number, rnd: () => number = Math.random, p: Params = DEFAULT_PARAMS): void {
  const moving = mode === 'sweep' || mode === 'combo';
  s.sweepAmp = moving ? lerp(TABLEFOOTBALL.sweepAmpStart, TABLEFOOTBALL.sweepAmpEnd, clamp01(progress)) : 0;
  // Goals move in opposite directions or together, whichever the dice say.
  s.sweepPhase = moving && rnd() < 0.5 ? Math.PI : 0;
  s.time = 0;
  updateGoals(s, p);
}

/** Centre of the goal mouths at the current time (player 0's, player 1's). */
export function updateGoals(s: TableFootballState, p: Params = DEFAULT_PARAMS): void {
  const cy = p.pitch.y + p.pitch.h / 2;
  const w = (2 * Math.PI) / TABLEFOOTBALL.sweepPeriodSec;
  s.goalY[0] = cy + s.sweepAmp * Math.sin(w * s.time);
  s.goalY[1] = cy + s.sweepAmp * Math.sin(w * s.time + s.sweepPhase);
}

export const figureY = (r: Rod, i: number): number => r.y + r.offsets[i];

/** Allowed range of a rod centre so every figure stays inside the pitch. */
export function rodBounds(r: Rod, p: Params = DEFAULT_PARAMS): { min: number; max: number } {
  const lo = Math.min(...r.offsets);
  const hi = Math.max(...r.offsets);
  return { min: p.pitch.y + p.figureRadius - lo, max: p.pitch.y + p.pitch.h - p.figureRadius - hi };
}

export function clampRod(r: Rod, y: number, p: Params = DEFAULT_PARAMS): number {
  const b = rodBounds(r, p);
  return Math.min(b.max, Math.max(b.min, y));
}

/** Ball to the centre, optionally moving toward `towards` (the player who conceded). */
export function serve(s: TableFootballState, towards: 0 | 1 | null, speed: number, p: Params = DEFAULT_PARAMS): void {
  const b = s.ball;
  b.x = p.pitch.x + p.pitch.w / 2;
  b.y = p.pitch.y + p.pitch.h / 2;
  b.vx = 0;
  b.vy = 0;
  s.touches = 0;
  if (towards === null) return;
  const angle = (Math.random() - 0.5) * 0.6;
  const dir = towards === 0 ? -1 : 1;
  b.vx = dir * Math.cos(angle) * speed;
  b.vy = Math.sin(angle) * speed;
}

/** Slide each rod toward its target centre (null = stay), speed-limited. Returns per-rod displacement; sets rod.vy. */
function planRodMoves(s: TableFootballState, dt: number, targets: readonly (number | null)[], p: Params): number[] {
  return s.rods.map((r, i) => {
    const t = targets[i];
    if (t === null || t === undefined || dt <= 0) {
      r.vy = 0;
      return 0;
    }
    let d = clampRod(r, t, p) - r.y;
    const max = p.rodMaxSpeed * dt;
    if (Math.abs(d) > max) d = Math.sign(d) * max;
    r.vy = d / dt;
    return d;
  });
}

/** Rods only (used while the ball is frozen, e.g. during countdowns). */
export function moveRods(s: TableFootballState, dtMs: number, targets: readonly (number | null)[], p: Params = DEFAULT_PARAMS): void {
  const moves = planRodMoves(s, Math.min(dtMs, 50) / 1000, targets, p);
  s.rods.forEach((r, i) => {
    r.y += moves[i];
    r.vy = 0;
  });
}

function limitSpeed(b: Ball, max: number): void {
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > max) {
    b.vx *= max / sp;
    b.vy *= max / sp;
  }
}

/** Ball vs one figure: push the ball out, reflect relative to the figure's velocity, and guarantee a minimum kick. */
function collide(s: TableFootballState, b: Ball, fx: number, fy: number, fvy: number, p: Params, fallbackDir: number): boolean {
  const minDist = p.ballRadius + p.figureRadius;
  let dx = b.x - fx;
  let dy = b.y - fy;
  let d = Math.hypot(dx, dy);
  if (d >= minDist) return false;
  if (d < 1e-6) {
    dx = fallbackDir;
    dy = 0;
    d = 1;
  }
  const nx = dx / d;
  const ny = dy / d;
  b.x = fx + nx * minDist;
  b.y = fy + ny * minDist;
  const vn = b.vx * nx + (b.vy - fvy) * ny;
  if (vn < 0) {
    const j = -(1 + p.figureRestitution) * vn;
    b.vx += j * nx;
    b.vy += j * ny;
    s.touches++;
    // The minimum kick grows with every touch of the rally.
    const kick = Math.min(p.kickSpeedMax, p.kickSpeed + s.touches * p.kickSpeedUp);
    const out = b.vx * nx + b.vy * ny;
    if (out < kick) {
      b.vx += (kick - out) * nx;
      b.vy += (kick - out) * ny;
    }
  }
  return true;
}

/** Walls and goal mouths. Returns the scorer when the ball centre crosses an end line inside a mouth. */
function walls(b: Ball, p: Params, goalY: readonly [number, number]): 0 | 1 | null {
  const { pitch, ballRadius: r, goalWidth, wallRestitution: e } = p;
  const left = pitch.x;
  const right = pitch.x + pitch.w;
  const top = pitch.y;
  const bottom = pitch.y + pitch.h;
  const inLeftMouth = Math.abs(b.y - goalY[0]) < goalWidth / 2;
  const inRightMouth = Math.abs(b.y - goalY[1]) < goalWidth / 2;

  if (b.y - r < top) {
    b.y = top + r;
    if (b.vy < 0) b.vy = -b.vy * e;
  } else if (b.y + r > bottom) {
    b.y = bottom - r;
    if (b.vy > 0) b.vy = -b.vy * e;
  }
  if (inLeftMouth) {
    if (b.x < left) return 1; // left goal is player 0's; player 1 scores
  } else if (b.x - r < left) {
    b.x = left + r;
    if (b.vx < 0) b.vx = -b.vx * e;
  }
  if (inRightMouth) {
    if (b.x > right) return 0;
  } else if (b.x + r > right) {
    b.x = right - r;
    if (b.vx > 0) b.vx = -b.vx * e;
  }
  return null;
}

/** Ball squeezed between a figure and a wall: figures only move along y, so slide it out along x. */
function unpin(b: Ball, fx: number, fy: number, p: Params): void {
  const min = p.ballRadius + p.figureRadius;
  if (Math.hypot(b.x - fx, b.y - fy) >= min - 0.01) return;
  const ax = Math.sqrt(Math.max(0, min * min - (b.y - fy) ** 2));
  const side = b.x >= fx ? 1 : -1;
  b.x = fx + side * ax;
}

/**
 * Advance the simulation by `dtMs`. Rods glide toward `targets` (one centre-y per rod, null = stay still),
 * then the ball is integrated in `substeps` slices with figure collisions, walls, friction and goal detection.
 */
export function step(s: TableFootballState, dtMs: number, targets: readonly (number | null)[], p: Params = DEFAULT_PARAMS): StepResult {
  const dt = Math.min(dtMs, 50) / 1000;
  const n = Math.max(1, Math.round(p.substeps));
  const h = dt / n;
  const moves = planRodMoves(s, dt, targets, p);
  const damp = Math.exp(-p.friction * h);
  const b = s.ball;
  for (let k = 0; k < n; k++) {
    s.time += h;
    updateGoals(s, p);
    s.rods.forEach((r, i) => (r.y += moves[i] / n));
    b.x += b.vx * h;
    b.y += b.vy * h;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > p.ballMinSpeed) {
      const f = Math.max(p.ballMinSpeed / sp, damp);
      b.vx *= f;
      b.vy *= f;
    }
    for (let pass = 0; pass < 2; pass++) {
      for (const r of s.rods) for (let i = 0; i < r.offsets.length; i++) collide(s, b, r.x, figureY(r, i), r.vy, p, r.player === 0 ? 1 : -1);
      const goal = walls(b, p, s.goalY);
      if (goal !== null) return { goal };
    }
    for (const r of s.rods) for (let i = 0; i < r.offsets.length; i++) unpin(b, r.x, figureY(r, i), p);
    limitSpeed(b, p.ballMaxSpeed);
  }
  return { goal: null };
}

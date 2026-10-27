import { FIELD, PONG, type FieldRect, type PongConfig } from './config';
import type { PlayerId } from '../../core/types';

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Paddle {
  /** Centre y. */
  y: number;
  /** Current vertical speed (px/s), used for spin. */
  vy: number;
}

/** Round block on the centre line. May sweep up and down. */
export interface Pillar {
  x: number;
  y: number;
  r: number;
  baseY: number;
  amp: number;
  periodSec: number;
  phase: number;
  /** Current vertical speed (px/s), so the ball bounces relative to a moving pillar. */
  vy: number;
}

export interface PongState {
  ball: Ball;
  /** Second ball in twin-ball points (null otherwise). */
  extra: Ball | null;
  paddles: [Paddle, Paddle];
  /** Paddle hits of the main ball since the serve (drives the speed-up). */
  hits: number;
  /** Paddle hits of the second ball. */
  extraHits: number;
  /** Obstacles for the current point. */
  pillars: Pillar[];
  /** Seconds since the serve (drives sweeping pillars). */
  time: number;
}

type Widen<T> = { -readonly [K in keyof T]: T[K] extends number ? number : T[K] };
export interface PongParams extends Widen<PongConfig> {
  field: FieldRect;
}

export const DEFAULT_PARAMS: PongParams = { ...PONG, field: FIELD };

const cy = (P: PongParams) => P.field.y + P.field.h / 2;
const cx = (P: PongParams) => P.field.x + P.field.w / 2;

/** x of the paddle centre for a player (0 left, 1 right). */
export function paddleX(p: PlayerId, P: PongParams = DEFAULT_PARAMS): number {
  return p === 0 ? P.paddleInset : 2 * cx(P) - P.paddleInset;
}

export function createState(P: PongParams = DEFAULT_PARAMS): PongState {
  return {
    ball: { x: cx(P), y: cy(P), vx: 0, vy: 0 },
    extra: null,
    paddles: [{ y: cy(P), vy: 0 }, { y: cy(P), vy: 0 }],
    hits: 0,
    extraHits: 0,
    pillars: [],
    time: 0,
  };
}

// ---- difficulty ramp -------------------------------------------------------------------------------------------

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 0..1: how far into the match we are. Driven by the leader (match point = 1) or the total points, whichever is further. */
export function matchProgress(scores: readonly [number, number], target: number): number {
  const lead = Math.max(scores[0], scores[1]) / Math.max(1, target - 1);
  const total = (scores[0] + scores[1]) / Math.max(1, 2 * (target - 1));
  return clamp01(Math.max(lead, total));
}

/** Physics for the current progress: smaller paddles, faster serve, higher top speed. */
export function paramsFor(progress: number, base: PongParams = DEFAULT_PARAMS): PongParams {
  const t = clamp01(progress);
  return {
    ...base,
    paddleH: Math.round(lerp(PONG.paddleH, PONG.paddleHEnd, t)),
    serveSpeed: Math.round(lerp(PONG.serveSpeed, PONG.serveSpeedEnd, t)),
    maxSpeed: Math.round(lerp(PONG.maxSpeed, PONG.maxSpeedEnd, t)),
  };
}

export interface RoundSetup {
  pillars: Pillar[];
  /** A second ball flies toward the other player. */
  twin: boolean;
}

function newPillar(P: PongParams, amp: number, phase: number): Pillar {
  const baseY = cy(P);
  return { x: cx(P), y: baseY + amp * Math.sin(phase), r: PONG.pillarRadius, baseY, amp, periodSec: PONG.pillarPeriodSec, phase, vy: 0 };
}

/**
 * Extras for the next point. Plain early on; then more and more often a pillar in the middle, later sweeping, later two of them,
 * and in the second half sometimes a second ball (never together with pillars, so a point is never a mess).
 */
export function pickRound(progress: number, rnd: () => number = Math.random, P: PongParams = DEFAULT_PARAMS): RoundSetup {
  const twinChance = progress < PONG.twinBallFromProgress ? 0 : lerp(0.2, PONG.twinBallChanceEnd, clamp01((progress - PONG.twinBallFromProgress) / (1 - PONG.twinBallFromProgress)));
  if (twinChance > 0 && rnd() < twinChance) return { pillars: [], twin: true };
  const from = PONG.pillarFromProgress;
  if (progress < from) return { pillars: [], twin: false };
  const chance = lerp(0.3, PONG.pillarChanceEnd, clamp01((progress - from) / (1 - from)));
  if (rnd() >= chance) return { pillars: [], twin: false };
  const roll = rnd();
  if (progress >= PONG.twinPillarFromProgress && roll < 0.4) return { pillars: [newPillar(P, PONG.pillarAmp, 0), newPillar(P, PONG.pillarAmp, Math.PI)], twin: false };
  if (progress >= PONG.movingFromProgress && roll < 0.75) return { pillars: [newPillar(P, PONG.pillarAmp, rnd() * Math.PI * 2)], twin: false };
  return { pillars: [newPillar(P, 0, 0)], twin: false };
}

/** Move sweeping pillars to time `t` (seconds since the serve). */
export function updatePillars(s: PongState, t: number, dt: number): void {
  for (const p of s.pillars) {
    if (p.amp === 0) continue;
    const y = p.baseY + p.amp * Math.sin((2 * Math.PI * t) / p.periodSec + p.phase);
    p.vy = dt > 0 ? (y - p.y) / dt : 0;
    p.y = y;
  }
}

/** Ball bounces off a pillar (relative to its sweep), pushed out so it never sits inside. Speed is kept (at least `minSpeed`). */
export function collidePillar(b: Ball, pl: Pillar, ballR: number, minSpeed = 0): boolean {
  const minDist = ballR + pl.r;
  let dx = b.x - pl.x;
  let dy = b.y - pl.y;
  let d = Math.hypot(dx, dy);
  if (d >= minDist) return false;
  if (d < 1e-6) {
    dx = b.vx >= 0 ? -1 : 1;
    dy = 0;
    d = 1;
  }
  const nx = dx / d;
  const ny = dy / d;
  b.x = pl.x + nx * minDist;
  b.y = pl.y + ny * minDist;
  const vn = b.vx * nx + (b.vy - pl.vy) * ny;
  if (vn < 0) {
    const before = Math.hypot(b.vx, b.vy);
    b.vx += -2 * vn * nx;
    b.vy += -2 * vn * ny;
    const sp = Math.hypot(b.vx, b.vy);
    const want = Math.max(minSpeed, before);
    if (sp > 1e-6 && sp !== want) {
      b.vx *= want / sp;
      b.vy *= want / sp;
    }
  }
  return true;
}

export const clampPaddleY = (y: number, P: PongParams = DEFAULT_PARAMS): number =>
  Math.max(P.field.y + P.paddleH / 2, Math.min(P.field.y + P.field.h - P.paddleH / 2, y));

export const ballSpeed = (b: Ball): number => Math.hypot(b.vx, b.vy);

/** Put the ball in the centre; with speed > 0 launch it toward `toward` (the player who conceded) at a gentle random angle. */
export function serve(
  s: PongState,
  toward: PlayerId | null,
  speed: number,
  rnd: () => number = Math.random,
  P: PongParams = DEFAULT_PARAMS,
  twin = false,
  placeSide: PlayerId | null = toward,
): void {
  // With pillars the ball starts beside the middle, on the receiving side, so it never starts inside a pillar.
  const side = placeSide === null ? 0 : placeSide === 0 ? -1 : 1;
  const gap = s.pillars.length ? PONG.pillarRadius + P.ballRadius + 90 : 0;
  s.ball.x = cx(P) + side * gap;
  s.ball.y = cy(P) + (twin ? -90 : 0);
  s.hits = 0;
  s.extraHits = 0;
  if (toward !== null) s.time = 0;
  s.extra = twin ? { x: cx(P), y: cy(P) + 90, vx: 0, vy: 0 } : null;
  if (toward === null || speed <= 0) {
    s.ball.vx = 0;
    s.ball.vy = 0;
    return;
  }
  const a = ((rnd() * 2 - 1) * 25 * Math.PI) / 180;
  const dir = toward === 0 ? -1 : 1;
  s.ball.vx = dir * speed * Math.cos(a);
  s.ball.vy = speed * Math.sin(a);
  if (s.extra) {
    // The twin flies the other way, so both players have a ball to deal with.
    const a2 = ((rnd() * 2 - 1) * 25 * Math.PI) / 180;
    s.extra.vx = -dir * speed * Math.cos(a2);
    s.extra.vy = speed * Math.sin(a2);
  }
}

/** Chase the finger targets (y, or null = stay) with a speed cap. */
export function movePaddles(s: PongState, dtMs: number, targets: readonly (number | null)[], P: PongParams = DEFAULT_PARAMS): void {
  const maxD = (P.paddleMaxSpeed * dtMs) / 1000;
  s.paddles.forEach((pd, i) => {
    const t = targets[i];
    if (t === null || t === undefined) {
      pd.vy = 0;
      return;
    }
    const goal = clampPaddleY(t, P);
    const d = Math.max(-maxD, Math.min(maxD, goal - pd.y));
    pd.y += d;
    pd.vy = dtMs > 0 ? (d * 1000) / dtMs : 0;
  });
}

/** Where on the paddle the ball hit, -1 (top tip) .. 1 (bottom tip). */
export const hitOffset = (ballY: number, paddleY: number, P: PongParams = DEFAULT_PARAMS): number =>
  Math.max(-1, Math.min(1, (ballY - paddleY) / (P.paddleH / 2 + P.ballRadius * 0.5)));

export interface StepResult {
  /** Player who scored, if any. */
  goal: PlayerId | null;
  /** Paddle that was hit this step. */
  hit: PlayerId | null;
  /** True if a top/bottom wall was hit. */
  wall: boolean;
}

/** Spin: a paddle that is sliding when it hits drags the ball along; the angle stays playable. */
export function withSpin(vy: number, paddleVy: number, speed: number, P: PongParams = DEFAULT_PARAMS): number {
  const v = vy + P.spin * Math.max(-P.spinCap, Math.min(P.spinCap, paddleVy));
  const vyMax = speed * Math.sin((P.maxAngleDeg * Math.PI) / 180);
  return Math.max(-vyMax, Math.min(vyMax, v));
}

/** Advance one ball by one substep. Returns the scoring player, if the ball left the field. */
function stepBall(s: PongState, b: Ball, extra: boolean, dt: number, res: StepResult, P: PongParams): PlayerId | null {
  const r = P.ballRadius;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  // top / bottom walls
  const top = P.field.y + r;
  const bot = P.field.y + P.field.h - r;
  if (b.y < top) {
    b.y = top + (top - b.y);
    b.vy = Math.abs(b.vy);
    res.wall = true;
  } else if (b.y > bot) {
    b.y = bot - (b.y - bot);
    b.vy = -Math.abs(b.vy);
    res.wall = true;
  }
  // pillars in the middle
  for (const pl of s.pillars) if (collidePillar(b, pl, r)) res.wall = true;
  // paddles
  for (const p of [0, 1] as const) {
    const toward = p === 0 ? b.vx < 0 : b.vx > 0;
    if (!toward) continue;
    const px = paddleX(p, P);
    const dir = p === 0 ? 1 : -1; // direction the ball leaves in
    const face = px + dir * (P.paddleW / 2); // surface that faces the field
    const reach = dir * (b.x - r - face) <= 0; // ball's near edge has touched/passed the face
    const notBehind = dir * (b.x - (px - dir * (P.paddleW / 2))) > 0; // ball centre has not gone past the back
    const pd = s.paddles[p];
    if (reach && notBehind && Math.abs(b.y - pd.y) <= P.paddleH / 2 + r * 0.6) {
      const off = hitOffset(b.y, pd.y, P);
      const hits = extra ? ++s.extraHits : ++s.hits;
      const speed = Math.min(P.maxSpeed, P.serveSpeed + hits * P.speedUp);
      const ang = (off * P.maxBounceDeg * Math.PI) / 180;
      const vy = withSpin(speed * Math.sin(ang), pd.vy, speed, P);
      b.vy = vy;
      b.vx = dir * Math.sqrt(Math.max(0, speed * speed - vy * vy));
      b.x = face + dir * r;
      res.hit = p;
    }
  }
  // goals: ball completely beyond a field end
  if (b.x < P.field.x - r) return 1;
  if (b.x > P.field.x + P.field.w + r) return 0;
  return null;
}

/** Advance the simulation by dtMs. */
export function step(s: PongState, dtMs: number, targets: readonly (number | null)[], P: PongParams = DEFAULT_PARAMS): StepResult {
  const res: StepResult = { goal: null, hit: null, wall: false };
  const dt = Math.min(dtMs, 50) / 1000 / P.substeps;
  for (let i = 0; i < P.substeps; i++) {
    s.time += dt;
    updatePillars(s, s.time, dt);
    movePaddles(s, dt * 1000, targets, P);
    const g = stepBall(s, s.ball, false, dt, res, P);
    const g2 = s.extra ? stepBall(s, s.extra, true, dt, res, P) : null;
    const goal = g ?? g2;
    if (goal !== null) {
      res.goal = goal;
      return res;
    }
  }
  return res;
}

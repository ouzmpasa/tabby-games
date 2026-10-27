import type { PlayerId } from '../../core/types';
import { CENTER, SUMO, type SumoConfig } from './config';

type Widen<T> = { -readonly [K in keyof T]: T[K] extends number ? number : T[K] };

export interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** True once the blob has been pushed off the edge; it then slides and falls with no control. */
  falling: boolean;
  /** Seconds since it started falling. */
  fallT: number;
  /** Dash charge 0..1 (finger held still near the blob). 1 = ready: swipe away to dash. */
  charge: number;
  /** Seconds of dash left (0 = not dashing). */
  dashT: number;
  /** Wobble 0..1: grows with every hit taken, makes the blob lighter (shoved further). */
  damage: number;
}

/** Hazards of a round: ICE patch in the middle, two BUMPER posts, or both. */
export type Hazard = 'plain' | 'ice' | 'bumpers' | 'both';

export interface SumoState {
  blobs: [Blob, Blob];
  /** Seconds since the round started. */
  time: number;
  /** Current platform radius. */
  platform: number;
  /** Set once a blob fell off. */
  loser: PlayerId | null;
  hazard: Hazard;
}

export interface Target {
  x: number;
  y: number;
}
export type Targets = [Target | null, Target | null];

export type Params = Widen<
  Pick<
    SumoConfig,
    | 'blobRadius' | 'platformStart' | 'platformMin' | 'shrinkDelaySec' | 'shrinkPerSec' | 'blobMaxSpeed' | 'chaseGain'
    | 'blobAccel' | 'idleBrake' | 'restitution' | 'dashBonus' | 'edgeForgiveness' | 'substeps' | 'startOffset'
    | 'damagePerBump' | 'damageLight' | 'iceRadius' | 'iceAccel' | 'iceBrake' | 'bumperRadius' | 'bumperOffset' | 'bumperKick'
    | 'chargeSec' | 'chargeRadius' | 'dashTriggerDist' | 'dashSec' | 'dashSpeedFactor'
  >
>;
export const DEFAULT_PARAMS: Params = SUMO;

const newBlob = (x: number, y: number): Blob => ({ x, y, vx: 0, vy: 0, falling: false, fallT: 0, charge: 0, dashT: 0, damage: 0 });

export function createState(p: Params = DEFAULT_PARAMS, hazard: Hazard = 'plain'): SumoState {
  return {
    blobs: [newBlob(CENTER.x - p.startOffset, CENTER.y), newBlob(CENTER.x + p.startOffset, CENTER.y)],
    time: 0,
    platform: p.platformStart,
    loser: null,
    hazard,
  };
}

export function reset(s: SumoState, p: Params = DEFAULT_PARAMS, hazard: Hazard = 'plain'): void {
  Object.assign(s, createState(p, hazard));
}

// ---- difficulty ramp -------------------------------------------------------------------------------------------

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 0..1: how far into the match we are. Driven by the leader (match point = 1) or the total rounds, whichever is further. */
export function matchProgress(scores: readonly [number, number], target: number): number {
  const lead = Math.max(scores[0], scores[1]) / Math.max(1, target - 1);
  const total = (scores[0] + scores[1]) / Math.max(1, 2 * (target - 1));
  return clamp01(Math.max(lead, total));
}

/** Parameters for the current progress: a smaller platform that crumbles sooner and faster. */
export function paramsFor(progress: number, base: Params = DEFAULT_PARAMS): Params {
  const t = clamp01(progress);
  const platformStart = Math.round(lerp(SUMO.platformStart, SUMO.platformStartEnd, t));
  return {
    ...base,
    platformStart,
    shrinkDelaySec: lerp(SUMO.shrinkDelaySec, SUMO.shrinkDelayEnd, t),
    shrinkPerSec: lerp(SUMO.shrinkPerSec, SUMO.shrinkPerSecEnd, t),
    startOffset: Math.min(SUMO.startOffset, Math.round(platformStart * SUMO.startOffsetFrac)),
  };
}

/** Hazard of the next round: plain at first, then more and more often ice, bumpers and (late) both. */
export function pickHazard(progress: number, rnd: () => number = Math.random): Hazard {
  const from = SUMO.hazardFromProgress;
  if (progress < from) return 'plain';
  const chance = lerp(0.4, SUMO.hazardChanceEnd, clamp01((progress - from) / (1 - from)));
  if (rnd() >= chance) return 'plain';
  const roll = rnd();
  if (progress >= SUMO.bothFromProgress && roll < 0.3) return 'both';
  if (progress >= SUMO.bumpersFromProgress && roll < 0.65) return 'bumpers';
  return 'ice';
}

export const hasIce = (h: Hazard): boolean => h === 'ice' || h === 'both';
export const hasBumpers = (h: Hazard): boolean => h === 'bumpers' || h === 'both';

/** The two bumper posts (above and below the middle). */
export function bumperPositions(p: Params = DEFAULT_PARAMS): { x: number; y: number }[] {
  return [
    { x: CENTER.x, y: CENTER.y - p.bumperOffset },
    { x: CENTER.x, y: CENTER.y + p.bumperOffset },
  ];
}

/** True when the blob is on the ice patch. */
export const onIce = (b: { x: number; y: number }, p: Params = DEFAULT_PARAMS): boolean => Math.hypot(b.x - CENTER.x, b.y - CENTER.y) < p.iceRadius;

/** Blob vs a bumper post: push out, bounce, and make sure it leaves at least `bumperKick` fast. */
export function collideBumper(b: Blob, post: { x: number; y: number }, p: Params = DEFAULT_PARAMS): boolean {
  const minD = p.blobRadius + p.bumperRadius;
  let dx = b.x - post.x;
  let dy = b.y - post.y;
  let d = Math.hypot(dx, dy);
  if (d >= minD) return false;
  if (d < 1e-6) {
    dx = 1;
    dy = 0;
    d = 1;
  }
  const nx = dx / d;
  const ny = dy / d;
  b.x = post.x + nx * minD;
  b.y = post.y + ny * minD;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < p.bumperKick) {
    const add = p.bumperKick - vn;
    b.vx += nx * add;
    b.vy += ny * add;
  }
  return true;
}

/** Platform radius after `t` seconds: constant for a while, then shrinks, never below the cap. */
export function platformRadius(t: number, p: Params = DEFAULT_PARAMS): number {
  return Math.max(p.platformMin, p.platformStart - Math.max(0, t - p.shrinkDelaySec) * p.shrinkPerSec);
}

/** Distance of a blob's centre from the platform centre. */
export const distFromCenter = (b: { x: number; y: number }): number => Math.hypot(b.x - CENTER.x, b.y - CENTER.y);

/** Velocity the blob wants right now: toward the finger, proportional to the distance, capped. Zero without a finger. */
export function desiredVelocity(b: Blob, t: Target | null, p: Params = DEFAULT_PARAMS, speedMul = 1): { vx: number; vy: number } {
  if (!t) return { vx: 0, vy: 0 };
  const dx = t.x - b.x;
  const dy = t.y - b.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return { vx: 0, vy: 0 };
  const sp = Math.min(p.blobMaxSpeed * speedMul, d * p.chaseGain * speedMul);
  return { vx: (dx / d) * sp, vy: (dy / d) * sp };
}

/** Move the velocity toward `want` by at most `maxDv`. */
function approach(b: Blob, want: { vx: number; vy: number }, maxDv: number): void {
  const dx = want.vx - b.vx;
  const dy = want.vy - b.vy;
  const d = Math.hypot(dx, dy);
  if (d <= maxDv || d === 0) {
    b.vx = want.vx;
    b.vy = want.vy;
  } else {
    b.vx += (dx / d) * maxDv;
    b.vy += (dy / d) * maxDv;
  }
}

/** Equal-mass collision with restitution and a speed bonus. Returns true when the blobs touched. */
export function collide(a: Blob, b: Blob, p: Params = DEFAULT_PARAMS): boolean {
  const minD = p.blobRadius * 2;
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let d = Math.hypot(dx, dy);
  if (d >= minD) return false;
  if (d < 1e-6) {
    dx = 1;
    dy = 0;
    d = 1;
  }
  const nx = dx / d;
  const ny = dy / d;
  const push = (minD - d) / 2;
  a.x -= nx * push;
  a.y -= ny * push;
  b.x += nx * push;
  b.y += ny * push;
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny; // < 0 means approaching
  if (vn < 0) {
    const boost = 1 + p.dashBonus * Math.min(1, -vn / (2 * p.blobMaxSpeed));
    // Wobbly blobs are lighter: they take more of the impulse (inverse mass 1 for a sturdy blob).
    const ia = 1 + p.damageLight * (a.damage ?? 0);
    const ib = 1 + p.damageLight * (b.damage ?? 0);
    const J = (-(1 + p.restitution) * vn * boost) / (ia + ib);
    a.vx -= J * ia * nx;
    a.vy -= J * ia * ny;
    b.vx += J * ib * nx;
    b.vy += J * ib * ny;
    // Both blobs get wobblier from a solid bump; the harder it is, the more.
    const hit = Math.min(1.5, Math.max(0.3, -vn / p.blobMaxSpeed)) * p.damagePerBump;
    a.damage = Math.min(1, (a.damage ?? 0) + hit);
    b.damage = Math.min(1, (b.damage ?? 0) + hit);
  }
  return true;
}

export interface StepResult {
  /** The blob that just went over the edge this step. */
  fell: PlayerId | null;
  /** Blobs touched during this step. */
  bumped: boolean;
  /** Fastest closing speed of a bump this step (px/s). */
  bumpSpeed: number;
  /** A blob hit a bumper post this step. */
  post: boolean;
  /** Players whose blob started a dash this step. */
  dashed: PlayerId[];
}

/** Charge / dash bookkeeping for one blob (see config: chargeSec, dashSec). Returns true when a dash starts. */
export function updateCharge(b: Blob, t: Target | null, h: number, p: Params = DEFAULT_PARAMS): boolean {
  if (b.falling || !t) {
    b.charge = Math.max(0, b.charge - 2 * h);
    b.dashT = Math.max(0, b.dashT - h);
    return false;
  }
  if (b.dashT > 0) {
    b.dashT = Math.max(0, b.dashT - h);
    return false;
  }
  const dist = Math.hypot(t.x - b.x, t.y - b.y);
  const speed = Math.hypot(b.vx, b.vy);
  if (dist < p.chargeRadius) {
    if (speed < 220) b.charge = Math.min(1, b.charge + h / p.chargeSec);
  } else if (b.charge >= 1 && dist > p.dashTriggerDist) {
    b.dashT = p.dashSec;
    b.charge = 0;
    return true;
  } else {
    b.charge = Math.max(0, b.charge - 1.2 * h);
  }
  return false;
}

/** Advance the simulation by `dtMs`. Targets are the finger positions (null = no finger). */
export function step(s: SumoState, dtMs: number, targets: Targets, p: Params = DEFAULT_PARAMS): StepResult {
  const res: StepResult = { fell: null, bumped: false, bumpSpeed: 0, post: false, dashed: [] };
  const dt = Math.min(dtMs, 50) / 1000;
  const n = p.substeps;
  const h = dt / n;
  const [b0, b1] = s.blobs;
  for (let i = 0; i < n; i++) {
    s.time += h;
    if (s.loser === null) s.platform = platformRadius(s.time, p);
    s.blobs.forEach((b, k) => {
      if (b.falling) {
        b.fallT += h;
        const damp = Math.max(0, 1 - 1.5 * h);
        b.vx *= damp;
        b.vy *= damp;
      } else {
        if (updateCharge(b, targets[k], h, p)) res.dashed.push(k as PlayerId);
        const slip = s.hazard === 'ice' || s.hazard === 'both';
        const ice = slip && onIce(b, p);
        const dashing = b.dashT > 0;
        if (targets[k]) {
          approach(b, desiredVelocity(b, targets[k], p, dashing ? p.dashSpeedFactor : 1), p.blobAccel * (dashing ? 3 : 1) * (ice ? p.iceAccel : 1) * h);
        } else {
          approach(b, { vx: 0, vy: 0 }, p.idleBrake * (ice ? p.iceBrake : 1) * h);
        }
      }
      b.x += b.vx * h;
      b.y += b.vy * h;
    });
    if (!b0.falling && !b1.falling) {
      const closing = -((b1.vx - b0.vx) * (b1.x - b0.x) + (b1.vy - b0.vy) * (b1.y - b0.y)) / Math.max(1, Math.hypot(b1.x - b0.x, b1.y - b0.y));
      if (collide(b0, b1, p)) {
        res.bumped = true;
        res.bumpSpeed = Math.max(res.bumpSpeed, closing);
      }
    }
    if (hasBumpers(s.hazard)) {
      for (const post of bumperPositions(p)) {
        for (const b of s.blobs) if (!b.falling && collideBumper(b, post, p)) res.post = true;
      }
    }
    if (s.loser === null) {
      // If both are over the edge in the same instant, the one that is farther out loses.
      const out = s.blobs.map((b, k) => ({ k, over: distFromCenter(b) - s.platform * p.edgeForgiveness })).filter((o) => o.over > 0);
      if (out.length) {
        out.sort((a, c) => c.over - a.over);
        const k = out[0].k as PlayerId;
        s.blobs[k].falling = true;
        s.loser = k;
        res.fell = k;
      }
    }
  }
  return res;
}

import { AIRHOCKEY, RINK, type RinkRect } from './config';

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Round post the puck bounces off. Mallets cannot enter it. May sweep up and down the centre line. */
export interface Bumper {
  x: number;
  y: number;
  r: number;
  /** Centre of the sweep, amplitude (0 = static), period and phase offset. */
  baseY: number;
  amp: number;
  periodSec: number;
  phase: number;
  /** Current vertical speed (px/s), so the puck is hit relative to a moving bumper. */
  vy: number;
}

export interface AirHockeyState {
  puck: Body;
  mallets: [Body, Body];
  /** Obstacles for the current point (empty on a plain table). */
  bumpers: Bumper[];
  /** Mallet hits since the serve (drives the rally speed-up). */
  rally: number;
  /** Seconds since the serve (drives sweeping bumpers). */
  time: number;
}

export interface Target {
  x: number;
  y: number;
}

export interface Params {
  rink: RinkRect;
  puckRadius: number;
  malletRadius: number;
  goalWidth: number;
  puckMaxSpeed: number;
  wallRestitution: number;
  malletRestitution: number;
  friction: number;
  malletMaxSpeed: number;
  substeps: number;
  rallyBaseSpeed: number;
  rallySpeedUp: number;
  rallyMaxSpeed: number;
  bumperKick: number;
}

export const DEFAULT_PARAMS: Params = { ...AIRHOCKEY, rink: RINK };

/** Result of a step: the player who scored (puck went into the OTHER player's goal), or null. */
export interface StepResult {
  goal: 0 | 1 | null;
  /** True if the puck hit a mallet or a bumper during this step (for sound). */
  hit?: boolean;
}

const body = (x: number, y: number): Body => ({ x, y, vx: 0, vy: 0 });

/** Puck at the centre; player 0 (left end) and player 1 (right end) mallets near their goals. */
export function createState(p: Params = DEFAULT_PARAMS): AirHockeyState {
  const cx = p.rink.x + p.rink.w / 2;
  const cy = p.rink.y + p.rink.h / 2;
  const off = p.rink.w / 4;
  return { puck: body(cx, cy), mallets: [body(cx - off, cy), body(cx + off, cy)], bumpers: [], rally: 0, time: 0 };
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

/** Physics parameters for the current progress: the goals get narrower. */
export function paramsFor(progress: number, base: Params = DEFAULT_PARAMS): Params {
  return { ...base, goalWidth: Math.round(lerp(AIRHOCKEY.goalWidth, AIRHOCKEY.goalWidthEnd, clamp01(progress))) };
}

export const serveSpeedFor = (progress: number): number => Math.round(lerp(AIRHOCKEY.serveSpeed, AIRHOCKEY.serveSpeedEnd, clamp01(progress)));

function newBumper(p: Params, amp: number, phase: number, baseY: number): Bumper {
  const x = p.rink.x + p.rink.w / 2;
  return { x, y: baseY + amp * Math.sin(phase), r: AIRHOCKEY.bumperRadius, baseY, amp, periodSec: AIRHOCKEY.bumperPeriodSec, phase, vy: 0 };
}

/**
 * Obstacles for the next point. Plain table early on; then more and more often a post in the middle, later one that sweeps up
 * and down, and in the last third sometimes two posts sweeping in opposite directions.
 */
export function pickBumpers(progress: number, rnd: () => number = Math.random, p: Params = DEFAULT_PARAMS): Bumper[] {
  const from = AIRHOCKEY.bumperFromProgress;
  if (progress < from) return [];
  const chance = lerp(0.3, AIRHOCKEY.bumperChanceEnd, clamp01((progress - from) / (1 - from)));
  if (rnd() >= chance) return [];
  const cy = p.rink.y + p.rink.h / 2;
  const roll = rnd();
  if (progress >= AIRHOCKEY.twinFromProgress && roll < 0.4) return [newBumper(p, AIRHOCKEY.bumperAmp, 0, cy), newBumper(p, AIRHOCKEY.bumperAmp, Math.PI, cy)];
  if (progress >= AIRHOCKEY.movingFromProgress && roll < 0.75) return [newBumper(p, AIRHOCKEY.bumperAmp, rnd() * Math.PI * 2, cy)];
  return [newBumper(p, 0, 0, cy)];
}

/** Move sweeping bumpers to time `t` (seconds since the serve). */
export function updateBumpers(s: AirHockeyState, t: number, dt: number): void {
  for (const b of s.bumpers) {
    if (b.amp === 0) continue;
    const y = b.baseY + b.amp * Math.sin((2 * Math.PI * t) / b.periodSec + b.phase);
    b.vy = dt > 0 ? (y - b.y) / dt : 0;
    b.y = y;
  }
}

/** Slide mallets out of the bumpers (mallets are not allowed on a post). */
export function keepOffBumpers(s: AirHockeyState, p: Params = DEFAULT_PARAMS): void {
  for (const b of s.bumpers) {
    for (const m of s.mallets) {
      const min = p.malletRadius + b.r;
      let dx = m.x - b.x;
      let dy = m.y - b.y;
      let d = Math.hypot(dx, dy);
      if (d >= min) continue;
      if (d < 1e-6) {
        dx = m === s.mallets[0] ? -1 : 1;
        dy = 0;
        d = 1;
      }
      m.x = b.x + (dx / d) * min;
      m.y = b.y + (dy / d) * min;
    }
  }
}

/**
 * Put the puck at the centre, optionally moving toward `towards` (the player who conceded). With bumpers on the table the
 * puck starts beside the middle, on the side of `placeSide`, so it never starts inside a post. Also starts a new rally.
 */
export function serve(
  s: AirHockeyState,
  towards: 0 | 1 | null,
  speed: number,
  p: Params = DEFAULT_PARAMS,
  placeSide: 0 | 1 | null = towards,
): void {
  const side = placeSide === null ? 0 : placeSide === 0 ? -1 : 1;
  const gap = s.bumpers.length ? AIRHOCKEY.bumperRadius + p.puckRadius + 90 : 0;
  s.puck.x = p.rink.x + p.rink.w / 2 + side * gap;
  s.puck.y = p.rink.y + p.rink.h / 2;
  s.puck.vx = 0;
  s.puck.vy = 0;
  s.rally = 0;
  if (towards !== null) s.time = 0;
  if (towards === null) return;
  const angle = (Math.random() - 0.5) * 0.6;
  const dir = towards === 0 ? -1 : 1;
  s.puck.vx = dir * Math.cos(angle) * speed;
  s.puck.vy = Math.sin(angle) * speed;
}

/** Allowed region of a mallet centre: its own half, inside the rink walls. */
export function malletBounds(player: 0 | 1, p: Params = DEFAULT_PARAMS) {
  const { rink, malletRadius: r } = p;
  const cx = rink.x + rink.w / 2;
  return {
    minX: player === 0 ? rink.x + r : cx + r,
    maxX: player === 0 ? cx - r : rink.x + rink.w - r,
    minY: rink.y + r,
    maxY: rink.y + rink.h - r,
  };
}

export function clampMallet(player: 0 | 1, x: number, y: number, p: Params = DEFAULT_PARAMS): Target {
  const b = malletBounds(player, p);
  return { x: Math.min(b.maxX, Math.max(b.minX, x)), y: Math.min(b.maxY, Math.max(b.minY, y)) };
}

/**
 * Moves each mallet toward its target (clamped to its half, speed-limited) over `dt` seconds.
 * Returns the per-mallet displacement so substeps can interpolate. Mallet velocity is set here.
 */
export function planMalletMoves(s: AirHockeyState, dt: number, targets: readonly (Target | null)[], p: Params): Target[] {
  return s.mallets.map((m, i) => {
    const t = targets[i];
    if (!t || dt <= 0) {
      m.vx = 0;
      m.vy = 0;
      return { x: 0, y: 0 };
    }
    const c = clampMallet(i as 0 | 1, t.x, t.y, p);
    let dx = c.x - m.x;
    let dy = c.y - m.y;
    const max = p.malletMaxSpeed * dt;
    const d = Math.hypot(dx, dy);
    if (d > max) {
      dx *= max / d;
      dy *= max / d;
    }
    m.vx = dx / dt;
    m.vy = dy / dt;
    return { x: dx, y: dy };
  });
}

/** Mallets only (used during countdowns while the puck is frozen). */
export function moveMallets(s: AirHockeyState, dtMs: number, targets: readonly (Target | null)[], p: Params = DEFAULT_PARAMS): void {
  const moves = planMalletMoves(s, dtMs / 1000, targets, p);
  s.mallets.forEach((m, i) => {
    m.x += moves[i].x;
    m.y += moves[i].y;
    m.vx = 0;
    m.vy = 0;
  });
  keepOffBumpers(s, p);
}

function limitSpeed(b: Body, max: number): void {
  const sp = Math.hypot(b.vx, b.vy);
  if (sp > max) {
    b.vx *= max / sp;
    b.vy *= max / sp;
  }
}

/**
 * Puck vs one mallet: push the puck out of the mallet and reflect it relative to the mallet's velocity.
 * Returns true on an actual hit (the puck was moving into the mallet), which also feeds the rally speed-up.
 */
function collide(s: AirHockeyState, puck: Body, m: Body, p: Params, fallbackDir: { x: number; y: number }): boolean {
  const minDist = p.puckRadius + p.malletRadius;
  let dx = puck.x - m.x;
  let dy = puck.y - m.y;
  let d = Math.hypot(dx, dy);
  if (d >= minDist) return false;
  let hit = false;
  if (d < 1e-6) {
    dx = fallbackDir.x;
    dy = fallbackDir.y;
    d = 1;
  }
  const nx = dx / d;
  const ny = dy / d;
  puck.x = m.x + nx * minDist;
  puck.y = m.y + ny * minDist;
  const vn = (puck.vx - m.vx) * nx + (puck.vy - m.vy) * ny;
  if (vn < 0) {
    const j = -(1 + p.malletRestitution) * vn;
    puck.vx += j * nx;
    puck.vy += j * ny;
    s.rally++;
    // Rally speed-up: the puck leaves the mallet at least this fast, growing with every hit.
    const floor = Math.min(p.rallyMaxSpeed, p.rallyBaseSpeed + s.rally * p.rallySpeedUp);
    const sp = Math.hypot(puck.vx, puck.vy);
    if (sp < floor) {
      const ux = sp > 1e-6 ? puck.vx / sp : nx;
      const uy = sp > 1e-6 ? puck.vy / sp : ny;
      puck.vx = ux * floor;
      puck.vy = uy * floor;
    }
    hit = true;
  }
  return hit;
}

/** Puck vs a bumper: elastic bounce off the post (relative to its sweep) with a minimum kick so it never just dies there. */
function collideBumper(puck: Body, b: Bumper, p: Params): boolean {
  const minDist = p.puckRadius + b.r;
  let dx = puck.x - b.x;
  let dy = puck.y - b.y;
  let d = Math.hypot(dx, dy);
  if (d >= minDist) return false;
  if (d < 1e-6) {
    dx = 1;
    dy = 0;
    d = 1;
  }
  const nx = dx / d;
  const ny = dy / d;
  puck.x = b.x + nx * minDist;
  puck.y = b.y + ny * minDist;
  const vn = puck.vx * nx + (puck.vy - b.vy) * ny;
  if (vn < 0) {
    puck.vx += -2 * vn * nx;
    puck.vy += -2 * vn * ny;
    const out = puck.vx * nx + puck.vy * ny;
    if (out < p.bumperKick) {
      puck.vx += (p.bumperKick - out) * nx;
      puck.vy += (p.bumperKick - out) * ny;
    }
    return true;
  }
  return false;
}

/** Walls and goal mouths. Returns the scorer (0/1) when the puck centre crosses an end line inside a mouth. */
function walls(puck: Body, p: Params): 0 | 1 | null {
  const { rink, puckRadius: r, goalWidth, wallRestitution: e } = p;
  const left = rink.x;
  const right = rink.x + rink.w;
  const top = rink.y;
  const bottom = rink.y + rink.h;
  const cy = rink.y + rink.h / 2;
  const inMouth = Math.abs(puck.y - cy) < goalWidth / 2;

  if (puck.y - r < top) {
    puck.y = top + r;
    if (puck.vy < 0) puck.vy = -puck.vy * e;
  } else if (puck.y + r > bottom) {
    puck.y = bottom - r;
    if (puck.vy > 0) puck.vy = -puck.vy * e;
  }
  if (inMouth) {
    // Open end: scored once the centre is past the end line.
    if (puck.x < left) return 1; // left goal is player 0's; player 1 scores
    if (puck.x > right) return 0;
  } else if (puck.x - r < left) {
    puck.x = left + r;
    if (puck.vx < 0) puck.vx = -puck.vx * e;
  } else if (puck.x + r > right) {
    puck.x = right - r;
    if (puck.vx > 0) puck.vx = -puck.vx * e;
  }
  return null;
}

function unpin(pk: Body, m: Body, p: Params): void {
  const min = p.puckRadius + p.malletRadius;
  if (Math.hypot(pk.x - m.x, pk.y - m.y) >= min - 0.01) return;
  const { rink, puckRadius: r } = p;
  const cands: Target[] = [];
  const dy = pk.y - m.y;
  const dx = pk.x - m.x;
  const ax = Math.sqrt(Math.max(0, min * min - dy * dy));
  const ay = Math.sqrt(Math.max(0, min * min - dx * dx));
  cands.push({ x: m.x + ax, y: pk.y }, { x: m.x - ax, y: pk.y }, { x: pk.x, y: m.y + ay }, { x: pk.x, y: m.y - ay });
  let best: Target | null = null;
  let bestD = Infinity;
  for (const c of cands) {
    if (c.x < rink.x + r || c.x > rink.x + rink.w - r || c.y < rink.y + r || c.y > rink.y + rink.h - r) continue;
    const d = Math.hypot(c.x - pk.x, c.y - pk.y);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  if (best) {
    pk.x = best.x;
    pk.y = best.y;
  }
}

/**
 * Advance the simulation by `dtMs`. Mallets glide toward `targets` (null = stay still) in their own half,
 * then the puck is integrated in `substeps` slices with mallet collisions, walls, friction and goal detection.
 */
export function step(
  s: AirHockeyState,
  dtMs: number,
  targets: readonly (Target | null)[],
  p: Params = DEFAULT_PARAMS,
): StepResult {
  const dt = Math.min(dtMs, 50) / 1000; // never simulate a huge hitch in one go
  const n = Math.max(1, Math.round(p.substeps));
  const h = dt / n;
  const moves = planMalletMoves(s, dt, targets, p);
  const damp = Math.exp(-p.friction * h);
  let hit = false;
  for (let k = 0; k < n; k++) {
    s.time += h;
    updateBumpers(s, s.time, h);
    s.mallets.forEach((m, i) => {
      m.x += moves[i].x / n;
      m.y += moves[i].y / n;
    });
    keepOffBumpers(s, p);
    const pk = s.puck;
    pk.x += pk.vx * h;
    pk.y += pk.vy * h;
    pk.vx *= damp;
    pk.vy *= damp;
    for (let pass = 0; pass < 2; pass++) {
      s.mallets.forEach((m, i) => {
        if (collide(s, pk, m, p, { x: i === 0 ? 1 : -1, y: 0 })) hit = true;
      });
      for (const b of s.bumpers) if (collideBumper(pk, b, p)) hit = true;
      const goal = walls(pk, p);
      if (goal !== null) return { goal, hit };
    }
    // Pinned between a mallet and a wall: slide to the nearest free spot so the puck is never inside a mallet.
    s.mallets.forEach((m) => unpin(pk, m, p));
    limitSpeed(pk, p.puckMaxSpeed);
  }
  return { goal: null, hit };
}

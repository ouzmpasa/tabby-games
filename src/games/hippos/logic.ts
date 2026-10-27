import { BALL, HIPPO, HIPPOS, POND, WAVES } from './config';

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

export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  golden: boolean;
  /** Index into BALL.colors (ignored for golden). */
  color: number;
  /** ms since it dropped in. */
  age: number;
  /** ms left before it floats away (golden balls only; Infinity otherwise). */
  ttl: number;
  /** Diver: ducks under water now and then. `diveOffset` shifts its cycle (mirrored partners share it). */
  diver: boolean;
  diveOffset: number;
  /** Wander push: starting angle, and -1 for the right-hand partner of a pair (mirrors the push). */
  phase: number;
  mirror: 1 | -1;
}

/** What the balls of the current wave swim in. */
export interface PondEnv {
  /** Speed limit (px/s). */
  maxSpeed: number;
  /** Wander push (px/s^2) that keeps the balls swimming. */
  wander: number;
  /** Rock island in the middle. */
  rock: boolean;
}

export const DEFAULT_ENV: PondEnv = { maxSpeed: BALL.maxSpeed, wander: 0, rock: false };

/** Mirrored golden ball / plain defaults for tests and callers that only need the basics. */
export const plainBall = (b: Pick<Ball, 'id' | 'x' | 'y' | 'vx' | 'vy' | 'r' | 'golden' | 'color'>): Ball => ({ ...b, age: 0, ttl: Infinity, diver: false, diveOffset: 0, phase: 0, mirror: 1 });

// ---------------------------------------------------------------- the ramp

const waveIndex = (wave: number): number => Math.max(0, wave);

/** Mirrored pairs in wave `wave` (0-based). */
export const pairsAt = (wave: number): number => Math.min(HIPPOS.wavePairsMax, HIPPOS.wavePairsStart + Math.floor(waveIndex(wave) / HIPPOS.wavePairsEveryWaves));

export const speedScaleAt = (wave: number): number => Math.min(WAVES.speedScaleMax, 1 + WAVES.speedGrowth * waveIndex(wave));

export const radiusAt = (wave: number): number => Math.max(WAVES.minRadius, BALL.radius - WAVES.radiusShrink * waveIndex(wave));

export const goldenRadiusAt = (wave: number): number => Math.max(WAVES.minGoldenRadius, BALL.goldenRadius - WAVES.radiusShrink * waveIndex(wave));

export const rockAt = (wave: number): boolean => waveIndex(wave) >= WAVES.rockFromWave;

/** Environment for the balls of wave `wave`. */
export function envAt(wave: number): PondEnv {
  return { maxSpeed: BALL.maxSpeed * speedScaleAt(wave), wander: Math.min(WAVES.wanderMax, WAVES.wanderPerWave * waveIndex(wave)), rock: rockAt(wave) };
}

export type DiveState = 'up' | 'warn' | 'under';

/** Is a diver above water, about to dive (wobbles) or under water (cannot be eaten)? */
export function diveState(b: Pick<Ball, 'diver' | 'age' | 'diveOffset'>): DiveState {
  if (!b.diver) return 'up';
  const t = (b.age + b.diveOffset) % WAVES.divePeriodMs;
  const underStart = WAVES.divePeriodMs - WAVES.diveUnderMs;
  if (t >= underStart) return 'under';
  if (t >= underStart - WAVES.diveWarnMs) return 'warn';
  return 'up';
}

export const isUnder = (b: Pick<Ball, 'diver' | 'age' | 'diveOffset'>): boolean => diveState(b) === 'under';

export interface PondState {
  balls: Ball[];
  nextId: number;
  /** Waves dropped so far. */
  wave: number;
  /** Time (ms) the pond has been empty. */
  emptyMs: number;
  /** Environment of the current wave (rock, speed, wander). */
  env: PondEnv;
}

export function createPond(): PondState {
  return { balls: [], nextId: 1, wave: 0, emptyMs: HIPPOS.wavePauseMs - HIPPOS.firstWaveMs, env: DEFAULT_ENV };
}

export const pointsFor = (b: Pick<Ball, 'golden'>): number => (b.golden ? HIPPOS.goldenPoints : HIPPOS.normalPoints);

/** Keep a ball centre inside the pond ellipse (shrunk by its radius) and bounce it off the wall. */
export function wallBounce(b: Ball, bounce: number = BALL.wallBounce): boolean {
  const A = POND.a - b.r;
  const B = POND.b - b.r;
  const dx = b.x - POND.cx;
  const dy = b.y - POND.cy;
  const q = (dx * dx) / (A * A) + (dy * dy) / (B * B);
  if (q <= 1) return false;
  const s = 1 / Math.sqrt(q);
  b.x = POND.cx + dx * s;
  b.y = POND.cy + dy * s;
  let nx = (b.x - POND.cx) / (A * A);
  let ny = (b.y - POND.cy) / (B * B);
  const l = Math.hypot(nx, ny) || 1;
  nx /= l;
  ny /= l;
  const vn = b.vx * nx + b.vy * ny;
  if (vn > 0) {
    b.vx -= (1 + bounce) * vn * nx;
    b.vy -= (1 + bounce) * vn * ny;
  }
  return true;
}

/** Equal-density circles: push apart and exchange the normal velocity component. */
function collide(a: Ball, b: Ball): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const min = a.r + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return;
  const d = Math.sqrt(d2) || 0.001;
  const nx = d2 === 0 ? 1 : dx / d;
  const ny = d2 === 0 ? 0 : dy / d;
  const ma = a.r * a.r;
  const mb = b.r * b.r;
  const push = min - d;
  a.x -= nx * push * (mb / (ma + mb));
  a.y -= ny * push * (mb / (ma + mb));
  b.x += nx * push * (ma / (ma + mb));
  b.y += ny * push * (ma / (ma + mb));
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel >= 0) return;
  const j = (-(1 + BALL.ballBounce) * rel) / (1 / ma + 1 / mb);
  a.vx -= (j / ma) * nx;
  a.vy -= (j / ma) * ny;
  b.vx += (j / mb) * nx;
  b.vy += (j / mb) * ny;
}

/** Push a ball out of the rock island in the middle and bounce it off. */
function rockBounce(b: Ball): void {
  const dx = b.x - POND.cx;
  const dy = b.y - POND.cy;
  const min = WAVES.rockRadius + b.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return;
  const d = Math.sqrt(d2) || 0.001;
  const nx = d2 === 0 ? 1 : dx / d;
  const ny = d2 === 0 ? 0 : dy / d;
  b.x = POND.cx + nx * min;
  b.y = POND.cy + ny * min;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + BALL.wallBounce) * vn * nx;
    b.vy -= (1 + BALL.wallBounce) * vn * ny;
  }
}

/** Moves the balls (drag, drift to the middle, wander, bounces). dt in ms. */
export function moveBalls(balls: Ball[], dtMs: number, env: PondEnv = DEFAULT_ENV): void {
  const dt = Math.min(dtMs, 50) / 1000;
  const pull = env.rock ? BALL.centrePull * WAVES.rockPullFactor : BALL.centrePull;
  for (const b of balls) {
    b.age += Math.min(dtMs, 50);
    const dx = POND.cx - b.x;
    const dy = POND.cy - b.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      b.vx += (dx / d) * pull * dt;
      b.vy += (dy / d) * pull * dt;
    }
    if (env.wander > 0) {
      const th = b.phase + (b.age / 1000) * WAVES.wanderTurnPerSec * Math.PI * 2;
      b.vx += Math.cos(th) * b.mirror * env.wander * dt;
      b.vy += Math.sin(th) * env.wander * dt;
    }
    const f = Math.exp(-BALL.drag * dt);
    b.vx *= f;
    b.vy *= f;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > env.maxSpeed) {
      b.vx *= env.maxSpeed / sp;
      b.vy *= env.maxSpeed / sp;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (env.rock) rockBounce(b);
    wallBounce(b);
  }
  for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) collide(balls[i], balls[j]);
  for (const b of balls) {
    if (env.rock) rockBounce(b);
    wallBounce(b);
  }
}

/**
 * Builds one wave (`state.wave` is its 0-based number). It is exactly mirror-symmetric (left <-> right) so neither side has an advantage:
 * mirrored pairs share colour, mirrored position and mirrored velocity (and their dive rhythm); the golden ball (if any) starts on the centre line.
 * Later waves have more balls, smaller and faster ones, divers, and a rock in the middle (see WAVES).
 */
export function makeWave(state: PondState, rng: () => number): Ball[] {
  const w = state.wave;
  const out: Ball[] = [];
  const pairs = pairsAt(w);
  const rows = pairs;
  const r = radiusAt(w);
  const scale = speedScaleAt(w);
  const order = Array.from({ length: rows }, (_, i) => i).sort(() => rng() - 0.5);
  const minDx = rockAt(w) ? WAVES.rockRadius + r + 30 : 140;
  // The "left" ball of each pair sits left of the centre line, the "right" one is its mirror image.
  for (let i = 0; i < pairs; i++) {
    const slot = order[i];
    const yFrac = ((slot + 0.5) / rows) * 2 - 1; // -1..1 spread over the pond height
    const y = POND.cy + yFrac * (POND.b - r - 110) + (rng() - 0.5) * 50;
    const half = Math.sqrt(Math.max(0, 1 - ((y - POND.cy) / POND.b) ** 2)) * POND.a;
    const dx = Math.max(minDx, Math.min(half - r - 40, 140 + rng() * 360));
    const ang = rng() * Math.PI * 2;
    const sp = (BALL.speedMin + rng() * (BALL.speedMax - BALL.speedMin)) * scale;
    const color = Math.floor(rng() * BALL.colors.length);
    const phase = rng() * Math.PI * 2;
    const diver = w >= WAVES.diveFromWave && rng() < WAVES.diveShare;
    const diveOffset = Math.floor(rng() * WAVES.divePeriodMs);
    const vx = Math.cos(ang) * sp;
    const vy = Math.sin(ang) * sp;
    const base = { y, vy, r, golden: false, color, age: 0, ttl: Infinity, diver, diveOffset, phase };
    out.push({ ...base, id: state.nextId++, x: POND.cx - dx, vx, mirror: 1 });
    out.push({ ...base, id: state.nextId++, x: POND.cx + dx, vx: -vx, mirror: -1 });
  }
  if (HIPPOS.goldenEveryWaves > 0 && (w + 1) % HIPPOS.goldenEveryWaves === 0) {
    const sp = BALL.speedMin * 0.6;
    const up = rng() < 0.5 ? -1 : 1;
    out.push({
      id: state.nextId++, x: POND.cx, y: POND.cy + (rng() < 0.5 ? -1 : 1) * (rockAt(w) ? WAVES.rockRadius + goldenRadiusAt(w) + 40 : 160), vx: 0, vy: up * sp,
      r: goldenRadiusAt(w), golden: true, color: 0, age: 0, ttl: HIPPOS.goldenLifeMs, diver: false, diveOffset: 0, phase: 0, mirror: 1,
    });
  }
  return out;
}

export interface PondStep {
  /** Balls dropped in this step (a new wave). */
  spawned: Ball[];
  /** Golden balls that floated away unseen (not eaten). */
  expired: Ball[];
}

/** Advances the pond: ball motion, golden balls floating away, and the next wave after the pond has been empty for a while. */
export function stepPond(state: PondState, dtMs: number, rng: () => number): PondStep {
  const spawned: Ball[] = [];
  const expired: Ball[] = [];
  if (state.balls.length === 0) {
    state.emptyMs += dtMs;
    if (state.emptyMs >= HIPPOS.wavePauseMs) {
      state.env = envAt(state.wave);
      const wave = makeWave(state, rng);
      state.wave++;
      state.emptyMs = 0;
      state.balls.push(...wave);
      spawned.push(...wave);
    }
  } else {
    state.emptyMs = 0;
    moveBalls(state.balls, dtMs, state.env);
    for (let i = state.balls.length - 1; i >= 0; i--) {
      const b = state.balls[i];
      if (b.ttl === Infinity) continue;
      b.ttl -= dtMs;
      if (b.ttl <= 0) {
        expired.push(b);
        state.balls.splice(i, 1);
      }
    }
  }
  return { spawned, expired };
}

// ---------------------------------------------------------------- hippo

export type LungePhase = 'idle' | 'out' | 'peak' | 'back' | 'rest';

export interface Hippo {
  /** Body anchor in screen coordinates and the +x direction toward the pond (1 or -1). */
  baseX: number;
  baseY: number;
  dir: 1 | -1;
  phase: LungePhase;
  /** ms in the current phase. */
  t: number;
  /** Lunge target: mouth centre at the peak, in screen coordinates. */
  tx: number;
  ty: number;
  /** Extension 0..1 (0 = resting head, 1 = at the target) and mouth openness 0..1. */
  ext: number;
  open: number;
  eaten: number;
}

export function createHippo(player: 0 | 1, screenW: number, screenH: number): Hippo {
  const dir = player === 0 ? 1 : -1;
  return {
    baseX: player === 0 ? HIPPO.baseInset : screenW - HIPPO.baseInset,
    baseY: screenH / 2,
    dir,
    phase: 'idle',
    t: 0,
    tx: 0,
    ty: 0,
    ext: 0,
    open: 0,
    eaten: 0,
  };
}

export interface Pt {
  x: number;
  y: number;
}

/** Where the mouth ends up for a touch at (x, y): the touch point, kept within [minReach, maxReach] of the body anchor. */
export function lungeTarget(h: Hippo, x: number, y: number): Pt {
  let dx = (x - h.baseX) * h.dir; // local frame: +x toward the pond
  const dy = y - h.baseY;
  dx = Math.max(dx, 1); // never lunge backwards, behind the hippo
  const d = Math.hypot(dx, dy);
  const len = Math.min(HIPPO.maxReach, Math.max(HIPPO.minReach, d));
  return { x: h.baseX + (dx / d) * len * h.dir, y: h.baseY + (dy / d) * len };
}

/** Starts a lunge toward (x, y) if the hippo is free. Returns whether it started. */
export function startLunge(h: Hippo, x: number, y: number): boolean {
  if (h.phase !== 'idle') return false;
  const p = lungeTarget(h, x, y);
  h.tx = p.x;
  h.ty = p.y;
  h.phase = 'out';
  h.t = 0;
  return true;
}

const easeOut = (u: number): number => 1 - (1 - u) * (1 - u);
const easeInOut = (u: number): number => u * u * (3 - 2 * u);

/** Mouth centre for the current extension. */
export function mouthPos(h: Hippo): Pt {
  const rx = h.baseX + HIPPO.idleReach * h.dir;
  const ry = h.baseY;
  const tx = h.phase === 'idle' ? rx : h.tx;
  const ty = h.phase === 'idle' ? ry : h.ty;
  return { x: rx + (tx - rx) * h.ext, y: ry + (ty - ry) * h.ext };
}

/** Direction the head points in (radians, screen frame). */
export function headAngle(h: Hippo): number {
  const m = mouthPos(h);
  return Math.atan2(m.y - h.baseY, m.x - h.baseX);
}

/** Advances the lunge. Returns true on the step where the mouth reaches the peak (CHOMP: eat now). */
export function stepHippo(h: Hippo, dtMs: number): boolean {
  let chomp = false;
  let left = dtMs;
  // Phase changes can carry leftover time into the next phase.
  for (let guard = 0; guard < 6 && left > 0; guard++) {
    if (h.phase === 'idle') {
      h.ext = 0;
      h.open = 0;
      return chomp;
    }
    const dur = h.phase === 'out' ? HIPPO.outMs : h.phase === 'peak' ? HIPPO.peakMs : h.phase === 'back' ? HIPPO.backMs : HIPPO.restMs;
    const use = Math.min(left, dur - h.t);
    h.t += use;
    left -= use;
    const u = dur > 0 ? h.t / dur : 1;
    if (h.phase === 'out') {
      h.ext = easeOut(u);
      h.open = Math.min(1, u * 1.6);
    } else if (h.phase === 'peak') {
      h.ext = 1;
      h.open = u < 0.5 ? 1 : 0; // wide open, then CHOMP
    } else if (h.phase === 'back') {
      h.ext = 1 - easeInOut(u);
      h.open = 0;
    } else {
      h.ext = 0;
      h.open = 0;
    }
    if (h.t >= dur - 1e-9) {
      h.t = 0;
      if (h.phase === 'out') {
        h.phase = 'peak';
        h.ext = 1;
        h.open = 1;
        chomp = true;
      } else if (h.phase === 'peak') h.phase = 'back';
      else if (h.phase === 'back') h.phase = 'rest';
      else {
        h.phase = 'idle';
        h.ext = 0;
      }
    }
  }
  return chomp;
}

/** Removes and returns every ball inside the open mouth (call on the chomp step). Balls that are under water cannot be eaten. */
export function eat(h: Hippo, balls: Ball[]): Ball[] {
  const m = mouthPos(h);
  const eaten: Ball[] = [];
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    if (!isUnder(b) && Math.hypot(b.x - m.x, b.y - m.y) <= HIPPO.mouthRadius + b.r * HIPPO.ballOverlap) {
      eaten.push(b);
      balls.splice(i, 1);
    }
  }
  h.eaten += eaten.length;
  return eaten.reverse();
}

/** Total time (ms) from the start of a lunge until the hippo can lunge again. */
export const LUNGE_CYCLE_MS = HIPPO.outMs + HIPPO.peakMs + HIPPO.backMs + HIPPO.restMs;

// ---------------------------------------------------------------- tap memory

/** Remembers the latest tap per player so frantic tapping during a lunge is not lost. */
export interface TapMemory {
  x: number;
  y: number;
  /** Expiry time (ms, scene clock), or -1 when there is none. */
  until: number;
}

export function rememberTap(m: TapMemory, x: number, y: number, now: number): void {
  m.x = x;
  m.y = y;
  m.until = now + HIPPO.tapBufferMs;
}

/** Target for the next lunge: a held finger (latest position) or an unexpired remembered tap; null if none. */
export function nextTarget(m: TapMemory, held: Pt | null, now: number): Pt | null {
  if (held) return held;
  if (m.until >= now) return { x: m.x, y: m.y };
  return null;
}

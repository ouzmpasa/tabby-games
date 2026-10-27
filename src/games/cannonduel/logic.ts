import { W } from '../../core/layout';
import { other, type PlayerId } from '../../core/types';
import { CANNONDUEL } from './config';

export interface LevelDef {
  hitRadius: number;
  windMax: number;
  hillMax: number;
  reloadMin: number;
  reloadMax: number;
  insetMax: number;
  sway: number;
}

export interface Params {
  /** Sway amplitude of this round (px); set by roundParams from the level. */
  sway: number;
  levels: readonly LevelDef[];
  roundsPerLevel: number;
  swayPeriodMs: number;
  maxPull: number;
  cueDots: readonly number[];
  groundY: number;
  cannonInset: number;
  pivotHeight: number;
  barrelLength: number;
  shellRadius: number;
  hitRadius: number;
  gravity: number;
  wind: number;
  minPull: number;
  minSpeed: number;
  maxSpeed: number;
  minElevationDeg: number;
  maxElevationDeg: number;
  idleElevationDeg: number;
  reloadMs: number;
  hillMinHeight: number;
  hillMaxHeight: number;
  hillMinHalfWidth: number;
  hillMaxHalfWidth: number;
  hillMaxOffset: number;
  outMargin: number;
  previewMaxSec: number;
  previewDotGap: number;
  centerX: number;
}

export const DEFAULT_PARAMS: Params = { ...CANNONDUEL, sway: 0 };

/** Difficulty level of a round (every `roundsPerLevel` rounds goes one up, capped at the last row). */
export const levelOfRound = (round: number, base: Params = DEFAULT_PARAMS): number =>
  Math.min(base.levels.length - 1, Math.floor(Math.max(0, round) / base.roundsPerLevel));

/**
 * The rules of one round: the base knobs with the level's blast radius, tallest hill and cannon distance, a random wind (direction and
 * 40-100% of the level's strongest) and a random reload time within the level's range. `rand` returns [0,1).
 */
export function roundParams(level: number, rand: () => number = Math.random, base: Params = DEFAULT_PARAMS): Params {
  const row = base.levels[Math.min(base.levels.length - 1, Math.max(0, Math.floor(level)))];
  const wind = row.windMax <= 0 ? 0 : (rand() < 0.5 ? -1 : 1) * row.windMax * (0.4 + 0.6 * rand());
  return {
    ...base,
    hitRadius: row.hitRadius,
    sway: row.sway,
    hillMaxHeight: Math.max(base.hillMinHeight, row.hillMax),
    wind,
    cannonInset: Math.round(base.cannonInset + rand() * Math.max(0, row.insetMax - base.cannonInset)),
    reloadMs: Math.round(row.reloadMin + rand() * (row.reloadMax - row.reloadMin)),
  };
}

/** Wind strength as 0..3 pennant steps for the flag (0 = calm). */
export function windSteps(wind: number, base: Params = DEFAULT_PARAMS): number {
  const top = Math.max(...base.levels.map((l) => l.windMax), 1);
  const a = Math.abs(wind);
  return a < 1 ? 0 : Math.min(3, 1 + Math.floor((a / top) * 3));
}

/** The two cue dots on the barrel line, whatever the pull. */
export function cueDotsFor(p: PlayerId, angle: number, params: Params = DEFAULT_PARAMS): Pt[] {
  const a = angle;
  const c = cannonPos(p, params);
  return params.cueDots.map((d) => ({ x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d }));
}

export interface Pt {
  x: number;
  y: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const rad = (deg: number) => (deg * Math.PI) / 180;

/** +1 when the player shoots to the right (player 0), -1 to the left. */
export const dirSign = (p: PlayerId): 1 | -1 => (p === 0 ? 1 : -1);

/** Where a cannon's body sits (its centre, used for hits). */
export function cannonPos(p: PlayerId, params: Params = DEFAULT_PARAMS): Pt {
  return { x: p === 0 ? params.cannonInset : W - params.cannonInset, y: params.groundY - params.pivotHeight };
}

/** x offset of a cannon `timeMs` into the round: the two rock in opposite phase (toward / away from each other). */
export function swayOffset(p: PlayerId, timeMs: number, params: Params = DEFAULT_PARAMS): number {
  if (params.sway <= 0) return 0;
  return params.sway * Math.sin((2 * Math.PI * timeMs) / params.swayPeriodMs) * (p === 0 ? 1 : -1);
}

/** Barrel pivot (same as the cannon centre). */
export const pivotPos = cannonPos;

/** Where the shell leaves the barrel for a shot at world angle `angle` (radians, atan2 of the velocity). */
export function muzzlePos(p: PlayerId, angle: number, params: Params = DEFAULT_PARAMS): Pt {
  const c = cannonPos(p, params);
  return { x: c.x + Math.cos(angle) * params.barrelLength, y: c.y + Math.sin(angle) * params.barrelLength };
}

/** World angle of the barrel for an elevation in degrees. */
export function angleFromElevation(p: PlayerId, elevDeg: number): number {
  const e = rad(elevDeg);
  return Math.atan2(-Math.sin(e), dirSign(p) * Math.cos(e));
}

export interface Hill {
  /** Centre x of the hill. */
  x: number;
  height: number;
  halfWidth: number;
}

/** Height of the hill above the ground at screen x (0 outside the hill). Smooth cosine bump. */
export function hillHeightAt(hill: Hill, x: number): number {
  const d = Math.abs(x - hill.x);
  if (d >= hill.halfWidth) return 0;
  return hill.height * (0.5 + 0.5 * Math.cos((Math.PI * d) / hill.halfWidth));
}

/** Surface y (screen) at x: the ground, or the top of the hill. */
export const surfaceY = (hill: Hill, x: number, params: Params = DEFAULT_PARAMS): number => params.groundY - hillHeightAt(hill, x);

/** A random hill; `rand` returns [0,1). Always re-rolled until a lob over it exists from both cannons. */
export function generateHill(rand: () => number = Math.random, params: Params = DEFAULT_PARAMS): Hill {
  for (let i = 0; i < 50; i++) {
    const hill: Hill = {
      x: params.centerX + (rand() * 2 - 1) * params.hillMaxOffset,
      height: params.hillMinHeight + rand() * (params.hillMaxHeight - params.hillMinHeight),
      halfWidth: params.hillMinHalfWidth + rand() * (params.hillMaxHalfWidth - params.hillMinHalfWidth),
    };
    if (isPassable(hill, params)) return hill;
  }
  return { x: params.centerX, height: params.hillMinHeight, halfWidth: params.hillMinHalfWidth };
}

/** True when a lob exists from each cannon that clears the hill and lands on (or within 200 px of) the other cannon. */
export function isPassable(hill: Hill, base: Params = DEFAULT_PARAMS): boolean {
  const params: Params = { ...base, wind: 0 }; // judged in calm air
  for (const p of [0, 1] as const) {
    let ok = false;
    for (let elev = 40; elev <= 80 && !ok; elev += 5) {
      for (let v = 900; v <= params.maxSpeed && !ok; v += 50) {
        const a = angleFromElevation(p, elev);
        const path = simulate(p, a, v, hill, params);
        ok = path.hit === 'cannon' || (path.hit === 'ground' && Math.abs(path.end.x - cannonPos(other(p), params).x) < 200);
      }
    }
    if (!ok) return false;
  }
  return true;
}

export interface Aim {
  /** World angle of the barrel / launch direction (radians). */
  angle: number;
  vx: number;
  vy: number;
  speed: number;
  /** 0..1 share of the pull range (only used for sound feedback; never drawn while aiming). */
  power: number;
}

/**
 * Slingshot: `pull` is (anchor - finger). Pulling back and down-left fires up and to the right for player 0.
 * Returns null for a too-short pull. Elevation is clamped so the barrel always points at the opponent's side.
 */
export function computeAim(p: PlayerId, pull: Pt, params: Params = DEFAULT_PARAMS): Aim | null {
  const len = Math.hypot(pull.x, pull.y);
  if (len < params.minPull) return null;
  const forward = pull.x * dirSign(p);
  const up = -pull.y;
  const elev = clamp((Math.atan2(up, Math.max(forward, 0)) * 180) / Math.PI, params.minElevationDeg, params.maxElevationDeg);
  const power = clamp((len - params.minPull) / (params.maxPull - params.minPull), 0, 1);
  const speed = params.minSpeed + power * (params.maxSpeed - params.minSpeed);
  const angle = angleFromElevation(p, elev);
  return { angle, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, speed, power };
}

export interface Shell {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: PlayerId;
}

export type Impact = 'cannon' | 'ground' | 'hill' | 'out' | null;

/** Advance a shell by dt ms (`offsets` = the cannons' current sway). Returns what it hit this step (null while flying) and, for cannon hits, the victim. */
export function stepShell(
  s: Shell,
  dtMs: number,
  hill: Hill,
  params: Params = DEFAULT_PARAMS,
  offsets: readonly [number, number] = [0, 0],
): { impact: Impact; victim?: PlayerId } {
  // sub-step so a fast shell never tunnels through the hill or a cannon
  const total = dtMs / 1000;
  const n = Math.max(1, Math.ceil(total / 0.008));
  const dt = total / n;
  for (let i = 0; i < n; i++) {
    s.vy += params.gravity * dt;
    s.vx += params.wind * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    for (const p of [0, 1] as const) {
      if (p === s.owner) continue; // can't shoot yourself
      const c = cannonPos(p, params);
      if (Math.hypot(s.x - (c.x + offsets[p]), s.y - c.y) <= params.hitRadius) return { impact: 'cannon', victim: p };
    }
    if (s.x < -params.outMargin || s.x > W + params.outMargin) return { impact: 'out' };
    const sy = surfaceY(hill, s.x, params);
    if (s.y >= sy && s.vy > 0) {
      s.y = sy;
      return { impact: hillHeightAt(hill, s.x) > 0 ? 'hill' : 'ground' };
    }
  }
  return { impact: null };
}

export interface Path {
  /** Points along the flight, starting at the muzzle. */
  points: Pt[];
  end: Pt;
  hit: Impact;
  victim?: PlayerId;
}

/** Simulate a whole shot (used for the aim preview, the hill generator and tests). Spaced ~`gapPx` apart if given. */
export function simulate(p: PlayerId, angle: number, speed: number, hill: Hill, params: Params = DEFAULT_PARAMS, stepMs = 8): Path {
  const m = muzzlePos(p, angle, params);
  const s: Shell = { x: m.x, y: m.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, owner: p };
  const points: Pt[] = [{ x: s.x, y: s.y }];
  let hit: Impact = null;
  let victim: PlayerId | undefined;
  for (let t = 0; t < params.previewMaxSec * 1000; t += stepMs) {
    const r = stepShell(s, stepMs, hill, params);
    points.push({ x: s.x, y: s.y });
    if (r.impact) {
      hit = r.impact;
      victim = r.victim;
      break;
    }
  }
  return { points, end: points[points.length - 1], hit, victim };
}

/** Pick points roughly `gap` px apart along a path (for the dotted preview). */
export function dotsAlong(points: readonly Pt[], gap: number): Pt[] {
  const out: Pt[] = [];
  let acc = gap * 0.5;
  for (let i = 1; i < points.length; i++) {
    acc += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (acc >= gap) {
      out.push(points[i]);
      acc = 0;
    }
  }
  return out;
}

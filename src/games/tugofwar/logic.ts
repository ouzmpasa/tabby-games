import { ROUND_RAMP, TOKEN_AREA, TUGOFWAR } from './config';

/** pos runs -1 (player 0's end) .. +1 (player 1's end); 0 is the centre. */
export interface TugState {
  pos: number;
  /** Timestamp (ms) of each player's last accepted tap. */
  lastTap: [number, number];
  /** Stamina 0..1 per player. */
  energy: [number, number];
  /** Round clock (ms) until which each player's boost lasts. */
  boostUntil: [number, number];
  /** ms since GO of this round (advance() keeps it going). */
  elapsed: number;
}

export interface TugParams {
  pullPerTap: number;
  minTapGapMs: number;
  tapCost: number;
  regenPerSec: number;
  softEnergy: number;
  floorPower: number;
  surgeStartMs: number;
  surgeRampMs: number;
  surgeMax: number;
  rubberBand: number;
  tokenPull: number;
  boostPower: number;
  boostMs: number;
}

export const DEFAULT_PARAMS: TugParams = {
  pullPerTap: TUGOFWAR.pullPerTap,
  minTapGapMs: TUGOFWAR.minTapGapMs,
  tapCost: TUGOFWAR.tapCost,
  regenPerSec: ROUND_RAMP.regenPerSec[0],
  softEnergy: TUGOFWAR.softEnergy,
  floorPower: TUGOFWAR.floorPower,
  surgeStartMs: TUGOFWAR.surgeStartMs,
  surgeRampMs: TUGOFWAR.surgeRampMs,
  surgeMax: TUGOFWAR.surgeMax,
  rubberBand: TUGOFWAR.rubberBand,
  tokenPull: TUGOFWAR.tokenPull,
  boostPower: TUGOFWAR.boostPower,
  boostMs: TUGOFWAR.boostMs,
};

const rampAt = (arr: readonly number[], round: number): number => arr[Math.max(0, Math.min(arr.length - 1, round - 1))];

/** Parameters of round `round` (1-based): later rounds have a heavier rope and a slower energy refill. */
export function roundParams(round: number): TugParams {
  return { ...DEFAULT_PARAMS, pullPerTap: TUGOFWAR.pullPerTap * rampAt(ROUND_RAMP.pullFactor, round), regenPerSec: rampAt(ROUND_RAMP.regenPerSec, round) };
}

export const createState = (): TugState => ({ pos: 0, lastTap: [-Infinity, -Infinity], energy: [1, 1], boostUntil: [0, 0], elapsed: 0 });

export function reset(s: TugState): void {
  Object.assign(s, createState());
}

/** Surge multiplier for time `elapsed` into a round: 1 at first, then growing up to surgeMax. */
export function surge(elapsed: number, p: TugParams = DEFAULT_PARAMS): number {
  const k = Math.max(0, Math.min(1, (elapsed - p.surgeStartMs) / p.surgeRampMs));
  return 1 + (p.surgeMax - 1) * k;
}

/** Pull power (floorPower..1) for an energy level: full while there is energy, fading (never to zero) when mashing drained it. */
export function powerOf(energy: number, p: TugParams = DEFAULT_PARAMS): number {
  if (energy >= p.softEnergy) return 1;
  return p.floorPower + (1 - p.floorPower) * Math.max(0, energy / p.softEnergy);
}

export const isBoosted = (s: TugState, player: 0 | 1): boolean => s.elapsed < s.boostUntil[player];

/** Advances the round clock and refills the energy bars. */
export function advance(s: TugState, dtMs: number, p: TugParams = DEFAULT_PARAMS): void {
  s.elapsed += dtMs;
  for (const i of [0, 1] as const) s.energy[i] = Math.min(1, s.energy[i] + (p.regenPerSec * dtMs) / 1000);
}

const move = (s: TugState, player: 0 | 1, amount: number): void => {
  s.pos += (player === 0 ? -1 : 1) * amount;
  s.pos = Math.max(-1, Math.min(1, s.pos));
};

/** Mild rubber band: pulling is a little harder while you are winning and a little easier while you are losing (keeps mismatched pairs close; fades out during the surge). */
export function band(s: TugState, p: 0 | 1, params: TugParams = DEFAULT_PARAMS): number {
  const lead = p === 0 ? -s.pos : s.pos; // +1 = your end, -1 = their end
  const k = Math.max(0, Math.min(1, (s.elapsed - params.surgeStartMs) / params.surgeRampMs));
  return 1 - params.rubberBand * (1 - k) * lead; // fades out as the surge builds, so a dead-even tug still ends
}

/**
 * Player `p` taps at time `now` (ms): pulls the marker toward their own end by pullPerTap x power (stamina) x surge x boost.
 * Returns the winner of the round if the marker reached an end, else null.
 */
export function tap(s: TugState, p: 0 | 1, now: number, params: TugParams = DEFAULT_PARAMS): 0 | 1 | null {
  if (winner(s) !== null) return winner(s);
  if (now - s.lastTap[p] < params.minTapGapMs) return null;
  s.lastTap[p] = now;
  const power = powerOf(s.energy[p], params);
  s.energy[p] = Math.max(0, s.energy[p] - params.tapCost);
  move(s, p, params.pullPerTap * power * surge(s.elapsed, params) * (isBoosted(s, p) ? params.boostPower : 1) * band(s, p, params));
  return winner(s);
}

/** Player `p` grabs a power token: an instant pull, a full energy bar and a boost for a few seconds. */
export function grabToken(s: TugState, p: 0 | 1, params: TugParams = DEFAULT_PARAMS): 0 | 1 | null {
  if (winner(s) !== null) return winner(s);
  s.energy[p] = 1;
  s.boostUntil[p] = s.elapsed + params.boostMs;
  move(s, p, params.tokenPull * surge(s.elapsed, params));
  return winner(s);
}

export function winner(s: TugState): 0 | 1 | null {
  if (s.pos <= -1) return 0;
  if (s.pos >= 1) return 1;
  return null;
}

/** Screen x of the marker for a track starting at `x` with width `w`. */
export const markerX = (pos: number, x: number, w: number): number => x + ((pos + 1) / 2) * w;

// ---------------------------------------------------------------- power tokens

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

export interface TokenEvent {
  /** ms after GO. */
  at: number;
  /** ms it stays. */
  life: number;
  /** Position in player 0's half (screen px); player 1 gets the mirror image (x -> W - x), so both see the same spot. */
  x: number;
  y: number;
}

/** Deterministic token schedule for one round: the same for both players, alternating above / below the rope. */
export function makeTokenSchedule(seed: number, count: number, every: number, life: number, first: number = TUGOFWAR.tokenFirstMs, jitter: number = TUGOFWAR.tokenJitterMs): TokenEvent[] {
  const rnd = mulberry32(seed);
  const out: TokenEvent[] = [];
  let at = first;
  let above = rnd() < 0.5;
  for (let i = 0; i < count; i++) {
    const [y0, y1] = above ? TOKEN_AREA.yAbove : TOKEN_AREA.yBelow;
    out.push({
      at: Math.round(at + (rnd() * 2 - 1) * jitter * (i === 0 ? 0.3 : 1)),
      life,
      x: Math.round(TOKEN_AREA.x0 + rnd() * (TOKEN_AREA.x1 - TOKEN_AREA.x0)),
      y: Math.round(y0 + rnd() * (y1 - y0)),
    });
    above = !above;
    at += every;
  }
  return out;
}

/** Token schedule of round `round` for a match seed. */
export function roundTokens(seed: number, round: number, count = 12): TokenEvent[] {
  return makeTokenSchedule(seed + round * 977, count, rampAt(ROUND_RAMP.tokenEveryMs, round), rampAt(ROUND_RAMP.tokenLifeMs, round));
}

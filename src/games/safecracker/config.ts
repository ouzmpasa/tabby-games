import { H, W } from '../../core/layout';

/** The rules of one round. Rounds escalate: more locks, narrower sweet spots, less hot/cold help, fake clicks, a heavy dial, a lock timer. */
export interface RoundRules {
  /** Locks per safe. */
  locks: number;
  /** Half-width (degrees) of the sweet spot per lock (the last value repeats). */
  tolerancesDeg: readonly number[];
  /** How long the dial must stay inside the sweet spot (ms). */
  holdMs: number;
  /** Travel from one secret angle to the next, same for both safes of a round (degrees: min, max). Longer = more turning. */
  travelDeg: readonly [number, number];
  /**
   * Distance (degrees) over which the glow and ticking fade from "cold" to "hot" outside the sweet spot, per lock.
   * Smaller = the hint only shows up very close to the spot, so later locks give less help.
   */
  heatFalloffDegs: readonly number[];
  /** Number of locks (never the first) that hide a DECOY: a near-miss spot that glows orange and ticks but needs a full hold to reveal itself as fake. */
  decoys: number;
  /** Dial inertia: the dial lags behind the finger by about this many ms (0 = follows exactly). */
  inertiaMs: number;
  /** Time limit per lock (ms); the clock pauses while the dial is warm. Running out re-hides THAT lock's spot (other locks stay open). 0 = none. */
  lockTimeMs: number;
  /** Lock directions: false = alternate clockwise / counter-clockwise, true = unpredictable (never 3 equal in a row). */
  randomDirs: boolean;
}

/**
 * Round table (the last row repeats). Round 1 is the old easy safe; round 2 adds a 4th lock, longer turns and a fake click; round 3 has 5 locks,
 * a heavy dial, a lock timer and unpredictable turning directions; rounds 4+ have 6 locks, narrower sweet spots, longer holds and less
 * hint. Even the hardest sweet spot stays >= 5 degrees (about 16 px of finger travel), the hold is at most 1 s and lock timers are long.
 */
export const ROUNDS: readonly RoundRules[] = [
  { locks: 3, tolerancesDeg: [9, 7, 5], holdMs: 500, travelDeg: [110, 250], heatFalloffDegs: [110, 110, 110], decoys: 0, inertiaMs: 0, lockTimeMs: 0, randomDirs: false },
  { locks: 4, tolerancesDeg: [8, 7, 6, 5], holdMs: 650, travelDeg: [130, 290], heatFalloffDegs: [110, 100, 80, 60], decoys: 1, inertiaMs: 0, lockTimeMs: 0, randomDirs: false },
  { locks: 5, tolerancesDeg: [8, 7, 6, 5, 5], holdMs: 800, travelDeg: [140, 310], heatFalloffDegs: [100, 80, 60, 45, 35], decoys: 2, inertiaMs: 60, lockTimeMs: 35000, randomDirs: true },
  { locks: 6, tolerancesDeg: [7, 6, 5.5, 5, 5, 5], holdMs: 900, travelDeg: [150, 320], heatFalloffDegs: [90, 70, 50, 40, 30, 30], decoys: 3, inertiaMs: 90, lockTimeMs: 30000, randomDirs: true },
  { locks: 6, tolerancesDeg: [6, 5.5, 5, 5, 5, 5], holdMs: 1000, travelDeg: [160, 340], heatFalloffDegs: [80, 60, 45, 35, 25, 25], decoys: 4, inertiaMs: 110, lockTimeMs: 28000, randomDirs: true },
];

export const roundRules = (round: number): RoundRules => ROUNDS[Math.max(0, Math.min(round, ROUNDS.length - 1))];

/** Safe Cracker tuning knobs. Kid-friendly early on (wide sweet spots, no penalties); gets trickier round by round (see ROUNDS). */
export const SAFECRACKER = {
  id: 'safecracker',
  sceneKey: 'SafeCracker',

  /**
   * Rounds needed to win the match. Was 4 wins of ~13-30 s rounds (1.5-3.5 minutes). Rounds now grow from ~20 s (3 locks, the old
   * safe) to ~55 s (6 locks, fakes, heavy dial) for a typical child (bot simulation; slower children take longer), so 4 wins
   * is about 5-7 rounds = 4-6 minutes.
   */
  targetRounds: 4,
  /** Max locks over all rounds (sizes the lock lights). */
  maxLocks: 6,
  /** Default travel from one secret angle to the next (degrees): rounds override it with their own range (see ROUNDS). */
  minTravelDeg: 110,
  maxTravelDeg: 250,
  /** Degrees the dial must be turned the other way before its "direction of travel" flips (ignores finger jitter). */
  dirHysteresisDeg: 14,
  /** Where a decoy sits along the travel to the real spot (fraction range), so the dial passes it on the way. */
  decoyFracMin: 0.3,
  decoyFracMax: 0.55,
  /** The dial sticks for this long after a fake click (ms). */
  jamMs: 450,
  /** Heat at which the lock timer pauses (the dial is warm, so a child who is nearly there is never reset). */
  timerPauseHeat: 0.8,
  /** How long the "what's new this round" banner stays on the safes (ms). */
  bannerMs: 2400,
  /** Finger closer than this to the dial centre (px) does not steer the dial. */
  minTouchRadius: 40,

  /** Ticking: silent below minHeat, then the gap shrinks from slowMs to fastMs as the dial gets hot. */
  tick: { minHeat: 0.3, slowMs: 650, fastMs: 85, baseHz: 520, topHz: 1150 },
  /** Gentle buzz when hotter than this. */
  vibrateHeat: 0.9,
  vibrateEveryMs: 160,

  /** Pause after a round is won before the next round's countdown (ms). */
  doorOpenMs: 1700,
  betweenRoundsMs: 900,
} as const;

/** Layout in a player's own (rotated) frame; the safe is centred `centreInset` px from their screen edge. */
export const LAYOUT = {
  centreInset: 420,
  centreY: H / 2,
  /** Half size of the safe frame and door face. */
  frameHalf: 322,
  faceHalf: 290,
  dialRadius: 182,
  ringRadius: 214,
  arrowRadius: 262,
  /** Lock lights row, distance above the safe centre (local, away from the player). */
  lightsY: 395,
  lightsGap: 96,
  /** Score badge positions (screen), kept clear of the safes and pause buttons. */
  badgeP0: { x: 100, y: 130 },
  badgeP1: { x: W - 100, y: H - 130 },
} as const;

export const TEXT = { open: 'OPEN!' } as const;

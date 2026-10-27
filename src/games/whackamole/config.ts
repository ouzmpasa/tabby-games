import { H } from '../../core/layout';

/**
 * Whack-a-Mole Race tuning knobs. Kid-friendly: big holes, slow pops at first, generous hit areas, nothing ever costs points.
 * The match is first to `targetScore` ROUNDS; a round is first to `roundPoints` points. One difficulty clock runs through the
 * whole match (it does not restart with a round), so the game keeps getting faster, busier and trickier for ~4 minutes.
 */
export const WHACKAMOLE = {
  id: 'whackamole',
  sceneKey: 'WhackAMole',

  /** Rounds needed to win the match. */
  targetScore: 3,
  /** Points that win a round. */
  roundPoints: 42,
  /** Pause after a round before the next countdown (ms). */
  roundPauseMs: 2200,
  /** Points for a normal / golden mole / defeated boss. */
  normalPoints: 1,
  goldenPoints: 3,
  bossPoints: 5,
  /** Chance that a spawned mole is golden, and how much shorter a golden one stays up (factor on the normal time). */
  goldenChance: 0.1,
  goldenUpFactor: 0.7,

  /** How long a mole stays up (ms): starts at upStartMs, eases to upEndMs over rampMs of play. */
  upStartMs: 1900,
  upEndMs: 950,
  /** Average gap between spawns on one side (ms): gapStartMs -> gapEndMs over rampMs. Both sides use the same numbers. */
  gapStartMs: 1350,
  gapEndMs: 560,
  rampMs: 190000,
  /** Max moles up at once on one side: maxActiveStart, then one more after each of `moreMolesAfterMs`. */
  maxActiveStart: 2,
  moreMolesAfterMs: [30000, 110000],
  /** A hole stays empty this long after its mole leaves (ms), so the same hole does not flicker. */
  holeCooldownMs: 450,
  /** Delay before the very first mole after GO (ms). */
  firstSpawnMs: 600,

  /**
   * Friendly bunny (decoy): do NOT whack it. From `decoyAfterMs` it pops up with a chance that grows to `decoyChanceMax`
   * over `decoyRampMs`; whacking one only stuns you for `stunMs` (no points lost).
   */
  decoyAfterMs: 28000,
  decoyChanceMax: 0.2,
  decoyRampMs: 90000,
  stunMs: 1000,

  /** Boss mole: from `bossAfterMs` one comes up on each side every `bossEveryMs`, stays `bossUpMs`, needs `bossHp` hits (worth `bossPoints`). */
  bossAfterMs: 60000,
  bossEveryMs: 20000,
  bossUpMs: 3800,
  bossHp: 3,

  /** Tap within this distance (px) of a hole holding a mole counts as a hit (holes are ~200 px wide). */
  hitRadius: 150,
  /** Rise / sink animation (ms). */
  riseMs: 170,
  sinkMs: 230,
} as const;

/** Hole grid per player: cols run along the screen y axis, rows go away from the player (screen x). */
export const GRID = {
  cols: 3,
  rows: 3,
  /** Spacing between hole centres along y (across the player's width) and along x (away from the player). */
  gapY: 270,
  gapX: 230,
  /** Screen x of the row nearest to the player (mirrored for player 1). */
  nearX: 330,
  centerY: H / 2,
  holeW: 200,
  holeH: 110,
} as const;

/** Round progress bar along the outer edge of each half (screen px, mirrored for player 1). */
export const BAR = {
  x: 66,
  w: 26,
  y0: 360,
  y1: 960,
} as const;

/** Hardcoded strings (i18n is wired elsewhere). */
export const WHACKAMOLE_STRINGS = {
  round: 'ROUND!',
  oops: 'OOPS!',
  friend: 'FRIEND!',
} as const;

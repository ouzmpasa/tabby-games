import { H, W } from '../../core/layout';

/**
 * Cannon Duel tuning knobs. Side view: lengths in the 1920x1080 design space, speeds in px/s, times in ms.
 * Defaults are kid-friendly at the start (a big blast radius, no wind, a short reload) and get harder every couple of rounds
 * (see `levels`). There is deliberately NO trajectory preview, landing ring or power bar: the barrel angle (plus two dots) is
 * the only aid; judging how hard to pull is the skill. After a shot a ring marks where it came down so players can correct.
 */
export const CANNONDUEL = {
  id: 'cannonduel',
  sceneKey: 'CannonDuel',

  /**
   * Hits needed to win. A round now lasts ~20-40 s (first shots usually miss, wind and hills change every round), so
   * 12 hits is a ~4-6 minute match.
   */
  targetScore: 12,

  /** y of the flat ground line. */
  groundY: H - 200,
  /** Cannon pivot x, measured from each screen edge. */
  cannonInset: 230,
  /** Pivot height above the ground. */
  pivotHeight: 62,
  /** Barrel length from the pivot to the muzzle. */
  barrelLength: 96,
  /** Visual radius of the shell. */
  shellRadius: 18,
  /** A shell hits when it comes within this distance of the cannon's centre (the blast radius). Level rows below shrink it. */
  hitRadius: 125,

  /** Gravity (px/s^2, downwards). */
  gravity: 1400,
  /** Horizontal wind acceleration (px/s^2, + = to the right). Set per round from the level (0 here = calm). */
  wind: 0,

  /** Slingshot: pull back less than this (px) and the shot is cancelled. */
  minPull: 40,
  /** A pull of maxPull px is full power; the muzzle speed grows linearly from minSpeed (minPull) to maxSpeed (maxPull), px/s. The long pull range gives fine control. */
  maxPull: 480,
  minSpeed: 450,
  maxSpeed: 1650,
  /** Direction cue: two dots on the barrel line at these distances from the pivot (px). They never change with power. */
  cueDots: [150, 205],
  /** Barrel elevation limits (degrees above horizontal). */
  minElevationDeg: 8,
  maxElevationDeg: 85,
  /** Elevation of an idle barrel. */
  idleElevationDeg: 45,

  /** Time to reload after firing (ms) when nothing else says so; each round draws its own from the level row. */
  reloadMs: 1800,
  /** Pause after a hit before the next countdown (ms). */
  hitPauseMs: 1500,

  /** The hill in the middle: height range, half-width range and how far its centre may sit off the middle (px). */
  hillMinHeight: 120,
  hillMaxHeight: 340,
  hillMinHalfWidth: 150,
  hillMaxHalfWidth: 260,
  hillMaxOffset: 140,

  /**
   * The difficulty ladder, one row per level; the level goes up every `roundsPerLevel` rounds:
   *  - hitRadius: blast radius around a cannon (shrinks)
   *  - windMax:   strongest wind (px/s^2); each round rolls a random direction and 40-100% of this
   *  - hillMax:   tallest hill that can appear
   *  - insetMax:  each round the two cannons stand at a random distance from their edge between cannonInset and this, so the range changes
   *    from round to round (what you learned last round does not carry over)
   *  - sway:     the cannons rock to and from each other by up to this many px (swayPeriodMs per swing), a moving target
   *  - reloadMin/reloadMax: each round both cannons reload in a time drawn from this range (ms), so a miss costs more later
   */
  roundsPerLevel: 2,
  levels: [
    { hitRadius: 125, windMax: 0, hillMax: 220, reloadMin: 1400, reloadMax: 1800, insetMax: 260, sway: 0 },
    { hitRadius: 115, windMax: 0, hillMax: 250, reloadMin: 1500, reloadMax: 2000, insetMax: 320, sway: 0 },
    { hitRadius: 105, windMax: 35, hillMax: 280, reloadMin: 1700, reloadMax: 2300, insetMax: 380, sway: 0 },
    { hitRadius: 95, windMax: 55, hillMax: 310, reloadMin: 1900, reloadMax: 2600, insetMax: 430, sway: 50 },
    { hitRadius: 85, windMax: 75, hillMax: 340, reloadMin: 2100, reloadMax: 2900, insetMax: 470, sway: 80 },
    { hitRadius: 76, windMax: 95, hillMax: 340, reloadMin: 2300, reloadMax: 3200, insetMax: 480, sway: 110 },
  ],
  /** One full swing of the swaying cannons (ms). */
  swayPeriodMs: 5200,
  /** How long the ring marking where a shell came down stays (ms). */
  markMs: 3200,

  /** Crater radius where a shell lands (visual only). */
  craterRadius: 46,
  /** Shells that leave the screen sideways further than this are lost. */
  outMargin: 200,
  /** Trajectory preview: max seconds simulated and spacing between dots (px along the path). */
  previewMaxSec: 4,
  previewDotGap: 44,
  /** Screen centre x. */
  centerX: W / 2,
} as const;

/** Text the players must read (en + nl). */
export const CANNONDUEL_TEXT = {
  en: { hint: 'Pull back and let go!', hint2: 'Watch the wind' },
  nl: { hint: 'Trek terug en laat los!', hint2: 'Let op de wind' },
} as const;

export type CannonDuelConfig = typeof CANNONDUEL;

import { H, W } from '../../core/layout';

/**
 * Snowball Fight tuning knobs. Top-down field in the 1920x1080 design space: lengths in px, speeds in px/s, times in ms.
 * Defaults are kid-friendly at the start (slow kids, a big splat radius, a generous reload, long warnings) and get harder
 * as the leader scores (see `levels`). There is deliberately NO landing ring, dotted line to the target or power bar for your
 * own throws: just the rubber band and a short direction cue. You see where a throw landed afterwards (a coloured ring and a
 * splat) and the sound pitch tells how far it went. Only a snowball that is about to hit a kid shows a short warning ring.
 */
export const SNOWBALL = {
  id: 'snowball',
  sceneKey: 'Snowball',

  /**
   * Hits needed to win. Simulated for two 7-8 year olds: ~4-5 minutes (see tests/unit/snowball.test.ts notes);
   * smaller children stay on the easy levels because the ramp follows the leader's score.
   */
  targetScore: 16,
  /** Difficulty goes up one level every this many points of the leader. */
  pointsPerLevel: 2,
  /** A player this many points (or more) behind gets a bigger splat radius (x catchUpSplat). */
  catchUpGap: 3,
  catchUpSplat: 1.15,
  /**
   * Safety net so a match between two small children cannot drag on: after mercyAfterMs the splat radius grows by mercyStep
   * every mercyEveryMs (up to mercyMax), for both players.
   */
  mercyAfterMs: 270000,
  mercyEveryMs: 20000,
  mercyStep: 0.12,
  mercyMax: 0.8,

  /** Distance of each kid's lane from its screen edge. */
  laneInset: 290,
  /** Lane ends (screen y) between which each kid walks back and forth. */
  laneMinY: 190,
  laneMaxY: H - 190,
  /** Patrol speed (px/s) at level 0, identical for both kids. Later levels are faster. */
  kidSpeed: 170,
  /** Visual size of a kid. */
  kidRadius: 56,

  /** A snowball hits a kid whose centre is within this distance of the landing spot (level 0; later levels shrink it). Never drawn while aiming. */
  splatRadius: 125,

  /** Time to reload between throws (ms) at level 0. */
  reloadMs: 1200,
  /**
   * Duck: how long the kid stays down (ms). Ducking costs stamina: each duck uses duckCost of a full bar (1.0), and the bar
   * refills at the level's staminaRegen (share of a full bar per second). So two quick ducks in a row empty it.
   */
  duckMs: 800,
  duckCost: 0.5,

  /**
   * The difficulty ladder, one row per level (level = floor(leader's score / pointsPerLevel)):
   *  - kidSpeed:    patrol speed (px/s)
   *  - eventEveryMs: on average, how often a kid does something unexpected (0 = never): turns round, or stops (stopShare of the time)
   *  - stopShare:   share of those events that are a short stop instead of a turn
   *  - splatRadius: how close a landing must be to hit (px)
   *  - reloadMs:    time between throws
   *  - warnMs:      how long before landing the "incoming!" ring shows on a ball that is about to hit a kid
   *  - staminaRegen: duck stamina refilled per second (share of a full bar)
   *  - coverPerSide: snow mounds standing in front of each kid; a low ball that flies through one is stopped
   */
  levels: [
    { kidSpeed: 170, eventEveryMs: 0, stopShare: 0, splatRadius: 125, reloadMs: 1200, warnMs: 900, staminaRegen: 0.5, coverPerSide: 0 },
    { kidSpeed: 200, eventEveryMs: 0, stopShare: 0, splatRadius: 118, reloadMs: 1300, warnMs: 800, staminaRegen: 0.45, coverPerSide: 0 },
    { kidSpeed: 230, eventEveryMs: 4500, stopShare: 0.5, splatRadius: 112, reloadMs: 1400, warnMs: 700, staminaRegen: 0.4, coverPerSide: 1 },
    { kidSpeed: 255, eventEveryMs: 3800, stopShare: 0.5, splatRadius: 105, reloadMs: 1500, warnMs: 620, staminaRegen: 0.35, coverPerSide: 1 },
    { kidSpeed: 280, eventEveryMs: 3200, stopShare: 0.5, splatRadius: 98, reloadMs: 1600, warnMs: 550, staminaRegen: 0.3, coverPerSide: 2 },
    { kidSpeed: 305, eventEveryMs: 2800, stopShare: 0.45, splatRadius: 92, reloadMs: 1700, warnMs: 500, staminaRegen: 0.27, coverPerSide: 2 },
    { kidSpeed: 330, eventEveryMs: 2400, stopShare: 0.45, splatRadius: 86, reloadMs: 1800, warnMs: 450, staminaRegen: 0.24, coverPerSide: 2 },
  ],
  /** A kid is about to do something unexpected: it wobbles for this long first (ms), so careful players can read it. */
  tellMs: 450,
  /** How long a kid stands still in a stop (ms). */
  stopMs: 700,
  /** Cover mounds: radius, the lift (0..1 arc height) under which a ball is stopped by one, and how often they move (ms). */
  coverRadius: 70,
  coverLift: 0.5,
  coverShuffleMs: 11000,
  /** Cover stands this far in front of a kid's lane (px, min..max) toward the middle. */
  coverNear: 150,
  coverFar: 330,
  /** Direction cue: always this many dots, this far apart (never shows the distance). */
  aimDots: 5,
  aimDotGap: 46,
  /** The ring marking where a throw landed stays this long (ms). */
  landMarkMs: 2600,
  /** A press is a tap (= duck) when it is shorter than this (ms) and moved less than tapMaxMove (px). */
  tapMaxMs: 260,
  tapMaxMove: 30,

  /** Slingshot: pulling back less than minPull (px) cancels the throw. Range = pull * pullScale, clamped to [minRange, maxRange]. */
  minPull: 40,
  pullScale: 3.2,
  minRange: 180,
  maxRange: 1500,
  /** Snowballs cannot be thrown outside this margin of the screen. */
  fieldMargin: 100,
  /** Flight time = flightBaseMs + range / flightSpeed. Longer throws take longer, so far targets need more leading. */
  flightBaseMs: 450,
  flightSpeed: 1000,

  /** How long a hit kid keeps a snowy face (ms). */
  snowyFaceMs: 2200,

  /** Decorative snow mounds in the middle of the field (landing on one only makes a puff). */
  mounds: [
    { x: W / 2, y: 280, r: 78 },
    { x: W / 2 - 170, y: 560, r: 92 },
    { x: W / 2 + 190, y: 700, r: 70 },
    { x: W / 2 + 40, y: 880, r: 60 },
  ],
} as const;

export type SnowballConfig = typeof SNOWBALL;

/** Texts a player must read (the scene faces them to the right player). */
export const SNOWBALL_TEXT = {
  en: { throwHint: 'Pull back and let go to throw!', duckHint: 'Quick tap = duck (it tires you out)' },
  nl: { throwHint: 'Trek terug en laat los!', duckHint: 'Even tikken = bukken (dat maakt moe)' },
} as const;

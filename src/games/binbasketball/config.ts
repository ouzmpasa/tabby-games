import { H, W } from '../../core/layout';

/**
 * Bin Basketball tuning knobs. Top-down view: lengths in the 1920x1080 design space, speeds in px/s, times in ms.
 * Defaults are kid-friendly at the start (a big, slow bin) and get harder as the leader scores (see `levels`).
 * There is deliberately NO landing ring and NO power bar: judging how far to pull is the skill. The only aids are a short
 * dotted direction cue (the same length whatever the pull), the rubber band, and feedback AFTER the throw (a mark where the
 * ball landed, the pitch of the throw sound).
 */
export const BINBASKETBALL = {
  id: 'binbasketball',
  sceneKey: 'BinBasketball',

  /**
   * Points needed to win. Simulated (see tests/unit/binbasketball.test.ts notes): ~4-5 minutes for two 7-8 year olds,
   * longer for 5 year olds (who stay on the easy levels because the ramp follows the LEADER'S score, not the clock).
   */
  targetScore: 24,
  /** Difficulty goes up one level every this many points of the leader (so levels 0..levels.length-1 over a match). */
  pointsPerLevel: 2.5,
  /** A player this many points (or more) behind gets a bigger scoring area (x catchUpHit) so a close match stays close. */
  catchUpGap: 3,
  catchUpHit: 1.15,

  /** Visual radius of a paper ball. */
  ballRadius: 46,
  /** Distance of each ball's home spot from its player's screen edge. */
  homeInset: 260,

  /** Visual radius of the bin (top-down) at level 0. Later levels shrink it, see `levels`. */
  binRadius: 124,
  /** A ball scores when it lands within the bin radius * hitFactor of the bin centre. */
  hitFactor: 0.92,
  /** Bin speed along its track (px/s) at level 0. Later levels speed it up, see `levels`. */
  binSpeed: 230,
  /** Bin travels between these screen y values (centre of the bin). */
  binMinY: 220,
  binMaxY: H - 220,
  /** Bin x (centre of the screen). */
  binX: W / 2,

  /**
   * The difficulty ladder, one row per level (the level is floor(leader's score / pointsPerLevel)):
   *  - radius: visual bin radius (the scoring area is radius * hitFactor); the bin shrinks as it goes up
   *  - speed:  bin speed along its track (px/s)
   *  - mode:   'sweep' = steady up and down; 'stop' = quick moves with a short stop at the top, middle and bottom;
   *            'dart' = surges between slow and fast
   *  - drift:  how far (px) the bin also sways sideways, which changes how far the ball has to go
   *  - wind:   the strongest gust (px/s of sideways push; a ball is pushed by wind * flight time). Changes after every point.
   */
  levels: [
    { radius: 124, speed: 230, mode: 'sweep', drift: 0, wind: 0 },
    { radius: 118, speed: 260, mode: 'sweep', drift: 0, wind: 0 },
    { radius: 112, speed: 290, mode: 'stop', drift: 0, wind: 30 },
    { radius: 106, speed: 320, mode: 'sweep', drift: 0, wind: 45 },
    { radius: 100, speed: 350, mode: 'dart', drift: 60, wind: 60 },
    { radius: 94, speed: 380, mode: 'stop', drift: 90, wind: 75 },
    { radius: 88, speed: 410, mode: 'dart', drift: 120, wind: 90 },
    { radius: 82, speed: 440, mode: 'sweep', drift: 150, wind: 105 },
  ],
  /** 'stop' mode: how long the bin waits at each stop (ms) and how much faster it travels in between. */
  stopMs: 650,
  stopSpeedUp: 1.6,
  /** 'dart' mode: the speed is multiplied by 1 + dartDepth * sin(...) with this period (ms). */
  dartDepth: 0.75,
  dartPeriodMs: 3200,
  /** Sideways sway period (ms). */
  driftPeriodMs: 6500,
  /** The bin changes size at this many px/s so a level-up is visible but not a jump. */
  radiusChangeSpeed: 30,
  /** ...and the sideways sway grows at this many px/s. */
  driftChangeSpeed: 40,
  /** The wind also changes by itself this often (ms) even if nobody scores. */
  windEveryMs: 14000,
  /**
   * Safety net so a match between two small children can never drag on: after mercyAfterMs of play the scoring area grows by
   * mercyStep every mercyEveryMs (up to mercyMax), for both players.
   */
  mercyAfterMs: 270000,
  mercyEveryMs: 20000,
  mercyStep: 0.12,
  mercyMax: 0.8,
  /** Hit streak: every this-many hits in a row by one player earns one bonus point. */
  comboEvery: 3,

  /** Slingshot: pull the finger back this far (px) to start aiming; shorter pulls cancel the throw. */
  minPull: 50,
  /** Landing distance = pull length * pullScale (clamped to the throw distance limits below). A long pull range = fine resolution. */
  pullScale: 3,
  /** Direction cue: always this many dots, this far apart (reveals the direction, never the distance). */
  aimDots: 5,
  aimDotGap: 46,
  /** A flick slower than this (px/s) is ignored and the ball stays put. */
  minFlickSpeed: 550,
  /** Seconds of flight the flick speed is worth: landing distance = speed * this. */
  distancePerSpeed: 0.3,
  /** Landing distance limits (px). */
  minThrowDistance: 220,
  maxThrowDistance: 1350,
  /** Widest angle (degrees) from straight-at-the-opponent a throw may take. */
  maxThrowAngleDeg: 65,
  /** Only the last this-many ms of finger movement count as the flick. */
  flickWindowMs: 110,
  /** Flick is ignored if the finger rested this long before lifting. */
  flickStaleMs: 90,

  /** Flight time = flightBaseMs + distance * flightPerPx. */
  flightBaseMs: 600,
  flightPerPx: 0.5,
  /** Extra apparent size at the top of the toss (1 = +100%). */
  arcHeight: 0.6,
  /** Missed ball rests where it landed, then rolls home. */
  restMs: 450,
  returnMs: 500,
  /** Scored ball shrinks into the bin. */
  sinkMs: 380,
  /** The mark showing where a ball landed stays this long (ms). */
  landMarkMs: 2600,
} as const;

/** Text the players must read (en + nl). */
export const BINBASKETBALL_TEXT = {
  en: { hint: 'Pull back and let go!', hint2: 'Not too hard, not too soft', combo: 'COMBO!' },
  nl: { hint: 'Trek terug en laat los!', hint2: 'Niet te hard, niet te zacht', combo: 'COMBO!' },
} as const;

export type BinBasketballConfig = typeof BINBASKETBALL;

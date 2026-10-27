/**
 * Penalty Shootout tuning knobs. Top-down view: lengths in the 1920x1080 design space, speeds in px/s, times in ms.
 * Defaults are kid-friendly at the start (a big goal, a keeper with a speed limit) and get harder every few kicks (see `levels`).
 * The shooter gets NO landing marker and NO power bar: only a short dotted cue showing the direction (the keeper can read it
 * too, which is the bluffing part). Power is a skill: too soft is slow and easy to save, too hard flies over the bar. After
 * the kick a power ring shows how hard it was, so players learn the sweet spot.
 */
export const PENALTY = {
  id: 'penalty',
  sceneKey: 'Penalty',

  /**
   * Goals needed to win. With the level ramp below the simulated goal rate falls from ~50% to ~25%, so a match is ~40-50
   * kicks (about 4-5 minutes at ~5-6 s per kick).
   */
  targetScore: 7,

  /** Distance of the goal line from the screen edge of the player who defends it. */
  goalInset: 230,
  /** Half the opening of the goal (centred on the screen's middle). The full mouth is twice this. */
  goalHalfH: 240,
  /** How far the net extends behind the goal line (visual). */
  netDepth: 100,
  /** Distance of the penalty spot from the shooter's own screen edge. */
  spotInset: 470,
  /** Visual radius of the ball. */
  ballRadius: 38,

  /** Half the keeper's reach (level 0; later levels grow it) along the goal line (the keeper is 2x this tall). */
  keeperHalf: 100,
  /** Keeper's centre stays this far inside the posts' centre range (px, positive = less travel). */
  keeperEdgeMargin: 40,
  /** The fastest the keeper may slide toward the finger (px/s): it can not teleport. */
  keeperSpeed: 420,

  /**
   * The difficulty ladder, one row per level; the level goes up every `levelEveryKicks` kicks (both players' kicks counted):
   *  - goalHalfH:    half the goal opening (px); the goal is narrowed with side boards
   *  - keeperHalf:   half the keeper's reach (px)
   *  - keeperSpeed:  the fastest the keeper may slide (px/s)
   *  - overAt:       a kick harder than this share of full power flies over the bar
   *  - blockerSpeed: 0 = none; otherwise a defender cone patrols up and down mid-pitch at this speed (px/s) and blocks shots
   */
  levelEveryKicks: 6,
  levels: [
    { goalHalfH: 240, keeperHalf: 100, keeperSpeed: 420, overAt: 0.95, blockerSpeed: 0 },
    { goalHalfH: 230, keeperHalf: 106, keeperSpeed: 460, overAt: 0.92, blockerSpeed: 0 },
    { goalHalfH: 220, keeperHalf: 112, keeperSpeed: 500, overAt: 0.9, blockerSpeed: 0 },
    { goalHalfH: 210, keeperHalf: 118, keeperSpeed: 540, overAt: 0.88, blockerSpeed: 220 },
    { goalHalfH: 200, keeperHalf: 122, keeperSpeed: 580, overAt: 0.86, blockerSpeed: 300 },
    { goalHalfH: 190, keeperHalf: 126, keeperSpeed: 620, overAt: 0.84, blockerSpeed: 380 },
  ],

  /** The defender cone: half its size along the goal line, and how far from the spot it stands (0..1 of the way to the goal). */
  blockerHalf: 44,
  blockerAt: 0.55,
  /** Slingshot: pull shorter than this (px) cancels the kick. */
  minPull: 50,
  /** Pull length (px) that gives full power (the sweet spot is well below it, see overAt). */
  maxPull: 320,
  /** Widest angle (degrees) from straight at the goal. */
  maxAngleDeg: 24,
  /** Finger angle is multiplied by this: <1 = a wobbly pull still hits the goal (the finger needs ~16 degrees to miss at level 0). */
  angleGain: 0.7,
  /** Flight time: weakest shot, and full-power shot (ms). */
  slowFlightMs: 900,
  fastFlightMs: 400,
  /** Extra apparent ball size at the top of the arc (0.5 = +50%). */
  arcHeight: 0.55,
  /** A shot is saved when it lands within keeperHalf + this many px of the keeper's centre. */
  saveSlack: 16,

  /** Direction cue: always this many dots, this far apart, whatever the power (it never shows the distance or the power). */
  aimDots: 4,
  aimDotGap: 50,

  /** Pause on the result (GOAL / SAVED / WIDE) before the roles swap (ms). */
  resultPauseMs: 1700,
} as const;

/** Text the players see. Fixed (not in i18n): short words that kids learn to recognise by sight. */
export const PENALTY_TEXT = {
  shoot: 'SHOOT!',
  save: 'SAVE!',
  goal: 'GOAL!',
  saved: 'SAVED!',
  wide: 'WIDE!',
  over: 'OVER!',
  blocked: 'BLOCKED!',
} as const;

/** Hint under the shooter's label for the first kicks (en + nl). */
export const PENALTY_HINT = {
  en: 'Pull back, let go. Not too hard!',
  nl: 'Trek terug, laat los. Niet te hard!',
} as const;

/** Only the first this-many kicks show the hint. */
export const HINT_KICKS = 4;

/** Extra colours for this game. */
export const PENALTY_COLORS = {
  /** Aim marker when the shot would miss the goal. */
  miss: 0xff6b6b,
  grass: 0x2c4a45,
  grassStripe: 0x305049,
  post: 0xf5f7fa,
} as const;

export type PenaltyConfig = typeof PENALTY;

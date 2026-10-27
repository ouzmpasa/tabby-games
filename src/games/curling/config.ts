import { H, W } from '../../core/layout';

/**
 * Curling tuning knobs. Top-down view along the x axis: lengths in the 1920x1080 design space, speeds in px/s, times in ms.
 * Defaults are kid-friendly: big stones, a big house, gentle friction so a shot is easy to read.
 */
export const CURLING = {
  id: 'curling',
  sceneKey: 'Curling',

  /** Points needed to win (total over all ends). */
  targetScore: 10,
  /** Stones each player throws per end. */
  stonesPerEnd: 3,
  /** At most this many points can be scored in one end. */
  maxEndPoints: 3,

  /** The sheet (ice). A stone whose centre crosses one of these edges is out (sides and back lines). */
  sheet: { left: 200, right: 1720, top: 150, bottom: 930 },
  /** The house: one in the centre; ring radii from the outside in (the last one is the button). */
  centerX: W / 2,
  centerY: H / 2,
  rings: [260, 185, 110, 38],
  /** Where each player's stone waits (distance from the centre along x). */
  launchOffsetX: 630,
  stoneRadius: 44,

  /**
   * Slingshot: pulls shorter than minPull cancel the throw; maxPull is full power. There is deliberately NO distance aid
   * (no ghost, power bar or ring): the player judges the pull by feel. The pull range is long so power has fine resolution.
   * Full power (~1550 px unswept) sails past the back line; reaching the button (630 px) takes a ~25% pull.
   */
  minPull: 40,
  maxPull: 400,
  /** Launch speed at the weakest / strongest counted pull. */
  minShotSpeed: 400,
  maxShotSpeed: 1900,
  /** Direction cue: the dotted line always has this many dots, spaced `aimDotGap` px, whatever the pull (reveals no power). */
  aimDots: 6,
  aimDotGap: 44,
  /** A throw can point at most this far (radians) away from the line to the house. */
  maxAimAngle: (70 * Math.PI) / 180,

  /** Physics. Ice friction is exponential: speed *= exp(-damping * dt); under stopSpeed a stone rests. */
  damping: 1.2,
  stopSpeed: 14,
  /**
   * Sweeping (the skill element). While the thrower's stone slides they scrub a finger back and forth on their own half.
   * Strokes = direction reversals of at least sweepMinStroke px, counted over the last sweepWindowMs. The stroke rate maps to
   * a 0..1 sweep effort (smoothstep from sweepMinRate to sweepFullRate strokes/s, flat above: the sweet spot is 6-8/s),
   * the displayed/applied level rises at sweepRise per second and decays at sweepFall per second once you stop.
   * At full effort the stone's damping is multiplied by sweepDamping (so it slides ~1.8x farther); it never speeds the stone up.
   */
  sweepDamping: 0.55,
  sweepMinRate: 1.5,
  sweepFullRate: 6,
  sweepWindowMs: 800,
  sweepMinStroke: 28,
  sweepRise: 5,
  sweepFall: 1.4,
  /**
   * Curl: the thrown stone's velocity direction turns at curlRate * (random 0.4..1 of it, random sign fixed per throw)
   * * (1 - speed / launchSpeed) rad/s, i.e. the drift grows as the stone slows. Sweeping at full effort cuts the turn by
   * curlSweepCut. curlRate is tuned so a full-length throw drifts <= ~60 px sideways.
   */
  curlRate: 0.12,
  curlMinFrac: 0.4,
  curlSweepCut: 0.5,

  /** Bounciness of stone-stone hits (1 = perfectly elastic). */
  restitution: 0.92,
  maxSpeed: 2000,

  /** A sliding stone is forced to rest after this long (never stalls). */
  slideTimeoutMs: 8000,
  /** If the active player throws nothing for this long, the stone is forfeited and the turn passes. */
  aimIdleMs: 20000,
  /** Pause after everything is at rest before the next turn / the scoring. */
  settleDelayMs: 500,
  /** Time between the points of the scoring animation, and the pause after it. */
  scoreStepMs: 650,
  endPauseMs: 1500,
} as const;

export type CurlingConfig = typeof CURLING;

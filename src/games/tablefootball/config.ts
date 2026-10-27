import { H, W } from '../../core/layout';

/**
 * Table Football tuning knobs. All lengths are in the 1920x1080 design space, speeds in px/s.
 * Defaults are kid-friendly: big figures, wide goals, a ball that never stops completely.
 */
export const TABLEFOOTBALL = {
  id: 'tablefootball',
  sceneKey: 'TableFootball',

  /** Goals needed to win. */
  targetScore: 12,
  /**
   * Difficulty ramp. Match progress runs 0..1 (leader's score / (target-1), or total goals / (2*(target-1)), whichever is
   * higher). Over the match the goals shrink from `goalWidth` to `goalWidthEnd`, the serve gets faster and the ball's top
   * speed rises.
   */
  goalWidthEnd: 215,
  serveSpeedEnd: 640,
  ballMaxSpeedEnd: 1900,
  /**
   * Rally speed-up: the minimum kick grows with every figure hit since the serve (kickSpeed + hits * kickSpeedUp, capped at
   * kickSpeedMax), so long rallies get faster. Resets after each goal.
   */
  kickSpeedUp: 55,
  kickSpeedMax: 1050,
  /**
   * Special points (chosen per point from the match progress, announced on the field): TURBO (ball is turboFactor times faster
   * from the first kick), MOVING GOALS (both goal mouths glide up and down, amplitude growing to sweepAmpEnd) and, late in the
   * match, both together. `modeFromProgress` is where the first special point can show up; the chance rises to `modeChanceEnd`.
   */
  modeFromProgress: 0.12,
  modeChanceEnd: 0.8,
  sweepFromProgress: 0.3,
  comboFromProgress: 0.7,
  turboFactor: 1.35,
  sweepAmpStart: 90,
  sweepAmpEnd: 170,
  sweepPeriodSec: 5,
  /** Ball radius. */
  ballRadius: 32,
  /** Figure (kicker) radius. */
  figureRadius: 46,
  /** Opening of each goal mouth, centred on the short end. */
  goalWidth: 300,
  /** Ball top speed (px/s). */
  ballMaxSpeed: 1600,
  /** Bounciness of the walls (1 = perfect bounce). */
  wallRestitution: 0.85,
  /** Bounciness of ball vs figure. */
  figureRestitution: 0.8,
  /** Ball slow-down per second. */
  friction: 0.3,
  /** Friction never slows the ball below this, so it cannot stall in a dead spot. */
  ballMinSpeed: 150,
  /** Every kick sends the ball away from the figure at least this fast (px/s), so taps and soft hits still count. */
  kickSpeed: 520,
  /** Fastest a rod may slide toward the finger (px/s). */
  rodMaxSpeed: 3200,
  /** Physics substeps per frame. */
  substeps: 6,
  /** Speed of the serve (px/s). */
  serveSpeed: 420,
  /** Pause after a goal before the countdown starts (ms). */
  goalPauseMs: 1100,
} as const;

/** Rods per player, ordered from their own goal outward. `dx` is the distance from the player's end line. */
export const RODS = [
  { name: 'keeper', dx: 80, figures: 1, spacing: 0 },
  { name: 'defence', dx: 330, figures: 2, spacing: 300 },
  { name: 'forward', dx: 560, figures: 3, spacing: 230 },
] as const;

/** Pitch playing surface, centred in the screen. */
export const PITCH = {
  x: W / 2 - 635,
  y: H / 2 - 378,
  w: 1270,
  h: 756,
} as const;

export const TABLEFOOTBALL_STRINGS = {
  turbo: { en: 'TURBO BALL!', nl: 'TURBOBAL!' },
  sweep: { en: 'MOVING GOALS!', nl: 'BEWEGENDE DOELEN!' },
  combo: { en: 'TURBO + MOVING GOALS!', nl: 'TURBO + BEWEGENDE DOELEN!' },
} as const;

export type TableFootballConfig = typeof TABLEFOOTBALL;
export type PitchRect = { x: number; y: number; w: number; h: number };
export interface RodDef {
  dx: number;
  figures: number;
  spacing: number;
}

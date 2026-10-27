import { H, W } from '../../core/layout';

/**
 * Air Hockey tuning knobs. All lengths are in the 1920x1080 design space, speeds in px/s.
 * Defaults are kid-friendly: slower puck than real air hockey, big mallets, wide goals.
 */
export const AIRHOCKEY = {
  id: 'airhockey',
  sceneKey: 'AirHockey',

  /** Goals needed to win. */
  targetScore: 12,
  /**
   * Difficulty ramp. Match progress runs 0..1 (leader's score / (target-1), or total goals / (2*(target-1)), whichever is
   * higher). Goals shrink from `goalWidth` to `goalWidthEnd` and the serve gets faster, so the second half of the match
   * is clearly harder than the first. Tables with obstacles appear from `bumperFromProgress` on.
   */
  goalWidthEnd: 230,
  serveSpeedEnd: 720,
  /** Progress at which the first bumper tables can show up, and the chance of a bumper table at progress 1. */
  bumperFromProgress: 0.15,
  bumperChanceEnd: 0.75,
  /** Progress from which the bumper may sweep up and down, and from which a table may have two sweeping bumpers. */
  movingFromProgress: 0.4,
  twinFromProgress: 0.7,
  /** Bumper (round post in the middle of the table that the puck bounces off): radius, sweep amplitude and period. */
  bumperRadius: 62,
  bumperAmp: 250,
  bumperPeriodSec: 4.2,
  /** A bumper always sends the puck away at least this fast (px/s). */
  bumperKick: 520,
  /**
   * Rally speed-up: every mallet hit lifts the speed the puck leaves the mallet with to at least
   * rallyBaseSpeed + hits * rallySpeedUp (capped at rallyMaxSpeed). Soft taps no longer produce lazy pucks late in a
   * rally. Resets to 0 after each goal.
   */
  rallyBaseSpeed: 520,
  rallySpeedUp: 80,
  rallyMaxSpeed: 1500,
  /** Puck top speed (px/s). The rink is 1560 px wide, so 1900 crosses it in ~0.8 s. */
  puckMaxSpeed: 1900,
  /** Bounciness of the walls (1 = perfect bounce). */
  wallRestitution: 0.85,
  /** Bounciness of puck vs mallet (1 = all of the relative speed is returned). */
  malletRestitution: 1.0,
  /** Puck slow-down per second (0 = none). 0.35 loses ~30% speed per second. */
  friction: 0.2,
  /** Mallet radius (mockup: 81). */
  malletRadius: 78,
  /** Puck radius (mockup: 40). */
  puckRadius: 40,
  /** Opening of each goal mouth, centred on the short end . */
  goalWidth: 340,
  /** Fastest a mallet may move toward the finger (px/s); caps the speed a hit can transfer. */
  malletMaxSpeed: 9000,
  /** Physics substeps per frame (4-8). */
  substeps: 6,
  /** Speed of the serve (px/s). */
  serveSpeed: 480,
  /** Pause after a goal before the countdown starts (ms). */
  goalPauseMs: 1100,
} as const;

/** Rink playing surface, centred in the screen (180 px side margins hold the score badges and pause buttons). */
export const RINK = {
  x: W / 2 - 780,
  y: H / 2 - 450,
  w: 1560,
  h: 900,
} as const;

export type AirHockeyConfig = typeof AIRHOCKEY;
export type RinkRect = { x: number; y: number; w: number; h: number };

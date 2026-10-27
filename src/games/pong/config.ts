import { H, W } from '../../core/layout';

/**
 * Pong tuning knobs. Lengths are in the 1920x1080 design space, speeds in px/s.
 * Defaults are kid-friendly: big paddles, moderate speed, gentle speed-up.
 */
export const PONG = {
  id: 'pong',
  sceneKey: 'Pong',

  /** Points needed to win. */
  targetScore: 15,
  /**
   * Difficulty ramp. Match progress runs 0..1 (leader's score / (target-1), or total points / (2*(target-1)), whichever
   * is higher). Over the match the paddles shrink from `paddleH` to `paddleHEnd`, the serve gets faster and the top speed
   * rises, so the last points are clearly tougher than the first.
   */
  paddleHEnd: 210,
  serveSpeedEnd: 740,
  maxSpeedEnd: 1500,
  /** Swiping the paddle while the ball hits it curves the ball: vy += spin * paddle speed (paddle speed capped at spinCap px/s). */
  spin: 0.3,
  spinCap: 1500,
  /** Never steeper than this (degrees from horizontal) after spin, so the ball still crosses the field. */
  maxAngleDeg: 66,
  /** Pillars: round blocks on the centre line that the ball bounces off. First seen at `pillarFromProgress`, chance rises to `pillarChanceEnd`. */
  pillarFromProgress: 0.12,
  pillarChanceEnd: 0.7,
  /** Progress from which a pillar may sweep up and down, and from which a point may have two of them. */
  movingFromProgress: 0.35,
  twinPillarFromProgress: 0.7,
  pillarRadius: 56,
  pillarAmp: 290,
  pillarPeriodSec: 3.8,
  /** Twin-ball points (a second ball flies toward the other player): from this progress, chance rising to `twinBallChanceEnd`. */
  twinBallFromProgress: 0.5,
  twinBallChanceEnd: 0.45,
  /** Ball radius. */
  ballRadius: 30,
  /** Speed of the serve (px/s). The field is ~1500 px wide, so it crosses in ~2.7 s. */
  serveSpeed: 560,
  /** Speed added by every paddle hit. */
  speedUp: 50,
  /** Top speed (px/s). */
  maxSpeed: 1250,
  /** Paddle size (height is the long side, along the end of the screen). */
  paddleH: 300,
  paddleW: 44,
  /** Distance of the paddle centre from its own screen edge. */
  paddleInset: 270,
  /** Steepest bounce angle (degrees from horizontal) when the ball hits the very tip of a paddle. */
  maxBounceDeg: 58,
  /** Fastest a paddle may chase the finger (px/s); high enough to feel instant. */
  paddleMaxSpeed: 7000,
  /** Physics substeps per frame. */
  substeps: 4,
  /** Pause after a point before the countdown starts (ms). */
  goalPauseMs: 1000,
} as const;

/** Playing field, centred in the screen (the side margins hold the score badges and pause buttons). */
export const FIELD = {
  x: 180,
  y: 80,
  w: W - 360,
  h: H - 160,
} as const;

export type PongConfig = typeof PONG;
export type FieldRect = { x: number; y: number; w: number; h: number };

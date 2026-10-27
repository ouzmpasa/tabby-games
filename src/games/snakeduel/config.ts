import { H, W } from '../../core/layout';

/**
 * Snake Duel tuning knobs. Lengths are in the 1920x1080 design space, speeds in px/s, turn rates in rad/s.
 * Defaults are kid-friendly: moderate speed, wide turns, generous collisions and a slowly closing arena.
 */
export const SNAKE = {
  id: 'snakeduel',
  sceneKey: 'SnakeDuel',

  /** Rounds needed to win the match. */
  targetScore: 8,
  /**
   * Difficulty ramp. Match progress runs 0..1 (leader's rounds / (target-1), or total rounds / (2*(target-1)), whichever is
   * higher). Over the match the base speed rises by speedMatchRamp (0.22 = +22%) and up to rocksMax rocks appear in a round
   * (first at rocksFromProgress).
   */
  speedMatchRamp: 0.22,
  rocksMax: 3,
  rocksFromProgress: 0.14,
  /** Rock sizes: drawn radius and collision radius (px, smaller than drawn so near-misses are misses). */
  rockRadius: 42,
  rockHit: 33,
  /** The first rock lands rockFirstSec into the round, then one every rockEverySec (+ up to rockJitterSec). It is shown as a warning ring rockWarnSec before. */
  rockFirstSec: 7,
  rockEverySec: 8,
  rockJitterSec: 3,
  rockWarnSec: 1.8,
  /** In-round speed ramp: speed grows by up to speedRoundRamp (0.3 = +30%) over speedRampSec seconds of play. */
  speedRoundRamp: 0.3,
  speedRampSec: 45,
  /**
   * Special fruit: GOLD gives a speed boost (boostFactor x speed for boostSec, harder to steer but you out-run the other
   * snake) and TRIM makes the OTHER snake trimSegments shorter (their body is a smaller wall for you). Chances at progress 1.
   */
  specialFruitFromProgress: 0.1,
  goldChanceEnd: 0.22,
  trimChanceEnd: 0.2,
  boostFactor: 1.35,
  boostSec: 2.5,
  trimSegments: 8,
  /** Constant snake speed (px/s). */
  speed: 340,
  /** Fastest the head can turn toward the finger (rad/s). Turn radius = speed / turnRate (~110 px). */
  turnRate: 3.1,
  /** Finger closer than this to the head (px) is ignored, so the head does not jitter. */
  steerDeadzone: 50,
  /** Body segments a snake starts a round with. */
  startSegments: 12,
  /** Segments gained per fruit eaten. */
  growPerFruit: 2,
  /** Longest a snake can get. */
  maxSegments: 40,
  /** Distance between body segments along the path (px). */
  segSpacing: 20,
  /** Drawn body radius / head radius (px). */
  bodyRadius: 26,
  headRadius: 31,
  /** Collision radii, deliberately smaller than the drawn ones so near-misses count as misses. */
  headHit: 19,
  bodyHit: 19,
  /** A fruit is eaten when the head centre is this close (px). */
  fruitRadius: 26,
  eatRadius: 54,
  /** Fruits on screen. */
  fruitCount: 2,
  /** Seconds a snake is harmless (and blinking) at the start of a round. */
  spawnInvulnSec: 1.6,
  /** Seconds of calm before the arena starts to close in. */
  shrinkDelaySec: 8,
  /** Closing speed per side (px/s). */
  shrinkPerSec: 12,
  /** Most the arena ever closes in per side (px). */
  maxInset: 310,
  /** Pause after a round before the next countdown (ms). */
  roundPauseMs: 1300,
  /** Where each snake starts: distance from the arena centre along x, and offset along y (so they miss each other). */
  startDx: 470,
  startDy: 130,
} as const;

/** The full-size arena (rounded rectangle). Corner areas of the screen stay free for buttons and badges. */
export const ARENA = { x: 190, y: 70, w: W - 380, h: H - 140, corner: 70 } as const;
export const CENTER = { x: W / 2, y: H / 2 } as const;

export const SNAKE_STRINGS = {
  crash: { en: 'OOPS!', nl: 'OEPS!' },
  draw: { en: 'DRAW!', nl: 'GELIJK!' },
} as const;
export type SnakeConfig = typeof SNAKE;

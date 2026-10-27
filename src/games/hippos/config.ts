import { H, W } from '../../core/layout';

/**
 * Hungry Hippos tuning knobs. Kid-friendly: big balls, a big mouth, long reach, a gentle pond that slowly gets busier.
 * One long race to `targetScore` balls: every wave is a bit bigger, faster and trickier than the one before
 * (see the `waves` knobs), so a match lasts ~4 minutes instead of a minute and a half.
 */
export const HIPPOS = {
  id: 'hippos',
  sceneKey: 'Hippos',

  /** Balls eaten to win (a golden ball counts 3). */
  targetScore: 60,
  normalPoints: 1,
  goldenPoints: 3,
  /** Delay between the points of a golden ball (ms), so each one pings. */
  goldenPointGapMs: 170,

  /**
   * Wave size: mirrored PAIRS of balls (one per side). The first wave has `wavePairsStart` pairs, +1 pair every
   * `wavePairsEveryWaves` waves, up to `wavePairsMax` (so 4 balls at first, 10 later).
   */
  wavePairsStart: 2,
  wavePairsEveryWaves: 2,
  wavePairsMax: 5,
  /** Every Nth wave also carries one golden ball dropped on the centre line (fair to both sides); it only stays `goldenLifeMs` and then floats away. */
  goldenEveryWaves: 4,
  goldenLifeMs: 6500,
  /** Pause before a wave drops in, after the pond is empty (ms). The first wave comes sooner. */
  wavePauseMs: 1100,
  firstWaveMs: 500,
} as const;

/**
 * The in-match ramp, per wave (wave 0 is the first). Everything is capped so a 5 year old can still play at the end.
 */
export const WAVES = {
  /** Ball speed (drop speed and speed limit) grows by this much per wave, up to x`speedScaleMax`. */
  speedGrowth: 0.07,
  speedScaleMax: 1.8,
  /** Balls shrink by this many px of radius per wave, down to `minRadius` (golden: `minGoldenRadius`). */
  radiusShrink: 1.2,
  minRadius: 27,
  minGoldenRadius: 34,
  /** Balls keep swimming around by themselves: a slowly turning push of `wanderPerWave` px/s^2 per wave, up to `wanderMax`. */
  wanderPerWave: 14,
  wanderMax: 110,
  wanderTurnPerSec: 0.9,
  /** A rock island appears in the middle of the pond from this wave on; balls bounce off it and the pull to the middle gets `rockPullFactor` times weaker. */
  rockFromWave: 3,
  rockRadius: 85,
  rockPullFactor: 0.35,
  /** From this wave on, a share of the pairs are "divers": they duck under water for `diveUnderMs` out of every `divePeriodMs` (a short warning wobble first) and cannot be eaten while under. */
  diveFromWave: 4,
  diveShare: 0.5,
  divePeriodMs: 3800,
  diveUnderMs: 1100,
  diveWarnMs: 450,
} as const;

/** The pond is an ellipse in the middle of the screen. */
export const POND = {
  cx: W / 2,
  cy: H / 2,
  /** Half width / half height of the ellipse the BALL CENTRES are kept in is (a - ball radius, b - ball radius). */
  a: 500,
  b: 395,
} as const;

export const BALL = {
  radius: 36,
  goldenRadius: 42,
  /** Speed given to a freshly dropped ball (px/s), min..max. */
  speedMin: 110,
  speedMax: 230,
  maxSpeed: 330,
  /** Velocity damping per second (soft, floaty feel). */
  drag: 0.7,
  /** Gentle pull toward the pond centre (px/s^2): balls slowly drift to the middle. */
  centrePull: 34,
  wallBounce: 0.8,
  ballBounce: 0.9,
  colors: [0xff4d6d, 0x4ade80, 0xb86bff, 0xff7ac8, 0x2dd4bf, 0xf5f7fa],
  golden: 0xffc928,
} as const;

/**
 * The hippo. Local frame: origin at the body anchor, +x toward the pond (mirrored for player 1).
 * A lunge goes toward the touch point, limited to `reach`; the head ends at the touch point or at `reach` at most.
 */
export const HIPPO = {
  /** Body anchor distance from the screen edge. */
  baseInset: 150,
  /** Where the head rests when idle (distance from the anchor, straight toward the pond). */
  idleReach: 215,
  /** Shortest and longest lunge (distance from the anchor to the mouth centre). Reach covers the pond centre line. */
  minReach: 300,
  maxReach: 835,
  /** Mouth capture radius, plus the share of a ball's own radius that has to be inside. */
  mouthRadius: 105,
  ballOverlap: 0.35,
  /** Lunge timeline (ms): stretch out, hold at the peak (mouth open, then CHOMP), snap back, short rest. */
  outMs: 110,
  peakMs: 90,
  backMs: 150,
  restMs: 150,
  /** A tap that lands while the hippo is busy is remembered this long (ms) so frantic tapping is never lost. */
  tapBufferMs: 350,
  /** Body size drawn in pieces.ts and how much the belly grows per eaten ball. */
  bellyGrow: 0.035,
  bellyMax: 0.4,
} as const;

import { H } from '../../core/layout';

/**
 * Balloon Pop Race tuning knobs. Kid-friendly: big-ish balloons, generous hit areas, no negative scores.
 * Scores are DISPLAYED points (the MatchState itself counts these points directly), see BalloonPopScene.award().
 * Pace target: about 2.5-3.5 minutes for a decent player (first to `targetScore`).
 */
export const BALLOONPOP = {
  id: 'balloonpop',
  sceneKey: 'BalloonPop',

  /** Points needed to win the match (raise for a longer match, lower for a shorter one). */
  targetScore: 500,
  /** Points per kind. A chain pop scores `chainPoints` plus the points of every balloon it takes with it. */
  normalPoints: 5,
  smallPoints: 10,
  starPoints: 25,
  chainPoints: 5,

  /** Spawn gap per side (ms): gapStartMs -> gapEndMs over rampMs. Both sides share one schedule (about 1.5 -> 2.8 balloons/s). */
  gapStartMs: 650,
  gapEndMs: 360,
  /** Length of the difficulty ramp (ms); everything "ramps" is linear 0 -> 1 over this and then stays at its end value. */
  rampMs: 130000,
  /** Safety cap: no new spawn (on BOTH sides, so it stays fair) while either side has this many balloons in play. */
  maxOnScreen: 16,
  /** Rising speed (px/s) of a normal balloon: speedStart -> speedEnd over rampMs (about +60% over the old game at the start). */
  speedStart: 240,
  speedEnd: 360,
  /** +- random speed spread (fraction). */
  speedJitter: 0.22,
  /** Small balloons are this much faster than normal ones. */
  smallSpeedFactor: 1.3,
  firstSpawnMs: 350,

  /**
   * Kind odds (weights), interpolated start -> end over the ramp.
   * Grumpy / chain / bomb do not appear before their `...AfterMs`.
   */
  weightsStart: { normal: 58, small: 22, star: 5, chain: 5, grumpy: 7, bomb: 4 },
  weightsEnd: { normal: 38, small: 28, star: 5, chain: 3, grumpy: 17, bomb: 9 },
  chainAfterMs: 4000,
  grumpyAfterMs: 8000,
  bombAfterMs: 25000,

  /** Body radius ranges (px). Normal balloons shrink by `shrinkEnd` (factor) at the end of the ramp. */
  normalRadius: [52, 100],
  smallRadius: [34, 46],
  shrinkEnd: 0.8,
  starRadius: 60,
  chainRadius: 72,
  grumpyRadius: 66,
  bombRadius: 72,

  /**
   * Movement patterns (chosen per balloon from the seeded RNG). Weights; sine/zigzag/dart. Dart only after dartAfterMs.
   * sine: smooth and wide. zigzag: sharp triangle wave. dart: sits still, then a quick sideways dash every dartEvery seconds.
   */
  moveWeights: { sine: 28, zigzag: 44, dart: 28 },
  dartAfterMs: 12000,
  sineAmp: [80, 150],
  /** rad/s */
  sineFreq: [0.6, 1.2],
  zigzagAmp: [45, 100],
  /** Zig-zag period (s) for one full left-right-left cycle. */
  zigzagPeriod: [0.9, 1.9],
  dartAmp: [70, 140],
  dartEvery: [1.0, 2.0],
  /** Duration of one dash (s). */
  dartDashS: 0.22,
  /** Some balloons speed up as they climb: chance ramps accelChanceStart -> End; extra speed fraction per second; speed multiplier cap. */
  accelChance: [0.12, 0.3],
  accel: [0.3, 0.7],
  accelCap: 2.2,

  /** Tap hit radius = radius * hitScale + hitExtra (>= radius + 25). Hit testing uses the drawn position. */
  hitScale: 1.1,
  hitExtra: 28,

  /** Chain balloon: pops every balloon (not bombs) on the same half within this radius (px). */
  chainRadiusPx: 330,
  /** Grumpy balloon: popping it freezes that player's tapping for this long (ms). */
  freezeMs: 1200,
  /** Bomb-cloud balloon: popping it drops this many extra balloons on the OPPONENT's half (no penalty for the popper's score). */
  bombGift: 4,
  /** Vertical stagger (px) between the gift balloons so they arrive one after another. */
  bombGiftSpacing: 170,

  /** Lane (x measured from the player's own screen edge). A balloon's body + movement stays within edgeMargin .. half - centreMargin. */
  edgeMargin: 110,
  centreMargin: 70,
  /** Spawn y (balloons start fully below the screen). */
  spawnY: H,
} as const;

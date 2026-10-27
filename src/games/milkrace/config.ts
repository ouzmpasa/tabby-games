/**
 * Milk Race tuning knobs. Kid-friendly: big pads, forgiving mistakes. A round fills a BIG tank in 3 stages
 * (Warm-up, Rhythm, Frisky cow), ~45-70 s for a decent player; a match is first to `targetScore` rounds (~4 min).
 * Squirt sizes below are fractions of the WHOLE tank (a stage is one third of it).
 */
export const MILKRACE = {
  id: 'milkrace',
  sceneKey: 'MilkRace',

  /** Rounds needed to win (a round is ~1 min now, so 3 instead of the old 6 -> 3..5 rounds, ~4 min). */
  targetScore: 3,

  /** Number of tank sections / stages per round. */
  stages: 3,

  /** Taps (alternating pads) per second that count as "slow" and "full speed" for the squirt size / combo meter. */
  slowRate: 1.5,
  fastRate: 6,
  /** Tank fraction added per correct tap at slowRate and at fastRate (so faster rhythm = bigger squirts). ~65 taps fill one stage. */
  minSquirt: 0.0028,
  maxSquirt: 0.0067,
  /** Weight of the newest tap in the smoothed rate (0..1); higher reacts faster. */
  rateSmoothing: 0.5,
  /** A pause between taps longer than this (ms) counts as a fresh start at slowRate. */
  idleResetMs: 1200,
  /** Taps closer together than this (ms) from one player are ignored (palm-mashing). */
  minTapGapMs: 40,
  /** Same pad twice: the smoothed rate is multiplied by this (combo drops, no milk). */
  splatRateFactor: 0.5,

  /** Stage 2 "Rhythm": tank fraction for a tap ON the beat, the bonus factor for a PERFECT tap, a tap OFF the beat (little), and the extra per beat in a streak. */
  beatSquirt: 0.0135,
  perfectFactor: 1.3,
  offBeatSquirt: 0.0015,
  streakBonus: 0.04,
  streakMax: 8,
  /** A tap counts as on-beat only if the previous tap was at least this fraction of a beat earlier (so mashing does not score big). */
  beatQuietFrac: 0.5,
  /** Silence before the first beat of the Rhythm stage (ms), so the banner can be read. */
  beatLeadMs: 1400,

  /** Stage 3 "Frisky cow": first shuffle after this long (ms), the wobble warning before a shuffle, and how long the pads slide. */
  firstShuffleMs: 2600,
  shuffleWarnMs: 700,
  shuffleMoveMs: 380,

  /** Golden bell: gives this fraction of the tank (~15% of one stage, never past the end of the stage). */
  bellBonus: 0.05,
  /** Per stage [Warm-up, Rhythm, Frisky]: first bell this long (ms) after the stage starts, then every bellEveryMs +- bellJitterMs. Frisky has MANY more bells. */
  bellFirstMs: [4500, 5200, 2200],
  bellEveryMs: [6500, 7500, 3600],
  bellJitterMs: 1500,
  /** How long a bell stays (ms) in round 1; shrinks per round (see ROUND_RAMP). */
  bellLifeMs: 2800,
  bellSpots: 3,
  /** Touch radius of the bell (px, design space). */
  bellRadius: 105,

  /** Pause after a round before the next countdown (ms). */
  roundPauseMs: 2600,
  /** Pause after a finished stage (celebration) during which the stage banner shows (ms). Taps keep working. */
  stageBannerMs: 1500,
} as const;

/**
 * In-match difficulty ramp: round 1 uses the first value, each later round the next (the last one repeats).
 * Rhythm: beat period / "good" window / "perfect" window (ms). Frisky: ms between pad shuffles. Bells: ms they stay.
 */
export const ROUND_RAMP = {
  beatPeriodMs: [680, 640, 600, 560],
  beatGoodMs: [150, 135, 120, 110],
  beatPerfectMs: [70, 62, 56, 50],
  shuffleMs: [3800, 3300, 2900, 2500],
  bellLifeMs: [2800, 2500, 2200, 2000],
} as const;

/** Stage names (shown facing each player) and what to do. */
export const STAGES = [
  { name: 'WARM-UP', tip: 'LEFT - RIGHT!' },
  { name: 'RHYTHM', tip: 'TAP ON THE BEAT!' },
  { name: 'FRISKY COW', tip: 'FOLLOW THE GLOW!' },
] as const;

/** Layout inside a player's frame: origin at the centre of their half, +x to their right, +y toward them (their "down"). */
export const LAYOUT = {
  padX: 175,
  padY: 300,
  padR: 122,
  /** Touch zone of a pad: everything with y >= padTouchTop on that side of the centre line. */
  padTouchTop: 110,
  /** The big tank: tall, with three marked sections. */
  bucketX: 410,
  bucketTop: -400,
  bucketBottom: 220,
  bucketW: 190,
  meterX: -375,
  meterTop: -230,
  meterBottom: 170,
  badgeX: -375,
  badgeY: -300,
  /**
   * Pad pairs [A, B] for the Frisky stage (slot 0 is the normal layout; the cow shuffles between them).
   * Kept inside |x| <= 200 so they never touch the tank, and at y >= 200 so they never cover the bell spots.
   */
  padSlots: [
    [{ x: -175, y: 300 }, { x: 175, y: 300 }],
    [{ x: 175, y: 300 }, { x: -175, y: 300 }],
    [{ x: -200, y: 225 }, { x: 200, y: 340 }],
    [{ x: 200, y: 225 }, { x: -200, y: 340 }],
    [{ x: -130, y: 270 }, { x: 130, y: 330 }],
    [{ x: 130, y: 270 }, { x: -130, y: 330 }],
  ],
  /** Possible bell positions (same for both players). */
  bellSpots: [
    { x: -140, y: -140 },
    { x: 140, y: -140 },
    { x: 0, y: 40 },
  ],
} as const;

/** Hardcoded strings (i18n is wired elsewhere). */
export const MILKRACE_STRINGS = {
  hint: 'LEFT - RIGHT!',
  stage: 'STAGE',
  moo: 'MOO!',
  splat: 'SPLAT!',
  bell: 'DING!',
  win: 'MOO-VELOUS!',
} as const;

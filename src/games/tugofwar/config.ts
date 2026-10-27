import { H, W } from '../../core/layout';

/**
 * Tug of War tuning knobs. Kid-friendly: big pulls, never negative. A round is a long, seesawing tug (~35-60 s) that
 * gets a growing "surge" so it always ends; a match is first to `targetScore` rounds (~4 min).
 */
export const TUGOFWAR = {
  id: 'tugofwar',
  sceneKey: 'TugOfWar',

  /** Rounds needed to win (rounds are ~45 s now, so 3 instead of the old 6). */
  targetScore: 3,
  /** Marker travel per full-power tap, as a fraction of the half-track (1 = centre to end). ~34 net taps win a round at the start. */
  pullPerTap: 0.03,
  /** Taps closer together than this (ms) from one player are ignored (stops palm-mashing); 0 = off. */
  minTapGapMs: 40,
  /** Pause after a round before the countdown starts (ms). */
  roundPauseMs: 1400,

  /**
   * Stamina (tames mashing): every tap costs `tapCost` of a 0..1 energy bar that refills `regenPerSec` per second
   * (see ROUND_RAMP), so tapping up to regen/tapCost per second is free. Below `softEnergy` the pull fades down to `floorPower`
   * (never to zero). A normal 4-6 taps/s child never feels it.
   */
  tapCost: 0.06,
  softEnergy: 0.4,
  floorPower: 0.5,

  /** Surge: from `surgeStartMs` into a round every pull gets stronger, linearly up to x`surgeMax` after `surgeRampMs` more, so no round drags on. */
  surgeStartMs: 16000,
  surgeRampMs: 38000,
  surgeMax: 3.5,

  /** Rubber band: a pull is x(1 - rubberBand * lead), lead = -1..+1 (+1 = marker at your own end). Keeps a 5-year-old vs an 8-year-old a game. */
  rubberBand: 0.22,

  /** Power token (a glowing knot on your half): tap it for an instant pull of `tokenPull`, a full energy bar, and `boostMs` of x`boostPower` pulls. */
  tokenPull: 0.06,
  boostPower: 1.8,
  boostMs: 3000,
  tokenFirstMs: 6000,
  tokenJitterMs: 1500,
  /** Touch radius of a token (px). */
  tokenRadius: 120,
} as const;

/**
 * In-match difficulty ramp: round 1 uses the first value, each later round the next (the last one repeats).
 * Tokens stay for less time and come more often (less time to grab, more to grab), and the energy bar refills a bit slower.
 */
export const ROUND_RAMP = {
  tokenLifeMs: [3400, 2900, 2500, 2100],
  tokenEveryMs: [8500, 7500, 6500, 5500],
  regenPerSec: [0.5, 0.45, 0.42, 0.4],
  /** Pull strength factor: later rounds are a heavier rope. */
  pullFactor: [1, 0.92, 0.85, 0.8],
} as const;

/** Rope track, centred in the screen. Marker x runs from `x` (player 0 end) to `x + w` (player 1 end). */
export const TRACK = {
  x: 300,
  w: W - 600,
  y: H / 2,
  markerRadius: 62,
} as const;

/** Where power tokens may appear (player 0's half, screen px; player 1's is mirrored). Above and below the rope. */
export const TOKEN_AREA = {
  x0: 400,
  x1: 860,
  yAbove: [170, 360],
  yBelow: [720, 910],
} as const;

/** Hardcoded strings (i18n is wired elsewhere). */
export const TUGOFWAR_STRINGS = {
  tap: 'TAP!',
  pull: 'PULL!',
  steady: 'STEADY!',
  power: 'POWER!',
} as const;

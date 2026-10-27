/** How the timing cue (the shrinking ring) behaves: always there, fades out before the catch, or flickers and fades out. */
export type Cue = 'ring' | 'fade' | 'blink';

/** What a block of swings looks like. Every tier is a little harder than the one before. */
export interface Tier {
  /** First swing (0-based) of this tier. */
  from: number;
  /** Name shown to the players when the tier starts (null = nothing to announce). */
  hint: 'faster' | 'fakeouts' | 'twoYarns' | 'hiddenRing' | 'blinkRing' | null;
  /** Time the yarn takes from its start to the paws (ms). */
  descentMs: number;
  /** Catch windows around the ideal moment (ms, either side): they narrow tier by tier. */
  perfectMs: number;
  goodMs: number;
  /** Hops on the way in (the last one lands in the paws): an inclusive range. */
  bounces: readonly [number, number];
  /** Chance that a yarn arrives sliding in from the side. */
  slide: number;
  /** Chance that the yarn pauses mid-lane (a fake-out) before it carries on. */
  feint: number;
  /** Chance of a second yarn following quickly after the first. */
  doubleBall: number;
  /** Random wait between the start of 'Ready...' and the yarn's start (ms). */
  waitMinMs: number;
  waitMaxMs: number;
  cue: Cue;
  /** Points multiplier (the last tier is worth double so the trailing player can still catch up). */
  multiplier: number;
}

/**
 * The match is 42 swings in six tiers of seven. Tier 1 is the old game (slow first swings, wide windows); then faster yarn that
 * hops 2-3 times and slides in from the side, fake-outs where the yarn pauses, two yarns in a row, a ring that fades out before the
 * catch (listen to the boing-boing rhythm!), a flickering ring and double points. A 5-year-old can still get "Good" (1 point) with
 * a window of +-112 ms (224 ms wide) even in the last tier.
 */
export const TIERS: readonly Tier[] = [
  { from: 0, hint: null, descentMs: 500, perfectMs: 60, goodMs: 150, bounces: [2, 2], slide: 0, feint: 0, doubleBall: 0, waitMinMs: 1300, waitMaxMs: 3200, cue: 'ring', multiplier: 1 },
  { from: 7, hint: 'faster', descentMs: 450, perfectMs: 54, goodMs: 138, bounces: [2, 3], slide: 0.55, feint: 0, doubleBall: 0, waitMinMs: 1400, waitMaxMs: 3400, cue: 'ring', multiplier: 1 },
  { from: 14, hint: 'fakeouts', descentMs: 430, perfectMs: 48, goodMs: 128, bounces: [2, 3], slide: 0.55, feint: 0.6, doubleBall: 0, waitMinMs: 1600, waitMaxMs: 3800, cue: 'ring', multiplier: 1 },
  { from: 21, hint: 'twoYarns', descentMs: 410, perfectMs: 44, goodMs: 120, bounces: [2, 3], slide: 0.55, feint: 0.3, doubleBall: 0.65, waitMinMs: 1700, waitMaxMs: 4000, cue: 'ring', multiplier: 1 },
  { from: 28, hint: 'hiddenRing', descentMs: 400, perfectMs: 42, goodMs: 116, bounces: [2, 3], slide: 0.6, feint: 0.4, doubleBall: 0.6, waitMinMs: 1700, waitMaxMs: 4000, cue: 'fade', multiplier: 1 },
  { from: 35, hint: 'blinkRing', descentMs: 390, perfectMs: 40, goodMs: 112, bounces: [2, 3], slide: 0.6, feint: 0.5, doubleBall: 0.6, waitMinMs: 1700, waitMaxMs: 4000, cue: 'blink', multiplier: 2 },
];

/** Yarn Catch tuning knobs. Kid-friendly: first swings are slow, windows are forgiving, nothing hurts. */
export const YARNCATCH = {
  id: 'yarncatch',
  sceneKey: 'YarnCatch',

  /**
   * Swings per match; if tied after these, extra swings continue until someone leads. Was 10 swings of ~5 s (under a minute);
   * now 42 swings of 5-8 s (the later ones have fake-outs, double yarns and longer waits): about 4.5 minutes.
   */
  swings: 42,
  /** Points per verdict (before the tier multiplier). */
  perfectPoints: 2,
  goodPoints: 1,

  /** Catch windows of the very first swings (later swings use the tier's windows). */
  perfectMs: 60,
  goodMs: 150,

  /** How long the yarn ball takes from its start to the paws (ms) on the first swing; later swings use the tier's descentMs. */
  descentMs: 500,
  /** The very first throw is slower so everybody can learn it, the second one a bit less. */
  firstDescentMs: 950,
  secondDescentMs: 720,

  /** Waits of the first swing (later swings use the tier's range). */
  waitMinMs: 1300,
  waitMaxMs: 3200,
  firstWaitMs: 1900,
  /** Each player's yarn starts up to +-this much away from the swing's base time, and at least minGapMs apart. */
  jitterMs: 380,
  firstJitterMs: 160,
  minGapMs: 140,
  /** A yarn ball never starts sooner than this after 'Ready...' (ms). */
  minStartMs: 900,

  /** Fake-out: the yarn stops at this fraction of its way (range) for this long (ms range) before it rolls on. */
  feintAtU: [0.35, 0.65],
  feintPauseMs: [300, 560],
  /** Slide: the yarn starts this far (px, range) off to the side and rolls to the middle on its way in. */
  slidePx: [190, 300],
  /** Two yarns: the second one reaches the paws this long (ms, range) after the first one. */
  doubleGapMs: [560, 760],
  /** Taps this soon after a tap of the same player are ignored (a double tap must not cost the second yarn). */
  ignoreTapMs: 250,

  /** The ring starts to fade at this fraction of the yarn's way (and is gone 0.2 later); blinking flickers this often (ms). */
  fadeFromU: 0.45,
  fadeSpanU: 0.2,
  blinkMs: 110,

  /** Pause after the results are shown before the next swing (ms), and spacing of the points being awarded. */
  resultHoldMs: 2100,
  pointGapMs: 350,
  firstPointDelayMs: 450,
} as const;

export const tierIndex = (swing: number): number => {
  let k = 0;
  for (let i = 0; i < TIERS.length; i++) if (swing >= TIERS[i].from) k = i;
  return k;
};
export const tierOf = (swing: number): Tier => TIERS[tierIndex(swing)];

/** Local lane geometry (per player): y runs from their screen edge (0) away from them (negative), x across. */
export const LANE = {
  /** Where the ball centre is at the ideal moment (between the paws). */
  handsY: -400,
  /** Where the ball waits before it rolls in. */
  startY: -810,
  /** Where a missed ball bounces off the head. */
  missY: -215,
  headY: -150,
  zoneRadius: 118,
  approachRadius: 330,
} as const;

import { H, W } from '../../core/layout';

/** The rules of one round. Rounds escalate: a bigger board, golden boxes and a move timer. */
export interface RoundRules {
  /** Boxes per side (dots per side = boxes + 1). */
  boxes: number;
  /** Golden boxes, worth 3 points each (see GOLDEN_POINTS in logic.ts) (so a trailing player can still catch up). */
  golden: number;
  /** Time to make a move (ms); running out passes the turn. 0 = no timer. */
  moveMs: number;
}

/**
 * Round table: 5x5 dots (4x4 boxes) like before, then golden boxes + a move timer, then 6x6 dots, then 7x7 dots in round 5.
 * Draws/ties do not score but still move on to the next round. The last row repeats. Timers stay generous
 * (never below 10 s): running out only passes the turn, it never loses anything.
 */
export const ROUNDS: readonly RoundRules[] = [
  { boxes: 4, golden: 0, moveMs: 0 },
  { boxes: 4, golden: 2, moveMs: 14000 },
  { boxes: 5, golden: 3, moveMs: 12000 },
  { boxes: 5, golden: 4, moveMs: 10000 },
  { boxes: 6, golden: 5, moveMs: 10000 },
];

export const roundRules = (round: number): RoundRules => ROUNDS[Math.max(0, Math.min(round, ROUNDS.length - 1))];

/** Dots & Boxes tuning knobs. Lengths are in the 1920x1080 design space. */
export const DOTSBOXES = {
  id: 'dotsboxes',
  sceneKey: 'DotsBoxes',

  /**
   * Rounds needed to win the match (unchanged at 3). Rounds now grow from ~1 min (4x4 boxes, 40 lines) through ~2 min (5x5,
   * 60 lines) to ~3 min (6x6, 84 lines) at 1.5 s a line, so 3-5 rounds are about 4-7 minutes (was 3-5 rounds of 1 min).
   */
  targetScore: 3,
  /** Distance between neighbouring dots (px) by boxes per side: the board stays about 760-810 px tall. */
  spacingByBoxes: { 4: 190, 5: 160, 6: 135 } as Record<number, number>,
  /** Dot radius, line width and touch reach as fractions of the spacing (4x4: 17 px / 20 px / 70 px). */
  dotFrac: 0.09,
  lineFrac: 0.105,
  /** Generous touch: the nearest undrawn edge within this fraction of the spacing of the finger is chosen (min 56 px). */
  hitFrac: 0.37,
  hitMin: 56,
  /** Pause showing the result before the next round starts (ms). */
  roundPauseMs: 2400,
  /** How long the "what's new this round" banner stays (ms). */
  bannerMs: 2600,
} as const;

export interface BoardLayout {
  /** Boxes per side. */
  n: number;
  /** Top-left dot. */
  x: number;
  y: number;
  span: number;
  margin: number;
  spacing: number;
  dotRadius: number;
  lineWidth: number;
  hitRadius: number;
}

/** Board geometry for a given number of boxes per side, centred on screen. */
export function boardLayout(n: number): BoardLayout {
  const spacing = DOTSBOXES.spacingByBoxes[n] ?? Math.floor(780 / n);
  const span = n * spacing;
  return {
    n,
    x: W / 2 - span / 2,
    y: H / 2 - span / 2 + 10,
    span,
    margin: 70,
    spacing,
    dotRadius: Math.round(spacing * DOTSBOXES.dotFrac),
    lineWidth: Math.round(spacing * DOTSBOXES.lineFrac),
    hitRadius: Math.max(DOTSBOXES.hitMin, Math.round(spacing * DOTSBOXES.hitFrac)),
  };
}

export type DotsBoxesConfig = typeof DOTSBOXES;

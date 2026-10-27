import { H, W } from '../../core/layout';

/** The rules of one round. Rounds escalate: a move timer, power discs, a bigger board. */
export interface RoundRules {
  cols: number;
  rows: number;
  /** Discs in a row needed to win. */
  connect: number;
  /** Time to make a move (ms); running out skips the turn. 0 = no timer. */
  moveMs: number;
  /** Each player may drop one BOMB disc this round: it clears the 3x3 discs around where it lands (it is gone too). */
  bomb: boolean;
  /** Each player may play DOUBLE once this round: drop two discs in a row. */
  double: boolean;
}

/**
 * Round table: round 1 is classic, then the timer joins, then BOMB, a bigger 8x7 board and DOUBLE. Draws do not score but
 * still move on to the next round, so the game keeps getting harder. The last row repeats. Timers stay generous
 * (never below 9 s): running out only skips a turn, it never loses anything.
 */
export const ROUNDS: readonly RoundRules[] = [
  { cols: 7, rows: 6, connect: 4, moveMs: 0, bomb: false, double: false },
  { cols: 7, rows: 6, connect: 4, moveMs: 14000, bomb: true, double: false },
  { cols: 8, rows: 7, connect: 4, moveMs: 12000, bomb: true, double: false },
  { cols: 8, rows: 7, connect: 4, moveMs: 11000, bomb: true, double: true },
  { cols: 8, rows: 7, connect: 4, moveMs: 10000, bomb: true, double: true },
  { cols: 8, rows: 7, connect: 4, moveMs: 9000, bomb: true, double: true },
];

export const roundRules = (round: number): RoundRules => ROUNDS[Math.max(0, Math.min(round, ROUNDS.length - 1))];

/** Connect 4 tuning knobs. Lengths are in the 1920x1080 design space. */
export const CONNECT4 = {
  id: 'connect4',
  sceneKey: 'Connect4',

  /**
   * Rounds needed to win the match. A round takes about 40-70 s for two children (the first is the quickest), so
   * 4 wins is about 4-7 rounds = 4-6 minutes. (Was 3 wins of ~30 s rounds.)
   */
  targetScore: 4,
  /** Size of one board cell (px); the 8x7 board is 1024x896, still clear of the side panels. */
  cell: 128,
  /** Disc radius as a fraction of the cell. */
  discFill: 0.41,
  /** Fall time: base + per row travelled (ms). */
  dropBaseMs: 260,
  dropPerRowMs: 70,
  /** Pause showing the result before the next round starts (ms). */
  roundPauseMs: 2200,
  /** How long the "what's new this round" banner stays (ms). */
  bannerMs: 2400,
  /** Bomb blast: radius in cells around the landing cell (1 = the 3x3 block). */
  bombRadius: 1,
} as const;

/** Board frame for a given size, centred on screen. */
export function boardRect(cols: number, rows: number): { x: number; y: number; w: number; h: number } {
  const w = cols * CONNECT4.cell;
  const h = rows * CONNECT4.cell;
  return { x: W / 2 - w / 2, y: H / 2 - h / 2 + 20, w, h };
}

export type Connect4Config = typeof CONNECT4;

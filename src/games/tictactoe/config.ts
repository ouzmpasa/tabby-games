import { H, W } from '../../core/layout';

/** The rules of one round. Rounds escalate: bigger boards, blocked squares, a move timer and a one-off FLIP power. */
export interface RoundRules {
  /** Board is size x size. */
  size: number;
  /** Marks in a row needed to win. */
  need: number;
  /** Number of squares blocked by rocks at the start of the round. */
  blocked: number;
  /** Time to make a move (ms); running out skips the turn. 0 = no timer. */
  moveMs: number;
  /** Each player may FLIP one enemy mark into their own once this round. */
  flip: boolean;
}

/**
 * Round table: round 1 is classic Tic-Tac-Toe, every later round adds something (4x4 with rocks and a timer, 4 in a row + FLIP,
 * 5x5 ...). Draws do not score but still move on to the next round, so the game keeps getting harder. The last row repeats.
 * Tuned with a throwaway bot simulation so that rounds stay decisive: 3 in a row on 4x4 and 5x5 with 4 in a row are rarely drawn
 * between children (a 4x4 board needing 4 in a row, or many rocks, mostly ends in draws, so those are kept light).
 * Move timers stay generous (7 s at the very end): running out only skips a turn, it never loses anything.
 */
export const ROUNDS: readonly RoundRules[] = [
  { size: 3, need: 3, blocked: 0, moveMs: 0, flip: false },
  { size: 4, need: 3, blocked: 2, moveMs: 10000, flip: false },
  { size: 4, need: 4, blocked: 1, moveMs: 10000, flip: true },
  { size: 5, need: 4, blocked: 2, moveMs: 9000, flip: true },
  { size: 5, need: 4, blocked: 3, moveMs: 8000, flip: true },
  { size: 5, need: 4, blocked: 3, moveMs: 7500, flip: true },
  { size: 5, need: 4, blocked: 4, moveMs: 7000, flip: true },
];

export const roundRules = (round: number): RoundRules => ROUNDS[Math.max(0, Math.min(round, ROUNDS.length - 1))];

/** Tic-Tac-Toe tuning knobs. Lengths are in the 1920x1080 design space. */
export const TICTACTOE = {
  id: 'tictactoe',
  sceneKey: 'TicTacToe',

  /**
   * Rounds needed to win the match (was 6, on a draw-prone 3x3 board: about 3 minutes). With the escalating rounds one round takes
   * about 15 s (3x3) to 40 s (5x5) for two children, so 5 wins is about 8-12 rounds = 4-6.5 minutes (bot simulation at 1.5-2 s a move).
   */
  targetScore: 5,
  /**
   * Safety net against endless draws: once this many rounds have been played and somebody leads, the leader wins the match
   * (a tie keeps playing until a round decides it).
   */
  maxRounds: 12,
  /** Size of one board cell (px) per board size; generous for small fingers (the board is ~810-900 px wide). */
  cellBySize: { 3: 270, 4: 225, 5: 180 } as Record<number, number>,
  /** Mark radius as a fraction of the cell. */
  markFill: 0.3,
  /** Mark stroke width as a fraction of the cell (30 px on the 270 px cell). */
  markStrokeFrac: 30 / 270,
  /** Pop-in tween duration (ms). */
  popMs: 260,
  /** Alpha of the ghost preview while the finger is down. */
  ghostAlpha: 0.45,
  /** Pause showing the result before the next round starts (ms). */
  roundPauseMs: 2200,
  /** How long the "what's new this round" banner stays (ms). */
  bannerMs: 2400,
} as const;

export const cellSize = (size: number): number => TICTACTOE.cellBySize[size] ?? Math.floor(900 / size);

/** Board frame for a given size, centred on screen. */
export function boardRect(size: number): { x: number; y: number; w: number; h: number; cell: number } {
  const cell = cellSize(size);
  const w = size * cell;
  return { x: W / 2 - w / 2, y: H / 2 - w / 2, w, h: w, cell };
}

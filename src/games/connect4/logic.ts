import { other, type PlayerId } from '../../core/types';

export type Cell = PlayerId | null;

export interface Board {
  cols: number;
  rows: number;
  /** Row-major, row 0 is the TOP row. */
  cells: Cell[];
}

export interface Pos {
  col: number;
  row: number;
}

export interface DropResult {
  row: number;
  /** The winning line (>= `connect` discs), or null. */
  win: Pos[] | null;
  draw: boolean;
}

export const createBoard = (cols = 7, rows = 6): Board => ({ cols, rows, cells: new Array<Cell>(cols * rows).fill(null) });

export const getCell = (b: Board, col: number, row: number): Cell =>
  col < 0 || col >= b.cols || row < 0 || row >= b.rows ? null : b.cells[row * b.cols + col];

/** Row a disc dropped in `col` would land on, or -1 if the column is full / invalid. */
export function landingRow(b: Board, col: number): number {
  if (col < 0 || col >= b.cols) return -1;
  for (let row = b.rows - 1; row >= 0; row--) if (getCell(b, col, row) === null) return row;
  return -1;
}

export const isFull = (b: Board): boolean => b.cells.every((c) => c !== null);

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** Winning line through (col,row) for the disc placed there, or null. */
export function findWin(b: Board, col: number, row: number, connect = 4): Pos[] | null {
  const p = getCell(b, col, row);
  if (p === null) return null;
  for (const [dx, dy] of DIRS) {
    const line: Pos[] = [{ col, row }];
    for (const s of [1, -1]) {
      let c = col + dx * s;
      let r = row + dy * s;
      while (getCell(b, c, r) === p) {
        line.push({ col: c, row: r });
        c += dx * s;
        r += dy * s;
      }
    }
    if (line.length >= connect) return line;
  }
  return null;
}

/** Drops a disc for `p`; returns null (board untouched) when the column is full. */
export function drop(b: Board, col: number, p: PlayerId, connect = 4): DropResult | null {
  const row = landingRow(b, col);
  if (row < 0) return null;
  b.cells[row * b.cols + col] = p;
  const win = findWin(b, col, row, connect);
  return { row, win, draw: win === null && isFull(b) };
}

/** Who moves next. */
export const nextTurn = (p: PlayerId): PlayerId => other(p);

export interface Win {
  player: PlayerId;
  line: Pos[];
}

/** Any winning line on the board (used after a bomb, when discs fall into new places). `prefer` wins a tie of two lines. */
export function findAnyWin(b: Board, connect = 4, prefer?: PlayerId): Win | null {
  let found: Win | null = null;
  for (let row = 0; row < b.rows; row++)
    for (let col = 0; col < b.cols; col++) {
      const line = findWin(b, col, row, connect);
      if (!line) continue;
      const player = getCell(b, col, row) as PlayerId;
      if (player === prefer) return { player, line };
      found ??= { player, line };
    }
  return found;
}

export interface Fall {
  col: number;
  fromRow: number;
  toRow: number;
}

export interface BombResult {
  /** Row the bomb landed on. */
  row: number;
  /** Cells that held a disc in the blast (the landing cell itself is not listed: the bomb was never on the board). */
  removed: Pos[];
  /** Discs that dropped down afterwards. */
  falls: Fall[];
  win: Win | null;
  draw: boolean;
}

/** Lets every column settle downwards after discs were removed; returns what moved. */
export function settle(b: Board): Fall[] {
  const falls: Fall[] = [];
  for (let col = 0; col < b.cols; col++) {
    let to = b.rows - 1;
    for (let row = b.rows - 1; row >= 0; row--) {
      const c = getCell(b, col, row);
      if (c === null) continue;
      if (row !== to) {
        b.cells[to * b.cols + col] = c;
        b.cells[row * b.cols + col] = null;
        falls.push({ col, fromRow: row, toRow: to });
      }
      to--;
    }
  }
  return falls;
}

/**
 * BOMB disc dropped in `col` by `p`: it falls like a disc, explodes where it lands (clearing the (2r+1)x(2r+1) block of
 * discs around it, the bomb itself included), the columns settle, and the whole board is checked for a line.
 * Null (board untouched) when the column is full.
 */
export function bombDrop(b: Board, col: number, p: PlayerId, connect = 4, radius = 1): BombResult | null {
  const row = landingRow(b, col);
  if (row < 0) return null;
  const removed: Pos[] = [];
  for (let r = row - radius; r <= row + radius; r++)
    for (let c = col - radius; c <= col + radius; c++) {
      if (c < 0 || c >= b.cols || r < 0 || r >= b.rows) continue;
      if (getCell(b, c, r) !== null) {
        removed.push({ col: c, row: r });
        b.cells[r * b.cols + c] = null;
      }
    }
  const falls = settle(b);
  const win = findAnyWin(b, connect, p);
  return { row, removed, falls, win, draw: win === null && isFull(b) };
}

export type Note = 'size' | 'timer' | 'bomb' | 'double';

/** What is new in `cur` compared with the previous round (round 1 is classic, so it announces nothing). */
export function roundNotes(
  prev: { cols: number; rows: number; moveMs: number; bomb: boolean; double: boolean } | null,
  cur: { cols: number; rows: number; moveMs: number; bomb: boolean; double: boolean },
): Note[] {
  const p = prev ?? { cols: 7, rows: 6, moveMs: 0, bomb: false, double: false };
  const out: Note[] = [];
  if (cur.cols !== p.cols || cur.rows !== p.rows) out.push('size');
  if (cur.moveMs > 0 && cur.moveMs !== p.moveMs) out.push('timer');
  if (cur.bomb && !p.bomb) out.push('bomb');
  if (cur.double && !p.double) out.push('double');
  return out;
}

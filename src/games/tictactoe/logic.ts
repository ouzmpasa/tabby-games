import { other, type PlayerId } from '../../core/types';
import type { RoundRules } from './config';

/** A rock: nobody can play here. */
export const BLOCK = 'block' as const;
export type Cell = PlayerId | null | typeof BLOCK;

export interface Board {
  size: number;
  /** Marks in a row needed to win. */
  need: number;
  /** size * size cells, row-major (index = row * size + col), row 0 on top. */
  cells: Cell[];
}

export const createBoard = (size = 3, need = 3, blocked: readonly number[] = []): Board => {
  const cells = new Array<Cell>(size * size).fill(null);
  for (const i of blocked) if (i >= 0 && i < cells.length) cells[i] = BLOCK;
  return { size, need, cells };
};

export const cellIndex = (b: Board, col: number, row: number): number => row * b.size + col;

export const isFree = (b: Board, i: number): boolean => i >= 0 && i < b.cells.length && b.cells[i] === null;

/** Nothing left to play (rocks count as taken). */
export const isFull = (b: Board): boolean => b.cells.every((c) => c !== null);

export interface Win {
  player: PlayerId;
  /** `need` cell indices in a straight line, first to last. */
  line: number[];
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** Every straight window of `need` cells on the board, as index lists. */
export function windows(size: number, need: number): number[][] {
  const out: number[][] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      for (const [dx, dy] of DIRS) {
        const er = r + dy * (need - 1);
        const ec = c + dx * (need - 1);
        if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
        out.push(Array.from({ length: need }, (_, k) => (r + dy * k) * size + c + dx * k));
      }
  return out;
}

const windowCache = new Map<string, number[][]>();
const windowsFor = (size: number, need: number): number[][] => {
  const key = `${size}/${need}`;
  let w = windowCache.get(key);
  if (!w) windowCache.set(key, (w = windows(size, need)));
  return w;
};

/** The completed line for the board, or null. */
export function findWin(b: Board): Win | null {
  for (const line of windowsFor(b.size, b.need)) {
    const v = b.cells[line[0]];
    if (v === null || v === BLOCK) continue;
    if (line.every((i) => b.cells[i] === v)) return { player: v, line };
  }
  return null;
}

/** True when no window can ever become a line for either player any more (rocks and enemy marks block everything). */
export function isDead(b: Board): boolean {
  return windowsFor(b.size, b.need).every((line) => {
    const hasBlock = line.some((i) => b.cells[i] === BLOCK);
    const has0 = line.some((i) => b.cells[i] === 0);
    const has1 = line.some((i) => b.cells[i] === 1);
    return hasBlock || (has0 && has1);
  });
}

export interface MoveResult {
  win: Win | null;
  draw: boolean;
}

function finish(b: Board): MoveResult {
  const win = findWin(b);
  return { win, draw: win === null && (isFull(b) || isDead(b)) };
}

/** Places `p` on cell `i`; returns null (board untouched) when the cell is taken / blocked / invalid. */
export function place(b: Board, i: number, p: PlayerId): MoveResult | null {
  if (!isFree(b, i)) return null;
  b.cells[i] = p;
  return finish(b);
}

/** FLIP power: turns an enemy mark on cell `i` into `p`'s mark. Null (board untouched) when `i` is not an enemy mark. */
export function flipMark(b: Board, i: number, p: PlayerId): MoveResult | null {
  if (i < 0 || i >= b.cells.length || b.cells[i] !== other(p)) return null;
  b.cells[i] = p;
  return finish(b);
}

/** Indices of the marks that belong to `p`. */
export const marksOf = (b: Board, p: PlayerId): number[] => b.cells.flatMap((c, i) => (c === p ? [i] : []));

/** `count` distinct random cells to block. Never blocks so much that the board is hopeless (leaves at least need*2 free cells). */
export function pickBlocked(rng: () => number, size: number, count: number, need: number): number[] {
  const total = size * size;
  const n = Math.max(0, Math.min(count, total - need * 2));
  const pool = Array.from({ length: total }, (_, i) => i);
  const out: number[] = [];
  for (let k = 0; k < n; k++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

export type Note = 'size' | 'need' | 'blocked' | 'timer' | 'flip';

const CLASSIC: RoundRules = { size: 3, need: 3, blocked: 0, moveMs: 0, flip: false };

/** What is new in `cur` compared with the previous round (round 1 compares with classic Tic-Tac-Toe, so it announces nothing). */
export function roundNotes(prev: RoundRules | null, cur: RoundRules): Note[] {
  const p = prev ?? CLASSIC;
  const out: Note[] = [];
  if (cur.size !== p.size) out.push('size');
  else if (cur.need !== p.need) out.push('need');
  if (cur.blocked > 0 && p.blocked === 0) out.push('blocked');
  if (cur.moveMs > 0 && cur.moveMs !== p.moveMs) out.push('timer');
  if (cur.flip && !p.flip) out.push('flip');
  return out;
}

/** Who moves next. */
export const nextTurn = (p: PlayerId): PlayerId => other(p);

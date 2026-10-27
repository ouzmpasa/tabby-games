import { describe, expect, it } from 'vitest';
import { boardRect, cellSize, ROUNDS, roundRules, TICTACTOE } from '../../src/games/tictactoe/config';
import { BLOCK, createBoard, findWin, flipMark, isDead, isFull, marksOf, pickBlocked, place, roundNotes, windows } from '../../src/games/tictactoe/logic';
import { mulberry32 } from '../../src/games/yarncatch/logic';

describe('tic-tac-toe logic (classic 3x3)', () => {
  it('places marks and refuses taken or invalid cells', () => {
    const b = createBoard();
    expect(place(b, 4, 0)).not.toBeNull();
    expect(b.cells[4]).toBe(0);
    expect(place(b, 4, 1)).toBeNull();
    expect(b.cells[4]).toBe(0);
    expect(place(b, 9, 1)).toBeNull();
    expect(place(b, -1, 1)).toBeNull();
  });

  it('detects every one of the eight lines', () => {
    const lines = windows(3, 3);
    expect(lines).toHaveLength(8);
    for (const line of lines) {
      const b = createBoard();
      line.forEach((i, k) => {
        const r = place(b, i, 1);
        if (k < 2) expect(r!.win).toBeNull();
        else expect(r!.win).toEqual({ player: 1, line });
      });
    }
  });

  it('detects a draw once the board is full (or hopeless) without a line', () => {
    // 0 1 0 / 0 1 1 / 1 0 0
    const order: [number, 0 | 1][] = [[0, 0], [1, 1], [2, 0], [3, 0], [4, 1], [5, 1], [6, 1], [7, 0], [8, 0]];
    const b = createBoard();
    let last = null as ReturnType<typeof place>;
    for (const [i, p] of order) {
      if (last) expect(last.draw && !isDead(b)).toBe(false);
      last = place(b, i, p);
    }
    expect(last!.win).toBeNull();
    expect(last!.draw).toBe(true);
    expect(isFull(b)).toBe(true);
  });

  it('a winning last move is a win, not a draw', () => {
    const b = createBoard();
    [[1, 1], [3, 1], [6, 1], [2, 1], [0, 0], [4, 0], [5, 0], [7, 0]].forEach(([i, p]) => place(b, i, p as 0 | 1));
    const r = place(b, 8, 0)!;
    expect(r.win?.player).toBe(0);
    expect(r.draw).toBe(false);
    expect(findWin(b)).not.toBeNull();
  });
});

describe('bigger boards and rocks', () => {
  it('4 in a row on a 4x4 and a 5x5 board, in every direction', () => {
    expect(windows(4, 4)).toHaveLength(10);
    expect(windows(5, 4)).toHaveLength(5 * 2 + 5 * 2 + 2 * 2 * 2); // rows, columns, two diagonal directions
    for (const [size, need] of [[4, 4], [5, 4]] as const)
      for (const line of windows(size, need)) {
        const b = createBoard(size, need);
        line.slice(0, need - 1).forEach((i) => expect(place(b, i, 0)!.win).toBeNull());
        expect(place(b, line[need - 1], 0)!.win?.line).toEqual(line);
      }
  });

  it('3 in a row is not enough when 4 are needed, and a rock breaks a line', () => {
    const b = createBoard(5, 4, [3]);
    [0, 1, 2].forEach((i) => place(b, i, 1));
    expect(findWin(b)).toBeNull();
    expect(place(b, 3, 1)).toBeNull(); // rock
    expect(b.cells[3]).toBe(BLOCK);
    expect(place(b, 4, 1)!.win).toBeNull();
  });

  it('rocks count as taken for a full board', () => {
    const b = createBoard(3, 3, [0]);
    expect(isFull(b)).toBe(false);
    for (let i = 1; i < 9; i++) place(b, i, (i % 2) as 0 | 1);
    expect(isFull(b)).toBe(true);
  });

  it('calls a hopeless board dead (draw) before it is full', () => {
    const b = createBoard(3, 3);
    expect(isDead(b)).toBe(false);
    // 0 1 0 / 0 1 1 / 1 0 _  : every line already holds both colours
    [0, 1, 0, 0, 1, 1, 1, 0].forEach((p, i) => place(b, i, p as 0 | 1));
    expect(isFull(b)).toBe(false);
    expect(isDead(b)).toBe(true);
    const r = place(b, 8, 0)!;
    expect(r.win).toBeNull();
    expect(r.draw).toBe(true);
  });

  it('pickBlocked gives distinct cells and never blocks too many', () => {
    for (let s = 1; s < 40; s++) {
      const out = pickBlocked(mulberry32(s), 4, 3, 4);
      expect(new Set(out).size).toBe(3);
      out.forEach((i) => expect(i).toBeGreaterThanOrEqual(0));
    }
    expect(pickBlocked(mulberry32(1), 3, 9, 3).length).toBeLessThanOrEqual(9 - 6);
  });
});

describe('flip power', () => {
  it('turns an enemy mark into yours, only enemy marks, and can win', () => {
    const b = createBoard();
    place(b, 0, 0);
    place(b, 1, 1);
    place(b, 2, 0);
    expect(flipMark(b, 0, 0)).toBeNull(); // own mark
    expect(flipMark(b, 5, 0)).toBeNull(); // empty
    const r = flipMark(b, 1, 0)!;
    expect(b.cells[1]).toBe(0);
    expect(r.win?.player).toBe(0);
    expect(marksOf(b, 0)).toEqual([0, 1, 2]);
    expect(marksOf(b, 1)).toEqual([]);
  });

  it('cannot flip a rock', () => {
    const b = createBoard(3, 3, [4]);
    expect(flipMark(b, 4, 0)).toBeNull();
  });
});

describe('round progression', () => {
  it('starts classic and gets harder: bigger boards, more rocks, shorter timers', () => {
    expect(ROUNDS[0]).toEqual({ size: 3, need: 3, blocked: 0, moveMs: 0, flip: false });
    expect(ROUNDS.some((r) => r.size === 4 && r.need === 4)).toBe(true);
    expect(ROUNDS.some((r) => r.size === 5 && r.need === 4)).toBe(true);
    expect(TICTACTOE.maxRounds).toBeGreaterThan(ROUNDS.length);
    for (let i = 1; i < ROUNDS.length; i++) {
      const a = ROUNDS[i - 1];
      const b = ROUNDS[i];
      expect(b.size).toBeGreaterThanOrEqual(a.size);
      expect(b.blocked).toBeLessThanOrEqual(Math.floor((b.size * b.size) / 4)); // rocks never swallow the board
      if (a.moveMs > 0) expect(b.moveMs).toBeLessThanOrEqual(a.moveMs);
      expect(b.need).toBeLessThanOrEqual(b.size);
      expect(b.moveMs === 0 || b.moveMs >= 6000).toBe(true); // never frantic for small children
    }
    expect(roundRules(99)).toEqual(ROUNDS[ROUNDS.length - 1]);
    expect(roundRules(-3)).toEqual(ROUNDS[0]);
  });

  it('announces only what is new', () => {
    expect(roundNotes(null, ROUNDS[0])).toEqual([]);
    expect(roundNotes(ROUNDS[0], ROUNDS[1])).toEqual(['size', 'blocked', 'timer']);
    expect(roundNotes(ROUNDS[1], ROUNDS[2])).toEqual(['need', 'flip']);
    expect(roundNotes(ROUNDS[2], ROUNDS[3])).toEqual(['size', 'timer']);
    expect(roundNotes(ROUNDS[3], ROUNDS[4])).toEqual(['timer']);
    expect(roundNotes(ROUNDS[6], ROUNDS[6])).toEqual([]);
  });

  it('boards stay finger-friendly and fit the screen', () => {
    for (const r of ROUNDS) {
      const L = boardRect(r.size);
      expect(L.cell).toBeGreaterThanOrEqual(180);
      expect(L.h).toBeLessThanOrEqual(900);
      expect(L.x).toBeGreaterThan(480); // clear of the turn panels
    }
    expect(cellSize(3)).toBe(270);
    expect(TICTACTOE.targetScore).toBeGreaterThanOrEqual(4);
  });
});

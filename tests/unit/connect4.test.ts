import { describe, expect, it } from 'vitest';
import { boardRect, CONNECT4, ROUNDS, roundRules } from '../../src/games/connect4/config';
import { bombDrop, createBoard, drop, findAnyWin, findWin, getCell, isFull, landingRow, roundNotes, settle, type Board } from '../../src/games/connect4/logic';
import { TurnClock, URGENT_MS } from '../../src/games/connect4/turnTimer';

function fill(b: Board, cols: number[], p: 0 | 1) {
  let last = null;
  for (const c of cols) last = drop(b, c, p);
  return last;
}

describe('connect 4 logic', () => {
  it('discs fall to the bottom and stack', () => {
    const b = createBoard();
    expect(drop(b, 3, 0)!.row).toBe(5);
    expect(drop(b, 3, 1)!.row).toBe(4);
    expect(getCell(b, 3, 5)).toBe(0);
    expect(getCell(b, 3, 4)).toBe(1);
  });

  it('refuses a full column and leaves the board untouched', () => {
    const b = createBoard();
    for (let i = 0; i < 6; i++) drop(b, 0, (i % 2) as 0 | 1);
    expect(landingRow(b, 0)).toBe(-1);
    const before = [...b.cells];
    expect(drop(b, 0, 0)).toBeNull();
    expect(b.cells).toEqual(before);
    expect(landingRow(b, 9)).toBe(-1);
  });

  it('detects horizontal, vertical and both diagonal wins', () => {
    let b = createBoard();
    expect(fill(b, [0, 1, 2], 0)!.win).toBeNull();
    expect(drop(b, 3, 0)!.win).toHaveLength(4);

    b = createBoard();
    fill(b, [2, 2, 2], 0);
    expect(drop(b, 2, 0)!.win).toHaveLength(4);

    // diagonal up-right for player 0: (0,5) (1,4) (2,3) (3,2)
    b = createBoard();
    drop(b, 1, 1);
    drop(b, 2, 1);
    drop(b, 2, 1);
    drop(b, 3, 1);
    drop(b, 3, 1);
    drop(b, 3, 1);
    drop(b, 0, 0);
    drop(b, 1, 0);
    drop(b, 2, 0);
    const r = drop(b, 3, 0)!;
    expect(r.win).toHaveLength(4);
    expect(r.win!.every((c) => getCell(b, c.col, c.row) === 0)).toBe(true);

    // diagonal up-left for player 1
    b = createBoard();
    drop(b, 2, 0);
    drop(b, 1, 0);
    drop(b, 1, 0);
    drop(b, 0, 0);
    drop(b, 0, 0);
    drop(b, 0, 0);
    drop(b, 3, 1);
    drop(b, 2, 1);
    drop(b, 1, 1);
    expect(drop(b, 0, 1)!.win).toHaveLength(4);
  });

  it('three in a row or mixed colours is not a win', () => {
    const b = createBoard();
    drop(b, 0, 0);
    drop(b, 1, 0);
    drop(b, 2, 1);
    expect(drop(b, 3, 0)!.win).toBeNull();
    expect(findWin(b, 3, 5)).toBeNull();
  });

  it('reports a draw on a full board with no four', () => {
    const b = createBoard();
    // column pattern chosen so no line of 4 forms: columns alternate in blocks
    const pattern: (0 | 1)[][] = [
      [0, 0, 1, 1, 0, 0],
      [1, 1, 0, 0, 1, 1],
      [0, 0, 1, 1, 0, 0],
      [1, 1, 0, 0, 1, 1],
      [0, 0, 1, 1, 0, 0],
      [1, 1, 0, 0, 1, 1],
      [0, 0, 1, 1, 0, 0],
    ];
    let last = null;
    pattern.forEach((col, c) => col.forEach((p) => (last = drop(b, c, p))));
    expect(isFull(b)).toBe(true);
    expect(last!.win).toBeNull();
    expect(last!.draw).toBe(true);
  });
});

describe('bomb disc', () => {
  it('clears the 3x3 block around where it lands (itself included) and the columns settle', () => {
    const b = createBoard();
    // three stacked columns 2,3,4 of alternating colours, two high
    for (const c of [2, 3, 4]) {
      drop(b, c, 0);
      drop(b, c, 1);
    }
    drop(b, 0, 1); // out of range of the blast
    const r = bombDrop(b, 3, 0)!;
    expect(r.row).toBe(3); // landed on top of the two discs in column 3
    // blast block: cols 2..4, rows 2..4 -> the upper disc (row 4) of each column goes; row 5 survives
    expect(r.removed).toHaveLength(3);
    expect(getCell(b, 3, 4)).toBeNull();
    expect(getCell(b, 3, 5)).toBe(0);
    expect(getCell(b, 0, 5)).toBe(1);
    expect(r.falls).toEqual([]);
  });

  it('discs above the blast fall down into the gap', () => {
    const b = createBoard(7, 6);
    for (let i = 0; i < 6; i++) drop(b, 0, (i % 2) as 0 | 1); // a full column 0
    // column 1: 1 disc; bomb lands on it at row 4, blast rows 3..5 of cols 0..2 -> column 0 rows 3..5 removed, rows 0..2 fall by 3
    drop(b, 1, 1);
    const r = bombDrop(b, 1, 0)!;
    expect(r.row).toBe(4);
    expect(r.removed.filter((p) => p.col === 0)).toHaveLength(3);
    expect(r.falls.filter((f) => f.col === 0)).toEqual([
      { col: 0, fromRow: 2, toRow: 5 },
      { col: 0, fromRow: 1, toRow: 4 },
      { col: 0, fromRow: 0, toRow: 3 },
    ]);
    expect(getCell(b, 0, 2)).toBeNull();
    expect(getCell(b, 0, 5)).not.toBeNull();
  });

  it('refuses a full column and leaves the board untouched', () => {
    const b = createBoard();
    for (let i = 0; i < 6; i++) drop(b, 2, (i % 2) as 0 | 1);
    const before = [...b.cells];
    expect(bombDrop(b, 2, 0)).toBeNull();
    expect(b.cells).toEqual(before);
  });

  it('a line made by falling discs wins (even for the other player), and the bomber wins a tie of lines', () => {
    const b = createBoard();
    [0, 1, 2].forEach((c) => drop(b, c, 0)); // row 5: 0 0 0
    [1, 1, 1].forEach((p) => drop(b, 3, p as 0 | 1)); // col 3 rows 5,4,3: junk
    drop(b, 3, 0); // (3,2): player 0, will fall to row 5
    drop(b, 4, 1); // (4,5): the bomb lands on this
    const r = bombDrop(b, 4, 1)!;
    expect(r.row).toBe(4);
    expect(r.win?.player).toBe(0);
    expect(r.win?.line).toHaveLength(4);

    const b3 = createBoard();
    [0, 1, 2, 3].forEach((c) => drop(b3, c, 0));
    [0, 1, 2, 3].forEach((c) => drop(b3, c, 1));
    expect(findAnyWin(b3, 4)).not.toBeNull();
    expect(findAnyWin(b3, 4, 0)!.player).toBe(0);
    expect(findAnyWin(b3, 4, 1)!.player).toBe(1);
  });

  it('settle drops floating discs and reports them', () => {
    const b = createBoard(3, 4);
    b.cells[0 * 3 + 1] = 0;
    b.cells[1 * 3 + 1] = 1;
    expect(settle(b)).toEqual([
      { col: 1, fromRow: 1, toRow: 3 },
      { col: 1, fromRow: 0, toRow: 2 },
    ]);
    expect(getCell(b, 1, 3)).toBe(1);
    expect(getCell(b, 1, 2)).toBe(0);
  });
});

describe('round progression', () => {
  it('starts classic and escalates: timer, bomb, bigger board, double; timers shrink but stay generous', () => {
    expect(ROUNDS[0]).toEqual({ cols: 7, rows: 6, connect: 4, moveMs: 0, bomb: false, double: false });
    for (let i = 1; i < ROUNDS.length; i++) {
      const a = ROUNDS[i - 1];
      const b = ROUNDS[i];
      expect(b.cols).toBeGreaterThanOrEqual(a.cols);
      expect(b.rows).toBeGreaterThanOrEqual(a.rows);
      if (a.moveMs > 0) expect(b.moveMs).toBeLessThanOrEqual(a.moveMs);
      expect(b.moveMs === 0 || b.moveMs >= 9000).toBe(true);
      expect(Number(b.bomb)).toBeGreaterThanOrEqual(Number(a.bomb));
      expect(Number(b.double)).toBeGreaterThanOrEqual(Number(a.double));
    }
    expect(roundRules(50)).toEqual(ROUNDS[ROUNDS.length - 1]);
  });

  it('announces only what is new', () => {
    expect(roundNotes(null, ROUNDS[0])).toEqual([]);
    expect(roundNotes(ROUNDS[0], ROUNDS[1])).toEqual(['timer', 'bomb']);
    expect(roundNotes(ROUNDS[1], ROUNDS[2])).toEqual(['size', 'timer']);
    expect(roundNotes(ROUNDS[2], ROUNDS[3])).toEqual(['timer', 'double']);
    expect(roundNotes(ROUNDS[5], ROUNDS[5])).toEqual([]);
  });

  it('keeps the big board finger-friendly and on screen', () => {
    for (const r of ROUNDS) {
      const B = boardRect(r.cols, r.rows);
      expect(B.x).toBeGreaterThan(420); // clear of the turn panels
      expect(B.y + B.h).toBeLessThanOrEqual(1040);
      expect(B.y).toBeGreaterThanOrEqual(40);
    }
    expect(CONNECT4.cell).toBeGreaterThanOrEqual(120);
  });
});

describe('turn clock', () => {
  it('counts down, ticks once a second when urgent, times out once', () => {
    const c = new TurnClock();
    c.start(0);
    expect(c.running).toBe(false);
    expect(c.step(1000)).toBeNull();
    c.start(5000);
    expect(c.fraction).toBe(1);
    expect(c.step(1500)).toBeNull(); // 3500 left, not urgent yet
    expect(c.urgent).toBe(false);
    const events: (string | null)[] = [];
    for (let i = 0; i < 40; i++) events.push(c.step(100));
    expect(events.filter((e) => e === 'tick').length).toBeGreaterThanOrEqual(2);
    expect(events.filter((e) => e === 'timeout')).toHaveLength(1);
    expect(c.running).toBe(false);
    expect(c.step(100)).toBeNull();
    expect(URGENT_MS).toBe(3000);
  });
});

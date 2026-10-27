import { describe, expect, it } from 'vitest';
import { boardLayout, ROUNDS, roundRules } from '../../src/games/dotsboxes/config';
import { boxEdges, countBoxes, createGame, edgeBoxes, edgeEnds, edgeTotal, GOLDEN_POINTS, hEdge, isOver, nearestEdge, passTurn, pickGolden, play, pointsOf, roundNotes, vEdge, winner } from '../../src/games/dotsboxes/logic';
import { mulberry32 } from '../../src/games/yarncatch/logic';

describe('dots and boxes logic', () => {
  it('has 40 edges on a 4x4 board and each box has 4 distinct edges', () => {
    expect(edgeTotal(4)).toBe(40);
    for (let b = 0; b < 16; b++) expect(new Set(boxEdges(4, b % 4, Math.floor(b / 4))).size).toBe(4);
  });

  it('edge ends and adjacent boxes are consistent', () => {
    expect(edgeEnds(4, hEdge(4, 2, 1))).toEqual([{ x: 2, y: 1 }, { x: 3, y: 1 }]);
    expect(edgeEnds(4, vEdge(4, 3, 2))).toEqual([{ x: 3, y: 2 }, { x: 3, y: 3 }]);
    expect(edgeBoxes(4, hEdge(4, 0, 0))).toEqual([0]);
    expect(edgeBoxes(4, hEdge(4, 1, 2))).toEqual([5, 9]);
    expect(edgeBoxes(4, vEdge(4, 0, 1))).toEqual([4]);
    expect(edgeBoxes(4, vEdge(4, 2, 1))).toEqual([5, 6]);
  });

  it('turns alternate unless a box is completed', () => {
    const g = createGame(4, 0);
    expect(play(g, hEdge(4, 0, 0))!.next).toBe(1);
    expect(play(g, hEdge(4, 0, 1))!.next).toBe(0);
    expect(play(g, vEdge(4, 0, 0))!.next).toBe(1);
    const r = play(g, vEdge(4, 1, 0))!;
    expect(r.completed).toEqual([0]);
    expect(r.next).toBe(1);
    expect(g.boxes[0]).toBe(1);
  });

  it('rejects drawn and invalid edges', () => {
    const g = createGame();
    expect(play(g, 3)).not.toBeNull();
    expect(play(g, 3)).toBeNull();
    expect(play(g, 99)).toBeNull();
    expect(g.turn).toBe(1);
  });

  it('one line can complete two boxes', () => {
    const g = createGame(4, 0);
    for (const e of [hEdge(4, 0, 0), hEdge(4, 0, 1), vEdge(4, 0, 0), hEdge(4, 1, 0), hEdge(4, 1, 1), vEdge(4, 2, 0)]) {
      g.turn = 0;
      play(g, e);
    }
    g.turn = 1;
    const r = play(g, vEdge(4, 1, 0))!;
    expect(r.completed).toEqual([0, 1]);
    expect(countBoxes(g, 1)).toBe(2);
    expect(r.next).toBe(1);
  });

  it('plays a full game and picks the winner / tie', () => {
    const g = createGame(1, 0);
    expect(winner(g)).toBeNull();
    [0, 1, 2].forEach((e) => play(g, e));
    expect(isOver(g)).toBe(false);
    play(g, 3);
    expect(isOver(g)).toBe(true);
    expect(winner(g)).toBe(1);
    const t = createGame(4);
    t.boxes = t.boxes.map((_, i) => (i % 2) as 0 | 1);
    expect(winner(t)).toBeNull();
    t.boxes[0] = 1;
    expect(winner(t)).toBe(1);
  });

  it('nearestEdge picks the closest undrawn edge within range', () => {
    const g = createGame(4);
    const o = { x: 100, y: 100 };
    expect(nearestEdge(g, 150, 108, o, 200, 60)).toBe(hEdge(4, 0, 0));
    expect(nearestEdge(g, 108, 200, o, 200, 60)).toBe(vEdge(4, 0, 0));
    expect(nearestEdge(g, 200, 200, o, 200, 60)).toBe(-1); // box centre, too far
    play(g, hEdge(4, 0, 0));
    expect(nearestEdge(g, 150, 108, o, 200, 60)).not.toBe(hEdge(4, 0, 0));
  });
});

describe('golden boxes', () => {
  it('a golden box is worth 3 and can swing the round', () => {
    const g = createGame(2, 0, [3]);
    expect(GOLDEN_POINTS).toBe(3);
    g.boxes = [0, 0, 0, 1]; // player 0 has three plain boxes, player 1 only the golden one
    expect(countBoxes(g, 0)).toBe(3);
    expect(pointsOf(g, 0)).toBe(3);
    expect(pointsOf(g, 1)).toBe(3);
    expect(winner(g)).toBeNull(); // 3 - 3 is a tie
    g.boxes = [0, 0, 1, 1];
    expect(pointsOf(g, 1)).toBe(4);
    expect(winner(g)).toBe(1);
    expect(countBoxes(g, 0)).toBe(countBoxes(g, 1)); // two boxes each, the golden one decides
  });

  it('completing a golden box still just gives another turn', () => {
    const g = createGame(1, 0, [0]);
    [0, 1, 2].forEach((e) => play(g, e));
    const r = play(g, 3)!;
    expect(r.completed).toEqual([0]);
    expect(pointsOf(g, g.boxes[0] as 0 | 1)).toBe(3);
  });

  it('pickGolden gives distinct boxes, mostly spread apart', () => {
    for (let s = 1; s < 50; s++) {
      const out = pickGolden(mulberry32(s), 5, 3);
      expect(new Set(out).size).toBe(3);
      out.forEach((i) => expect(i).toBeLessThan(25));
    }
    expect(pickGolden(mulberry32(1), 4, 0)).toEqual([]);
    expect(pickGolden(mulberry32(1), 2, 4)).toHaveLength(4); // never gets stuck on a tiny board
  });

  it('passTurn hands the turn over without drawing', () => {
    const g = createGame(4, 0);
    passTurn(g);
    expect(g.turn).toBe(1);
    expect(g.edges.every((e) => e === null)).toBe(true);
  });
});

describe('round progression', () => {
  it('boards grow 5x5 -> 6x6 -> 7x7 dots with more golden boxes and shorter (but generous) timers', () => {
    expect(ROUNDS.map((r) => r.boxes + 1)).toEqual([5, 5, 6, 6, 7]);
    expect(ROUNDS[0].golden).toBe(0);
    expect(ROUNDS[0].moveMs).toBe(0);
    for (let i = 1; i < ROUNDS.length; i++) {
      expect(ROUNDS[i].boxes).toBeGreaterThanOrEqual(ROUNDS[i - 1].boxes);
      expect(ROUNDS[i].golden).toBeGreaterThanOrEqual(ROUNDS[i - 1].golden);
      expect(ROUNDS[i].moveMs).toBeGreaterThanOrEqual(10000);
      if (ROUNDS[i - 1].moveMs) expect(ROUNDS[i].moveMs).toBeLessThanOrEqual(ROUNDS[i - 1].moveMs);
    }
    expect(roundRules(40)).toEqual(ROUNDS[ROUNDS.length - 1]);
  });

  it('every board fits the screen and keeps finger-friendly targets', () => {
    for (const r of ROUNDS) {
      const L = boardLayout(r.boxes);
      expect(L.y - L.margin).toBeGreaterThanOrEqual(40);
      expect(L.y + L.span + L.margin).toBeLessThanOrEqual(1040);
      expect(L.x - L.margin).toBeGreaterThan(480); // clear of the turn panels
      expect(L.spacing).toBeGreaterThanOrEqual(130);
      expect(L.hitRadius).toBeGreaterThanOrEqual(56);
      expect(L.lineWidth).toBeGreaterThanOrEqual(14);
    }
    expect(boardLayout(4).spacing).toBe(190);
    expect(boardLayout(4).hitRadius).toBe(70);
  });

  it('announces only what is new', () => {
    expect(roundNotes(null, ROUNDS[0])).toEqual([]);
    expect(roundNotes(ROUNDS[0], ROUNDS[1])).toEqual(['golden', 'timer']);
    expect(roundNotes(ROUNDS[1], ROUNDS[2])).toEqual(['size', 'timer']);
    expect(roundNotes(ROUNDS[2], ROUNDS[3])).toEqual(['timer']);
    expect(roundNotes(ROUNDS[3], ROUNDS[4])).toEqual(['size']);
    expect(roundNotes(ROUNDS[4], ROUNDS[4])).toEqual([]);
  });
});

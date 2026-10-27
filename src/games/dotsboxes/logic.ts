import { other, type PlayerId } from '../../core/types';

/**
 * Edges are numbered: horizontals first (row-major, (n+1) rows of n), then verticals (n rows of n+1).
 * Dots are (col,row) with (0,0) top-left. Box (c,r) sits right/below dot (c,r).
 */
export type Owner = PlayerId | null;

export interface Game {
  n: number;
  /** Who drew each edge. */
  edges: Owner[];
  /** Who owns each box (row-major). */
  boxes: Owner[];
  /** Golden boxes (worth GOLDEN_POINTS), row-major. */
  golden: boolean[];
  turn: PlayerId;
}

export interface Point {
  x: number;
  y: number;
}

export const edgeTotal = (n: number): number => 2 * n * (n + 1);

/** Points a golden box is worth (a normal box is 1). */
export const GOLDEN_POINTS = 3;

/** `golden` lists the box indices that are golden. */
export function createGame(n = 4, first: PlayerId = 0, golden: readonly number[] = []): Game {
  const g: boolean[] = new Array<boolean>(n * n).fill(false);
  for (const i of golden) if (i >= 0 && i < g.length) g[i] = true;
  return { n, edges: new Array<Owner>(edgeTotal(n)).fill(null), boxes: new Array<Owner>(n * n).fill(null), golden: g, turn: first };
}

/** `count` distinct random box indices to make golden, spread out (no two touching when the board has room for that). */
export function pickGolden(rng: () => number, n: number, count: number): number[] {
  const out: number[] = [];
  const pool = Array.from({ length: n * n }, (_, i) => i);
  const touching = (a: number, b: number): boolean => Math.abs((a % n) - (b % n)) <= 1 && Math.abs(Math.floor(a / n) - Math.floor(b / n)) <= 1;
  while (out.length < count && pool.length) {
    const k = Math.floor(rng() * pool.length);
    const i = pool.splice(k, 1)[0];
    if (out.some((o) => touching(o, i)) && pool.some((q) => !out.some((o) => touching(o, q)))) continue; // retry elsewhere, but never get stuck
    out.push(i);
  }
  return out;
}

/** The turn passes without a line being drawn (move timer ran out). */
export function passTurn(g: Game): void {
  g.turn = other(g.turn);
}

export const hEdge = (n: number, c: number, r: number): number => r * n + c;
export const vEdge = (n: number, c: number, r: number): number => n * (n + 1) + r * (n + 1) + c;
export const isHorizontal = (n: number, e: number): boolean => e < n * (n + 1);

/** Dot coordinates (grid units) of the two ends of an edge. */
export function edgeEnds(n: number, e: number): [Point, Point] {
  if (isHorizontal(n, e)) {
    const r = Math.floor(e / n);
    const c = e % n;
    return [{ x: c, y: r }, { x: c + 1, y: r }];
  }
  const k = e - n * (n + 1);
  const r = Math.floor(k / (n + 1));
  const c = k % (n + 1);
  return [{ x: c, y: r }, { x: c, y: r + 1 }];
}

/** The four edges around box (c,r): top, bottom, left, right. */
export const boxEdges = (n: number, c: number, r: number): number[] => [hEdge(n, c, r), hEdge(n, c, r + 1), vEdge(n, c, r), vEdge(n, c + 1, r)];

/** Boxes (indices) touching an edge: one on the border, two inside. */
export function edgeBoxes(n: number, e: number): number[] {
  const out: number[] = [];
  if (isHorizontal(n, e)) {
    const r = Math.floor(e / n);
    const c = e % n;
    if (r > 0) out.push((r - 1) * n + c);
    if (r < n) out.push(r * n + c);
  } else {
    const k = e - n * (n + 1);
    const r = Math.floor(k / (n + 1));
    const c = k % (n + 1);
    if (c > 0) out.push(r * n + c - 1);
    if (c < n) out.push(r * n + c);
  }
  return out;
}

/** Boxes that would be completed by drawing edge `e` now (no mutation). */
export function wouldComplete(g: Game, e: number): number[] {
  if (e < 0 || e >= g.edges.length || g.edges[e] !== null) return [];
  return edgeBoxes(g.n, e).filter((b) => {
    if (g.boxes[b] !== null) return false;
    return boxEdges(g.n, b % g.n, Math.floor(b / g.n)).every((x) => x === e || g.edges[x] !== null);
  });
}

export interface MoveResult {
  /** Boxes this move completed. */
  completed: number[];
  /** Whose turn it is next (same player after completing a box, unless the game is over). */
  next: PlayerId;
}

/** Draws edge `e` for the current player; null when invalid / already drawn. Completing a box gives another turn. */
export function play(g: Game, e: number): MoveResult | null {
  if (e < 0 || e >= g.edges.length || g.edges[e] !== null) return null;
  const player = g.turn;
  const completed = wouldComplete(g, e);
  g.edges[e] = player;
  for (const b of completed) g.boxes[b] = player;
  if (completed.length === 0) g.turn = other(player);
  return { completed, next: g.turn };
}

export const isOver = (g: Game): boolean => g.boxes.every((b) => b !== null);

export const countBoxes = (g: Game, p: PlayerId): number => g.boxes.filter((b) => b === p).length;

/** Points of a player: 1 per box, GOLDEN_POINTS per golden box. */
export const pointsOf = (g: Game, p: PlayerId): number => g.boxes.reduce<number>((sum, o, i) => (o === p ? sum + (g.golden[i] ? GOLDEN_POINTS : 1) : sum), 0);

/** Round winner: the player with more points once all boxes are taken, else null (tie or unfinished). */
export function winner(g: Game): PlayerId | null {
  if (!isOver(g)) return null;
  const a = pointsOf(g, 0);
  const b = pointsOf(g, 1);
  return a === b ? null : a > b ? 0 : 1;
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Nearest undrawn edge to a touch point. `origin` is the top-left dot, `spacing` the dot distance, all in px.
 * Returns -1 when nothing is within `maxDist`.
 */
export function nearestEdge(g: Game, px: number, py: number, origin: Point, spacing: number, maxDist: number): number {
  let best = -1;
  let bestD = maxDist;
  for (let e = 0; e < g.edges.length; e++) {
    if (g.edges[e] !== null) continue;
    const [a, b] = edgeEnds(g.n, e);
    const d = distToSegment(
      { x: px, y: py },
      { x: origin.x + a.x * spacing, y: origin.y + a.y * spacing },
      { x: origin.x + b.x * spacing, y: origin.y + b.y * spacing },
    );
    if (d <= bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

export type Note = 'size' | 'golden' | 'timer';

/** What is new in `cur` compared with the previous round (round 1 is classic, so it announces nothing). */
export function roundNotes(prev: { boxes: number; golden: number; moveMs: number } | null, cur: { boxes: number; golden: number; moveMs: number }): Note[] {
  const p = prev ?? { boxes: 4, golden: 0, moveMs: 0 };
  const out: Note[] = [];
  if (cur.boxes !== p.boxes) out.push('size');
  if (cur.golden > 0 && p.golden === 0) out.push('golden');
  if (cur.moveMs > 0 && cur.moveMs !== p.moveMs) out.push('timer');
  return out;
}

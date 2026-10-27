import { describe, expect, it } from 'vitest';
import { PONG } from '../../src/games/pong/config';
import {
  DEFAULT_PARAMS as P, clampPaddleY, collidePillar, createState, hitOffset, matchProgress, movePaddles, paddleX, paramsFor, pickRound, serve, step,
  updatePillars, withSpin,
} from '../../src/games/pong/logic';

const none = [null, null] as const;
const cy = P.field.y + P.field.h / 2;

describe('pong logic', () => {
  it('serves toward the conceder', () => {
    const s = createState();
    serve(s, 0, 500, () => 0.5);
    expect(s.ball.vx).toBeLessThan(0);
    serve(s, 1, 500, () => 0.5);
    expect(s.ball.vx).toBeGreaterThan(0);
    serve(s, null, 0);
    expect(s.ball.vx).toBe(0);
  });

  it('bounces off the top and bottom walls', () => {
    const s = createState();
    Object.assign(s.ball, { x: 960, y: P.field.y + P.ballRadius + 2, vx: 0, vy: -600 });
    step(s, 16, none);
    expect(s.ball.vy).toBeGreaterThan(0);
    Object.assign(s.ball, { x: 960, y: P.field.y + P.field.h - P.ballRadius - 2, vx: 0, vy: 600 });
    step(s, 16, none);
    expect(s.ball.vy).toBeLessThan(0);
  });

  it('paddle returns the ball and speeds it up, capped', () => {
    const s = createState();
    Object.assign(s.ball, { x: paddleX(0) + 80, y: cy, vx: -600, vy: 0 });
    s.paddles[0].y = cy;
    let r = { hit: null as number | null };
    for (let i = 0; i < 20 && r.hit === null; i++) r = step(s, 16, none);
    expect(r.hit).toBe(0);
    expect(s.ball.vx).toBeGreaterThan(0);
    expect(Math.hypot(s.ball.vx, s.ball.vy)).toBeCloseTo(P.serveSpeed + P.speedUp, 0);
    s.hits = 1000;
    Object.assign(s.ball, { x: paddleX(1) - 80, y: cy, vx: 600, vy: 0 });
    s.paddles[1].y = cy;
    for (let i = 0; i < 20; i++) step(s, 16, none);
    expect(Math.hypot(s.ball.vx, s.ball.vy)).toBeLessThanOrEqual(P.maxSpeed + 0.01);
    expect(s.ball.vx).toBeLessThan(0);
  });

  it('bounce angle depends on where the paddle is hit', () => {
    const hitAt = (dy: number) => {
      const s = createState();
      Object.assign(s.ball, { x: paddleX(0) + 80, y: cy + dy, vx: -600, vy: 0 });
      s.paddles[0].y = cy;
      for (let i = 0; i < 20; i++) step(s, 16, none);
      return s.ball.vy;
    };
    expect(Math.abs(hitAt(0))).toBeLessThan(1);
    expect(hitAt(100)).toBeGreaterThan(50);
    expect(hitAt(-100)).toBeLessThan(-50);
    expect(hitOffset(cy + 1000, cy)).toBe(1);
  });

  it('a ball that passes a paddle scores for the other player', () => {
    const s = createState();
    Object.assign(s.ball, { x: 400, y: 150, vx: -800, vy: 0 });
    s.paddles[0].y = 900; // far away
    let goal: number | null = null;
    for (let i = 0; i < 100 && goal === null; i++) goal = step(s, 16, none).goal;
    expect(goal).toBe(1);
    Object.assign(s.ball, { x: 1500, y: 150, vx: 800, vy: 0 });
    s.paddles[1].y = 900;
    goal = null;
    for (let i = 0; i < 100 && goal === null; i++) goal = step(s, 16, none).goal;
    expect(goal).toBe(0);
  });

  it('paddles follow targets and stay inside the field', () => {
    const s = createState();
    movePaddles(s, 1000, [0, 5000]);
    expect(s.paddles[0].y).toBe(clampPaddleY(0));
    expect(s.paddles[1].y).toBe(clampPaddleY(5000));
    expect(s.paddles[0].y).toBe(P.field.y + P.paddleH / 2);
    const y = s.paddles[0].y;
    movePaddles(s, 16, [null, null]);
    expect(s.paddles[0].y).toBe(y);
  });
});

describe('pong difficulty', () => {
  const cx = P.field.x + P.field.w / 2;

  it('match progress follows the leader or the total, from 0 to 1', () => {
    expect(matchProgress([0, 0], 15)).toBe(0);
    expect(matchProgress([14, 3], 15)).toBe(1);
    expect(matchProgress([4, 4], 15)).toBeCloseTo(8 / 28);
  });

  it('paddles shrink, serves get faster and top speed rises with progress', () => {
    expect(paramsFor(0).paddleH).toBe(PONG.paddleH);
    expect(paramsFor(1).paddleH).toBe(PONG.paddleHEnd);
    expect(paramsFor(1).serveSpeed).toBeGreaterThan(paramsFor(0).serveSpeed);
    expect(paramsFor(1).maxSpeed).toBeGreaterThan(paramsFor(0).maxSpeed);
    // a smaller paddle really misses a ball that the big one returns
    const edgeHit = (pp: typeof P) => {
      const s = createState(pp);
      Object.assign(s.ball, { x: paddleX(0, pp) + 80, y: cy + 150 + pp.ballRadius * 0.5, vx: -600, vy: 0 });
      s.paddles[0].y = cy;
      let hit: number | null = null;
      for (let i = 0; i < 30 && hit === null; i++) hit = step(s, 16, none, pp).hit;
      return hit;
    };
    expect(edgeHit(paramsFor(0))).toBe(0);
    expect(edgeHit(paramsFor(1))).toBeNull();
  });

  it('a sliding paddle curves the ball (spin), within the maximum angle', () => {
    expect(withSpin(0, 0, 700)).toBe(0);
    expect(withSpin(0, 1500, 700)).toBeCloseTo(P.spin * 1500);
    expect(withSpin(0, -1500, 700)).toBeCloseTo(-P.spin * 1500);
    expect(withSpin(0, 99999, 700)).toBeCloseTo(P.spin * P.spinCap); // paddle speed is capped
    expect(Math.abs(withSpin(600, 99999, 700))).toBeLessThanOrEqual(700 * Math.sin((P.maxAngleDeg * Math.PI) / 180) + 1e-6);
    // and it is wired into the hit: the speed stays on the speed-up curve
    const s = createState();
    Object.assign(s.ball, { x: paddleX(0) + P.paddleW / 2 + P.ballRadius + 6, y: cy, vx: -600, vy: 0 });
    const t = [cy + 120, null];
    for (let i = 0; i < 20; i++) step(s, 16, t);
    expect(Math.hypot(s.ball.vx, s.ball.vy)).toBeCloseTo(P.serveSpeed + P.speedUp, 0);
  });

  const seq = (...v: number[]) => {
    let i = 0;
    return () => v[Math.min(i++, v.length - 1)];
  };

  it('pickRound: plain at first, then pillars, sweeping and twin pillars, then twin balls', () => {
    expect(pickRound(0.05, () => 0)).toEqual({ pillars: [], twin: false });
    expect(pickRound(0.3, () => 0.99).pillars).toHaveLength(0);
    const one = pickRound(0.2, () => 0);
    expect(one.pillars).toHaveLength(1);
    expect(one.pillars[0].amp).toBe(0);
    expect(pickRound(0.45, seq(0, 0.5, 0.2)).pillars[0].amp).toBeGreaterThan(0);
    expect(pickRound(0.45, seq(0, 0.5, 0.2)).twin).toBe(false);
    expect(pickRound(0.9, () => 0.9).twin).toBe(false);
    expect(pickRound(0.9, seq(0.9, 0, 0.1)).pillars).toHaveLength(2);
    const twin = pickRound(0.9, () => 0);
    expect(twin.twin).toBe(true);
    expect(twin.pillars).toHaveLength(0);
  });

  it('a pillar bounces the ball without changing its speed and sweeping pillars move', () => {
    const s = createState();
    s.pillars = pickRound(0.2, () => 0).pillars;
    const pl = s.pillars[0];
    const b = { x: pl.x - pl.r - P.ballRadius - 4, y: pl.y, vx: 700, vy: 0 };
    for (let i = 0; i < 5 && b.vx > 0; i++) {
      b.x += b.vx * 0.016;
      collidePillar(b, pl, P.ballRadius);
    }
    expect(b.vx).toBeLessThan(0);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(700, 0);
    expect(Math.hypot(b.x - pl.x, b.y - pl.y)).toBeGreaterThanOrEqual(pl.r + P.ballRadius - 1e-6);
    const m = createState();
    m.pillars = pickRound(0.9, seq(0.9, 0, 0.1)).pillars;
    const y0 = m.pillars[0].y;
    updatePillars(m, 1, 1 / 60);
    expect(m.pillars[0].y).not.toBe(y0);
    expect(m.pillars[0].x).toBeCloseTo(cx);
  });

  it('twin serve sends one ball each way; either ball passing ends the point', () => {
    const s = createState();
    serve(s, 1, 600, () => 0.5, P, true);
    expect(s.extra).not.toBeNull();
    expect(s.ball.vx).toBeGreaterThan(0);
    expect(s.extra!.vx).toBeLessThan(0);
    // the extra ball flies to player 0's side and passes the (far away) paddle: player 1 scores
    s.paddles[0].y = 900;
    s.paddles[1].y = 150;
    s.ball.y = 150;
    s.extra!.y = 150;
    let goal: number | null = null;
    for (let i = 0; i < 300 && goal === null; i++) goal = step(s, 16, none).goal;
    expect(goal).toBe(1);
    serve(s, 0, 600, () => 0.5, P, false);
    expect(s.extra).toBeNull();
  });

  it('with pillars the ball starts beside the middle on the receiving side', () => {
    const s = createState();
    s.pillars = pickRound(0.2, () => 0).pillars;
    serve(s, null, 0, () => 0.5, P, false, 0);
    expect(s.ball.x).toBeLessThan(cx - s.pillars[0].r);
    serve(s, null, 0, () => 0.5, P, false, 1);
    expect(s.ball.x).toBeGreaterThan(cx + s.pillars[0].r);
  });

  it('a long chaotic rally keeps the numbers finite and the ball in the field', () => {
    const s = createState();
    const pp = paramsFor(1);
    s.pillars = pickRound(0.9, seq(0.9, 0, 0.1), pp).pillars;
    serve(s, 1, pp.serveSpeed, () => 0.3, pp, false);
    for (let i = 0; i < 4000; i++) {
      const t = [cy + 250 * Math.sin(i / 25), cy + 250 * Math.cos(i / 31)];
      const r = step(s, 16, t, pp);
      if (r.goal !== null) serve(s, r.goal === 0 ? 1 : 0, pp.serveSpeed, () => 0.3, pp, false);
      expect(Number.isFinite(s.ball.x + s.ball.y + s.ball.vx + s.ball.vy)).toBe(true);
      expect(s.ball.y).toBeGreaterThanOrEqual(P.field.y);
      expect(s.ball.y).toBeLessThanOrEqual(P.field.y + P.field.h);
      expect(Math.hypot(s.ball.vx, s.ball.vy)).toBeLessThanOrEqual(pp.maxSpeed + 1);
    }
  });
});

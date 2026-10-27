import { describe, expect, it } from 'vitest';
import { TABLEFOOTBALL } from '../../src/games/tablefootball/config';
import {
  DEFAULT_PARAMS as P, clampRod, createState, figureY, matchProgress, moveRods, paramsFor, pickMode, rodIndex, serve, serveSpeedFor, setupPoint, step,
  updateGoals,
} from '../../src/games/tablefootball/logic';

const cx = P.pitch.x + P.pitch.w / 2;
const cy = P.pitch.y + P.pitch.h / 2;
const none = Array(6).fill(null) as (number | null)[];

function run(s: ReturnType<typeof createState>, ms: number, targets: readonly (number | null)[] = none) {
  for (let t = 0; t < ms; t += 16) {
    const r = step(s, 16, targets);
    if (r.goal !== null) return r;
  }
  return { goal: null };
}

/** Move all rods so no figure is near y (keeps tests about walls/goals free of figures). */
const clearAway = (s: ReturnType<typeof createState>) => s.rods.forEach((r) => (r.x = -5000));

describe('table football logic', () => {
  it('creates 3 rods per player with 1/2/3 figures inside their own half', () => {
    const s = createState();
    expect(s.rods).toHaveLength(6);
    expect(s.rods.slice(0, 3).map((r) => r.offsets.length)).toEqual([1, 2, 3]);
    s.rods.slice(0, 3).forEach((r) => expect(r.x).toBeLessThan(cx));
    s.rods.slice(3).forEach((r) => expect(r.x).toBeGreaterThan(cx));
  });

  it('bounces off the long walls', () => {
    const s = createState();
    clearAway(s);
    s.ball.x = cx;
    s.ball.y = P.pitch.y + P.ballRadius + 5;
    s.ball.vy = -600;
    step(s, 16, none);
    expect(s.ball.vy).toBeGreaterThan(0);
    expect(s.ball.y).toBeGreaterThanOrEqual(P.pitch.y + P.ballRadius - 0.01);
  });

  it('bounces off the end wall outside the goal mouth', () => {
    const s = createState();
    clearAway(s);
    s.ball.x = P.pitch.x + P.ballRadius + 5;
    s.ball.y = cy + P.goalWidth / 2 + 120;
    s.ball.vx = -800;
    expect(step(s, 16, none).goal).toBeNull();
    expect(s.ball.vx).toBeGreaterThan(0);
  });

  it('left goal scores for player 1, right goal for player 0', () => {
    const a = createState();
    clearAway(a);
    Object.assign(a.ball, { x: P.pitch.x + 60, y: cy, vx: -900, vy: 0 });
    expect(run(a, 1000).goal).toBe(1);
    const b = createState();
    clearAway(b);
    Object.assign(b.ball, { x: P.pitch.x + P.pitch.w - 60, y: cy, vx: 900, vy: 0 });
    expect(run(b, 1000).goal).toBe(0);
  });

  it('a fast ball cannot pass through a still figure', () => {
    const s = createState();
    const rod = s.rods[rodIndex(1, 2)];
    const fy = figureY(rod, 1);
    Object.assign(s.ball, { x: rod.x - 300, y: fy, vx: P.ballMaxSpeed, vy: 0 });
    run(s, 400);
    expect(s.ball.x).toBeLessThan(rod.x);
  });

  it('a gentle touch still kicks the ball away', () => {
    const s = createState();
    const rod = s.rods[rodIndex(0, 2)];
    s.rods.slice(3).forEach((r) => (r.x = -5000));
    Object.assign(s.ball, { x: rod.x + P.ballRadius + P.figureRadius + 1, y: figureY(rod, 1), vx: -50, vy: 0 });
    run(s, 48);
    expect(s.ball.vx).toBeGreaterThan(P.kickSpeed * 0.8);
  });

  it('a sliding rod hits the ball sideways', () => {
    const s = createState();
    const k = rodIndex(0, 2);
    const rod = s.rods[k];
    Object.assign(s.ball, { x: rod.x, y: figureY(rod, 1) + P.ballRadius + P.figureRadius + 20, vx: 0, vy: 0 });
    const t = [...none];
    t[k] = rod.y + 200;
    run(s, 150, t);
    expect(s.ball.vy).toBeGreaterThan(300);
  });

  it('rods stay inside the pitch and respect max speed', () => {
    const s = createState();
    const k = rodIndex(1, 2);
    const t = [...none];
    t[k] = -9999;
    moveRods(s, 16, t);
    expect(s.rods[k].y).toBeGreaterThanOrEqual(cy - P.rodMaxSpeed * 0.016 - 1e-6);
    for (let i = 0; i < 100; i++) moveRods(s, 16, t);
    expect(figureY(s.rods[k], 0)).toBeGreaterThanOrEqual(P.pitch.y + P.figureRadius - 1e-6);
    expect(clampRod(s.rods[k], 9999)).toBeLessThanOrEqual(P.pitch.y + P.pitch.h);
    expect(figureY(s.rods[k], 2)).toBeLessThanOrEqual(P.pitch.y + P.pitch.h);
  });

  it('never tunnels out of the pitch and never stalls', () => {
    const s = createState();
    Object.assign(s.ball, { x: cx, y: cy, vx: 1200, vy: -900 });
    for (let i = 0; i < 1500; i++) {
      const r = step(s, 33, none);
      if (r.goal !== null) break;
      expect(s.ball.y).toBeGreaterThanOrEqual(P.pitch.y);
      expect(s.ball.y).toBeLessThanOrEqual(P.pitch.y + P.pitch.h);
      expect(Math.hypot(s.ball.vx, s.ball.vy)).toBeLessThanOrEqual(P.ballMaxSpeed + 1e-6);
      expect(Math.hypot(s.ball.vx, s.ball.vy)).toBeGreaterThan(P.ballMinSpeed - 1);
    }
  });

  it('a ball pinned between a figure and a wall is freed', () => {
    const s = createState();
    const rod = s.rods[rodIndex(0, 0)];
    rod.y = P.pitch.y + P.figureRadius;
    Object.assign(s.ball, { x: rod.x + 5, y: P.pitch.y + P.ballRadius, vx: 0, vy: 0 });
    step(s, 16, none);
    expect(Math.hypot(s.ball.x - rod.x, s.ball.y - figureY(rod, 0))).toBeGreaterThanOrEqual(P.ballRadius + P.figureRadius - 0.5);
  });

  it('serve sends the ball toward the player who conceded', () => {
    const s = createState();
    serve(s, 0, 500);
    expect(s.ball.vx).toBeLessThan(0);
    serve(s, 1, 500);
    expect(s.ball.vx).toBeGreaterThan(0);
  });

  it('friction slows a fast ball but not below the minimum', () => {
    const s = createState();
    clearAway(s);
    Object.assign(s.ball, { x: cx, y: cy - 200, vx: 500, vy: 0 });
    run(s, 400);
    expect(Math.hypot(s.ball.vx, s.ball.vy)).toBeLessThan(500);
    run(s, 5000);
    expect(Math.hypot(s.ball.vx, s.ball.vy)).toBeGreaterThanOrEqual(P.ballMinSpeed - 1);
  });
});

describe('table football difficulty', () => {
  it('match progress follows the leader or the total, from 0 to 1', () => {
    expect(matchProgress([0, 0], 12)).toBe(0);
    expect(matchProgress([11, 2], 12)).toBe(1);
    expect(matchProgress([3, 3], 12)).toBeCloseTo(6 / 22);
  });

  it('goals narrow, serve and top speed rise with progress; turbo kicks harder', () => {
    expect(paramsFor(0).goalWidth).toBe(TABLEFOOTBALL.goalWidth);
    expect(paramsFor(1).goalWidth).toBe(TABLEFOOTBALL.goalWidthEnd);
    expect(paramsFor(1).ballMaxSpeed).toBeGreaterThan(paramsFor(0).ballMaxSpeed);
    expect(serveSpeedFor(1)).toBeGreaterThan(serveSpeedFor(0));
    expect(paramsFor(0.5, 'turbo').kickSpeed).toBeGreaterThan(paramsFor(0.5).kickSpeed);
    expect(serveSpeedFor(0.5, 'turbo')).toBeGreaterThan(serveSpeedFor(0.5));
    expect(paramsFor(0.5, 'sweep').kickSpeed).toBe(paramsFor(0.5).kickSpeed);
  });

  it('every touch of a rally lifts the minimum kick, up to the cap, and a serve starts over', () => {
    const kickAfter = (touches: number) => {
      const s = createState();
      s.touches = touches;
      const rod = s.rods[rodIndex(0, 2)];
      s.rods.slice(3).forEach((r) => (r.x = -5000));
      Object.assign(s.ball, { x: rod.x + P.ballRadius + P.figureRadius + 1, y: figureY(rod, 1), vx: -50, vy: 0 });
      run(s, 48);
      return Math.hypot(s.ball.vx, s.ball.vy);
    };
    expect(kickAfter(8)).toBeGreaterThan(kickAfter(0) + 200);
    expect(kickAfter(999)).toBeLessThanOrEqual(P.kickSpeedMax + 40);
    const s = createState();
    s.touches = 7;
    serve(s, 0, 400);
    expect(s.touches).toBe(0);
  });

  it('plain points early, then turbo, moving goals and finally both', () => {
    expect(pickMode(0.05, () => 0)).toBe('classic');
    expect(pickMode(0.5, () => 0.99)).toBe('classic');
    expect(pickMode(0.2, () => 0)).toBe('turbo');
    const seq = (...v: number[]) => {
      let i = 0;
      return () => v[Math.min(i++, v.length - 1)];
    };
    expect(pickMode(0.2, seq(0, 0.6))).toBe('turbo'); // too early for moving goals
    expect(pickMode(0.5, seq(0, 0.5))).toBe('sweep');
    expect(pickMode(0.9, seq(0, 0.2))).toBe('combo');
  });

  it('moving goals glide up and down inside the pitch, together or opposed', () => {
    const s = createState();
    setupPoint(s, 'classic', 1, () => 0.9);
    expect(s.sweepAmp).toBe(0);
    s.time = 1.2;
    updateGoals(s);
    expect(s.goalY).toEqual([cy, cy]);
    setupPoint(s, 'sweep', 1, () => 0.9); // 0.9 -> opposed? (>= 0.5 means together)
    expect(s.sweepAmp).toBe(TABLEFOOTBALL.sweepAmpEnd);
    const half = paramsFor(1).goalWidth / 2;
    for (let t = 0; t < 6; t += 0.1) {
      s.time = t;
      updateGoals(s);
      for (const y of s.goalY) {
        expect(y - half).toBeGreaterThanOrEqual(P.pitch.y);
        expect(y + half).toBeLessThanOrEqual(P.pitch.y + P.pitch.h);
      }
    }
    setupPoint(s, 'sweep', 1, () => 0.1); // opposed
    s.time = 1.25;
    updateGoals(s);
    expect(s.goalY[0] - cy).toBeCloseTo(-(s.goalY[1] - cy));
    expect(s.goalY[0]).not.toBeCloseTo(cy);
  });

  it('a moved goal mouth scores where it is, and the wall is solid where it was', () => {
    const pn = paramsFor(0);
    const shot = (y: number) => {
      const s = createState();
      clearAway(s);
      s.sweepAmp = 150;
      s.time = TABLEFOOTBALL.sweepPeriodSec / 4; // player 0's mouth is at its lowest (cy + 150), player 1's too
      Object.assign(s.ball, { x: P.pitch.x + 60, y, vx: -900, vy: 0 });
      return run2(s, pn);
    };
    expect(shot(cy + 140)).toBe(1); // ball in line with the moved mouth
    expect(shot(cy - 60)).toBeNull(); // the old mouth position is now wall: the ball bounces off
    expect(shot(cy - 200)).toBeNull();
  });

  it('a narrower goal blocks a shot that the full goal lets in', () => {
    const narrow = paramsFor(1);
    const s = createState();
    clearAway(s);
    Object.assign(s.ball, { x: P.pitch.x + 60, y: cy + narrow.goalWidth / 2 + 25, vx: -900, vy: 0 });
    expect(run2(s, narrow)).toBeNull();
    const t = createState();
    clearAway(t);
    Object.assign(t.ball, { x: P.pitch.x + 60, y: cy + narrow.goalWidth / 2 + 25, vx: -900, vy: 0 });
    expect(run2(t, paramsFor(0))).toBe(1);
  });
});

function run2(s: ReturnType<typeof createState>, pn: typeof P): number | null {
  for (let i = 0; i < 60; i++) {
    const r = step(s, 16, none, pn);
    if (r.goal !== null) return r.goal;
  }
  return null;
}

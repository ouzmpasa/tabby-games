import { describe, expect, it } from 'vitest';
import { AIRHOCKEY } from '../../src/games/airhockey/config';
import {
  DEFAULT_PARAMS as P, clampMallet, createState, keepOffBumpers, matchProgress, moveMallets, paramsFor, pickBumpers, serve, serveSpeedFor, step,
  updateBumpers,
} from '../../src/games/airhockey/logic';

const cx = P.rink.x + P.rink.w / 2;
const cy = P.rink.y + P.rink.h / 2;
const none = [null, null] as const;

function run(s: ReturnType<typeof createState>, ms: number, targets: readonly ({ x: number; y: number } | null)[] = none) {
  for (let t = 0; t < ms; t += 16) {
    const r = step(s, 16, targets);
    if (r.goal !== null) return r;
  }
  return { goal: null };
}

describe('air hockey physics', () => {
  it('bounces off the long walls with restitution', () => {
    const s = createState();
    s.puck.x = cx;
    s.puck.y = P.rink.y + P.puckRadius + 5;
    s.puck.vy = -600;
    step(s, 16, none);
    expect(s.puck.vy).toBeGreaterThan(0);
    expect(s.puck.vy).toBeLessThan(600 * P.wallRestitution + 1);
    expect(s.puck.y).toBeGreaterThanOrEqual(P.rink.y + P.puckRadius - 0.01);
  });

  it('bounces off the end wall outside the goal mouth', () => {
    const s = createState();
    s.puck.x = P.rink.x + P.puckRadius + 5;
    s.puck.y = cy + P.goalWidth / 2 + 120;
    s.puck.vx = -800;
    expect(step(s, 16, none).goal).toBeNull();
    expect(s.puck.vx).toBeGreaterThan(0);
  });

  it('left goal scores for player 1, right goal for player 0', () => {
    const a = createState();
    a.puck.x = P.rink.x + 60;
    a.puck.y = cy;
    a.puck.vx = -900;
    expect(run(a, 1000).goal).toBe(1);
    const b = createState();
    b.puck.x = P.rink.x + P.rink.w - 60;
    b.puck.y = cy;
    b.puck.vx = 900;
    expect(run(b, 1000).goal).toBe(0);
  });

  it('does not tunnel through walls or goals-posts at max speed', () => {
    const s = createState();
    s.puck.x = cx;
    s.puck.y = P.rink.y + 100;
    s.puck.vx = 1200;
    s.puck.vy = -1200;
    for (let i = 0; i < 600; i++) {
      s.puck.vx = Math.sign(s.puck.vx || 1) * Math.max(Math.abs(s.puck.vx), 1000);
      const r = step(s, 33, none);
      if (r.goal !== null) break;
      expect(s.puck.y).toBeGreaterThanOrEqual(P.rink.y);
      expect(s.puck.y).toBeLessThanOrEqual(P.rink.y + P.rink.h);
      expect(Math.hypot(s.puck.vx, s.puck.vy)).toBeLessThanOrEqual(P.puckMaxSpeed + 1e-6);
    }
  });

  it('a fast puck cannot pass through a still mallet', () => {
    const s = createState();
    s.mallets[1].x = cx + 400;
    s.mallets[1].y = cy;
    s.puck.x = cx + 100;
    s.puck.y = cy;
    s.puck.vx = P.puckMaxSpeed;
    run(s, 300, [null, { x: cx + 400, y: cy }]);
    expect(s.puck.x).toBeLessThan(s.mallets[1].x);
  });

  it('mallets cannot cross the centre line or leave the rink', () => {
    const s = createState();
    const t = [{ x: cx + 500, y: -500 }, { x: cx - 500, y: 5000 }];
    run(s, 1000, t);
    expect(s.mallets[0].x).toBeLessThanOrEqual(cx - P.malletRadius + 1e-6);
    expect(s.mallets[1].x).toBeGreaterThanOrEqual(cx + P.malletRadius - 1e-6);
    expect(s.mallets[0].y).toBeGreaterThanOrEqual(P.rink.y + P.malletRadius - 1e-6);
    expect(s.mallets[1].y).toBeLessThanOrEqual(P.rink.y + P.rink.h - P.malletRadius + 1e-6);
    expect(clampMallet(0, 9999, 9999).x).toBeLessThanOrEqual(cx);
  });

  it('a moving mallet hits the puck away and transfers its velocity', () => {
    const s = createState();
    s.mallets[0].x = cx - 300;
    s.mallets[0].y = cy;
    s.puck.x = cx - 100;
    s.puck.y = cy;
    run(s, 100, [{ x: cx - 150, y: cy }, null]);
    expect(s.puck.vx).toBeGreaterThan(300);
  });

  it('pushes a puck that sits inside a mallet out of it', () => {
    const s = createState();
    s.puck.x = s.mallets[0].x + 5;
    s.puck.y = s.mallets[0].y;
    step(s, 16, none);
    expect(Math.hypot(s.puck.x - s.mallets[0].x, s.puck.y - s.mallets[0].y)).toBeGreaterThanOrEqual(P.puckRadius + P.malletRadius - 0.01);
    const t = createState();
    t.puck.x = t.mallets[0].x;
    t.puck.y = t.mallets[0].y; // exact overlap
    step(t, 16, none);
    expect(Math.hypot(t.puck.x - t.mallets[0].x, t.puck.y - t.mallets[0].y)).toBeGreaterThanOrEqual(P.puckRadius + P.malletRadius - 0.01);
  });

  it('a mallet pinning the puck against a wall does not trap it', () => {
    const s = createState();
    s.puck.x = cx - 400;
    s.puck.y = P.rink.y + P.puckRadius;
    s.mallets[0].x = cx - 400;
    s.mallets[0].y = P.rink.y + P.malletRadius + 5;
    step(s, 16, [{ x: cx - 400, y: P.rink.y + P.malletRadius }, null]);
    expect(Math.hypot(s.puck.x - s.mallets[0].x, s.puck.y - s.mallets[0].y)).toBeGreaterThanOrEqual(P.puckRadius + P.malletRadius - 0.5);
  });

  it('serve sends the puck toward the player who conceded', () => {
    const s = createState();
    serve(s, 0, 500);
    expect(s.puck.vx).toBeLessThan(0);
    serve(s, 1, 500);
    expect(s.puck.vx).toBeGreaterThan(0);
  });

  it('friction slows the puck', () => {
    const s = createState();
    s.puck.vx = 500;
    s.puck.y = cy - 200;
    run(s, 400);
    expect(Math.hypot(s.puck.vx, s.puck.vy)).toBeLessThan(500);
  });

  it('moveMallets moves without touching the puck', () => {
    const s = createState();
    const before = { ...s.puck };
    moveMallets(s, 100, [{ x: s.mallets[0].x + 50, y: cy }, null]);
    expect(s.mallets[0].x).toBeGreaterThan(cx - P.rink.w / 4);
    expect(s.puck).toEqual(before);
  });
});

describe('air hockey difficulty', () => {
  const hitWith = (rally: number, puckVx: number) => {
    const s = createState();
    s.rally = rally;
    s.mallets[0].x = cx - 300;
    s.mallets[0].y = cy;
    s.puck.x = cx - 300 + P.malletRadius + P.puckRadius - 1;
    s.puck.y = cy;
    s.puck.vx = puckVx;
    step(s, 16, none);
    return s;
  };

  it('a hit leaves the mallet at least at the rally speed, which grows with every hit and is capped', () => {
    const slow = hitWith(0, -120);
    expect(slow.rally).toBe(1);
    expect(Math.hypot(slow.puck.vx, slow.puck.vy)).toBeGreaterThanOrEqual(P.rallyBaseSpeed + P.rallySpeedUp - 40);
    const later = hitWith(6, -120);
    expect(Math.hypot(later.puck.vx, later.puck.vy)).toBeGreaterThan(Math.hypot(slow.puck.vx, slow.puck.vy) + 200);
    const capped = hitWith(500, -120);
    expect(Math.hypot(capped.puck.vx, capped.puck.vy)).toBeLessThanOrEqual(P.rallyMaxSpeed + 60);
    expect(slow.puck.vx).toBeGreaterThan(0); // still sent away from the mallet
  });

  it('serving starts a new rally', () => {
    const s = createState();
    s.rally = 9;
    serve(s, 0, 500);
    expect(s.rally).toBe(0);
  });

  it('match progress follows the leader or the total, from 0 to 1', () => {
    expect(matchProgress([0, 0], 12)).toBe(0);
    expect(matchProgress([11, 0], 12)).toBe(1);
    expect(matchProgress([3, 3], 12)).toBeCloseTo(6 / 22);
    expect(matchProgress([99, 0], 12)).toBe(1);
  });

  it('goals get narrower and the serve faster as the match goes on', () => {
    expect(paramsFor(0).goalWidth).toBe(AIRHOCKEY.goalWidth);
    expect(paramsFor(1).goalWidth).toBe(AIRHOCKEY.goalWidthEnd);
    expect(paramsFor(0.5).goalWidth).toBeLessThan(AIRHOCKEY.goalWidth);
    expect(paramsFor(0.5).goalWidth).toBeGreaterThan(AIRHOCKEY.goalWidthEnd);
    expect(serveSpeedFor(1)).toBeGreaterThan(serveSpeedFor(0));
    // a narrowed goal really blocks a shot that the full goal lets in
    const s = createState();
    const pn = paramsFor(1);
    s.puck.x = P.rink.x + P.puckRadius + 5;
    s.puck.y = cy + pn.goalWidth / 2 + 40;
    s.puck.vx = -900;
    expect(step(s, 16, none, pn).goal).toBeNull();
    expect(s.puck.vx).toBeGreaterThan(0);
  });

  it('early tables are plain, later ones get posts, sweeping posts and twins', () => {
    expect(pickBumpers(0.05, () => 0)).toEqual([]);
    expect(pickBumpers(0.5, () => 0.99)).toEqual([]); // the chance roll failed
    const rnd = (v: number) => () => v;
    const early = pickBumpers(0.2, rnd(0.0));
    expect(early).toHaveLength(1);
    expect(early[0].amp).toBe(0);
    const mid = pickBumpers(0.5, rnd(0.0));
    expect(mid).toHaveLength(1);
    expect(mid[0].amp).toBeGreaterThan(0);
    const late = pickBumpers(0.9, rnd(0.0));
    expect(late).toHaveLength(2);
    late.forEach((b) => expect(b.x).toBeCloseTo(cx));
  });

  it('a sweeping bumper moves along the middle line', () => {
    const s = createState();
    s.bumpers = pickBumpers(0.9, () => 0);
    const y0 = s.bumpers[0].y;
    updateBumpers(s, 1, 1 / 60);
    expect(s.bumpers[0].y).not.toBe(y0);
    expect(s.bumpers[0].vy).not.toBe(0);
    expect(s.bumpers[0].x).toBeCloseTo(cx);
  });

  it('the puck bounces off a bumper and is never left inside it', () => {
    const s = createState();
    s.bumpers = pickBumpers(0.2, () => 0);
    const b = s.bumpers[0];
    s.puck.x = b.x - b.r - P.puckRadius - 6;
    s.puck.y = b.y;
    s.puck.vx = 700;
    s.puck.vy = 0;
    for (let i = 0; i < 6; i++) step(s, 16, none);
    expect(s.puck.vx).toBeLessThan(0);
    expect(Math.hypot(s.puck.x - b.x, s.puck.y - b.y)).toBeGreaterThanOrEqual(b.r + P.puckRadius - 0.5);
    // a puck that sits exactly at rest next to a bumper is kicked away from it
    s.puck.x = b.x + b.r + P.puckRadius - 5;
    s.puck.y = b.y;
    s.puck.vx = -50;
    step(s, 16, none);
    expect(s.puck.vx).toBeGreaterThan(0);
  });

  it('mallets cannot be pushed into a bumper', () => {
    const s = createState();
    s.bumpers = pickBumpers(0.2, () => 0);
    s.mallets[0].x = cx - P.malletRadius;
    s.mallets[0].y = s.bumpers[0].y;
    keepOffBumpers(s);
    expect(Math.hypot(s.mallets[0].x - s.bumpers[0].x, s.mallets[0].y - s.bumpers[0].y)).toBeGreaterThanOrEqual(P.malletRadius + s.bumpers[0].r - 1e-6);
    moveMallets(s, 16, [{ x: cx - P.malletRadius, y: s.bumpers[0].y }, null]);
    expect(Math.hypot(s.mallets[0].x - s.bumpers[0].x, s.mallets[0].y - s.bumpers[0].y)).toBeGreaterThanOrEqual(P.malletRadius + s.bumpers[0].r - 1e-6);
  });

  it('with a bumper the puck is served beside the middle on the receiving side', () => {
    const s = createState();
    s.bumpers = pickBumpers(0.2, () => 0);
    serve(s, null, 0, P, 1);
    expect(s.puck.x).toBeGreaterThan(cx + s.bumpers[0].r + P.puckRadius);
    serve(s, null, 0, P, 0);
    expect(s.puck.x).toBeLessThan(cx - s.bumpers[0].r - P.puckRadius);
  });

  it('a long chaotic rally never produces NaN or escapes the rink', () => {
    const s = createState();
    s.bumpers = pickBumpers(0.95, () => 0);
    serve(s, 1, 900, P, 1);
    const pn = paramsFor(1);
    for (let i = 0; i < 4000; i++) {
      const r = step(s, 16, [{ x: cx - 200 + 150 * Math.sin(i / 20), y: cy + 300 * Math.cos(i / 13) }, { x: cx + 200, y: cy + 200 * Math.sin(i / 17) }], pn);
      if (r.goal !== null) serve(s, r.goal === 0 ? 1 : 0, 900, pn, r.goal === 0 ? 1 : 0);
      expect(Number.isFinite(s.puck.x + s.puck.y + s.puck.vx + s.puck.vy)).toBe(true);
      expect(s.puck.y).toBeGreaterThanOrEqual(P.rink.y);
      expect(s.puck.y).toBeLessThanOrEqual(P.rink.y + P.rink.h);
    }
  });
});

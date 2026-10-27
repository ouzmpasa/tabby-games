import { describe, expect, it } from 'vitest';
import { CENTER, SUMO } from '../../src/games/sumo/config';
import {
  DEFAULT_PARAMS as P, bumperPositions, collide, collideBumper, createState, desiredVelocity, matchProgress, onIce, paramsFor, pickHazard, platformRadius,
  reset, step, updateCharge, type Blob, type Targets,
} from '../../src/games/sumo/logic';

const none: Targets = [null, null];
const run = (s: ReturnType<typeof createState>, ms: number, t: Targets) => {
  let fell: 0 | 1 | null = null;
  for (let i = 0; i < ms / 16 && fell === null; i++) fell = step(s, 16, t, P).fell;
  return fell;
};

describe('sumo logic', () => {
  it('starts with blobs on their own sides, on the platform', () => {
    const s = createState();
    expect(s.blobs[0].x).toBeLessThan(CENTER.x);
    expect(s.blobs[1].x).toBeGreaterThan(CENTER.x);
    expect(s.loser).toBeNull();
  });

  it('platform shrinks after the delay and never below the cap', () => {
    expect(platformRadius(0)).toBe(P.platformStart);
    expect(platformRadius(P.shrinkDelaySec)).toBe(P.platformStart);
    expect(platformRadius(P.shrinkDelaySec + 10)).toBeLessThan(P.platformStart);
    expect(platformRadius(9999)).toBe(P.platformMin);
  });

  it('desired speed is capped, so a far flick cannot teleport the blob', () => {
    const s = createState();
    const v = desiredVelocity(s.blobs[0], { x: 99999, y: s.blobs[0].y }, P);
    expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(P.blobMaxSpeed);
    const t: Targets = [{ x: 1800, y: 100 }, null];
    run(s, 100, t);
    expect(Math.hypot(s.blobs[0].vx, s.blobs[0].vy)).toBeLessThanOrEqual(P.blobMaxSpeed + 1);
    expect(Math.hypot(s.blobs[0].x - (CENTER.x - P.startOffset), s.blobs[0].y - CENTER.y)).toBeLessThan(P.blobMaxSpeed * 0.11);
  });

  it('accelerates gradually (has weight) and brakes without a finger', () => {
    const s = createState();
    step(s, 16, [{ x: 0, y: CENTER.y }, null], P);
    expect(Math.abs(s.blobs[0].vx)).toBeLessThan(P.blobMaxSpeed / 4);
    run(s, 300, [{ x: CENTER.x - 100, y: CENTER.y }, null]);
    run(s, 800, none);
    expect(Math.hypot(s.blobs[0].vx, s.blobs[0].vy)).toBeLessThan(1);
  });

  it('collision separates blobs and transfers momentum', () => {
    const a = { x: 0, y: 0, vx: 500, vy: 0, falling: false, fallT: 0, charge: 0, dashT: 0, damage: 0 };
    const b = { x: P.blobRadius * 1.8, y: 0, vx: 0, vy: 0, falling: false, fallT: 0, charge: 0, dashT: 0, damage: 0 };
    expect(collide(a, b, P)).toBe(true);
    expect(b.x - a.x).toBeGreaterThanOrEqual(P.blobRadius * 2 - 1e-6);
    expect(b.vx).toBeGreaterThan(400);
    expect(a.vx).toBeLessThan(100);
  });

  it('a harder hit shoves harder than a gentle one (dash bonus)', () => {
    const hit = (v: number) => {
      const a = { x: 0, y: 0, vx: v, vy: 0, falling: false, fallT: 0, charge: 0, dashT: 0, damage: 0 };
      const b = { x: P.blobRadius * 2 - 1, y: 0, vx: 0, vy: 0, falling: false, fallT: 0, charge: 0, dashT: 0, damage: 0 };
      collide(a, b, P);
      return b.vx / v;
    };
    expect(hit(P.blobMaxSpeed)).toBeGreaterThan(hit(100));
  });

  it('a blob steered off the edge loses, and the other does not', () => {
    const s = createState();
    expect(run(s, 5000, [{ x: 0, y: CENTER.y }, null])).toBe(0);
    expect(s.loser).toBe(0);
    expect(s.blobs[0].falling).toBe(true);
    expect(s.blobs[1].falling).toBe(false);
  });

  it('pushing the other blob off wins', () => {
    const s = createState();
    // player 0 charges right through the opponent, who stays put
    const fell = run(s, 8000, [{ x: 1900, y: CENTER.y }, null]);
    expect(fell).toBe(1);
  });

  it('a round always ends: idle blobs get squeezed off by the shrinking edge only if the cap is small enough', () => {
    const s = createState();
    run(s, 120_000, none);
    expect(s.platform).toBe(P.platformMin);
    expect(s.platform).toBeLessThan(P.platformStart);
  });
});

describe('sumo difficulty', () => {
  const seq = (...v: number[]) => {
    let i = 0;
    return () => v[Math.min(i++, v.length - 1)];
  };

  it('match progress follows the leader or the total, from 0 to 1', () => {
    expect(matchProgress([0, 0], 8)).toBe(0);
    expect(matchProgress([7, 1], 8)).toBe(1);
    expect(matchProgress([3, 3], 8)).toBeCloseTo(6 / 14);
  });

  it('later rounds start on a smaller platform that crumbles sooner and faster', () => {
    const a = paramsFor(0);
    const b = paramsFor(1);
    expect(a.platformStart).toBe(SUMO.platformStart);
    expect(b.platformStart).toBe(SUMO.platformStartEnd);
    expect(b.shrinkDelaySec).toBeLessThan(a.shrinkDelaySec);
    expect(b.shrinkPerSec).toBeGreaterThan(a.shrinkPerSec);
    expect(platformRadius(20, b)).toBeLessThan(platformRadius(20, a));
    // blobs always start on the platform, with room between them
    const s = createState(b);
    expect(Math.abs(s.blobs[0].x - CENTER.x) + P.blobRadius).toBeLessThan(b.platformStart);
    expect(s.blobs[1].x - s.blobs[0].x).toBeGreaterThan(P.blobRadius * 2);
  });

  it('plain rounds first, then ice, bumpers and finally both', () => {
    expect(pickHazard(0.05, () => 0)).toBe('plain');
    expect(pickHazard(0.5, () => 0.99)).toBe('plain');
    expect(pickHazard(0.15, seq(0, 0.9))).toBe('ice');
    expect(pickHazard(0.15, seq(0, 0.1))).toBe('ice'); // bumpers are not here yet
    expect(pickHazard(0.4, seq(0, 0.5))).toBe('bumpers');
    expect(pickHazard(0.9, seq(0, 0.1))).toBe('both');
  });

  it('ice makes a blob slide on instead of stopping', () => {
    const slide = (hazard: 'plain' | 'ice') => {
      const s = createState(P, hazard);
      s.blobs[0].x = CENTER.x;
      s.blobs[0].y = CENTER.y;
      s.blobs[0].vx = 600;
      s.blobs[1].y = CENTER.y + 300; // out of the way
      run(s, 300, none);
      return s.blobs[0].x - CENTER.x;
    };
    expect(slide('ice')).toBeGreaterThan(slide('plain') + 60);
    expect(onIce({ x: CENTER.x + P.iceRadius - 5, y: CENTER.y })).toBe(true);
    expect(onIce({ x: CENTER.x + P.iceRadius + 5, y: CENTER.y })).toBe(false);
  });

  it('a bumper kicks the blob away and never leaves it inside the post', () => {
    const post = bumperPositions(P)[0];
    const b: Blob = { x: post.x - P.blobRadius - P.bumperRadius + 6, y: post.y, vx: 0, vy: 0, falling: false, fallT: 0, charge: 0, dashT: 0, damage: 0 };
    expect(collideBumper(b, post)).toBe(true);
    expect(Math.hypot(b.x - post.x, b.y - post.y)).toBeGreaterThanOrEqual(P.blobRadius + P.bumperRadius - 1e-6);
    expect(Math.hypot(b.vx, b.vy)).toBeGreaterThanOrEqual(P.bumperKick - 1);
    expect(b.vx).toBeLessThan(0);
    expect(collideBumper({ ...b, x: 0, y: 0 }, post)).toBe(false);
  });

  it('in a bumper round a blob driven into a post bounces off it', () => {
    const s = createState(P, 'bumpers');
    const post = bumperPositions(P)[0];
    s.blobs[0].x = post.x - 220;
    s.blobs[0].y = post.y;
    const res = { post: false };
    for (let i = 0; i < 60; i++) if (step(s, 16, [{ x: post.x + 100, y: post.y }, null], P).post) res.post = true;
    expect(res.post).toBe(true);
    expect(Math.hypot(s.blobs[0].x - post.x, s.blobs[0].y - post.y)).toBeGreaterThanOrEqual(P.blobRadius + P.bumperRadius - 1);
  });

  it('holding the finger still on the blob charges a dash; swiping away fires it, and a dash is faster', () => {
    const b: Blob = { x: 500, y: 500, vx: 0, vy: 0, falling: false, fallT: 0, charge: 0, dashT: 0, damage: 0 };
    const finger = { x: 520, y: 500 };
    for (let i = 0; i < 40; i++) expect(updateCharge(b, finger, 0.016, P)).toBe(false);
    expect(b.charge).toBeGreaterThan(0.6);
    for (let i = 0; i < 40; i++) updateCharge(b, finger, 0.016, P);
    expect(b.charge).toBe(1);
    expect(updateCharge(b, { x: 500 + P.dashTriggerDist + 20, y: 500 }, 0.016, P)).toBe(true);
    expect(b.dashT).toBeGreaterThan(0);
    expect(b.charge).toBe(0);
    // a moving finger near the blob never charges, and charge fades when the finger leaves early
    const c: Blob = { ...b, charge: 0.5, dashT: 0 };
    updateCharge(c, { x: 900, y: 500 }, 0.1, P);
    expect(c.charge).toBeLessThan(0.5);
    expect(updateCharge(c, { x: 900, y: 500 }, 0.1, P)).toBe(false);

    const dashDistance = (charged: boolean) => {
      const s = createState();
      s.blobs[0].x = 400;
      s.blobs[0].y = CENTER.y;
      s.blobs[0].charge = charged ? 1 : 0;
      s.blobs[0].x = CENTER.x - 100;
      s.blobs[0].y = CENTER.y;
      const f = { x: CENTER.x - 100 + 600, y: CENTER.y };
      let maxSpeed = 0;
      for (let i = 0; i < 12; i++) {
        step(s, 16, [f, null], P);
        maxSpeed = Math.max(maxSpeed, Math.hypot(s.blobs[0].vx, s.blobs[0].vy));
      }
      return maxSpeed;
    };
    expect(dashDistance(true)).toBeGreaterThan(dashDistance(false) + 150);
  });

  it('bumps make blobs wobbly, and a wobbly blob is shoved further; a new round starts sturdy again', () => {
    const mk = (damage: number): [Blob, Blob] => [
      { x: 0, y: 0, vx: 600, vy: 0, falling: false, fallT: 0, charge: 0, dashT: 0, damage: 0 },
      { x: P.blobRadius * 2 - 2, y: 0, vx: 0, vy: 0, falling: false, fallT: 0, charge: 0, dashT: 0, damage },
    ];
    const [a1, b1] = mk(0);
    collide(a1, b1, P);
    expect(a1.damage).toBeGreaterThan(0);
    expect(b1.damage).toBeGreaterThan(0);
    const [a2, b2] = mk(1);
    collide(a2, b2, P);
    expect(b2.vx).toBeGreaterThan(b1.vx + 40);
    // momentum is conserved (mass = 1 / (1 + damageLight * damage))
    expect(a2.vx + b2.vx / (1 + P.damageLight)).toBeCloseTo(600, 3);
    // a gentle touch hurts less than a hard hit
    const soft = mk(0);
    soft[0].vx = 100;
    collide(soft[0], soft[1], P);
    expect(soft[0].damage).toBeLessThan(a1.damage);
    // damage never exceeds 1 and a reset clears it
    const s = createState();
    s.blobs[0].damage = 0.9;
    for (let i = 0; i < 20; i++) {
      s.blobs[0].x = CENTER.x - P.blobRadius + 5;
      s.blobs[1].x = CENTER.x + P.blobRadius - 5;
      s.blobs[0].vx = 800;
      s.blobs[1].vx = -800;
      collide(s.blobs[0], s.blobs[1], P);
    }
    expect(s.blobs[0].damage).toBeLessThanOrEqual(1);
    reset(s);
    expect(s.blobs[0].damage).toBe(0);
  });

  it('a head-on bump does not throw a sturdy blob across the platform (rounds last several exchanges)', () => {
    const s = createState();
    const t: Targets = [{ x: CENTER.x + 400, y: CENTER.y }, { x: CENTER.x - 400, y: CENTER.y }];
    let far = 0;
    for (let i = 0; i < 60; i++) {
      step(s, 16, t, P);
      far = Math.max(far, Math.abs(s.blobs[0].x - CENTER.x));
    }
    expect(s.loser).toBeNull();
    expect(far).toBeLessThan(P.platformStart - 60);
  });

  it('when both blobs are over the edge together the farther one loses', () => {
    const s = createState();
    reset(s);
    s.blobs[0].x = CENTER.x - P.platformStart - 10;
    s.blobs[0].y = CENTER.y;
    s.blobs[1].x = CENTER.x + P.platformStart + 60;
    s.blobs[1].y = CENTER.y;
    expect(step(s, 16, none, P).fell).toBe(1);
  });
});

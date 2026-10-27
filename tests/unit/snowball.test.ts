import { describe, expect, it } from 'vitest';
import { SNOWBALL } from '../../src/games/snowball/config';
import { H, W } from '../../src/core/layout';
import {
  DEFAULT_PARAMS as P,
  ballGround,
  ballLift,
  canDuck,
  catchUp,
  coverStop,
  cueDots,
  isTelling,
  levelFor,
  liftAt,
  mercy,
  paramsForLevel,
  placeCover,
  timeLeft,
  canThrow,
  computeThrow,
  createKid,
  dotsAlong,
  isDucking,
  isTap,
  kidPos,
  kidYAfter,
  makeBall,
  resolveLanding,
  startDuck,
  stepBall,
  stepKid,
  walk,
  type Mound,
} from '../../src/games/snowball/logic';

describe('kid patrol', () => {
  it('starts at opposite lane ends on their own sides', () => {
    expect(kidPos(0, createKid(0)).x).toBeLessThan(W / 2);
    expect(kidPos(1, createKid(1)).x).toBeGreaterThan(W / 2);
    expect(createKid(0).y).toBe(P.laneMinY);
    expect(createKid(1).y).toBe(P.laneMaxY);
  });
  it('walks at constant speed and turns around at the lane ends', () => {
    const k = createKid(0);
    stepKid(k, 1000);
    expect(k.y).toBeCloseTo(P.laneMinY + P.kidSpeed);
    const w = walk(P.laneMaxY - 50, 1, 150);
    expect(w.dir).toBe(-1);
    expect(w.y).toBeCloseTo(P.laneMaxY - 100);
  });
  it('never leaves the lane', () => {
    const k = createKid(1);
    for (let i = 0; i < 5000; i++) {
      stepKid(k, 16);
      expect(k.y).toBeGreaterThanOrEqual(P.laneMinY - 1e-6);
      expect(k.y).toBeLessThanOrEqual(P.laneMaxY + 1e-6);
    }
  });
  it('predicts its own future position', () => {
    const k = createKid(0);
    const predicted = kidYAfter(k, 3500);
    for (let i = 0; i < 350; i++) stepKid(k, 10);
    expect(k.y).toBeCloseTo(predicted, 3);
  });
});

describe('duck and reload', () => {
  it('ducks for duckMs, stands still, and tires the kid out', () => {
    const k = createKid(0);
    expect(startDuck(k)).toBe(true);
    expect(isDucking(k)).toBe(true);
    expect(canThrow(k)).toBe(false);
    const y = k.y;
    stepKid(k, 400);
    expect(k.y).toBe(y);
    stepKid(k, 500);
    expect(isDucking(k)).toBe(false);
    expect(k.stamina).toBeLessThan(1);
  });
  it('stamina allows a limited number of quick ducks and refills over time', () => {
    const k = createKid(0);
    let n = 0;
    while (startDuck(k)) {
      n++;
      k.duckLeft = 0; // skip the crouch itself
    }
    expect(n).toBe(Math.floor(1 / P.duckCost + 1e-9));
    expect(canDuck(k)).toBe(false);
    stepKid(k, (P.duckCost / P.staminaRegen) * 1000 + 50);
    expect(canDuck(k)).toBe(true);
    stepKid(k, 60000);
    expect(k.stamina).toBe(1);
  });
  it('reload blocks throwing until it runs out', () => {
    const k = createKid(0);
    k.reload = P.reloadMs;
    expect(canThrow(k)).toBe(false);
    stepKid(k, P.reloadMs);
    expect(canThrow(k)).toBe(true);
  });
  it('tells a quick still press (tap) from an aim gesture', () => {
    expect(isTap(120, 5)).toBe(true);
    expect(isTap(600, 5)).toBe(false);
    expect(isTap(120, 80)).toBe(false);
  });
});

describe('throw', () => {
  const o = { x: 290, y: 500 };
  it('cancels short pulls', () => {
    expect(computeThrow(o, { x: 10, y: 5 })).toBeNull();
  });
  it('lands in the pull direction, farther for bigger pulls, clamped to the field', () => {
    const a = computeThrow(o, { x: 100, y: 0 })!;
    const b = computeThrow(o, { x: 300, y: 0 })!;
    expect(a.target.y).toBeCloseTo(500);
    expect(a.target.x).toBeCloseTo(290 + 100 * P.pullScale);
    expect(b.range).toBeGreaterThan(a.range);
    expect(b.power).toBeGreaterThan(a.power);
    const far = computeThrow(o, { x: 5000, y: 0 })!;
    expect(far.target.x).toBeLessThanOrEqual(W - P.fieldMargin);
    expect(far.power).toBeLessThanOrEqual(1);
    const up = computeThrow(o, { x: 0, y: -5000 })!;
    expect(up.target.y).toBeGreaterThanOrEqual(P.fieldMargin);
    expect(up.target.y).toBeLessThanOrEqual(H);
  });
  it('flight time grows with distance', () => {
    const a = computeThrow(o, { x: 100, y: 0 })!;
    const b = computeThrow(o, { x: 400, y: 0 })!;
    expect(b.durationMs).toBeGreaterThan(a.durationMs);
    expect(a.durationMs).toBeGreaterThan(P.flightBaseMs);
  });
  it('a ball flies from the thrower to the target and lands after its duration', () => {
    const th = computeThrow(o, { x: 200, y: 100 })!;
    const b = makeBall(0, o, th);
    expect(ballGround(b)).toEqual(o);
    expect(ballLift(b)).toBe(0);
    expect(stepBall(b, th.durationMs / 2)).toBe(false);
    expect(ballLift(b)).toBeGreaterThan(0.3);
    expect(stepBall(b, th.durationMs)).toBe(true);
    expect(ballGround(b).x).toBeCloseTo(th.target.x);
    expect(ballLift(b)).toBeCloseTo(0);
  });
  it('dots stay on the line', () => {
    const d = dotsAlong({ x: 0, y: 0 }, { x: 400, y: 0 }, 100);
    expect(d.length).toBe(3);
    expect(d.every((p) => p.y === 0)).toBe(true);
  });
});

describe('landing', () => {
  const kid = { x: 1630, y: 500 };
  it('hits a kid inside the splat radius, misses outside', () => {
    expect(resolveLanding({ x: 1630 - P.splatRadius + 5, y: 500 }, kid, false)).toBe('hit');
    expect(resolveLanding({ x: 1630 - P.splatRadius - 5, y: 500 }, kid, false)).toBe('miss');
  });
  it('a ducking kid cannot be hit', () => {
    expect(resolveLanding({ x: 1630, y: 500 }, kid, true)).toBe('blocked');
  });
  it('uses the position at landing: leading the target matters', () => {
    const k = createKid(1);
    k.y = 300;
    k.dir = 1;
    const later = kidYAfter(k, 1500);
    expect(resolveLanding({ x: 1630, y: later }, kidPos(1, { ...k, y: later }), false)).toBe('hit');
    expect(resolveLanding({ x: 1630, y: k.y }, kidPos(1, { ...k, y: later }), false)).toBe('miss');
  });
  it('a snowball on a mound only makes a puff', () => {
    const m = { x: 960, y: 500, r: 80 };
    expect(resolveLanding({ x: 970, y: 510 }, kid, false, [m])).toBe('mound');
    expect(resolveLanding({ x: 600, y: 510 }, kid, false, [m])).toBe('miss');
  });
});


describe('difficulty ladder', () => {
  const last = P.levels.length - 1;
  it('follows the leader and is capped; every level is harder than the last', () => {
    expect(levelFor(0)).toBe(0);
    expect(levelFor(P.pointsPerLevel * 3)).toBe(3);
    expect(levelFor(999)).toBe(last);
    for (let i = 1; i <= last; i++) {
      const a = P.levels[i - 1];
      const b = P.levels[i];
      expect(b.kidSpeed).toBeGreaterThan(a.kidSpeed);
      expect(b.splatRadius).toBeLessThan(a.splatRadius);
      expect(b.reloadMs).toBeGreaterThan(a.reloadMs);
      expect(b.warnMs).toBeLessThan(a.warnMs);
      expect(b.staminaRegen).toBeLessThan(a.staminaRegen);
      expect(b.coverPerSide).toBeGreaterThanOrEqual(a.coverPerSide);
    }
    expect(P.levels[0].kidSpeed).toBe(P.kidSpeed);
    expect(P.levels[0].eventEveryMs).toBe(0);
    expect((last) * P.pointsPerLevel).toBeLessThanOrEqual(SNOWBALL.targetScore);
    expect(paramsForLevel(last).splatRadius).toBe(P.levels[last].splatRadius);
  });
  it('the incoming warning never gets shorter than a duck can react to', () => {
    expect(P.levels[last].warnMs).toBeGreaterThanOrEqual(400);
  });
  it('safety nets: catch-up for a trailing player, mercy late in a long match', () => {
    expect(catchUp(0)).toBe(1);
    expect(catchUp(P.catchUpGap)).toBeGreaterThan(1);
    expect(mercy(0)).toBe(1);
    expect(mercy(P.mercyAfterMs)).toBeCloseTo(1 + P.mercyStep);
    expect(mercy(1e9)).toBeCloseTo(1 + P.mercyMax);
  });
  it('a bigger splat scale widens the hit area', () => {
    const kid = { x: 1630, y: 500 };
    const t = { x: 1630 - P.splatRadius - 10, y: 500 };
    expect(resolveLanding(t, kid, false)).toBe('miss');
    expect(resolveLanding(t, kid, false, [], P, 1.2)).toBe('hit');
  });
});

describe('unexpected moves', () => {
  const hard = paramsForLevel(P.levels.length - 1);
  it('level 0 and 1 kids never stop or turn unexpectedly', () => {
    const k = createKid(0);
    let turns = 0;
    let prev = k.dir;
    for (let i = 0; i < 4000; i++) {
      stepKid(k, 16, paramsForLevel(0));
      expect(k.pause).toBe(0);
      if (k.dir !== prev && k.y > P.laneMinY + 30 && k.y < P.laneMaxY - 30) turns++;
      prev = k.dir;
    }
    expect(turns).toBe(0);
  });
  it('hard-level kids sometimes stop and sometimes turn, after a wobble, and stay in the lane', () => {
    let seed = 5;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const k = createKid(0);
    let stops = 0;
    let turns = 0;
    let wobbles = 0;
    let prevPause = 0;
    let prevDir = k.dir;
    let prevY = k.y;
    for (let i = 0; i < 20000; i++) {
      stepKid(k, 16, hard, rand);
      if (k.pause > 0 && prevPause === 0) stops++;
      if (k.dir !== prevDir && Math.abs(k.y - prevY) < 5 && k.y > P.laneMinY + 5 && k.y < P.laneMaxY - 5) turns++;
      if (isTelling(k, hard)) wobbles++;
      expect(k.y).toBeGreaterThanOrEqual(P.laneMinY - 1e-6);
      expect(k.y).toBeLessThanOrEqual(P.laneMaxY + 1e-6);
      prevPause = k.pause;
      prevDir = k.dir;
      prevY = k.y;
    }
    expect(stops).toBeGreaterThan(5);
    expect(turns).toBeGreaterThan(5);
    expect(wobbles * 16).toBeGreaterThan(hard.tellMs);
  });
  it('a stopped kid stands still for stopMs', () => {
    const k = createKid(0);
    k.pause = hard.stopMs;
    const y = k.y;
    stepKid(k, hard.stopMs - 10, hard);
    expect(k.y).toBe(y);
    stepKid(k, 100, hard);
    stepKid(k, 100, hard);
    expect(k.y).toBeGreaterThan(y);
  });
});

describe('cover mounds', () => {
  const mound: Mound = { x: 500, y: 500, r: 70 };
  const from = { x: 290, y: 500 };
  it('stop a short, low throw that passes through them', () => {
    const th = computeThrow(from, { x: 120, y: 0 })!; // short throw, low arc
    const u = coverStop(from, th.target, th.range, [mound]);
    expect(u).not.toBeNull();
    expect(u!).toBeGreaterThan(0);
    expect(u!).toBeLessThan(1);
  });
  it('a long, high throw sails over cover that is not right at the thrower', () => {
    const far = computeThrow(from, { x: 420, y: 0 })!;
    expect(coverStop(from, far.target, far.range, [{ ...mound, x: 650 }])).toBeNull();
  });
  it('a throw that goes around the mound is not stopped; no cover = never stopped', () => {
    const th = computeThrow(from, { x: 120, y: 0 })!;
    expect(coverStop(from, th.target, th.range, [{ ...mound, y: 800 }])).toBeNull();
    expect(coverStop(from, th.target, th.range, [])).toBeNull();
  });
  it('a stopped ball lands early at the mound', () => {
    const th = computeThrow(from, { x: 120, y: 0 })!;
    const u = coverStop(from, th.target, th.range, [mound])!;
    const b = makeBall(0, from, th, u);
    expect(stepBall(b, th.durationMs * u * 0.5)).toBe(false);
    expect(stepBall(b, th.durationMs)).toBe(true);
    expect(timeLeft(b)).toBe(0);
    expect(Math.hypot(ballGround(b).x - 500, ballGround(b).y - 500)).toBeLessThanOrEqual(75);
  });
  it('the arc is higher for longer throws and zero on the ground', () => {
    expect(liftAt(0, 800)).toBe(0);
    expect(liftAt(0.5, 1200)).toBeGreaterThan(liftAt(0.5, 300));
  });
  it('placeCover puts non-overlapping mounds in front of the right lane', () => {
    let seed = 9;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const p of [0, 1] as const) {
      const ms = placeCover(p, 2, rand);
      expect(ms.length).toBe(2);
      for (const m of ms) {
        expect(p === 0 ? m.x > kidPos(0, createKid(0)).x : m.x < kidPos(1, createKid(1)).x).toBe(true);
        expect(m.y).toBeGreaterThanOrEqual(P.laneMinY);
        expect(m.y).toBeLessThanOrEqual(P.laneMaxY);
      }
      expect(Math.hypot(ms[0].x - ms[1].x, ms[0].y - ms[1].y)).toBeGreaterThan(ms[0].r + ms[1].r);
    }
    expect(placeCover(0, 0)).toEqual([]);
  });
});

describe('direction cue', () => {
  it('has a fixed length whatever the throw distance', () => {
    const a = cueDots({ x: 290, y: 500 }, { x: 500, y: 500 }, 5, 46);
    const b = cueDots({ x: 290, y: 500 }, { x: 1500, y: 500 }, 5, 46);
    expect(a).toEqual(b);
    expect(a).toHaveLength(5);
  });
});

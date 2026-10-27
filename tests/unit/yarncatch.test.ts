import { describe, expect, it } from 'vitest';
import { tierIndex, tierOf, TIERS, YARNCATCH as C } from '../../src/games/yarncatch/config';
import {
  assignTap, cueAlpha, idealMs, inFeint, isCatch, judge, judgeTap, landings, matchWinner, missDeadline, mulberry32, paramsFor, planSwing, pointsFor, timeAtU,
  yarnHop, yarnPath, yarnProgress, type BallPlan,
} from '../../src/games/yarncatch/logic';

describe('yarn catch logic', () => {
  it('rng is seedable and repeatable', () => {
    const a = mulberry32(9);
    const b = mulberry32(9);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('judges perfect / good / early / late around the ideal moment', () => {
    expect(judge(1000, 1000)).toBe('perfect');
    expect(judge(1000 - C.perfectMs, 1000)).toBe('perfect');
    expect(judge(1000 + C.perfectMs, 1000)).toBe('perfect');
    expect(judge(1000 + C.perfectMs + 1, 1000)).toBe('good');
    expect(judge(1000 - C.goodMs, 1000)).toBe('good');
    expect(judge(1000 - C.goodMs - 1, 1000)).toBe('early');
    expect(judge(1000 + C.goodMs + 1, 1000)).toBe('late');
  });

  it('a tap before the yarn starts is a foul, never a catch', () => {
    expect(judgeTap(499, 500, 500)).toBe('foul');
    expect(judgeTap(500, 500, 500)).toBe('early');
    expect(judgeTap(1000, 500, 500)).toBe('perfect');
    expect(isCatch('foul')).toBe(false);
    expect(isCatch('none')).toBe(false);
  });

  it('points: perfect 2, good 1, everything else 0', () => {
    expect(pointsFor('perfect')).toBe(2);
    expect(pointsFor('good')).toBe(1);
    for (const v of ['early', 'late', 'none', 'foul'] as const) expect(pointsFor(v)).toBe(0);
  });

  it('miss deadline is after the good window', () => {
    expect(missDeadline(100, 500)).toBe(100 + 500 + C.goodMs);
  });

  it('plans: seeded, first swings slow, players differ, never before minStartMs, same kind of swing for both', () => {
    const a = planSwing(mulberry32(3), 0);
    const b = planSwing(mulberry32(3), 0);
    expect(a).toEqual(b);
    expect(a.balls[0]).toHaveLength(1);
    expect(a.balls[0][0].descentMs).toBe(C.firstDescentMs);
    expect(a.balls[0][0].descentMs).toBeGreaterThan(planSwing(mulberry32(3), 1).balls[0][0].descentMs);
    expect(planSwing(mulberry32(3), 1).balls[0][0].descentMs).toBeGreaterThan(planSwing(mulberry32(3), 2).balls[0][0].descentMs);
    const rng = mulberry32(42);
    for (let i = 0; i < 400; i++) {
      const p = planSwing(rng, i % 60);
      const [pa, pb] = p.balls;
      expect(pa.length).toBe(pb.length);
      expect(Math.abs(idealMs(pa[0]) - idealMs(pb[0]))).toBeGreaterThanOrEqual(C.minGapMs - 1);
      expect(Math.min(pa[0].startMs, pb[0].startMs)).toBeGreaterThanOrEqual(C.minStartMs);
      pa.forEach((x, k) => {
        expect(x.pauseMs).toBe(pb[k].pauseMs);
        expect(x.bounces).toBe(pb[k].bounces);
        expect(x.descentMs).toBe(pb[k].descentMs);
      });
    }
  });
  it('yarn path: starts at 0, reaches the hands at 1, keeps going and speeds up', () => {
    expect(yarnProgress(100, 200, 500)).toBe(0);
    expect(yarnProgress(700, 200, 500)).toBe(1);
    expect(yarnPath(0)).toBe(0);
    expect(yarnPath(1)).toBe(1);
    expect(yarnPath(1.2)).toBeGreaterThan(1);
    expect(yarnPath(0.5)).toBeLessThan(0.5);
  });

  it('yarn hop: two little bounces, landing at the halfway point and at the paws, flat afterwards', () => {
    expect(yarnHop(0.25)).toBe(yarnHop(0.25, 2));
    expect(yarnHop(0)).toBe(0);
    expect(yarnHop(0.25)).toBeGreaterThan(0.5);
    expect(yarnHop(0.5)).toBeLessThan(0.01);
    expect(yarnHop(0.75)).toBeGreaterThan(0.4);
    expect(yarnHop(1)).toBe(0);
    expect(yarnHop(1.4)).toBe(0);
  });

  it('match: nobody wins before all swings; ties never end the match; more points wins', () => {
    expect(matchWinner([9, 0], C.swings - 1)).toBeNull();
    expect(matchWinner([4, 4], C.swings)).toBeNull();
    expect(matchWinner([5, 4], C.swings)).toBe(0);
    expect(matchWinner([3, 6], C.swings)).toBe(1);
    expect(matchWinner([7, 7], C.swings + 3)).toBeNull();
    expect(matchWinner([7, 8], C.swings + 3)).toBe(1);
  });
});

describe('escalation', () => {
  it('has 42 swings in six tiers of seven, each harder than the last: narrower windows, faster yarn, more tricks', () => {
    expect(C.swings).toBe(42);
    expect(TIERS.map((t) => t.from)).toEqual([0, 7, 14, 21, 28, 35]);
    for (let i = 1; i < TIERS.length; i++) {
      const a = TIERS[i - 1];
      const b = TIERS[i];
      expect(b.perfectMs).toBeLessThanOrEqual(a.perfectMs);
      expect(b.goodMs).toBeLessThanOrEqual(a.goodMs);
      expect(b.descentMs).toBeLessThanOrEqual(a.descentMs);
      expect(b.feint).toBeGreaterThanOrEqual(a.feint * 0.5);
      expect(b.multiplier).toBeGreaterThanOrEqual(a.multiplier);
    }
    // the first tier is the old game, the last one still lets a small child score with a window of 224 ms
    expect(TIERS[0]).toMatchObject({ perfectMs: C.perfectMs, goodMs: C.goodMs, slide: 0, feint: 0, doubleBall: 0, cue: 'ring', multiplier: 1 });
    expect(TIERS[5].goodMs).toBeGreaterThanOrEqual(110);
    expect(TIERS[5].perfectMs).toBeGreaterThanOrEqual(36);
    expect(TIERS.map((t) => t.cue)).toEqual(['ring', 'ring', 'ring', 'ring', 'fade', 'blink']);
    expect(TIERS.at(-1)!.multiplier).toBe(2);
    expect(tierIndex(0)).toBe(0);
    expect(tierIndex(6)).toBe(0);
    expect(tierIndex(7)).toBe(1);
    expect(tierIndex(41)).toBe(5);
    expect(tierIndex(200)).toBe(5);
    expect(tierOf(25).from).toBe(21);
  });

  it('later tiers really produce slides, fake-outs and double yarns; early ones never do', () => {
    const seen = { slide: 0, feint: 0, two: 0 };
    const rng = mulberry32(5);
    for (let i = 0; i < 14; i++) {
      const p = planSwing(rng, i);
      expect(p.balls[0]).toHaveLength(1);
      expect(p.balls[0][0].pauseMs).toBe(0);
      if (i < 7) expect(p.balls[0][0].sideX).toBe(0);
    }
    for (let k = 0; k < 400; k++) {
      const p = planSwing(rng, 21 + (k % 21));
      if (p.balls[0].length === 2) seen.two++;
      if (p.balls[0][0].pauseMs > 0) seen.feint++;
      if (p.balls[0][0].sideX !== 0) seen.slide++;
    }
    expect(seen.two).toBeGreaterThan(100);
    expect(seen.feint).toBeGreaterThan(80);
    expect(seen.slide).toBeGreaterThan(100);
    // the very first two swings are always plain
    for (let s = 1; s < 50; s++) {
      for (const i of [0, 1]) {
        const p = planSwing(mulberry32(s), i);
        expect(p.balls[0]).toHaveLength(1);
        expect(p.balls[0][0].pauseMs).toBe(0);
        expect(p.balls[0][0].sideX).toBe(0);
      }
    }
  });

  it('the second yarn reaches the paws 560-760 ms after the first and never starts before it', () => {
    for (let s = 1; s < 300; s++) {
      const p = planSwing(mulberry32(s), 23);
      for (const balls of p.balls) {
        if (balls.length < 2) continue;
        const gap = idealMs(balls[1]) - idealMs(balls[0]);
        expect(gap).toBeGreaterThanOrEqual(C.doubleGapMs[0] - 1);
        expect(gap).toBeLessThanOrEqual(C.doubleGapMs[1] + 1);
        expect(balls[1].startMs).toBeGreaterThan(balls[0].startMs);
        expect(balls[1].pauseMs).toBe(0);
      }
    }
  });

  it('points scale with the tier multiplier', () => {
    expect(pointsFor('perfect', 2)).toBe(4);
    expect(pointsFor('good', 2)).toBe(2);
    expect(pointsFor('late', 2)).toBe(0);
    expect(planSwing(mulberry32(1), 35).multiplier).toBe(2);
    expect(planSwing(mulberry32(1), 34).multiplier).toBe(1);
    expect(paramsFor(TIERS[3])).toEqual({ perfectMs: 44, goodMs: 120 });
  });
});

describe('fake-outs', () => {
  const ball: BallPlan = { startMs: 1000, descentMs: 400, pauseAtU: 0.5, pauseMs: 400, sideX: 0, bounces: 2 };

  it('the progress stops during the pause and the ideal moment moves back', () => {
    expect(yarnProgress(1000, 1000, 400, 0.5, 400)).toBe(0);
    expect(yarnProgress(1100, 1000, 400, 0.5, 400)).toBeCloseTo(0.25, 6);
    expect(yarnProgress(1200, 1000, 400, 0.5, 400)).toBeCloseTo(0.5, 6);
    expect(yarnProgress(1400, 1000, 400, 0.5, 400)).toBeCloseTo(0.5, 6); // hanging in the air
    expect(yarnProgress(1600, 1000, 400, 0.5, 400)).toBeCloseTo(0.5, 6);
    expect(yarnProgress(1700, 1000, 400, 0.5, 400)).toBeCloseTo(0.75, 6);
    expect(yarnProgress(1800, 1000, 400, 0.5, 400)).toBe(1);
    expect(yarnProgress(1900, 1000, 400, 0.5, 400)).toBeCloseTo(1.25, 6);
    expect(idealMs(ball)).toBe(1800);
    expect(inFeint(1100, ball)).toBe(false);
    expect(inFeint(1400, ball)).toBe(true);
    expect(inFeint(1700, ball)).toBe(false);
    expect(inFeint(1000, { ...ball, pauseMs: 0 })).toBe(false);
  });

  it('tapping at the old ideal time is early; tapping after the pause is perfect', () => {
    const p = { perfectMs: 40, goodMs: 110 };
    expect(judgeTap(1400, 1000, 400, p, 400)).toBe('early');
    expect(judgeTap(1800, 1000, 400, p, 400)).toBe('perfect');
    expect(judgeTap(1400, 1000, 400, p)).toBe('perfect'); // the same tap without a fake-out
    expect(missDeadline(1000, 400, p, 400)).toBe(1800 + 110);
  });

  it('landing sounds follow the pause', () => {
    expect(landings(2)).toEqual([0, 0.5, 1]);
    expect(landings(3).map((u) => Math.round(u * 100))).toEqual([0, 33, 67, 100]);
    expect(timeAtU(ball, 0)).toBe(0);
    expect(timeAtU(ball, 0.5)).toBe(200); // the pause starts at u = 0.5
    expect(timeAtU(ball, 1)).toBe(800); // 400 descent + 400 pause: exactly the ideal moment
    expect(1000 + timeAtU(ball, 1)).toBe(idealMs(ball));
  });
});

describe('two yarns', () => {
  const a: BallPlan = { startMs: 1000, descentMs: 400, pauseAtU: 0, pauseMs: 0, sideX: 0, bounces: 2 };
  const b: BallPlan = { ...a, startMs: 1550 }; // ideal 1950, 550 after the first

  it('a tap belongs to the nearest ball that has started', () => {
    expect(assignTap([a, b], [false, false], 1400)).toEqual({ ball: 0, foul: false });
    expect(assignTap([a, b], [false, false], 1960)).toEqual({ ball: 1, foul: false });
    expect(assignTap([a, b], [true, false], 1500)).toEqual({ ball: 1, foul: true }); // second yarn not started yet: eager tap
    expect(assignTap([a, b], [true, false], 1950)).toEqual({ ball: 1, foul: false });
    expect(assignTap([a, b], [true, true], 1950)).toEqual({ ball: -1, foul: false });
  });

  it('a tap before anything started is a foul on the first yarn', () => {
    expect(assignTap([a, b], [false, false], 500)).toEqual({ ball: 0, foul: true });
  });

  it('a late tap for the first yarn that is nearer the second one counts for the second', () => {
    expect(assignTap([a, b], [false, false], 1900)).toEqual({ ball: 1, foul: false });
  });
});

describe('timing cue', () => {
  it('the ring is always there in the early tiers, fades out before the catch later, and flickers in the last tier', () => {
    for (const u of [0.1, 0.5, 0.9, 1]) expect(cueAlpha('ring', u, 123)).toBe(1);
    expect(cueAlpha('fade', 0.2, 0)).toBe(1);
    expect(cueAlpha('fade', 0.55, 0)).toBeGreaterThan(0);
    expect(cueAlpha('fade', 0.55, 0)).toBeLessThan(1);
    expect(cueAlpha('fade', 0.7, 0)).toBe(0);
    expect(cueAlpha('fade', 1, 0)).toBe(0);
    expect(cueAlpha('blink', 0.2, 0)).toBe(1);
    expect(cueAlpha('blink', 0.2, C.blinkMs)).toBeLessThan(0.2);
    expect(cueAlpha('blink', 0.9, 0)).toBe(0);
  });
});

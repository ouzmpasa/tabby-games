import { describe, expect, it } from 'vitest';
import { PENALTY } from '../../src/games/penalty/config';
import { H, W } from '../../src/core/layout';
import { DEFAULT_PARAMS as P, blockerPassK, blockerX, blockerY, computeShot, cueDots, isBlocked, levelOfKick, paramsForLevel, goalX, keeperOf, keeperRange, power, resolveShot, shooterOf, shotAt, spotPos, stepKeeper } from '../../src/games/penalty/logic';

describe('roles', () => {
  it('alternate every kick', () => {
    expect([0, 1, 2, 3].map(shooterOf)).toEqual([0, 1, 0, 1]);
    for (let k = 0; k < 6; k++) expect(keeperOf(k)).not.toBe(shooterOf(k));
  });
  it('goal is at the far end from the shooter', () => {
    expect(goalX(0)).toBe(W - P.goalInset);
    expect(goalX(1)).toBe(P.goalInset);
    expect(spotPos(0).x).toBeLessThan(W / 2);
    expect(spotPos(1).x).toBeGreaterThan(W / 2);
  });
});

describe('computeShot', () => {
  it('ignores short or backward pulls', () => {
    expect(computeShot(0, { x: 10, y: 0 })).toBeNull();
    expect(computeShot(0, { x: -200, y: 0 })).toBeNull();
    expect(computeShot(1, { x: 200, y: 0 })).toBeNull();
  });
  it('straight pull aims at the middle of the goal', () => {
    const s = computeShot(0, { x: 200, y: 0 })!;
    expect(s.to.x).toBe(goalX(0));
    expect(s.to.y).toBeCloseTo(H / 2, 6);
    expect(s.onTarget).toBe(true);
    const s1 = computeShot(1, { x: -200, y: 0 })!;
    expect(s1.to.x).toBe(goalX(1));
  });
  it('angle is clamped and wide shots are off target', () => {
    const s = computeShot(0, { x: 100, y: 1000 })!;
    expect(s.angle).toBeCloseTo((P.maxAngleDeg * Math.PI) / 180, 6);
    expect(s.onTarget).toBe(false);
    expect(s.to.y).toBeGreaterThan(H / 2 + P.goalHalfH);
    expect(computeShot(0, { x: 200, y: -1000 })!.to.y).toBeLessThan(H / 2 - P.goalHalfH);
  });
  it('angle gain softens the aim', () => {
    const s = computeShot(0, { x: 100, y: 27 })!; // ~15 degrees of finger angle
    expect(s.onTarget).toBe(true);
    expect(s.angle).toBeLessThan(0.2);
  });
  it('more pull = more power = faster ball', () => {
    expect(power(P.minPull)).toBe(0);
    expect(power(P.maxPull * 3)).toBe(1);
    const weak = computeShot(0, { x: P.minPull + 1, y: 0 })!;
    const strong = computeShot(0, { x: P.maxPull + 100, y: 0 })!;
    expect(strong.flightMs).toBeLessThan(weak.flightMs);
    expect(strong.flightMs).toBeCloseTo(P.fastFlightMs, 6);
  });
});

describe('keeper', () => {
  it('has a speed limit and cannot leave the goal', () => {
    const y1 = stepKeeper(H / 2, H / 2 + 400, 100);
    expect(y1 - H / 2).toBeCloseTo((P.keeperSpeed * 100) / 1000, 6);
    let y = H / 2;
    for (let i = 0; i < 200; i++) y = stepKeeper(y, -5000, 16);
    expect(y).toBeCloseTo(keeperRange().min, 6);
    expect(stepKeeper(y, 99999, 100000)).toBeCloseTo(keeperRange().max, 6);
  });
  it('reaches the target when it is close', () => {
    expect(stepKeeper(500, 510, 1000)).toBe(510);
  });
});

describe('shot flight and result', () => {
  it('ball goes from the spot to the target and is biggest mid-flight', () => {
    const s = computeShot(0, { x: 200, y: 40 })!;
    const a = shotAt(s, 0);
    const b = shotAt(s, 1);
    const m = shotAt(s, 0.5);
    expect(a).toMatchObject({ x: s.from.x, y: s.from.y, scale: 1 });
    expect(b.x).toBeCloseTo(s.to.x, 6);
    expect(b.scale).toBeCloseTo(1, 6);
    expect(m.scale).toBeCloseTo(1 + P.arcHeight, 6);
  });
  it('save / goal / miss', () => {
    const s = computeShot(0, { x: 200, y: 0 })!; // lands at H/2
    expect(resolveShot(s, H / 2)).toBe('save');
    expect(resolveShot(s, H / 2 + P.keeperHalf + P.saveSlack - 1)).toBe('save');
    expect(resolveShot(s, H / 2 + P.keeperHalf + P.saveSlack + 1)).toBe('goal');
    const wide = computeShot(0, { x: 100, y: 150 })!;
    expect(resolveShot(wide, wide.to.y)).toBe('miss');
  });
  it('the keeper cannot cover the whole goal', () => {
    expect(2 * (P.keeperHalf + P.saveSlack)).toBeLessThan(2 * P.goalHalfH);
  });
});


describe('difficulty ladder', () => {
  it('goes up every levelEveryKicks kicks and stops at the last row', () => {
    expect(levelOfKick(0)).toBe(0);
    expect(levelOfKick(P.levelEveryKicks - 1)).toBe(0);
    expect(levelOfKick(P.levelEveryKicks)).toBe(1);
    expect(levelOfKick(9999)).toBe(P.levels.length - 1);
  });
  it('every level is harder to score on than the one before, yet the keeper never covers the whole goal', () => {
    for (let i = 0; i < P.levels.length; i++) {
      const lv = paramsForLevel(i);
      expect(2 * (lv.keeperHalf + lv.saveSlack)).toBeLessThan(2 * lv.goalHalfH * 0.8);
      if (i > 0) {
        const prev = paramsForLevel(i - 1);
        expect(lv.goalHalfH).toBeLessThan(prev.goalHalfH);
        expect(lv.keeperHalf).toBeGreaterThan(prev.keeperHalf);
        expect(lv.overAt).toBeLessThan(prev.overAt);
        expect(lv.blockerSpeed).toBeGreaterThanOrEqual(prev.blockerSpeed);
      }
    }
    expect(paramsForLevel(0)).toMatchObject({ goalHalfH: PENALTY.goalHalfH, keeperHalf: PENALTY.keeperHalf });
    expect(paramsForLevel(0).blockerSpeed).toBe(0);
  });
  it('the keeper range follows the narrower goal', () => {
    const wide = keeperRange(paramsForLevel(0));
    const narrow = keeperRange(paramsForLevel(P.levels.length - 1));
    expect(narrow.max - narrow.min).toBeLessThan(wide.max - wide.min);
  });
});

describe('power sweet spot', () => {
  it('a kick harder than overAt flies over the bar, a normal one does not', () => {
    const soft = computeShot(0, { x: P.minPull + 0.5 * (P.maxPull - P.minPull), y: 0 })!;
    const hard = computeShot(0, { x: P.maxPull, y: 0 })!;
    expect(soft.over).toBe(false);
    expect(hard.over).toBe(true);
    expect(resolveShot(hard, H / 2 + 400)).toBe('over');
    expect(resolveShot(soft, H / 2 + 400)).toBe('goal');
  });
  it('the over threshold moves down with the level', () => {
    const len = P.minPull + 0.86 * (P.maxPull - P.minPull);
    expect(computeShot(0, { x: len, y: 0 }, paramsForLevel(0))!.over).toBe(false);
    expect(computeShot(0, { x: len, y: 0 }, paramsForLevel(P.levels.length - 1))!.over).toBe(true);
  });
});

describe('defender cone', () => {
  const hard = paramsForLevel(P.levels.length - 1);
  it('patrols across the goal and never leaves its range', () => {
    const lim = hard.goalHalfH + 30;
    for (let t = 0; t < 30000; t += 123) {
      const y = blockerY(t, hard);
      expect(y).toBeGreaterThanOrEqual(H / 2 - lim - 1e-6);
      expect(y).toBeLessThanOrEqual(H / 2 + lim + 1e-6);
    }
  });
  it('stands between the spot and the goal', () => {
    expect(blockerX(0, hard)).toBeGreaterThan(spotPos(0).x);
    expect(blockerX(0, hard)).toBeLessThan(goalX(0));
    expect(blockerX(1, hard)).toBeLessThan(spotPos(1).x);
  });
  it('blocks a ball passing through it and lets other balls by; absent on easy levels', () => {
    const shot = computeShot(0, { x: 200, y: 0 }, hard)!; // straight down the middle
    // find a clock when the cone is at the middle, and one when it is far away
    let mid = 0;
    let far = 0;
    for (let t = 0; t < 20000; t += 10) {
      if (Math.abs(blockerY(t, hard) - H / 2) < 5) mid = t;
      if (Math.abs(blockerY(t, hard) - (H / 2 + hard.goalHalfH)) < 5) far = t;
    }
    expect(isBlocked(shot, mid, hard)).toBe(true);
    expect(isBlocked(shot, far, hard)).toBe(false);
    expect(isBlocked(shot, mid, paramsForLevel(0))).toBe(false);
    expect(blockerPassK(hard)).toBeGreaterThan(0);
    expect(blockerPassK(hard)).toBeLessThan(1);
  });
});

describe('direction cue', () => {
  it('has a fixed length for any power, pointing at the goal', () => {
    const weak = computeShot(0, { x: P.minPull + 2, y: 0 })!;
    const strong = computeShot(0, { x: P.maxPull, y: 0 })!;
    const a = cueDots(weak, P.aimDots, P.aimDotGap);
    const b = cueDots(strong, P.aimDots, P.aimDotGap);
    expect(a).toHaveLength(P.aimDots);
    expect(a).toEqual(b);
    expect(a[0].x).toBeGreaterThan(weak.from.x);
  });
});

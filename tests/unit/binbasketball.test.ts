import { describe, expect, it } from 'vitest';
import { BINBASKETBALL } from '../../src/games/binbasketball/config';
import { H, W } from '../../src/core/layout';
import { DEFAULT_PARAMS as P, applyWind, binCentre, binPos, catchUp, comboBonus, createBin, cueDots, fold, levelDef, levelFor, mercy, rollWind, stepBin, computeAim, computeThrow, createBall, flickVelocity, homePos, isHit, launch, stepBall } from '../../src/games/binbasketball/logic';

describe('bin motion', () => {
  it('stays on its track and bounces between the ends', () => {
    for (let t = 0; t < 20000; t += 137) {
      const b = binPos(t);
      expect(b.x).toBe(P.binX);
      expect(b.y).toBeGreaterThanOrEqual(P.binMinY - 1e-6);
      expect(b.y).toBeLessThanOrEqual(P.binMaxY + 1e-6);
    }
    const span = P.binMaxY - P.binMinY;
    expect(binPos(0).y).toBe(P.binMinY);
    expect(binPos((span / P.binSpeed) * 1000).y).toBeCloseTo(P.binMaxY, 3);
    expect(binPos((2 * span / P.binSpeed) * 1000).y).toBeCloseTo(P.binMinY, 3);
  });
});

describe('flick', () => {
  it('measures recent finger velocity and ignores a stopped finger', () => {
    const s = [{ x: 0, y: 0, t: 0 }, { x: 100, y: 0, t: 50 }, { x: 200, y: 0, t: 100 }];
    expect(flickVelocity(s, 100)!.x).toBeCloseTo(2000);
    expect(flickVelocity(s, 400)).toBeNull();
    expect(flickVelocity([s[0]], 0)).toBeNull();
  });

  it('ignores slow and backward flicks', () => {
    expect(computeThrow(0, homePos(0), { x: 100, y: 0 })).toBeNull();
    expect(computeThrow(0, homePos(0), { x: -3000, y: 0 })).toBeNull();
    expect(computeThrow(1, homePos(1), { x: 3000, y: 0 })).toBeNull();
  });

  it('lands farther for faster flicks, toward the opponent, mirrored for player 1', () => {
    const slow = computeThrow(0, homePos(0), { x: 1500, y: 0 })!;
    const fast = computeThrow(0, homePos(0), { x: 3000, y: 0 })!;
    expect(fast.distance).toBeGreaterThan(slow.distance);
    expect(fast.to.x).toBeGreaterThan(slow.to.x);
    expect(fast.durationMs).toBeGreaterThan(slow.durationMs);
    const r = computeThrow(1, homePos(1), { x: -3000, y: 0 })!;
    expect(r.to.x).toBeCloseTo(W - fast.to.x);
  });

  it('clamps distance and angle, and stays on screen', () => {
    const huge = computeThrow(0, homePos(0), { x: 30000, y: 0 })!;
    expect(huge.distance).toBeLessThanOrEqual(P.maxThrowDistance);
    const steep = computeThrow(0, homePos(0), { x: 100, y: 3000 })!;
    const ang = Math.atan2(steep.to.y - H / 2, steep.to.x - homePos(0).x);
    expect(ang).toBeLessThanOrEqual((P.maxThrowAngleDeg * Math.PI) / 180 + 1e-6);
    expect(steep.to.y).toBeLessThanOrEqual(H - 40);
  });
});

describe('hit test', () => {
  it('hits inside the forgiving radius only', () => {
    const bin = { x: 960, y: 500 };
    expect(isHit({ x: 960, y: 500 }, bin)).toBe(true);
    expect(isHit({ x: 960 + P.binRadius * P.hitFactor - 1, y: 500 }, bin)).toBe(true);
    expect(isHit({ x: 960 + P.binRadius, y: 500 }, bin)).toBe(false);
  });
});

function fly(b: ReturnType<typeof createBall>, bin: { x: number; y: number }, maxMs = 5000) {
  const events: string[] = [];
  for (let t = 0; t < maxMs; t += 16) {
    const ev = stepBall(b, 16, bin);
    if (ev.landed) events.push(ev.landed);
    if (ev.ready) {
      events.push('ready');
      break;
    }
  }
  return events;
}

describe('ball lifecycle', () => {
  it('a throw landing on the bin scores a hit then returns ready at home', () => {
    const b = createBall(0);
    const bin = { x: 960, y: H / 2 };
    const home = homePos(0);
    // aim exactly at the bin: speed such that distance == 960 - home.x
    const dist = bin.x - home.x;
    const th = computeThrow(0, home, { x: dist / P.distancePerSpeed, y: 0 })!;
    expect(th.to.x).toBeCloseTo(bin.x);
    launch(b, th);
    expect(fly(b, bin)).toEqual(['hit', 'ready']);
    expect(b).toMatchObject({ phase: 'ready', x: home.x, y: home.y, scale: 1 });
  });

  it('a miss rests, returns to the thrower and can be thrown again', () => {
    const b = createBall(1);
    const home = homePos(1);
    launch(b, computeThrow(1, home, { x: -1200, y: 0 })!);
    expect(fly(b, { x: 960, y: 900 })).toEqual(['miss', 'ready']);
    expect(b.x).toBe(home.x);
    launch(b, computeThrow(1, home, { x: -1200, y: 0 })!);
    expect(b.phase).toBe('flight');
  });

  it('the ball is bigger mid-flight than at rest and the bin position at landing decides', () => {
    const b = createBall(0);
    launch(b, computeThrow(0, homePos(0), { x: 2000, y: 0 })!);
    let max = 0;
    while (b.phase === 'flight') {
      stepBall(b, 16, { x: 0, y: 0 });
      max = Math.max(max, b.scale);
    }
    expect(max).toBeGreaterThan(1.2);
    expect(b.phase).toBe('rest');
  });
});

describe('computeAim (slingshot)', () => {
  const from = { x: 260, y: 540 };
  it('pulling back toward your own end throws forward, farther for longer pulls', () => {
    const short = computeAim(0, from, { x: 100, y: 0 })!;
    const long = computeAim(0, from, { x: 250, y: 0 })!;
    expect(short.to.x).toBeGreaterThan(from.x);
    expect(long.distance).toBeGreaterThan(short.distance);
  });
  it('mirrors for player 1', () => {
    const th = computeAim(1, { x: 1660, y: 540 }, { x: -200, y: 0 })!;
    expect(th.to.x).toBeLessThan(1660);
  });
  it('ignores tiny and backward pulls', () => {
    expect(computeAim(0, from, { x: 10, y: 0 })).toBeNull();
    expect(computeAim(0, from, { x: -200, y: 0 })).toBeNull();
  });
});


describe('difficulty ladder', () => {
  it('the level follows the leader and is capped; every level is harder than the last', () => {
    expect(levelFor(0)).toBe(0);
    expect(levelFor(P.pointsPerLevel * 3)).toBe(3);
    expect(levelFor(999)).toBe(P.levels.length - 1);
    for (let i = 1; i < P.levels.length; i++) {
      expect(P.levels[i].radius).toBeLessThan(P.levels[i - 1].radius);
      expect(P.levels[i].speed).toBeGreaterThan(P.levels[i - 1].speed);
      expect(P.levels[i].wind).toBeGreaterThanOrEqual(P.levels[i - 1].wind);
    }
    expect(levelDef(0).radius).toBe(P.binRadius);
    expect(levelDef(0).speed).toBe(P.binSpeed);
    expect((P.levels.length - 1) * P.pointsPerLevel).toBeLessThanOrEqual(BINBASKETBALL.targetScore); // the top level is reached during a match
  });
  it('level 0 steady play is exactly the old triangle wave', () => {
    const b = createBin();
    let t = 0;
    for (let i = 0; i < 400; i++) {
      stepBin(b, 16, 0);
      t += 16;
      expect(binCentre(b).y).toBeCloseTo(binPos(t).y, 3);
      expect(binCentre(b).x).toBe(P.binX);
    }
  });
  it('the bin shrinks and sways gradually after a level-up, never jumps', () => {
    const b = createBin();
    const last = P.levels.length - 1;
    const r0 = b.radius;
    stepBin(b, 16, last);
    expect(r0 - b.radius).toBeLessThan(1);
    for (let i = 0; i < 4000; i++) stepBin(b, 16, last);
    expect(b.radius).toBe(levelDef(last).radius);
    expect(b.drift).toBe(levelDef(last).drift);
  });
  it('stays on the track in every mode, including the sway', () => {
    for (let lvl = 0; lvl < P.levels.length; lvl++) {
      const b = createBin();
      for (let i = 0; i < 3000; i++) {
        stepBin(b, 16, lvl);
        const c = binCentre(b);
        expect(c.y).toBeGreaterThanOrEqual(P.binMinY - 1e-6);
        expect(c.y).toBeLessThanOrEqual(P.binMaxY + 1e-6);
        expect(Math.abs(c.x - P.binX)).toBeLessThanOrEqual(levelDef(lvl).drift + 1e-6);
      }
    }
  });
  it("'stop' mode waits at the stations and 'dart' mode changes speed", () => {
    const stopLvl = P.levels.findIndex((l) => l.mode === 'stop');
    const b = createBin();
    let stopped = 0;
    let prev = binCentre(b).y;
    for (let i = 0; i < 1500; i++) {
      stepBin(b, 16, stopLvl);
      const y = binCentre(b).y;
      if (Math.abs(y - prev) < 1e-9) stopped++;
      prev = y;
    }
    expect(stopped * 16).toBeGreaterThan(P.stopMs);
    const dartLvl = P.levels.findIndex((l) => l.mode === 'dart');
    const d = createBin();
    const speeds: number[] = [];
    for (let i = 0; i < 500; i++) {
      const before = d.d;
      stepBin(d, 16, dartLvl);
      speeds.push((d.d - before) / 0.016);
    }
    expect(Math.max(...speeds) / Math.min(...speeds)).toBeGreaterThan(2);
  });
  it('fold bounces a distance back and forth', () => {
    expect(fold(0, 100)).toBe(0);
    expect(fold(150, 100)).toBe(50);
    expect(fold(250, 100)).toBe(50);
    expect(fold(-30, 100)).toBe(30);
  });
});

describe('wind', () => {
  it('is calm on the first levels and never stronger than the level allows', () => {
    expect(rollWind(0)).toEqual({ x: 0, y: 0 });
    for (let lvl = 0; lvl < P.levels.length; lvl++) {
      for (let i = 0; i < 50; i++) {
        const w = rollWind(lvl);
        expect(Math.hypot(w.x, w.y)).toBeLessThanOrEqual(levelDef(lvl).wind + 1e-6);
      }
    }
  });
  it('pushes the landing spot by wind * flight time and keeps it on screen', () => {
    const th = { to: { x: 900, y: 500 }, distance: 640, durationMs: 1000 };
    const w = applyWind(th, { x: 50, y: -80 });
    expect(w.to.x).toBeCloseTo(950);
    expect(w.to.y).toBeCloseTo(420);
    expect(applyWind(th, { x: 0, y: 0 })).toBe(th);
    expect(applyWind(th, { x: 0, y: -99999 }).to.y).toBe(40);
  });
});

describe('fairness helpers', () => {
  it('a streak of comboEvery hits earns a bonus, others do not', () => {
    expect(comboBonus(0)).toBe(false);
    expect(comboBonus(P.comboEvery - 1)).toBe(false);
    expect(comboBonus(P.comboEvery)).toBe(true);
    expect(comboBonus(P.comboEvery * 2)).toBe(true);
  });
  it('only a player far behind gets the bigger scoring area', () => {
    expect(catchUp(0)).toBe(1);
    expect(catchUp(P.catchUpGap - 1)).toBe(1);
    expect(catchUp(P.catchUpGap)).toBeGreaterThan(1);
  });
  it('the safety net starts late and grows in steps up to a cap', () => {
    expect(mercy(0)).toBe(1);
    expect(mercy(P.mercyAfterMs - 1)).toBe(1);
    expect(mercy(P.mercyAfterMs)).toBeCloseTo(1 + P.mercyStep);
    expect(mercy(1e9)).toBeCloseTo(1 + P.mercyMax);
  });
  it('the direction cue has a fixed length whatever the throw distance', () => {
    const a = cueDots({ x: 0, y: 0 }, { x: 300, y: 0 }, 5, 46);
    const b = cueDots({ x: 0, y: 0 }, { x: 1300, y: 0 }, 5, 46);
    expect(a).toEqual(b);
    expect(a).toHaveLength(5);
    expect(cueDots({ x: 1, y: 1 }, { x: 1, y: 1 }, 5, 46)).toEqual([]);
  });
});

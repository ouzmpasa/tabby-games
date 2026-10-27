import { describe, expect, it } from 'vitest';
import { BALLOONPOP as C } from '../../src/games/balloonpop/config';
import {
  advance, chainVictims, createSpawner, freezeEnd, gapAt, giftEvents, hitRadius, isFrozen, isGone, lateralOffset, makeBalloon, mulberry32, pickBalloon, pointsFor,
  spawnUntil, speedAt, weightsAt,
  type Balloon,
} from '../../src/games/balloonpop/logic';

const W = 1920;
const mk = (kind: Balloon['kind'], x: number, y: number, r = 70): Balloon => ({ id: 0, kind, r, vy: 100, cx: x, move: 'sine', amp: 0, freq: 1, phase: 0, accel: 0, colour: 0, age: 0, x, y });

describe('balloon pop logic', () => {
  it('rng is seedable and repeatable', () => {
    const a = mulberry32(3);
    const b = mulberry32(3);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('the same seed gives the same schedule', () => {
    const a = spawnUntil(createSpawner(9), 30000);
    const b = spawnUntil(createSpawner(9), 30000);
    expect(a.length).toBeGreaterThan(40);
    expect(a).toEqual(b);
  });

  it('spawns about twice as often as before (>= 1.4 per second at the start, >= 2.4 at the end)', () => {
    expect(1000 / gapAt(0)).toBeGreaterThan(1.4);
    expect(1000 / gapAt(C.rampMs)).toBeGreaterThan(2.4);
  });

  it('holds back gated kinds at the start; every kind shows up; lanes keep the whole sweep inside the half', () => {
    const ev = spawnUntil(createSpawner(4), 130000);
    expect(ev.filter((e) => e.at < C.chainAfterMs).every((e) => e.kind !== 'chain')).toBe(true);
    expect(ev.filter((e) => e.at < C.grumpyAfterMs).every((e) => e.kind !== 'grumpy')).toBe(true);
    expect(ev.filter((e) => e.at < C.bombAfterMs).every((e) => e.kind !== 'bomb')).toBe(true);
    expect(ev.filter((e) => e.at < C.dartAfterMs).every((e) => e.move !== 'dart')).toBe(true);
    for (const e of ev) {
      expect(e.lane - e.amp - e.r).toBeGreaterThanOrEqual(C.edgeMargin - 1e-6);
      expect(e.lane + e.amp + e.r).toBeLessThanOrEqual(960 - C.centreMargin + 1e-6);
    }
    expect(new Set(ev.map((e) => e.kind)).size).toBe(6);
    expect(new Set(ev.map((e) => e.move)).size).toBe(3);
    expect(ev.some((e) => e.accel > 0)).toBe(true);
    const radii = ev.filter((e) => e.kind === 'normal').map((e) => e.r);
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(35);
  });

  it('later balloons are grumpier and smaller than early ones', () => {
    expect(weightsAt(C.rampMs).grumpy).toBeGreaterThan(weightsAt(C.grumpyAfterMs).grumpy * 1.8);
    const mean = (t: number): number => {
      const ev = spawnUntil(createSpawner(21), t + 40000).filter((e) => e.at >= t && e.kind === 'normal');
      return ev.reduce((s, e) => s + e.r, 0) / ev.length;
    };
    expect(mean(C.rampMs)).toBeLessThan(mean(0) * 0.9);
  });

  it('both sides are mirrored copies of one event', () => {
    for (const e of spawnUntil(createSpawner(2), 40000).filter((_, i) => i % 7 === 0)) {
      const l = makeBalloon(e, 0, W);
      const r = makeBalloon(e, 1, W);
      expect(l.cx + r.cx).toBe(W);
      for (let i = 0; i < 100; i++) {
        advance(l, 16, 0);
        advance(r, 16, 1);
        expect(l.x + r.x).toBeCloseTo(W, 6);
        expect(l.y).toBe(r.y);
      }
    }
  });

  it('balloons rise and escape off the top; lateral movement stays within the amplitude', () => {
    for (const e of spawnUntil(createSpawner(5), 40000).filter((_, i) => i % 5 === 0)) {
      const b = makeBalloon(e, 0, W);
      const y0 = b.y;
      advance(b, 1000);
      expect(b.y).toBeLessThan(y0);
      let n = 0;
      while (!isGone(b) && n++ < 3000) {
        advance(b, 16);
        expect(Math.abs(b.x - b.cx)).toBeLessThanOrEqual(b.amp + 1e-6);
      }
      expect(isGone(b)).toBe(true);
    }
  });

  it('zig-zag is a sharp triangle wave, darts rest then dash, accelerating balloons speed up', () => {
    const zz = { move: 'zigzag', amp: 100, freq: 1, phase: 0 } as const;
    expect(lateralOffset(zz, 0)).toBeCloseTo(100);
    expect(lateralOffset(zz, 0.5)).toBeCloseTo(-100);
    expect(lateralOffset(zz, 0.25)).toBeCloseTo(0); // constant speed through the middle: linear
    expect(lateralOffset(zz, 1)).toBeCloseTo(100);
    const dart = { move: 'dart', amp: 120, freq: 1.5, phase: 1 } as const;
    // At rest well after a dash, moving during the dash.
    expect(lateralOffset(dart, 1.4)).toBeCloseTo(lateralOffset(dart, 1.2), 6);
    expect(Math.abs(lateralOffset(dart, 1.5 + C.dartDashS * 0.5) - lateralOffset(dart, 1.45))).toBeGreaterThan(10);
    for (let t = 0; t < 30; t += 0.05) expect(Math.abs(lateralOffset(dart, t))).toBeLessThanOrEqual(120 + 1e-9);
    const fast = { ...mk('normal', 300, 2000), vy: 100, accel: 0.5 };
    const slow = { ...mk('normal', 300, 2000), vy: 100, accel: 0 };
    for (let i = 0; i < 125; i++) { advance(fast, 16); advance(slow, 16); }
    expect(2000 - fast.y).toBeGreaterThan((2000 - slow.y) * 1.2);
  });

  it('difficulty ramps and flattens; speeds are well above the old game', () => {
    expect(gapAt(C.rampMs * 3)).toBeLessThan(gapAt(0));
    expect(gapAt(C.rampMs * 3)).toBe(C.gapEndMs);
    expect(speedAt(C.rampMs * 3)).toBeGreaterThan(speedAt(0));
    expect(speedAt(0)).toBeGreaterThanOrEqual(150 * 1.5);
    expect(speedAt(C.rampMs * 3) * (1 + C.speedJitter) * C.smallSpeedFactor).toBeLessThan(650);
  });

  it('bomb gifts: a few normal balloons with valid lanes and unique ids', () => {
    const g = giftEvents(mulberry32(3), 40000, 100);
    expect(g.length).toBe(C.bombGift);
    expect(g.every((e) => e.kind === 'normal')).toBe(true);
    expect(new Set(g.map((e) => e.id)).size).toBe(g.length);
  });

  it('hit radius is generous (>= radius + 25)', () => {
    for (const r of [C.smallRadius[0], C.normalRadius[1]]) expect(hitRadius(mk('normal', 0, 0, r))).toBeGreaterThanOrEqual(r + 25);
  });

  it('picks the nearest balloon, topmost on a tie, none when too far', () => {
    const list = [mk('normal', 300, 500), mk('normal', 400, 500)];
    expect(pickBalloon(list, 330, 500)).toBe(0);
    expect(pickBalloon(list, 380, 500)).toBe(1);
    expect(pickBalloon(list, 800, 500)).toBe(-1);
    expect(pickBalloon(list, 300, 500 + 70 + 29)).toBe(0); // just inside the generous ring
    expect(pickBalloon(list, 300, 500 + 140)).toBe(-1);
    const tie = [mk('normal', 300, 600), mk('normal', 300, 400)];
    expect(pickBalloon(tie, 300, 500)).toBe(1);
  });

  it('point values (x5 scale): normal 5, small 10, star 25, chain 5, grumpy and bomb 0; target 500', () => {
    expect([pointsFor('normal'), pointsFor('small'), pointsFor('star'), pointsFor('chain'), pointsFor('grumpy'), pointsFor('bomb')]).toEqual([5, 10, 25, 5, 0, 0]);
    expect(C.targetScore).toBe(500);
  });

  it('chain takes everything within its radius on that half', () => {
    const list = [mk('chain', 300, 500), mk('normal', 400, 500), mk('small', 300, 500 + C.chainRadiusPx - 5), mk('normal', 300, 500 + C.chainRadiusPx + 50)];
    expect(chainVictims(list, 0)).toEqual([1, 2]);
    expect(chainVictims([mk('chain', 300, 500), mk('bomb', 350, 500)], 0)).toEqual([]); // bombs are left alone
  });

  it('freeze lasts exactly freezeMs', () => {
    const until = freezeEnd(5000);
    expect(until).toBe(5000 + C.freezeMs);
    expect(isFrozen(until, 5000)).toBe(true);
    expect(isFrozen(until, until - 1)).toBe(true);
    expect(isFrozen(until, until)).toBe(false);
    expect(C.freezeMs).toBe(1200);
  });
});

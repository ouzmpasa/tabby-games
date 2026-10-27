import { describe, expect, it } from 'vitest';
import { ROUND_RAMP, TOKEN_AREA, TUGOFWAR } from '../../src/games/tugofwar/config';
import {
  DEFAULT_PARAMS as P,
  advance,
  band,
  createState,
  grabToken,
  isBoosted,
  makeTokenSchedule,
  markerX,
  mulberry32,
  powerOf,
  reset,
  roundParams,
  roundTokens,
  surge,
  tap,
  winner,
} from '../../src/games/tugofwar/logic';

describe('tug of war logic', () => {
  it('starts at the centre with no winner and full energy', () => {
    const s = createState();
    expect(s.pos).toBe(0);
    expect(s.energy).toEqual([1, 1]);
    expect(winner(s)).toBeNull();
  });

  it('a tap pulls toward the tapping player', () => {
    const s = createState();
    tap(s, 0, 1000);
    expect(s.pos).toBeLessThan(0);
    expect(s.pos).toBeCloseTo(-P.pullPerTap, 3);
    const before = s.pos;
    tap(s, 1, 1000);
    expect(s.pos).toBeGreaterThan(before);
  });

  it('reaching an end wins and clamps', () => {
    const s = createState();
    let w: 0 | 1 | null = null;
    for (let i = 0; i < 400 && w === null; i++) {
      advance(s, 150); // a relaxed pace: full energy
      w = tap(s, 1, i * 150);
    }
    expect(w).toBe(1);
    expect(s.pos).toBe(1);
    tap(s, 0, 99999);
    expect(s.pos).toBe(1); // frozen after the win
  });

  it('ignores taps faster than the minimum gap, per player', () => {
    const s = createState();
    tap(s, 0, 1000);
    const p1 = s.pos;
    tap(s, 0, 1000 + P.minTapGapMs - 1);
    expect(s.pos).toBe(p1);
    tap(s, 1, 1001); // other player unaffected
    expect(s.pos).toBeGreaterThan(p1);
  });

  it('reset recentres and refills', () => {
    const s = createState();
    tap(s, 0, 1000);
    grabToken(s, 1);
    advance(s, 500);
    reset(s);
    expect(s.pos).toBe(0);
    expect(s.elapsed).toBe(0);
    expect(isBoosted(s, 1)).toBe(false);
    tap(s, 0, 0);
    expect(s.pos).toBeLessThan(0);
  });

  it('maps pos to screen x', () => {
    expect(markerX(-1, 300, 1000)).toBe(300);
    expect(markerX(0, 300, 1000)).toBe(800);
    expect(markerX(1, 300, 1000)).toBe(1300);
  });

  describe('stamina', () => {
    it('a steady 5 taps/s never loses power; mashing at 12 taps/s does, but never to zero', () => {
      const run = (perSec: number, seconds: number): { pulled: number; energy: number } => {
        const s = createState();
        const gap = 1000 / perSec;
        let pulled = 0;
        for (let t = 0; t < seconds * 1000; t += gap) {
          advance(s, gap);
          const before = s.pos;
          tap(s, 1, t + 100000);
          pulled += s.pos - before;
          s.pos = 0; // keep it centred: only the power is measured
          s.lastTap[1] = -Infinity;
        }
        return { pulled, energy: s.energy[1] };
      };
      const calm = run(5, 10);
      expect(calm.energy).toBeGreaterThan(0.9);
      expect(calm.pulled / (5 * 10)).toBeCloseTo(P.pullPerTap, 3);
      const mash = run(12, 10);
      expect(mash.energy).toBeLessThan(0.3);
      const perTap = mash.pulled / (12 * 10);
      expect(perTap).toBeLessThan(P.pullPerTap * 0.8);
      expect(perTap).toBeGreaterThan(P.pullPerTap * P.floorPower * 0.95); // never below the floor
      expect(mash.pulled).toBeGreaterThan(calm.pulled); // mashing still beats a calm pace, just much less than 12/5 times
      expect(mash.pulled).toBeLessThan(calm.pulled * 1.9);
    });

    it('power fades with energy but stays above the floor', () => {
      expect(powerOf(1)).toBe(1);
      expect(powerOf(P.softEnergy)).toBe(1);
      expect(powerOf(0)).toBe(P.floorPower);
      expect(powerOf(P.softEnergy / 2)).toBeGreaterThan(P.floorPower);
    });

    it('energy refills while resting', () => {
      const s = createState();
      s.energy = [0, 0.5];
      advance(s, 1000);
      expect(s.energy[0]).toBeCloseTo(P.regenPerSec);
      advance(s, 5000);
      expect(s.energy).toEqual([1, 1]);
    });
  });

  describe('surge and rubber band', () => {
    it('surge is 1 until it starts, then grows to the maximum', () => {
      expect(surge(0)).toBe(1);
      expect(surge(P.surgeStartMs)).toBe(1);
      expect(surge(P.surgeStartMs + P.surgeRampMs / 2)).toBeCloseTo((1 + P.surgeMax) / 2);
      expect(surge(1e9)).toBe(P.surgeMax);
    });

    it('a late tap pulls much more than an early one', () => {
      const early = createState();
      tap(early, 1, 1000);
      const late = createState();
      late.elapsed = P.surgeStartMs + P.surgeRampMs;
      tap(late, 1, 1000);
      expect(late.pos).toBeGreaterThan(early.pos * 3);
    });

    it('the leader pulls a little weaker and the trailing player a little stronger; it fades with the surge', () => {
      const s = createState();
      s.pos = 0.8; // marker near player 1's end: player 1 leads
      expect(band(s, 1)).toBeLessThan(1);
      expect(band(s, 0)).toBeGreaterThan(1);
      expect(band(createState(), 0)).toBe(1);
      s.elapsed = P.surgeStartMs + P.surgeRampMs;
      expect(band(s, 1)).toBe(1);
    });

    it('a dead-even tug still ends within about a minute and a half', () => {
      const s = createState();
      let t = 0;
      const rnd = mulberry32(5);
      while (winner(s) === null && t < 150000) {
        t += 100;
        advance(s, 100);
        // both tap 5 per second with a bit of noise
        if (rnd() < 0.5) tap(s, 0, t);
        if (rnd() < 0.5) tap(s, 1, t);
      }
      expect(winner(s)).not.toBeNull();
    });
  });

  describe('power tokens', () => {
    it('a token pulls instantly, refills energy and boosts for a few seconds', () => {
      const s = createState();
      s.energy = [0.1, 1];
      grabToken(s, 0);
      expect(s.pos).toBeCloseTo(-P.tokenPull);
      expect(s.energy[0]).toBe(1);
      expect(isBoosted(s, 0)).toBe(true);
      expect(isBoosted(s, 1)).toBe(false);
      const boosted = createState();
      grabToken(boosted, 1);
      boosted.pos = 0;
      tap(boosted, 1, 5000);
      const plain = createState();
      tap(plain, 1, 5000);
      expect(boosted.pos).toBeCloseTo(plain.pos * P.boostPower, 5);
      advance(boosted, P.boostMs + 1);
      expect(isBoosted(boosted, 1)).toBe(false);
    });

    it('the schedule is seeded, alternates above / below the rope and stays in the area', () => {
      const a = makeTokenSchedule(4, 10, 8000, 3000);
      expect(makeTokenSchedule(4, 10, 8000, 3000)).toEqual(a);
      expect(makeTokenSchedule(5, 10, 8000, 3000)).not.toEqual(a);
      expect(a[0].at).toBeGreaterThan(TUGOFWAR.tokenFirstMs - TUGOFWAR.tokenJitterMs);
      for (let i = 0; i < a.length; i++) {
        expect(a[i].x).toBeGreaterThanOrEqual(TOKEN_AREA.x0);
        expect(a[i].x).toBeLessThanOrEqual(TOKEN_AREA.x1);
        if (i > 0) {
          expect(a[i].at).toBeGreaterThan(a[i - 1].at + a[i - 1].life); // one at a time
          expect(a[i].y < 540).not.toBe(a[i - 1].y < 540);
        }
      }
    });
  });

  it('later rounds are harder: shorter tokens, more of them, a heavier rope, slower refill; the last row repeats', () => {
    const r1 = roundParams(1);
    const r4 = roundParams(4);
    expect(r4.pullPerTap).toBeLessThan(r1.pullPerTap);
    expect(r4.regenPerSec).toBeLessThan(r1.regenPerSec);
    expect(roundParams(9)).toEqual(r4);
    const t1 = roundTokens(1, 1);
    const t4 = roundTokens(1, 4);
    expect(t4[0].life).toBeLessThan(t1[0].life);
    expect(t4[1].at - t4[0].at).toBeLessThan(t1[1].at - t1[0].at + 1);
    expect(Math.min(...ROUND_RAMP.tokenLifeMs)).toBeGreaterThanOrEqual(2000); // still easy to grab
    expect(r4.pullPerTap / r1.pullPerTap).toBeGreaterThan(0.7);
  });
});

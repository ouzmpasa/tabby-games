import { describe, expect, it } from 'vitest';
import { ROUNDS, roundRules, SAFECRACKER as C } from '../../src/games/safecracker/config';
import {
  activeDecoy, angDiff, createSafe, DECOY_MAX_HEAT, falloffAt, heat, heatColor, inDecoyZone, inZone, isOpen, lockTimeLeft, makeDirs, makePlans,
  mulberry32, normDeg, paramsForRound, rerollLock, roundNotes, stepDial, tickIntervalMs, tickSafe, turnDial, wrongWay, DEFAULT_PARAMS as P,
} from '../../src/games/safecracker/logic';

describe('angle maths', () => {
  it('wraps and takes the shortest signed difference', () => {
    expect(normDeg(-10)).toBe(350);
    expect(normDeg(725)).toBe(5);
    expect(angDiff(350, 10)).toBe(-20);
    expect(angDiff(10, 350)).toBe(20);
    expect(Math.abs(angDiff(180, 0))).toBe(180);
    expect(angDiff(370, 10)).toBe(0);
  });
});

describe('plans', () => {
  it('are seedable, fair (same travel) and differ per player', () => {
    const a = makePlans(mulberry32(3));
    const b = makePlans(mulberry32(3));
    expect(a).toEqual(b);
    const [p0, p1] = a;
    expect(p0.secrets).toHaveLength(P.locks);
    expect(p0.secrets).not.toEqual(p1.secrets);
    expect(p0.dirs).toEqual([1, -1, 1]);
    const travel = (pl: typeof p0) => pl.secrets.map((s, i) => Math.abs(angDiff(s, i === 0 ? pl.start : pl.secrets[i - 1])));
    travel(p0).forEach((t, i) => expect(t).toBeCloseTo(travel(p1)[i], 6));
  });
  it('keeps travel between locks long enough not to click by accident, and the sweet spot shrinks', () => {
    for (let seed = 1; seed < 60; seed++) {
      const [pl] = makePlans(mulberry32(seed));
      pl.secrets.forEach((s, i) => {
        const prev = i === 0 ? pl.start : pl.secrets[i - 1];
        const d = Math.abs(angDiff(s, prev));
        expect(d).toBeGreaterThanOrEqual(P.minTravelDeg - 1e-6);
      });
    }
    const [pl] = makePlans(mulberry32(1));
    expect(pl.tols[2]).toBeLessThan(pl.tols[0]);
    expect(pl.tols[2]).toBeGreaterThanOrEqual(5);
  });
});

describe('hot / cold', () => {
  const mk = () => createSafe({ start: 0, secrets: [100, 20, 200], dirs: [1, -1, 1], tols: [9, 7, 5] });
  it('rises as the dial nears the secret, 1 inside the spot, across the 360 wrap', () => {
    const s = mk();
    const hs = [280, 200, 150, 95].map((a) => ((s.angle = a), heat(s)));
    expect(hs[0]).toBe(0);
    for (let i = 1; i < hs.length; i++) expect(hs[i]).toBeGreaterThan(hs[i - 1]);
    s.angle = 100 + 360 * 3;
    s.dir = 1;
    expect(heat(s)).toBe(1);
    const t = createSafe({ start: 0, secrets: [359], dirs: [1], tols: [9] });
    t.angle = 2;
    t.dir = 1;
    expect(inZone(t)).toBe(true);
  });
  it('colour goes blue -> yellow -> orange -> green', () => {
    expect(heatColor(0)).toBe(0x3a6ff7);
    expect(heatColor(0.4)).toBe(0xffd84d);
    expect(heatColor(0.8)).toBe(0xff8a3d);
    expect(heatColor(1)).toBe(0x3ddc84);
  });
  it('ticks only when warm and speed up', () => {
    const f = (h: number) => tickIntervalMs(h, 0.3, 650, 85);
    expect(f(0.1)).toBeNull();
    expect(f(0.3)).toBe(650);
    expect(f(0.6)!).toBeLessThan(f(0.4)!);
    expect(f(1)).toBe(85);
  });
});

describe('lock state machine', () => {
  const plan = { start: 0, secrets: [100, 20, 200], dirs: [1, -1, 1] as (1 | -1)[], tols: [9, 7, 5] };
  const run = (s: ReturnType<typeof createSafe>, ms: number) => {
    let r = null as ReturnType<typeof tickSafe>;
    for (let t = 0; t < ms; t += 16) r = tickSafe(s, 16) ?? r;
    return r;
  };
  it('needs the hold time, and resets when the dial leaves', () => {
    const s = createSafe(plan);
    turnDial(s, 100);
    expect(run(s, P.holdMs - 100)).toBeNull();
    turnDial(s, -30); // slip out
    expect(run(s, 100)).toBeNull();
    expect(s.hold).toBe(0);
    turnDial(s, 30);
    expect(run(s, P.holdMs + 50)).toBe('click');
    expect(s.index).toBe(1);
  });
  it('second lock needs the opposite direction', () => {
    const s = createSafe(plan);
    turnDial(s, 100);
    run(s, 600);
    // next secret is 20, reached by going back (counter-clockwise): approaching clockwise from the other side is the wrong way
    turnDial(s, -160 + 360 - 360); // 100 -> -60 (=300)
    turnDial(s, 0);
    turnDial(s, 0);
    s.angle = 10; // slightly before 20 ...
    s.dir = 1; // ... arrived travelling clockwise
    expect(wrongWay(s)).toBe(false); // 10 is off by 10 > tol 7
    s.angle = 15;
    expect(wrongWay(s)).toBe(true);
    expect(run(s, 1000)).toBeNull();
    turnDial(s, -20); // turn the right way: past the secret, flips direction
    s.angle = 21;
    expect(wrongWay(s)).toBe(false);
    expect(run(s, 600)).toBe('click');
  });
  it('opens after the last lock', () => {
    const s = createSafe(plan);
    s.index = 2;
    s.angle = 201;
    s.dir = 1;
    expect(run(s, 600)).toBe('open');
    expect(isOpen(s)).toBe(true);
    turnDial(s, 50);
    expect(s.angle).toBe(201);
  });
  it('direction does not flip on finger jitter', () => {
    const s = createSafe(plan);
    turnDial(s, 50);
    turnDial(s, -5);
    turnDial(s, 4);
    expect(s.dir).toBe(1);
    turnDial(s, -30);
    expect(s.dir).toBe(-1);
  });
});

describe('rounds get harder', () => {
  it('more locks, narrower spots, less hint, longer hold, as the rounds go (never below 5 degrees, never frantic)', () => {
    expect(ROUNDS.map((r) => r.locks).slice(0, 4)).toEqual([3, 4, 5, 6]);
    for (let i = 1; i < ROUNDS.length; i++) {
      const a = ROUNDS[i - 1];
      const b = ROUNDS[i];
      expect(b.locks).toBeGreaterThanOrEqual(a.locks);
      expect(b.holdMs).toBeGreaterThanOrEqual(a.holdMs);
      expect(b.decoys).toBeGreaterThanOrEqual(a.decoys);
      expect(b.inertiaMs).toBeGreaterThanOrEqual(a.inertiaMs);
      const sum = (x: readonly number[]) => x.reduce((m, n) => m + n, 0) / x.length;
      expect(sum(b.tolerancesDeg)).toBeLessThanOrEqual(sum(a.tolerancesDeg));
      expect(sum(b.heatFalloffDegs)).toBeLessThanOrEqual(sum(a.heatFalloffDegs));
    }
    for (const r of ROUNDS) {
      expect(Math.min(...r.tolerancesDeg)).toBeGreaterThanOrEqual(5);
      expect(r.lockTimeMs === 0 || r.lockTimeMs >= 20000).toBe(true);
      expect(r.holdMs).toBeLessThanOrEqual(1000);
      // later locks of a safe get less hint than earlier ones
      r.heatFalloffDegs.forEach((f, k) => k > 0 && expect(f).toBeLessThanOrEqual(r.heatFalloffDegs[k - 1]));
      expect(r.tolerancesDeg).toHaveLength(r.locks);
      expect(r.heatFalloffDegs).toHaveLength(r.locks);
    }
    expect(ROUNDS[0]).toMatchObject({ locks: 3, decoys: 0, inertiaMs: 0, lockTimeMs: 0 });
    expect(Math.max(...ROUNDS.map((r) => r.locks))).toBe(C.maxLocks);
    expect(roundRules(99)).toBe(ROUNDS[ROUNDS.length - 1]);
    expect(paramsForRound(2).locks).toBe(5);
    expect(paramsForRound(4).minTravelDeg).toBeGreaterThan(paramsForRound(0).minTravelDeg);
  });

  it('announces what is new', () => {
    expect(roundNotes(null, ROUNDS[0])).toEqual([]);
    expect(roundNotes(ROUNDS[0], ROUNDS[1])).toEqual(['locks', 'decoy']);
    expect(roundNotes(ROUNDS[1], ROUNDS[2])).toEqual(['locks', 'heavy', 'timer', 'dirs']);
    expect(roundNotes(ROUNDS[2], ROUNDS[3])).toEqual(['locks']);
    expect(roundNotes(ROUNDS[3], ROUNDS[4])).toEqual(['narrow', 'hint']);
  });

  it('plans honour the round: lock count, per-lock tolerances, same travel for both safes', () => {
    for (let r = 0; r < ROUNDS.length; r++) {
      const p = paramsForRound(r);
      const [a, b] = makePlans(mulberry32(r + 5), p);
      expect(a.secrets).toHaveLength(p.locks);
      expect(a.tols).toEqual([...ROUNDS[r].tolerancesDeg]);
      expect(a.travels).toEqual(b.travels);
      expect(a.dirs).toEqual(b.dirs);
      a.travels!.forEach((t) => {
        expect(t).toBeGreaterThanOrEqual(p.minTravelDeg);
        expect(t).toBeLessThanOrEqual(p.maxTravelDeg);
      });
    }
  });

  it('random directions never repeat three times and do flip', () => {
    for (let seed = 1; seed < 200; seed++) {
      const d = makeDirs(mulberry32(seed), 5, true);
      expect(d[0]).toBe(1);
      expect(d.some((x) => x === -1)).toBe(true);
      for (let i = 2; i < d.length; i++) expect(d[i] === d[i - 1] && d[i] === d[i - 2]).toBe(false);
    }
    expect(makeDirs(mulberry32(1), 4, false)).toEqual([1, -1, 1, -1]);
  });
});

describe('hint window', () => {
  it('the glow reaches less far on later (narrower falloff) locks', () => {
    const p = paramsForRound(2);
    const mk = (index: number) => {
      const s = createSafe({ start: 0, secrets: [100, 200, 300, 40, 140], dirs: [1, 1, -1, 1, -1], tols: [8, 7, 6, 5, 5] });
      s.index = index;
      return s;
    };
    const heatAt = (index: number, off: number) => {
      const s = mk(index);
      s.angle = s.plan.secrets[index] - off;
      return heat(s, p);
    };
    expect(falloffAt(p, 0)).toBeGreaterThan(falloffAt(p, 4));
    expect(heatAt(0, 60)).toBeGreaterThan(0.3); // first lock: warm 60 degrees away
    expect(heatAt(4, 60)).toBe(0); // last lock: stone cold 60 degrees away
    expect(heatAt(4, 20)).toBeGreaterThan(0.3);
  });
});

describe('decoy (fake click)', () => {
  const p = { ...P, decoys: 1 };
  const plan = { start: 0, secrets: [100, 220], dirs: [1, 1] as (1 | -1)[], tols: [8, 8], decoys: [null, 160] as (number | null)[] };
  const run = (s: ReturnType<typeof createSafe>, ms: number) => {
    let r = null as ReturnType<typeof tickSafe>;
    for (let t = 0; t < ms; t += 16) r = tickSafe(s, 16, p) ?? r;
    return r;
  };

  it('glows and ticks like a hot spot but never green, and needs a full hold to reveal itself', () => {
    const s = createSafe(plan);
    s.index = 1;
    s.angle = 160;
    s.dir = 1;
    expect(activeDecoy(s)).toBe(160);
    expect(inDecoyZone(s)).toBe(true);
    expect(heat(s, p)).toBe(DECOY_MAX_HEAT);
    expect(heat(s, p)).toBeLessThan(1);
    expect(run(s, p.holdMs - 100)).toBeNull();
    expect(s.index).toBe(1);
    expect(run(s, 200)).toBe('fake');
    expect(s.index).toBe(1); // the lock did not open
    expect(activeDecoy(s)).toBeNull(); // and the decoy is gone for good
    expect(s.jam).toBeGreaterThan(0);
    expect(heat(s, p)).toBeLessThan(DECOY_MAX_HEAT);
  });

  it('sweeping through a decoy without stopping is harmless; leaving resets the hold', () => {
    const s = createSafe(plan);
    s.index = 1;
    s.dir = 1;
    s.angle = 160;
    run(s, 300);
    s.angle = 190;
    run(s, 100);
    expect(s.decoyHold).toBe(0);
    s.angle = 160;
    expect(run(s, p.holdMs - 100)).toBeNull();
  });

  it('the dial sticks while jammed, then moves again', () => {
    const s = createSafe(plan);
    s.index = 1;
    s.angle = 160;
    s.dir = 1;
    run(s, p.holdMs + 50);
    const a = s.angle;
    turnDial(s, 30, p);
    expect(s.angle).toBe(a);
    run(s, C.jamMs + 50);
    turnDial(s, 30, p);
    expect(s.angle).toBe(a + 30);
  });

  it('makePlans puts decoys on later locks only, on the way to the spot, far from it', () => {
    for (let seed = 1; seed < 100; seed++) {
      const pr = { ...P, locks: 5, decoys: 3, tolerancesDeg: [8, 7, 6, 5, 5] };
      const [a, b] = makePlans(mulberry32(seed), pr);
      expect(a.decoys![0]).toBeNull();
      expect(a.decoys!.filter((d) => d !== null)).toHaveLength(3);
      expect(a.decoyFracs).toEqual(b.decoyFracs);
      a.decoys!.forEach((d, i) => {
        if (d === null) return;
        const gap = Math.abs(angDiff(d, a.secrets[i]));
        expect(gap).toBeGreaterThan(a.tols[i] * 3);
      });
    }
  });
});

describe('heavy dial and lock timer', () => {
  it('a heavy dial lags behind the finger and catches up', () => {
    const p = { ...P, inertiaMs: 100 };
    const s = createSafe({ start: 0, secrets: [100], dirs: [1], tols: [9] });
    turnDial(s, 40, p);
    expect(s.angle).toBe(0);
    expect(s.target).toBe(40);
    stepDial(s, 100, p);
    expect(s.angle).toBeGreaterThan(20);
    expect(s.angle).toBeLessThan(40);
    for (let i = 0; i < 60; i++) stepDial(s, 16, p);
    expect(s.angle).toBeCloseTo(40, 1);
    expect(s.dir).toBe(1);
  });

  it('without inertia the dial follows exactly', () => {
    const s = createSafe({ start: 5, secrets: [100], dirs: [1], tols: [9] });
    turnDial(s, 40);
    expect(s.angle).toBe(45);
    stepDial(s, 16);
    expect(s.angle).toBe(45);
  });

  it('the lock timer runs only while the dial is cold, resets only that lock, and keeps open locks open', () => {
    const p = { ...P, lockTimeMs: 20000, heatFalloffDeg: [80, 80, 80] };
    const rng = mulberry32(7);
    const [plan] = makePlans(rng, { ...p, locks: 3, tolerancesDeg: [9, 9, 9] });
    const s = createSafe(plan);
    s.index = 1; // first lock already open
    s.angle = plan.secrets[1] + 180; // stone cold
    for (let t = 0; t < 10000; t += 100) expect(tickSafe(s, 100, p)).toBeNull();
    expect(lockTimeLeft(s, p)).toBeCloseTo(0.5, 2);
    // warm: the clock stands still
    s.angle = plan.secrets[1] - 12; // close: heat well above the pause threshold
    const before = s.lockMs;
    for (let t = 0; t < 5000; t += 100) tickSafe(s, 100, p);
    expect(s.lockMs).toBe(before);
    // cold again until time runs out
    s.angle = plan.secrets[1] + 180;
    let res = null as ReturnType<typeof tickSafe>;
    for (let t = 0; t < 12000 && res !== 'reset'; t += 100) res = tickSafe(s, 100, p);
    expect(res).toBe('reset');
    const old1 = plan.secrets[1];
    const old2 = plan.secrets[2];
    const first = plan.secrets[0];
    rerollLock(s, rng, p);
    expect(s.index).toBe(1); // still on lock 2, lock 1 stays open
    expect(plan.secrets[0]).toBe(first);
    expect(plan.secrets[1]).not.toBe(old1);
    expect(plan.secrets[2]).not.toBe(old2);
    // the new spot lies the required way round from where the dial is now, a full travel away
    const gap = angDiff(plan.secrets[1], s.angle) * plan.dirs[1];
    expect(Math.abs(angDiff(plan.secrets[1], s.angle))).toBeGreaterThanOrEqual(P.minTravelDeg - 1e-6);
    expect(Math.abs(gap)).toBeLessThanOrEqual(180);
    expect(lockTimeLeft(s, p)).toBe(1);
  });

  it('no timer means no countdown value', () => {
    const s = createSafe({ start: 0, secrets: [100], dirs: [1], tols: [9] });
    expect(lockTimeLeft(s, P)).toBeNull();
  });
});

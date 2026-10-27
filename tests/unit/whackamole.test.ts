import { describe, expect, it } from 'vitest';
import { WHACKAMOLE as C } from '../../src/games/whackamole/config';
import { DEFAULT_PARAMS as P, activeCount, createSide, difficultyAt, mulberry32, pickHole, pointsFor, step, whack, type MoleKind } from '../../src/games/whackamole/logic';

const hole = (kind: MoleKind, hp = 1) => ({ kind, spawnedAt: 0, expiresAt: 100000, hp });

describe('whack-a-mole logic', () => {
  it('rng is seedable and repeatable', () => {
    const a = mulberry32(5);
    const b = mulberry32(5);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('difficulty ramps steadily over the whole match and then flattens', () => {
    const d0 = difficultyAt(0);
    const mid = difficultyAt(C.rampMs / 2);
    const dEnd = difficultyAt(C.rampMs * 3);
    expect(d0.upMs).toBe(C.upStartMs);
    expect(dEnd.upMs).toBe(C.upEndMs);
    expect(mid.upMs).toBeLessThan(d0.upMs);
    expect(dEnd.upMs).toBeLessThan(mid.upMs);
    expect(dEnd.gapMs).toBeLessThan(d0.gapMs);
    expect(dEnd.upMs).toBeGreaterThanOrEqual(900); // never too fast for a 5 year old
    expect(d0.maxActive).toBe(C.maxActiveStart);
    expect(dEnd.maxActive).toBe(C.maxActiveStart + C.moreMolesAfterMs.length);
    expect(dEnd.maxActive).toBeLessThanOrEqual(5);
    // the ramp is slow: it is still going at the end of a 2-minute match
    expect(difficultyAt(120000).upMs).toBeGreaterThan(difficultyAt(C.rampMs).upMs + 100);
  });

  it('decoys and bosses only arrive later in the match, decoys get more likely', () => {
    expect(difficultyAt(C.decoyAfterMs - 1).decoyChance).toBe(0);
    expect(difficultyAt(C.decoyAfterMs).decoyChance).toBeGreaterThan(0);
    expect(difficultyAt(C.decoyAfterMs + C.decoyRampMs).decoyChance).toBeCloseTo(C.decoyChanceMax);
    expect(difficultyAt(C.decoyAfterMs + C.decoyRampMs).decoyChance).toBeLessThanOrEqual(0.25); // mostly real moles
    expect(difficultyAt(C.bossAfterMs - 1).bossOn).toBe(false);
    expect(difficultyAt(C.bossAfterMs).bossOn).toBe(true);
  });

  it('spawns nothing before the first spawn time, then a mole in a free hole', () => {
    const s = createSide(9);
    const rng = mulberry32(1);
    expect(step(s, 100, rng).spawned).toHaveLength(0);
    const r = step(s, C.firstSpawnMs, rng);
    expect(r.spawned).toHaveLength(1);
    expect(s.holes[r.spawned[0].hole]).not.toBeNull();
    expect(r.spawned[0].kind).toBe('normal'); // early on it is only ever plain or golden moles
  });

  it('never exceeds maxActive and moles expire', () => {
    const s = createSide(9);
    const rng = mulberry32(2);
    let max = 0;
    for (let t = 0; t < 20000; t += 50) {
      step(s, t, rng);
      max = Math.max(max, activeCount(s));
    }
    expect(max).toBeLessThanOrEqual(C.maxActiveStart);
    expect(max).toBeGreaterThan(0);
    // late in the match busier
    const late = createSide(9, 0, Infinity);
    let lateMax = 0;
    for (let t = 150000; t < 180000; t += 50) {
      step(late, t, rng);
      lateMax = Math.max(lateMax, activeCount(late));
    }
    expect(lateMax).toBeGreaterThanOrEqual(C.maxActiveStart);
    expect(difficultyAt(150000).maxActive).toBeGreaterThan(C.maxActiveStart);
    expect(lateMax).toBeLessThanOrEqual(C.maxActiveStart + C.moreMolesAfterMs.length);
  });

  it('expired moles are reported', () => {
    const s = createSide(4, 0);
    const rng = mulberry32(3);
    const sp = step(s, 0, rng).spawned[0];
    const r = step(s, sp.upMs + 1, rng);
    expect(r.expired).toContain(sp.hole);
  });

  it('does not respawn in the same hole straight away', () => {
    const s = createSide(9, 0);
    const rng = mulberry32(4);
    let last = -1;
    for (let t = 0; t < 60000; t += 40) {
      const r = step(s, t, rng);
      for (const sp of r.spawned) {
        expect(sp.hole).not.toBe(last);
        last = sp.hole;
      }
    }
  });

  it('golden moles stay up shorter than normal ones', () => {
    const g = createSide(4, 0);
    const sp = step(g, 0, mulberry32(1), { ...P, goldenChance: 1 }).spawned[0];
    const n = createSide(4, 0);
    const sn = step(n, 0, mulberry32(1), { ...P, goldenChance: 0 }).spawned[0];
    expect(sp.kind).toBe('golden');
    expect(sn.kind).toBe('normal');
    expect(sp.upMs).toBeCloseTo(sn.upMs * C.goldenUpFactor);
  });

  describe('whacking', () => {
    it('whacking an empty hole does nothing (no penalty); whacking a mole scores and removes it', () => {
      const s = createSide(4, 0);
      expect(whack(s, 0, 0)).toEqual({ kind: 'none' });
      s.holes[1] = hole('normal');
      const r = whack(s, 1, 100);
      expect(r.kind).toBe('score');
      expect(r.kind === 'score' && r.points).toBe(1);
      expect(s.holes[1]).toBeNull();
      expect(whack(s, 1, 100).kind).toBe('none');
    });

    it('points: normal 1, golden 3, boss 5, friend 0', () => {
      expect(pointsFor('normal')).toBe(1);
      expect(pointsFor('golden')).toBe(3);
      expect(pointsFor('boss')).toBe(5);
      expect(pointsFor('friend')).toBe(0);
    });

    it('a friendly bunny stuns for a moment but never costs points, and the stun ends', () => {
      const s = createSide(4, 0);
      s.holes[0] = hole('friend');
      s.holes[1] = hole('normal');
      const r = whack(s, 0, 1000);
      expect(r.kind).toBe('friend');
      expect(s.holes[0]).toBeNull();
      expect(whack(s, 1, 1000 + P.stunMs - 1).kind).toBe('stunned');
      expect(s.holes[1]).not.toBeNull(); // the mole is still there
      expect(whack(s, 1, 1000 + P.stunMs).kind).toBe('score');
      expect(P.stunMs).toBeLessThanOrEqual(1200); // a short stun, not a punishment
    });

    it('a boss needs several hits, then pays out and is due again later', () => {
      const s = createSide(4, 0);
      s.holes[2] = hole('boss', P.bossHp);
      for (let k = P.bossHp - 1; k >= 1; k--) {
        const r = whack(s, 2, 1000);
        expect(r.kind).toBe('bossHit');
        expect(r.kind === 'bossHit' && r.hpLeft).toBe(k);
        expect(s.holes[2]).not.toBeNull();
      }
      const last = whack(s, 2, 1500);
      expect(last.kind === 'score' && last.points).toBe(C.bossPoints);
      expect(s.holes[2]).toBeNull();
      expect(s.nextBossAt).toBe(1500 + P.bossEveryMs);
    });
  });

  describe('spawn mix', () => {
    const count = (from: number, to: number, seed: number) => {
      const s = createSide(9, from, from);
      const rng = mulberry32(seed);
      const n: Record<MoleKind, number> = { normal: 0, golden: 0, friend: 0, boss: 0 };
      for (let t = from; t < to; t += 40) for (const sp of step(s, t, rng).spawned) n[sp.kind]++;
      return n;
    };

    it('late in the match there are bunnies and bosses, but real moles stay the majority', () => {
      const n = count(150000, 330000, 7);
      expect(n.friend).toBeGreaterThan(0);
      expect(n.boss).toBeGreaterThan(3);
      expect(n.normal + n.golden).toBeGreaterThan((n.friend + n.boss) * 3);
      expect(n.golden).toBeLessThan(n.normal);
    });

    it('never two bunnies or two bosses at once on a side', () => {
      const s = createSide(9, 0, 0);
      const rng = mulberry32(8);
      for (let t = 100000; t < 300000; t += 40) {
        step(s, t, rng);
        const kinds = s.holes.filter(Boolean).map((m) => m!.kind);
        expect(kinds.filter((k) => k === 'friend').length).toBeLessThanOrEqual(1);
        expect(kinds.filter((k) => k === 'boss').length).toBeLessThanOrEqual(1);
      }
    });

    it('a boss that escapes comes back after bossEveryMs; the boss stays up for bossUpMs', () => {
      const s = createSide(9, 0, 0);
      const rng = mulberry32(1);
      const sp = step(s, 70000, rng, P).spawned[0];
      expect(sp.kind).toBe('boss');
      expect(sp.upMs).toBe(P.bossUpMs);
      step(s, 70000 + P.bossUpMs + 1, rng, P);
      expect(s.nextBossAt).toBe(70000 + P.bossUpMs + 1 + P.bossEveryMs);
    });
  });

  it('both sides get the same spawn rate', () => {
    const count = (seed: number) => {
      const s = createSide(9);
      const rng = mulberry32(seed);
      let n = 0;
      for (let t = 0; t < 60000; t += 50) n += step(s, t, rng).spawned.length;
      return n;
    };
    expect(Math.abs(count(11) - count(12))).toBeLessThanOrEqual(8);
  });

  it('pickHole picks the nearest occupied hole within the radius', () => {
    const s = createSide(3, 0);
    const centres = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 400, y: 0 }];
    s.holes[1] = hole('normal');
    s.holes[2] = hole('normal');
    expect(pickHole(s, centres, 20, 0, 150)).toBe(-1);
    expect(pickHole(s, centres, 120, 0, 150)).toBe(1);
    expect(pickHole(s, centres, 330, 0, 150)).toBe(2);
    expect(pickHole(s, centres, 200, 400, 150)).toBe(-1);
  });
});

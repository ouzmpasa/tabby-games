import { describe, expect, it } from 'vitest';
import { W } from '../../src/core/layout';
import {
  DEFAULT_PARAMS as P,
  angleFromElevation,
  cannonPos,
  computeAim,
  cueDotsFor,
  dotsAlong,
  generateHill,
  hillHeightAt,
  isPassable,
  levelOfRound,
  muzzlePos,
  roundParams,
  simulate,
  stepShell,
  swayOffset,
  windSteps,
  type Hill,
  type Shell,
} from '../../src/games/cannonduel/logic';

const hill: Hill = { x: W / 2, height: 300, halfWidth: 200 };

describe('cannon placement', () => {
  it('puts player 0 on the left and player 1 on the right, on the same height', () => {
    expect(cannonPos(0).x).toBeLessThan(W / 2);
    expect(cannonPos(1).x).toBeGreaterThan(W / 2);
    expect(cannonPos(0).y).toBe(cannonPos(1).y);
  });
  it('muzzle is one barrel length from the pivot along the angle', () => {
    const a = angleFromElevation(1, 60);
    const m = muzzlePos(1, a);
    expect(Math.hypot(m.x - cannonPos(1).x, m.y - cannonPos(1).y)).toBeCloseTo(P.barrelLength);
    expect(m.x).toBeLessThan(cannonPos(1).x);
    expect(m.y).toBeLessThan(cannonPos(1).y);
  });
});

describe('hill', () => {
  it('is a smooth bump: full height at the centre, zero outside', () => {
    expect(hillHeightAt(hill, hill.x)).toBeCloseTo(300);
    expect(hillHeightAt(hill, hill.x + 200)).toBe(0);
    expect(hillHeightAt(hill, hill.x - 500)).toBe(0);
    expect(hillHeightAt(hill, hill.x + 100)).toBeCloseTo(150);
  });
  it('generated hills are within range and always passable by a lob', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 40; i++) {
      const h = generateHill(rand);
      expect(h.height).toBeGreaterThanOrEqual(P.hillMinHeight);
      expect(h.height).toBeLessThanOrEqual(P.hillMaxHeight);
      expect(Math.abs(h.x - W / 2)).toBeLessThanOrEqual(P.hillMaxOffset);
      expect(isPassable(h)).toBe(true);
    }
  });
  it('the tallest, widest hill is still passable', () => {
    expect(isPassable({ x: W / 2, height: P.hillMaxHeight, halfWidth: P.hillMaxHalfWidth })).toBe(true);
  });
});

describe('aim', () => {
  it('ignores short pulls', () => {
    expect(computeAim(0, { x: 10, y: -10 })).toBeNull();
  });
  it('pull down-left shoots up-right for player 0, down-right pull shoots up-left for player 1', () => {
    const a = computeAim(0, { x: 150, y: -150 })!;
    expect(a.vx).toBeGreaterThan(0);
    expect(a.vy).toBeLessThan(0);
    const b = computeAim(1, { x: -150, y: -150 })!;
    expect(b.vx).toBeLessThan(0);
    expect(b.vy).toBeLessThan(0);
  });
  it('speed scales with the pull and is clamped', () => {
    const s1 = computeAim(0, { x: 100, y: -100 })!.speed;
    const s2 = computeAim(0, { x: 150, y: -150 })!.speed;
    expect(s2).toBeGreaterThan(s1);
    const big = computeAim(0, { x: 5000, y: -5000 })!;
    expect(big.speed).toBe(P.maxSpeed);
    expect(big.power).toBe(1);
  });
  it('clamps elevation so the barrel never points backwards or into the ground', () => {
    const back = computeAim(0, { x: -200, y: -100 })!; // pulled the wrong way
    expect(back.vx).toBeGreaterThan(0);
    const flat = computeAim(0, { x: 200, y: 200 })!; // pulled upward -> would shoot downward
    expect(flat.vy).toBeLessThan(0);
  });
});

describe('ballistics', () => {
  it('follows a parabola under gravity', () => {
    const s: Shell = { x: 100, y: 100, vx: 500, vy: -800, owner: 0 };
    const wide: Hill = { x: -5000, height: 0, halfWidth: 1 };
    stepShell(s, 1000, wide); // 1 s, no impact (in the air)
    expect(s.x).toBeCloseTo(600, 0);
    expect(Math.abs(s.y - (100 - 800 + 0.5 * P.gravity))).toBeLessThan(10); // semi-implicit Euler
  });
  it('lands on the ground', () => {
    const a = angleFromElevation(0, 45);
    const path = simulate(0, a, 900, { x: -5000, height: 0, halfWidth: 1 });
    expect(path.hit).toBe('ground');
    expect(path.end.y).toBeCloseTo(P.groundY, 3);
    expect(path.end.x).toBeGreaterThan(cannonPos(0).x);
  });
  it('a flat shot is stopped by the hill', () => {
    const path = simulate(0, angleFromElevation(0, 15), 1300, hill);
    expect(path.hit).toBe('hill');
    expect(path.end.x).toBeLessThan(hill.x);
  });
  it('a high lob clears the hill and hits the other cannon', () => {
    // find a speed that works at 60 degrees
    let found = false;
    for (let v = 800; v <= P.maxSpeed && !found; v += 10) found = simulate(0, angleFromElevation(0, 60), v, hill).hit === 'cannon';
    expect(found).toBe(true);
  });
  it('does not hit its own cannon but does hit the enemy one (generous radius)', () => {
    const own: Shell = { x: cannonPos(0).x, y: cannonPos(0).y, vx: 0, vy: 0, owner: 0 };
    expect(stepShell(own, 8, hill).impact).toBeNull();
    const c1 = cannonPos(1);
    const near: Shell = { x: c1.x - P.hitRadius + 10, y: c1.y, vx: 0, vy: 0, owner: 0 };
    expect(stepShell(near, 8, hill)).toEqual({ impact: 'cannon', victim: 1 });
  });
  it('wind pushes the shell sideways', () => {
    const w = { ...P, wind: 400 };
    const a = angleFromElevation(0, 60);
    const calm = simulate(0, a, 1000, { x: -5000, height: 0, halfWidth: 1 });
    const windy = simulate(0, a, 1000, { x: -5000, height: 0, halfWidth: 1 }, w);
    expect(windy.end.x).toBeGreaterThan(calm.end.x);
  });
});

describe('preview dots', () => {
  it('are spaced about `gap` apart', () => {
    const pts = Array.from({ length: 101 }, (_, i) => ({ x: i * 10, y: 0 }));
    const d = dotsAlong(pts, 100);
    expect(d.length).toBe(10);
    expect(d[1].x - d[0].x).toBeCloseTo(100);
  });
});


describe('difficulty ladder', () => {
  const last = P.levels.length - 1;
  it('goes up every roundsPerLevel rounds and stops at the last row', () => {
    expect(levelOfRound(0)).toBe(0);
    expect(levelOfRound(P.roundsPerLevel - 1)).toBe(0);
    expect(levelOfRound(P.roundsPerLevel)).toBe(1);
    expect(levelOfRound(9999)).toBe(last);
  });
  it('every level has a smaller blast radius, longer reloads and no weaker wind', () => {
    for (let i = 1; i <= last; i++) {
      expect(P.levels[i].hitRadius).toBeLessThan(P.levels[i - 1].hitRadius);
      expect(P.levels[i].reloadMin).toBeGreaterThan(P.levels[i - 1].reloadMin);
      expect(P.levels[i].reloadMax).toBeGreaterThan(P.levels[i - 1].reloadMax);
      expect(P.levels[i].windMax).toBeGreaterThanOrEqual(P.levels[i - 1].windMax);
      expect(P.levels[i].sway).toBeGreaterThanOrEqual(P.levels[i - 1].sway);
    }
    expect(P.levels[0].hitRadius).toBe(P.hitRadius);
    expect(P.levels[0].windMax).toBe(0);
    expect(P.levels[0].sway).toBe(0);
  });
  it('a round draws wind, reload and cannon distance inside the level\'s ranges', () => {
    let seed = 3;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const winds = new Set<number>();
    for (let lvl = 0; lvl <= last; lvl++) {
      const row = P.levels[lvl];
      for (let i = 0; i < 60; i++) {
        const rp = roundParams(lvl, rand);
        expect(Math.abs(rp.wind)).toBeLessThanOrEqual(row.windMax + 1e-6);
        if (row.windMax > 0) expect(Math.abs(rp.wind)).toBeGreaterThanOrEqual(row.windMax * 0.4 - 1e-6);
        expect(rp.reloadMs).toBeGreaterThanOrEqual(row.reloadMin);
        expect(rp.reloadMs).toBeLessThanOrEqual(row.reloadMax);
        expect(rp.cannonInset).toBeGreaterThanOrEqual(P.cannonInset);
        expect(rp.cannonInset).toBeLessThanOrEqual(Math.max(P.cannonInset, row.insetMax));
        expect(rp.hitRadius).toBe(row.hitRadius);
        winds.add(Math.sign(rp.wind));
      }
    }
    expect(winds.has(-1) && winds.has(1)).toBe(true);
  });
  it('every round on every level still has a lob over its hill', () => {
    let seed = 11;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let lvl = 0; lvl <= last; lvl++) {
      for (let i = 0; i < 6; i++) {
        const rp = roundParams(lvl, rand);
        const h = generateHill(rand, rp);
        expect(h.height).toBeLessThanOrEqual(rp.hillMaxHeight);
        expect(isPassable(h, rp)).toBe(true);
      }
    }
  });
  it('the wind flag has 0..3 steps', () => {
    expect(windSteps(0)).toBe(0);
    const top = P.levels[last].windMax;
    expect(windSteps(top)).toBe(3);
    expect(windSteps(-top)).toBe(3);
    expect(windSteps(top * 0.2)).toBeGreaterThanOrEqual(1);
    expect(windSteps(top * 0.2)).toBeLessThan(3);
  });
});

describe('pull to power (no aids)', () => {
  it('speed grows linearly from minSpeed at minPull to maxSpeed at maxPull', () => {
    const lo = computeAim(0, { x: P.minPull + 0.1, y: 0 })!;
    const mid = computeAim(0, { x: (P.minPull + P.maxPull) / 2, y: 0 })!;
    const hi = computeAim(0, { x: P.maxPull + 50, y: 0 })!;
    expect(lo.speed).toBeCloseTo(P.minSpeed, 0);
    expect(mid.speed).toBeCloseTo((P.minSpeed + P.maxSpeed) / 2, 0);
    expect(hi.speed).toBe(P.maxSpeed);
    expect(hi.power).toBe(1);
  });
  it('reaching the other cannon takes a pull well inside the range (not a max pull)', () => {
    const rp = roundParams(0);
    let ok = false;
    for (let pull = P.minPull; pull <= P.maxPull && !ok; pull += 5) {
      const a = computeAim(0, { x: pull * Math.cos(0.78), y: -pull * Math.sin(0.78) })!;
      ok = simulate(0, a.angle, a.speed, { x: -5000, height: 0, halfWidth: 1 }, rp).hit === 'cannon';
    }
    expect(ok).toBe(true);
  });
  it('the two cue dots sit on the barrel line at fixed distances whatever the power', () => {
    const a = angleFromElevation(0, 40);
    const d = cueDotsFor(0, a);
    expect(d).toHaveLength(2);
    expect(Math.hypot(d[0].x - cannonPos(0).x, d[0].y - cannonPos(0).y)).toBeCloseTo(P.cueDots[0]);
    expect(Math.hypot(d[1].x - cannonPos(0).x, d[1].y - cannonPos(0).y)).toBeCloseTo(P.cueDots[1]);
  });
});

describe('swaying cannons', () => {
  const rp = { ...P, sway: 100 };
  it('rock in opposite phase within their amplitude; still when sway is 0', () => {
    for (let t = 0; t < 12000; t += 250) {
      expect(Math.abs(swayOffset(0, t, rp))).toBeLessThanOrEqual(100 + 1e-6);
      expect(swayOffset(0, t, rp)).toBeCloseTo(-swayOffset(1, t, rp), 6);
      expect(swayOffset(0, t, P)).toBe(0);
    }
  });
  it('a hit is judged against the cannon where it is now', () => {
    const c1 = cannonPos(1);
    const mk = (): Shell => ({ x: c1.x - P.hitRadius + 10, y: c1.y, vx: 0, vy: 0, owner: 0 });
    expect(stepShell(mk(), 8, hill, P, [0, 0]).impact).toBe('cannon');
    expect(stepShell(mk(), 8, hill, P, [0, 200]).impact).toBeNull(); // cannon swayed away to the right
    expect(stepShell(mk(), 8, hill, P, [0, -200]).impact).toBe('cannon');
  });
});

import { describe, expect, it } from 'vitest';
import { MARBLES } from '../../src/games/marbles/config';
import {
  aimFromPull,
  aliveCount,
  cfgForLevel,
  levelFor,
  placePegs,
  createWorld,
  freeze,
  isSettled,
  needsRefill,
  pickMarble,
  shoot,
  speedOf,
  stepWorld,
  travelDistance,
  type Marble,
  type World,
} from '../../src/games/marbles/logic';

const { centerX: CX, centerY: CY, marbleRadius: R } = MARBLES;
const lone = (x: number, y: number, owner: 0 | 1 = 0, id = 0): Marble => ({ id, owner, x, y, vx: 0, vy: 0, alive: true });
const run = (w: World, seconds: number) => {
  const outs: Marble[] = [];
  for (let t = 0; t < seconds; t += 1 / 60) outs.push(...stepWorld(w, 1 / 60).out);
  return outs;
};

describe('marbles logic', () => {
  it('starts with 3 non-overlapping marbles per side inside the arena, on their own halves', () => {
    const w = createWorld();
    expect(aliveCount(w, 0)).toBe(MARBLES.perPlayer);
    expect(aliveCount(w, 1)).toBe(MARBLES.perPlayer);
    for (const a of w.marbles) {
      expect(Math.hypot(a.x - CX, a.y - CY) + R).toBeLessThan(MARBLES.arenaRadius);
      expect(a.owner === 0 ? a.x < CX : a.x > CX).toBe(true);
      for (const b of w.marbles) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(2 * R);
    }
  });

  it('friction brings a marble to rest after about the predicted distance', () => {
    const w: World = { marbles: [lone(CX - 300, CY)] };
    shoot(w.marbles[0], { dirX: 1, dirY: 0, speed: 1000, power: 0.5 });
    run(w, 6);
    expect(isSettled(w)).toBe(true);
    const d = w.marbles[0].x - (CX - 300);
    expect(d).toBeGreaterThan(travelDistance(1000) * 0.9);
    expect(d).toBeLessThan(travelDistance(1000) * 1.05);
  });

  it('a head-on hit between equal marbles passes (almost) all the speed on', () => {
    const w: World = { marbles: [lone(CX - 100, CY, 0, 0), lone(CX, CY, 1, 1)] };
    w.marbles[0].vx = 800;
    const res = stepWorld(w, 1 / 60);
    for (let i = 0; i < 3; i++) stepWorld(w, 1 / 60);
    expect(w.marbles[1].vx).toBeGreaterThan(600);
    expect(Math.abs(w.marbles[0].vx)).toBeLessThan(120);
    expect(res.impact + 1).toBeGreaterThan(0);
  });

  it('momentum is conserved in an oblique hit and marbles are pushed apart', () => {
    const w: World = { marbles: [lone(CX - 100, CY - 40, 0, 0), lone(CX, CY, 1, 1)] };
    w.marbles[0].vx = 900;
    const p0 = 900;
    stepWorld(w, 1 / 60);
    const [a, b] = w.marbles;
    expect(a.vx + b.vx).toBeCloseTo(p0 * 0.99, -2);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(2 * R - 0.01);
  });

  it('separates marbles that overlap and rest', () => {
    const w: World = { marbles: [lone(CX, CY, 0, 0), lone(CX + 20, CY + 5, 1, 1)] };
    run(w, 0.2);
    expect(Math.hypot(w.marbles[0].x - w.marbles[1].x, w.marbles[0].y - w.marbles[1].y)).toBeGreaterThanOrEqual(2 * R - 0.01);
    expect(isSettled(w)).toBe(true);
  });

  it('even a capped, very fast shot cannot tunnel through a marble', () => {
    const w: World = { marbles: [lone(CX - 400, CY, 0, 0), lone(CX, CY, 1, 1)] };
    shoot(w.marbles[0], { dirX: 1, dirY: 0, speed: 99999, power: 1 });
    expect(speedOf(w.marbles[0])).toBeLessThanOrEqual(MARBLES.maxSpeed + 1e-6);
    run(w, 0.5);
    expect(w.marbles[1].x).toBeGreaterThan(CX + 50);
    expect(w.marbles[0].x).toBeLessThan(w.marbles[1].x);
  });

  it('a marble crossing the rim is out and reported once', () => {
    const w: World = { marbles: [lone(CX + MARBLES.arenaRadius - 20, CY, 1, 0)] };
    w.marbles[0].vx = 600;
    const outs = run(w, 1);
    expect(outs).toHaveLength(1);
    expect(w.marbles[0].alive).toBe(false);
  });

  it('a player knocking their own marble out leaves that side one short', () => {
    const w = createWorld();
    w.marbles[0].alive = false;
    expect(aliveCount(w, 0)).toBe(MARBLES.perPlayer - 1);
    expect(needsRefill(w)).toBe(false);
  });

  it('asks for a refill when a side is empty', () => {
    const w = createWorld();
    w.marbles.filter((m) => m.owner === 1).forEach((m) => (m.alive = false));
    expect(needsRefill(w)).toBe(true);
  });

  it('pull maps to direction and power; short pulls cancel', () => {
    expect(aimFromPull({ x: 10, y: 10 })).toBeNull();
    const weak = aimFromPull({ x: MARBLES.minPull + 1, y: 0 })!;
    const full = aimFromPull({ x: 0, y: -9999 })!;
    expect(weak.dirX).toBeCloseTo(1);
    expect(full.dirY).toBeCloseTo(-1);
    expect(full.power).toBe(1);
    expect(full.speed).toBe(MARBLES.maxShotSpeed);
    expect(weak.speed).toBeLessThan(full.speed);
  });

  it('picks the nearest of the player\'s own marbles only', () => {
    const w = createWorld();
    const m = pickMarble(w, 0, 0, 0)!;
    expect(m.owner).toBe(0);
    expect(pickMarble(w, 1, 0, 0)!.owner).toBe(1);
    w.marbles.filter((x) => x.owner === 0).forEach((x) => (x.alive = false));
    expect(pickMarble(w, 0, 0, 0)).toBeNull();
  });

  it('freeze stops everything so a shot can never stall the game', () => {
    const w = createWorld();
    w.marbles[0].vx = 500;
    freeze(w);
    expect(isSettled(w)).toBe(true);
  });
});


describe('difficulty ladder', () => {
  const last = MARBLES.levels.length - 1;
  it('follows the leader and is capped; each level has a smaller arena, slipperier floor and no fewer pegs', () => {
    expect(levelFor(0)).toBe(0);
    expect(levelFor(MARBLES.pointsPerLevel * 2)).toBe(2);
    expect(levelFor(999)).toBe(last);
    for (let i = 1; i <= last; i++) {
      expect(MARBLES.levels[i].arenaRadius).toBeLessThan(MARBLES.levels[i - 1].arenaRadius);
      expect(MARBLES.levels[i].damping).toBeLessThan(MARBLES.levels[i - 1].damping);
      expect(MARBLES.levels[i].pegs).toBeGreaterThanOrEqual(MARBLES.levels[i - 1].pegs);
    }
    expect(MARBLES.levels[0].arenaRadius).toBe(MARBLES.arenaRadius);
    expect(MARBLES.levels[0].damping).toBe(MARBLES.damping);
    expect(MARBLES.levels[0].pegs).toBe(0);
  });
  it('the starting marbles always fit inside even the smallest arena, clear of the rim', () => {
    const cfg = cfgForLevel(last);
    const w = createWorld(cfg);
    for (const m of w.marbles) expect(Math.hypot(m.x - CX, m.y - CY) + R).toBeLessThan(cfg.arenaRadius);
  });
  it('a slippier floor sends a shot farther', () => {
    const near = cfgForLevel(0);
    const far = cfgForLevel(last);
    expect(travelDistance(1500, far)).toBeGreaterThan(travelDistance(1500, near));
  });
  it('a smaller arena takes marbles out sooner', () => {
    const run1 = (lvl: number) => {
      const cfg = cfgForLevel(lvl);
      const w: World = { marbles: [lone(CX, CY, 1, 0)] };
      w.marbles[0].vx = 700;
      let t = 0;
      for (; t < 6 && w.marbles[0].alive; t += 1 / 60) stepWorld(w, 1 / 60, cfg);
      return w.marbles[0].alive;
    };
    // 700 px/s rolls ~370 px at level 0 (stays in a 440 arena) but ~540 px on the slippiest floor (falls out)
    expect(run1(0)).toBe(true);
    expect(run1(last)).toBe(false);
  });
});

describe('pegs', () => {
  it('level 0 has none; later levels place the asked number, apart from each other and from the start spots', () => {
    let seed = 4;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    expect(placePegs(0, rand)).toEqual([]);
    for (let lvl = 1; lvl < MARBLES.levels.length; lvl++) {
      for (let i = 0; i < 20; i++) {
        const pegs = placePegs(lvl, rand);
        expect(pegs).toHaveLength(MARBLES.levels[lvl].pegs);
        const cfg = cfgForLevel(lvl);
        const start = createWorld(cfg).marbles;
        for (const a of pegs) {
          expect(Math.hypot(a.x - CX, a.y - CY)).toBeLessThan(cfg.arenaRadius - 100);
          for (const m of start) expect(Math.hypot(a.x - m.x, a.y - m.y)).toBeGreaterThan(R + MARBLES.pegRadius + 10);
          for (const b of pegs) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(2 * MARBLES.pegRadius + 2 * R);
        }
      }
    }
  });
  it('a marble bounces off a peg instead of passing through', () => {
    const w: World = { marbles: [lone(CX - 300, CY, 0, 0)], pegs: [{ x: CX, y: CY }] };
    w.marbles[0].vx = 900;
    run(w, 0.6);
    expect(w.marbles[0].vx).toBeLessThan(0); // bounced back
    expect(w.marbles[0].x).toBeLessThan(CX - R - MARBLES.pegRadius + 1);
  });
  it('a glancing hit deflects the marble sideways and keeps most of its speed', () => {
    const w: World = { marbles: [lone(CX - 300, CY - 50, 0, 0)], pegs: [{ x: CX, y: CY }] };
    w.marbles[0].vx = 900;
    run(w, 0.5);
    expect(w.marbles[0].vy).toBeLessThan(-100); // sent up, away from the side it came on
    expect(Math.hypot(w.marbles[0].vx, w.marbles[0].vy)).toBeGreaterThan(250);
  });
  it('worlds without pegs still work', () => {
    const w: World = { marbles: [lone(CX, CY)] };
    expect(() => run(w, 0.1)).not.toThrow();
  });
});

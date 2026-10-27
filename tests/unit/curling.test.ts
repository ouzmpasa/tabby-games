import * as logic from '../../src/games/curling/logic';
import { describe, expect, it } from 'vitest';
import { CURLING } from '../../src/games/curling/config';
import {
  addStone,
  aimFromPull,
  createWorld,
  freeze,
  isSettled,
  launchSpot,
  nextStarter,
  frictionFactor,
  makeRng,
  rollCurl,
  SweepMeter,
  sweepEffort,
  scoreEnd,
  stepWorld,
  throwerFor,
  throwStone,
  travelDistance,
  type World,
} from '../../src/games/curling/logic';

const { centerX: CX, centerY: CY, stoneRadius: R } = CURLING;
const run = (w: World, seconds: number) => {
  const outs = [];
  for (let t = 0; t < seconds; t += 1 / 60) outs.push(...stepWorld(w, 1 / 60).out);
  return outs;
};
const at = (w: World, owner: 0 | 1, dx: number, dy: number) => addStone(w, owner, CX + dx, CY + dy);

describe('curling physics', () => {
  it('friction stops a stone near the predicted distance', () => {
    const w = createWorld();
    const s = addStone(w, 0, launchSpot(0).x, CY);
    const shot = aimFromPull({ x: 150, y: 0 }, 0)!;
    throwStone(s, shot);
    run(w, 12);
    expect(isSettled(w)).toBe(true);
    expect(Math.abs(s.x - launchSpot(0).x - travelDistance(shot.speed))).toBeLessThan(15);
  });

  it('a medium pull reaches the house, a full pull is far longer', () => {
    const half = travelDistance(aimFromPull({ x: 120, y: 0 }, 0)!.speed);
    expect(half).toBeGreaterThan(CURLING.launchOffsetX - CURLING.rings[0]);
    expect(travelDistance(aimFromPull({ x: CURLING.maxPull, y: 0 }, 0)!.speed)).toBeGreaterThan(CURLING.launchOffsetX + CURLING.rings[0]);
  });

  it('ignores tiny pulls and never throws backwards', () => {
    expect(aimFromPull({ x: 10, y: 5 }, 0)).toBeNull();
    const back = aimFromPull({ x: -200, y: 0 }, 0)!; // pulled the wrong way
    expect(back.dirX).toBeGreaterThan(0);
    const right = aimFromPull({ x: 200, y: 0 }, 1)!; // player 1 must throw to the left
    expect(right.dirX).toBeLessThan(0);
    const straight = aimFromPull({ x: -200, y: 0 }, 1)!;
    expect(straight.dirX).toBeCloseTo(-1, 5);
  });

  it('elastic hit: equal stones swap momentum', () => {
    const w = createWorld();
    const a = at(w, 0, -300, 0);
    const b = at(w, 1, 0, 0);
    a.vx = 900;
    run(w, 0.5);
    expect(b.x).toBeGreaterThan(CX + 100);
    expect(a.x).toBeLessThan(b.x - 2 * R + 1);
    expect(Math.hypot(b.vx, b.vy)).toBeGreaterThan(Math.hypot(a.vx, a.vy));
  });

  it('removes stones crossing the sides or back line, but keeps those inside', () => {
    const w = createWorld();
    const side = at(w, 0, 0, 0);
    side.vy = -1500;
    const back = at(w, 1, 300, 200);
    back.vx = 2000;
    const stay = at(w, 0, -400, -250);
    const outs = run(w, 3);
    expect(outs.map((s) => s.id).sort()).toEqual([side.id, back.id].sort());
    expect(stay.alive).toBe(true);
  });

  it('never tunnels through a stone at top speed', () => {
    const w = createWorld();
    const a = at(w, 0, -500, 0);
    const b = at(w, 1, 0, 0);
    a.vx = CURLING.maxSpeed;
    run(w, 1);
    expect(b.x).toBeGreaterThan(CX);
    expect(a.x).toBeLessThan(b.x);
  });

  it('freeze settles the world', () => {
    const w = createWorld();
    at(w, 0, 0, 0).vx = 500;
    freeze(w);
    expect(isSettled(w)).toBe(true);
  });

  it('shows no distance aids: no preview in the logic, a full pull is a long throw', () => {
    expect(logic).not.toHaveProperty('previewShot');
    expect(travelDistance(aimFromPull({ x: CURLING.maxPull, y: 0 }, 0)!.speed)).toBeGreaterThan(CURLING.launchOffsetX + CURLING.rings[0] + 500);
    expect(CURLING).not.toHaveProperty('ghost');
  });
});

/** Throws from the left launch spot with a given pull; returns the stone after it rests. */
const throwFrom = (pull: number, curl: number, sweep = 0) => {
  const w = createWorld();
  const sp = launchSpot(0);
  const s = addStone(w, 0, sp.x, sp.y);
  s.sweep = sweep;
  throwStone(s, aimFromPull({ x: pull, y: 0 }, 0)!, CURLING, curl);
  let maxLat = 0;
  for (let t = 0; t < 9 && (s.vx || s.vy); t += 1 / 60) {
    stepWorld(w, 1 / 60);
    maxLat = Math.max(maxLat, Math.abs(s.y - sp.y));
    if (!s.alive) break;
  }
  return { s, dx: s.x - sp.x, dy: s.y - sp.y, maxLat };
};

describe('curling sweeping', () => {
  it('stroke rate maps to an effort 0..1 that is flat above the full rate', () => {
    expect(sweepEffort(0)).toBe(0);
    expect(sweepEffort(CURLING.sweepMinRate)).toBe(0);
    expect(sweepEffort(CURLING.sweepFullRate)).toBe(1);
    expect(sweepEffort(8)).toBe(1);
    expect(sweepEffort(3)).toBeGreaterThan(0);
    expect(sweepEffort(3)).toBeLessThan(sweepEffort(5));
  });

  it('friction factor goes from 1 to sweepDamping, never to 0', () => {
    expect(frictionFactor(0)).toBe(1);
    expect(frictionFactor(1)).toBeCloseTo(CURLING.sweepDamping, 9);
    expect(frictionFactor(5)).toBeGreaterThan(0);
    expect(frictionFactor(-1)).toBe(1);
  });

  it('a swept stone slides farther, a half-swept in between, and never faster than it was thrown', () => {
    const plain = throwFrom(130, 0).dx;
    const half = throwFrom(130, 0, 0.5).dx;
    const full = throwFrom(130, 0, 1).dx;
    expect(half).toBeGreaterThan(plain + 50);
    expect(full).toBeGreaterThan(half + 50);
    expect(full).toBeLessThan(plain * 2.2);
    const w = createWorld();
    const s = addStone(w, 0, 0, CY + 400);
    s.vx = 600;
    s.sweep = 1;
    let last = 600;
    for (let i = 0; i < 120; i++) {
      stepWorld(w, 1 / 60);
      expect(Math.hypot(s.vx, s.vy)).toBeLessThanOrEqual(last + 1e-9);
      last = Math.hypot(s.vx, s.vy);
    }
  });

  it('a fully swept stone still comes to rest (never loops forever)', () => {
    const r = throwFrom(130, 1, 1);
    expect(r.s.vx === 0 && r.s.vy === 0).toBe(true);
  });

  const scrub = (m: SweepMeter, strokesPerSec: number, seconds: number, amp = 60) => {
    const dtMs = 1000 / 60;
    const period = 1000 / strokesPerSec;
    m.begin(100, 100);
    for (let t = 0; t < seconds * 1000; t += dtMs) {
      const phase = (t % (2 * period)) / period; // 0..2
      const x = 100 + amp * (phase < 1 ? phase : 2 - phase);
      m.move(x, 100);
      m.update(dtMs);
    }
  };

  it('the meter reads the stroke rate from finger movement', () => {
    const fast = new SweepMeter();
    scrub(fast, 7, 2);
    expect(fast.rate).toBeGreaterThan(5);
    expect(fast.level).toBeGreaterThan(0.95);
    const slow = new SweepMeter();
    scrub(slow, 2, 2);
    expect(slow.level).toBeLessThan(0.3);
    const wobble = new SweepMeter();
    scrub(wobble, 10, 2, 5); // tiny jitter is not sweeping
    expect(wobble.level).toBe(0);
  });

  it('the level ramps up smoothly and decays after you stop', () => {
    const m = new SweepMeter();
    scrub(m, 7, 0.4);
    expect(m.level).toBeGreaterThan(0);
    expect(m.level).toBeLessThan(1);
    scrub(m, 7, 2);
    expect(m.level).toBeGreaterThan(0.95);
    let prev = m.level;
    for (let i = 0; i < 120; i++) {
      m.update(1000 / 60);
      expect(m.level).toBeLessThanOrEqual(prev);
      prev = m.level;
    }
    expect(m.level).toBe(0);
  });
});

describe('curling curl', () => {
  it('is deterministic for a seed, random in size and side', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const xs = [0, 1, 2, 3, 4, 5, 6, 7].map(() => rollCurl(a));
    expect(xs).toEqual([0, 1, 2, 3, 4, 5, 6, 7].map(() => rollCurl(b)));
    for (const x of xs) {
      expect(Math.abs(x)).toBeGreaterThanOrEqual(CURLING.curlMinFrac);
      expect(Math.abs(x)).toBeLessThanOrEqual(1);
    }
    expect(xs.some((x) => x < 0) && xs.some((x) => x > 0)).toBe(true);
  });

  it('drifts to the fixed side, little at first and more as the stone slows, but stays small', () => {
    const up = throwFrom(CURLING.maxPull, -1);
    const down = throwFrom(CURLING.maxPull, 1);
    expect(up.dy).toBeLessThan(0);
    expect(down.dy).toBeGreaterThan(0);
    expect(Math.abs(down.dy)).toBeLessThanOrEqual(60);
    expect(throwFrom(0.6 * CURLING.maxPull, 1).maxLat).toBeLessThanOrEqual(60);
    // no curl, no drift
    expect(throwFrom(200, 0).maxLat).toBeLessThan(1e-6);
    // drift grows as it slows: the stone is straighter early than late
    const w = createWorld();
    const sp = launchSpot(0);
    const s = addStone(w, 0, sp.x, sp.y);
    throwStone(s, aimFromPull({ x: 250, y: 0 }, 0)!, CURLING, 1);
    const lat: number[] = [];
    for (let i = 0; i < 240; i++) {
      stepWorld(w, 1 / 60);
      if (i === 59 || i === 119 || i === 179 || i === 239) lat.push(s.y - sp.y);
    }
    const inc = lat.map((v, i) => v - (lat[i - 1] ?? 0));
    expect(inc[1]).toBeGreaterThan(inc[0]);
  });

  it('sweeping reduces the curl, and a swept long throw still drifts <= 60 px', () => {
    const mid = 130;
    const plain = throwFrom(mid, 1);
    const swept = throwFrom(mid, 1, 1);
    expect(swept.dy / swept.dx).toBeLessThan(plain.dy / plain.dx);
    expect(swept.maxLat).toBeLessThanOrEqual(60);
  });

  it('only the thrown stone curls: struck stones leave straight', () => {
    const w = createWorld();
    const a = at(w, 0, -300, 0);
    const b = at(w, 1, 0, 0);
    throwStone(a, { dirX: 1, dirY: 0, speed: 900, power: 0.5 }, CURLING, 1);
    run(w, 4);
    expect(b.curl).toBeUndefined();
    expect(b.x).toBeGreaterThan(CX + 100);
  });
});

describe('curling scoring', () => {
  it('is blank with no stone in the house', () => {
    const w = createWorld();
    at(w, 0, -600, 0);
    at(w, 1, 500, 100);
    expect(scoreEnd(w)).toEqual({ scorer: null, points: 0, scoring: [] });
  });

  it('closest stone scores 1 when the opponent has the next closest', () => {
    const w = createWorld();
    const a = at(w, 0, 20, 0);
    at(w, 1, 60, 0);
    at(w, 0, 150, 0); // farther than the opponent: does not count
    const r = scoreEnd(w);
    expect(r.scorer).toBe(0);
    expect(r.points).toBe(1);
    expect(r.scoring).toEqual([a.id]);
  });

  it('counts every stone closer than the opponent best, and caps at 3', () => {
    const w = createWorld();
    at(w, 1, 0, 30);
    at(w, 0, 0, 100);
    at(w, 0, 0, -105);
    at(w, 1, 0, 200); // not closest
    const r = scoreEnd(w);
    expect(r.scorer).toBe(1);
    expect(r.points).toBe(1);
    const w2 = createWorld();
    for (let i = 0; i < 5; i++) at(w2, 0, 10 + i * 20, 0);
    at(w2, 1, 200, 0);
    const r2 = scoreEnd(w2);
    expect(r2.scorer).toBe(0);
    expect(r2.points).toBe(CURLING.maxEndPoints);
  });

  it('a lone stone in the house scores, one that only touches the outer ring counts too', () => {
    const w = createWorld();
    at(w, 1, CURLING.rings[0] + R - 5, 0);
    expect(scoreEnd(w).points).toBe(1);
    const w2 = createWorld();
    at(w2, 1, CURLING.rings[0] + R + 5, 0);
    expect(scoreEnd(w2).scorer).toBeNull();
  });

  it('ignores removed stones and stones outside the house even if they are the opponents', () => {
    const w = createWorld();
    const gone = at(w, 1, 0, 0);
    gone.alive = false;
    at(w, 0, 200, 0);
    expect(scoreEnd(w).scorer).toBe(0);
  });

  it('a dead heat between players scores nothing', () => {
    const w = createWorld();
    at(w, 0, 100, 0);
    at(w, 1, -100, 0);
    expect(scoreEnd(w).scorer).toBeNull();
  });
});

describe('curling turn order', () => {
  it('alternates throws starting with the starter, 3 each', () => {
    const order = [0, 1, 2, 3, 4, 5].map((i) => throwerFor(1, i));
    expect(order).toEqual([1, 0, 1, 0, 1, 0]);
  });

  it('the player who did not score starts the next end; blank ends alternate', () => {
    expect(nextStarter(0, 0)).toBe(1);
    expect(nextStarter(0, 1)).toBe(0);
    expect(nextStarter(1, null)).toBe(0);
    expect(nextStarter(0, null)).toBe(1);
  });
});

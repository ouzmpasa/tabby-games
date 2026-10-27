import { describe, expect, it } from 'vitest';
import { ARENA, CENTER } from '../../src/games/snakeduel/config';
import { SNAKE } from '../../src/games/snakeduel/config';
import {
  DEFAULT_PARAMS as P, arenaAt, arenaInset, createState, headHitsBody, insideArena, matchProgress, moveSnake, paramsFor, planRocks, rand, reset,
  speedMul, step, steer, topUpFruits, type Targets,
} from '../../src/games/snakeduel/logic';

const none: Targets = [null, null];
const calm = () => {
  const s = createState(1);
  s.fruits = [];
  return s;
};

describe('snakeduel logic', () => {
  it('starts facing each other on their own sides, full length', () => {
    const s = createState(1);
    expect(s.snakes[0].x).toBeLessThan(CENTER.x);
    expect(s.snakes[1].x).toBeGreaterThan(CENTER.x);
    expect(s.snakes[0].body).toHaveLength(P.startSegments);
    expect(s.fruits).toHaveLength(P.fruitCount);
  });

  it('rng is seedable and deterministic', () => {
    const a = { seed: 5 };
    const b = { seed: 5 };
    expect([rand(a), rand(a)]).toEqual([rand(b), rand(b)]);
  });

  it('moves at constant speed and keeps going straight without a finger', () => {
    const s = calm();
    const sn = s.snakes[0];
    const x0 = sn.x;
    moveSnake(sn, 0.5, null);
    expect(sn.x - x0).toBeCloseTo(P.speed * 0.5);
    expect(sn.heading).toBe(0);
    expect(sn.body).toHaveLength(P.startSegments);
  });

  it('turns toward the finger with a limited rate', () => {
    const h = steer(0, { x: 0, y: 0 }, { x: 0, y: 500 }, 0.05, 10);
    expect(h).toBeCloseTo(0.05);
    expect(steer(0, { x: 0, y: 0 }, { x: 500, y: 0 }, 0.05, 10)).toBe(0);
    expect(steer(0, { x: 0, y: 0 }, { x: 5, y: 5 }, 0.5, 50)).toBe(0); // dead zone
    // turns the short way round
    expect(steer(3, { x: 0, y: 0 }, { x: -500, y: -1 }, 1, 10)).toBeGreaterThan(3);
  });

  it('grows by growPerFruit when eating, capped at maxSegments', () => {
    const s = calm();
    const sn = s.snakes[0];
    s.fruits = [{ x: sn.x + 20, y: sn.y, r: P.fruitRadius }];
    const r = step(s, 16, none);
    expect(r.ate).toEqual([0]);
    expect(sn.length).toBe(P.startSegments + P.growPerFruit);
    expect(s.fruits).toHaveLength(P.fruitCount); // replaced
    sn.length = P.maxSegments;
    s.fruits = [{ x: sn.x + 20, y: sn.y, r: P.fruitRadius }];
    step(s, 16, none);
    expect(sn.length).toBe(P.maxSegments);
  });

  it('spawns fruit away from snakes, inside the arena', () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = createState(seed);
      for (const f of s.fruits) {
        expect(insideArena(arenaAt(0), f.x, f.y, 60)).toBe(true);
        for (const sn of s.snakes) expect(Math.hypot(f.x - sn.x, f.y - sn.y)).toBeGreaterThan(100);
      }
    }
  });

  it('own body is harmless, the other body ends the round', () => {
    const s = calm();
    s.time = P.spawnInvulnSec;
    const [a, b] = s.snakes;
    a.body = [{ x: a.x, y: a.y }];
    expect(step(s, 1, none).losers).toBeNull();
    a.heading = Math.PI / 2;
    a.x = 600;
    a.y = 300;
    b.x = 640;
    b.y = 330;
    b.body = [{ x: 600, y: 330 }];
    expect(headHitsBody(a, b)).toBe(true);
    expect(step(s, 16, none).losers).toEqual([0]);
  });

  it('is generous: a near miss (between hit and drawn radius) is not a hit', () => {
    const s = calm();
    s.snakes[1].body = [{ x: 500, y: 500 + P.headHit + P.bodyHit + 4 }];
    expect(headHitsBody({ x: 500, y: 500 }, s.snakes[1])).toBe(false);
  });

  it('wall ends the round for that snake only', () => {
    const s = calm();
    s.time = P.spawnInvulnSec;
    s.snakes[0].x = ARENA.x + 22;
    s.snakes[0].heading = Math.PI;
    expect(step(s, 16, none).losers).toEqual([0]);
  });

  it('head-on = both lose', () => {
    const s = calm();
    s.time = P.spawnInvulnSec;
    s.snakes[0].x = 900;
    s.snakes[0].y = 500;
    s.snakes[1].x = 930;
    s.snakes[1].y = 500;
    expect(step(s, 16, none).losers).toEqual([0, 1]);
  });

  it('spawn invulnerability: no crash while blinking', () => {
    const s = calm();
    s.snakes[0].x = ARENA.x + 5;
    expect(step(s, 16, none).losers).toBeNull();
  });

  it('arena closes in after the delay, capped', () => {
    expect(arenaInset(0)).toBe(0);
    expect(arenaInset(P.shrinkDelaySec)).toBe(0);
    expect(arenaInset(P.shrinkDelaySec + 5)).toBeGreaterThan(0);
    expect(arenaInset(9999)).toBe(P.maxInset);
  });

  it('rounded corners: a point in the square corner is outside', () => {
    const a = arenaAt(0);
    expect(insideArena(a, a.x + 5, a.y + 5, 10)).toBe(false);
    expect(insideArena(a, a.x + a.corner, a.y + a.corner, 10)).toBe(true);
  });

  it('round always ends: two idle snakes crash eventually', () => {
    const s = calm();
    let losers: unknown = null;
    for (let i = 0; i < 60 * 60 && !losers; i++) losers = step(s, 16, none).losers;
    expect(losers).not.toBeNull();
  });
});

describe('snakeduel difficulty', () => {
  it('match progress follows the leader or the total, from 0 to 1', () => {
    expect(matchProgress([0, 0], 8)).toBe(0);
    expect(matchProgress([7, 2], 8)).toBe(1);
    expect(matchProgress([2, 2], 8)).toBeCloseTo(4 / 14);
  });

  it('rounds get faster, get rocks and special fruit as the match goes on', () => {
    const a = paramsFor(0);
    const b = paramsFor(1);
    expect(a.speed).toBe(SNAKE.speed);
    expect(a.rockCount).toBe(0);
    expect(a.goldChance + a.trimChance).toBe(0);
    expect(b.speed).toBeCloseTo(SNAKE.speed * (1 + SNAKE.speedMatchRamp), -1);
    expect(b.rockCount).toBe(SNAKE.rocksMax);
    expect(b.goldChance).toBeGreaterThan(0);
    expect(b.trimChance).toBeGreaterThan(0);
    expect(paramsFor(SNAKE.rocksFromProgress + 0.01).rockCount).toBe(1);
  });

  it('a snake speeds up during a round and with a gold boost', () => {
    const s = createState(1);
    const sn = s.snakes[0];
    expect(speedMul(sn, 0)).toBe(1);
    expect(speedMul(sn, SNAKE.speedRampSec)).toBeCloseTo(1 + SNAKE.speedRoundRamp);
    expect(speedMul(sn, 999)).toBeCloseTo(1 + SNAKE.speedRoundRamp);
    sn.boostT = 1;
    expect(speedMul(sn, 0)).toBeCloseTo(SNAKE.boostFactor);
    // moveSnake honours the multiplier, and fast snakes still turn (a little faster)
    const a = createState(1);
    const x0 = a.snakes[0].x;
    moveSnake(a.snakes[0], 0.5, null, P, 1.5);
    expect(a.snakes[0].x - x0).toBeCloseTo(P.speed * 0.75);
    const slow = steer(0, { x: 0, y: 0 }, { x: 0, y: 500 }, P.turnRate * 0.1, 10);
    const h = createState(1).snakes[0];
    moveSnake(h, 0.1, { x: h.x, y: h.y + 500 }, P, 1.5);
    expect(h.heading).toBeGreaterThan(slow);
  });

  it('rocks are planned away from the snakes and each other, and land on a schedule', () => {
    const q = paramsFor(1);
    for (let seed = 0; seed < 30; seed++) {
      const s = createState(seed, q);
      expect(s.rocks.length).toBeGreaterThanOrEqual(q.rockCount - 1);
      expect(s.rocks.length).toBeGreaterThan(0);
      s.rocks.forEach((r, i) => {
        expect(r.active).toBe(false);
        expect(r.t0).toBeGreaterThanOrEqual(SNAKE.rockFirstSec);
        expect(insideArena(arenaAt(150), r.x, r.y, 60)).toBe(true);
        s.snakes.forEach((sn) => expect(Math.hypot(sn.x - r.x, sn.y - r.y)).toBeGreaterThanOrEqual(380));
        s.rocks.slice(0, i).forEach((o) => expect(Math.hypot(o.x - r.x, o.y - r.y)).toBeGreaterThanOrEqual(260));
      });
    }
    const none = createState(1);
    planRocks(none, paramsFor(0));
    expect(none.rocks).toHaveLength(0);
  });

  it('a rock waits while a snake is near, then lands and crashes whoever hits it', () => {
    const q = paramsFor(1);
    const s = createState(3, q);
    s.fruits = [];
    s.rocks = [{ x: 900, y: 500, r: q.rockRadius, t0: 1, active: false }];
    s.snakes[0].x = 950; // close to the rock: it must not land on top of the snake
    s.snakes[0].y = 500;
    s.snakes[0].heading = Math.PI / 2;
    s.time = 1;
    const r1 = step(s, 16, none, q);
    expect(r1.landed).toBe(false);
    expect(s.rocks[0].active).toBe(false);
    expect(s.rocks[0].t0).toBeGreaterThan(1);
    // far from everything it lands
    s.snakes[0].x = 400;
    s.snakes[0].y = 300;
    s.snakes[1].x = 1500;
    s.snakes[1].y = 800;
    s.snakes[0].body = [];
    s.snakes[1].body = [];
    s.time = 2;
    s.rocks[0].t0 = 1;
    let landed = false;
    for (let i = 0; i < 5; i++) landed = step(s, 16, none, q).landed || landed;
    expect(landed).toBe(true);
    expect(s.rocks[0].active).toBe(true);
    // a snake head in the rock ends the round for that snake
    s.time = q.spawnInvulnSec + 1;
    s.snakes[0].x = 900 - q.headHit - q.rockHit + 8;
    s.snakes[0].y = 500;
    s.snakes[0].heading = 0;
    s.snakes[0].body = [];
    s.snakes[1].x = 1500;
    s.snakes[1].y = 800;
    expect(step(s, 16, none, q).losers).toEqual([0]);
  });

  it('a pending rock is harmless (and new rounds start without active rocks)', () => {
    const q = paramsFor(1);
    const s = createState(5, q);
    s.time = q.spawnInvulnSec;
    s.rocks = [{ x: s.snakes[0].x + 60, y: s.snakes[0].y, r: q.rockRadius, t0: 99, active: false }];
    expect(step(s, 16, none, q).losers).toBeNull();
    reset(s, q);
    expect(s.rocks.every((r) => !r.active)).toBe(true);
  });

  it('gold fruit gives a boost, trim shortens the other snake (never below the start length)', () => {
    const q = paramsFor(1);
    const gold = createState(1, q);
    gold.rocks = [];
    const a = gold.snakes[0];
    gold.fruits = [{ x: a.x + 20, y: a.y, r: q.fruitRadius, kind: 'gold' }];
    const r = step(gold, 16, none, q);
    expect(r.kinds).toEqual(['gold']);
    expect(a.boostT).toBeGreaterThan(0);
    expect(a.length).toBe(q.startSegments + q.growPerFruit);

    const trim = createState(1, q);
    trim.rocks = [];
    const [t0, t1] = trim.snakes;
    t1.length = q.startSegments + 12;
    t1.body = Array.from({ length: t1.length }, (_, i) => ({ x: 1700 + i, y: 900 }));
    trim.fruits = [{ x: t0.x + 20, y: t0.y, r: q.fruitRadius, kind: 'trim' }];
    expect(step(trim, 16, none, q).kinds).toEqual(['trim']);
    expect(t1.length).toBe(q.startSegments + 12 - q.trimSegments);
    expect(t1.body.length).toBeLessThanOrEqual(t1.length);
    expect(t0.length).toBe(q.startSegments); // the eater does not grow

    const flat = createState(1, q);
    flat.rocks = [];
    flat.fruits = [{ x: flat.snakes[0].x + 20, y: flat.snakes[0].y, r: q.fruitRadius, kind: 'trim' }];
    step(flat, 16, none, q);
    expect(flat.snakes[1].length).toBe(q.startSegments); // nothing to trim: no shrinking below the start
  });

  it('new fruit is mostly apples early and includes special kinds late', () => {
    const early = createState(7, paramsFor(0));
    for (let i = 0; i < 40; i++) {
      early.fruits = [];
      topUpFruits(early, paramsFor(0));
      early.fruits.forEach((f) => expect(f.kind).toBe('apple'));
    }
    const late = paramsFor(1);
    const s = createState(7, late);
    const kinds = new Set<string>();
    for (let i = 0; i < 200; i++) {
      s.fruits = [];
      topUpFruits(s, late);
      s.fruits.forEach((f) => kinds.add(f.kind ?? 'apple'));
    }
    expect(kinds).toEqual(new Set(['apple', 'gold', 'trim']));
  });

  it('a full late-match round with everything on stays finite and ends', () => {
    const q = paramsFor(1);
    const s = createState(11, q);
    let over = false;
    for (let i = 0; i < 60 * 120 && !over; i++) {
      const sn = s.snakes[0];
      const r = step(s, 16, [{ x: sn.x + Math.cos(i / 40) * 300, y: sn.y + Math.sin(i / 40) * 300 }, null], q);
      over = r.losers !== null;
      for (const k of s.snakes) expect(Number.isFinite(k.x + k.y)).toBe(true);
    }
    expect(over).toBe(true);
  });
});

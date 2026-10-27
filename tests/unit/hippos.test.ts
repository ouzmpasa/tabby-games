import { describe, expect, it } from 'vitest';
import { BALL, HIPPO, HIPPOS, POND, WAVES } from '../../src/games/hippos/config';
import {
  LUNGE_CYCLE_MS,

  diveState,
  envAt,
  goldenRadiusAt,
  isUnder,
  pairsAt,
  plainBall,
  radiusAt,
  rockAt,
  speedScaleAt,
  createHippo,
  createPond,
  eat,
  lungeTarget,
  makeWave,
  mouthPos,
  moveBalls,
  mulberry32,
  nextTarget,
  pointsFor,
  rememberTap,
  startLunge,
  stepHippo,
  stepPond,
  type Ball,
} from '../../src/games/hippos/logic';

const W = 1920;
const H = 1080;
const ball = (x: number, y: number, golden = false): Ball => plainBall({ id: 1, x, y, vx: 0, vy: 0, r: golden ? BALL.goldenRadius : BALL.radius, golden, color: 0 });
const inPond = (b: Ball): boolean => ((b.x - POND.cx) / (POND.a - b.r + 0.01)) ** 2 + ((b.y - POND.cy) / (POND.b - b.r + 0.01)) ** 2 <= 1.0001;

describe('hippos logic', () => {
  it('rng is seedable and repeatable', () => {
    const a = mulberry32(3);
    const b = mulberry32(3);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('waves are mirror-symmetric, so both sides are treated the same', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = createPond();
      const wave = makeWave(s, mulberry32(seed)).filter((b) => !b.golden);
      expect(wave).toHaveLength(2 * HIPPOS.wavePairsStart);
      const left = wave.filter((_, i) => i % 2 === 0);
      const right = wave.filter((_, i) => i % 2 === 1);
      left.forEach((l, i) => {
        const r = right[i];
        expect(r.x).toBeCloseTo(2 * POND.cx - l.x);
        expect(r.y).toBeCloseTo(l.y);
        expect(r.vx).toBeCloseTo(-l.vx);
        expect(r.vy).toBeCloseTo(l.vy);
        expect(r.color).toBe(l.color);
      });
      wave.forEach((b) => expect(inPond(b)).toBe(true));
    }
  });

  it('later waves are mirror-symmetric too, divers included (mirrored partners dive together)', () => {
    for (const w of [4, 7, 12]) {
      for (let seed = 1; seed <= 10; seed++) {
        const s = createPond();
        s.wave = w;
        const wave = makeWave(s, mulberry32(seed)).filter((b) => !b.golden);
        expect(wave).toHaveLength(2 * pairsAt(w));
        for (let i = 0; i < wave.length; i += 2) {
          const l = wave[i];
          const r = wave[i + 1];
          expect(r.x).toBeCloseTo(2 * POND.cx - l.x);
          expect(r.vx).toBeCloseTo(-l.vx);
          expect(r.diver).toBe(l.diver);
          expect(r.diveOffset).toBe(l.diveOffset);
          expect(r.r).toBe(l.r);
          expect(r.mirror).toBe(-l.mirror);
        }
        wave.forEach((b) => expect(inPond(b)).toBe(true));
      }
    }
  });

  it('every Nth wave carries a rarer golden ball on the centre line worth 3, which floats away after a few seconds', () => {
    const s = createPond();
    const rng = mulberry32(2);
    const golds: number[] = [];
    for (let w = 0; w < 8; w++) {
      const wave = makeWave(s, rng);
      s.wave++;
      golds.push(wave.filter((b) => b.golden).length);
      wave.filter((b) => b.golden).forEach((g) => {
        expect(g.x).toBe(POND.cx);
        expect(pointsFor(g)).toBe(HIPPOS.goldenPoints);
        expect(g.ttl).toBe(HIPPOS.goldenLifeMs);
      });
      wave.filter((b) => !b.golden).forEach((b) => expect(b.ttl).toBe(Infinity));
    }
    expect(golds).toEqual([0, 0, 0, 1, 0, 0, 0, 1]);
    expect(pointsFor(ball(0, 0))).toBe(1);
    // a golden ball that is not eaten leaves
    const pond = createPond();
    pond.balls.push({ ...ball(POND.cx, POND.cy - 200, true), ttl: 300 }, ball(POND.cx + 300, POND.cy));
    const r1 = stepPond(pond, 200, mulberry32(1));
    expect(r1.expired).toHaveLength(0);
    const r2 = stepPond(pond, 200, mulberry32(1));
    expect(r2.expired).toHaveLength(1);
    expect(r2.expired[0].golden).toBe(true);
    expect(pond.balls).toHaveLength(1);
  });

  describe('the ramp', () => {
    it('waves get bigger, faster and smaller, then stay capped', () => {
      expect(pairsAt(0)).toBe(HIPPOS.wavePairsStart);
      expect(pairsAt(10)).toBeGreaterThan(pairsAt(0));
      expect(pairsAt(99)).toBe(HIPPOS.wavePairsMax);
      expect(speedScaleAt(0)).toBe(1);
      expect(speedScaleAt(5)).toBeGreaterThan(speedScaleAt(2));
      expect(speedScaleAt(99)).toBe(WAVES.speedScaleMax);
      expect(radiusAt(0)).toBe(BALL.radius);
      expect(radiusAt(6)).toBeLessThan(radiusAt(1));
      expect(radiusAt(99)).toBe(WAVES.minRadius);
      expect(radiusAt(99)).toBeGreaterThanOrEqual(26); // still a big marble for a small hand
      expect(goldenRadiusAt(99)).toBeGreaterThan(radiusAt(99));
      expect(envAt(0).wander).toBe(0);
      expect(envAt(8).wander).toBeGreaterThan(envAt(2).wander);
      expect(envAt(99).wander).toBe(WAVES.wanderMax);
    });

    it('the rock appears from rockFromWave on and the first waves are rock-free', () => {
      expect(rockAt(WAVES.rockFromWave - 1)).toBe(false);
      expect(rockAt(WAVES.rockFromWave)).toBe(true);
      expect(envAt(0).rock).toBe(false);
      expect(envAt(9).rock).toBe(true);
    });

    it('balls never end up inside the rock, and bounce off it', () => {
      const s = createPond();
      s.wave = 8;
      s.env = envAt(8);
      const rng = mulberry32(3);
      s.balls.push(...makeWave(s, rng));
      for (let i = 0; i < 60 * 60; i++) {
        moveBalls(s.balls, 1000 / 60, s.env);
        for (const b of s.balls) {
          expect(Math.hypot(b.x - POND.cx, b.y - POND.cy)).toBeGreaterThanOrEqual(WAVES.rockRadius + b.r - 1);
          expect(inPond(b)).toBe(true);
        }
      }
      // fresh balls drop clear of the rock
      s.balls.length = 0;
      for (const b of makeWave(s, mulberry32(5))) expect(Math.hypot(b.x - POND.cx, b.y - POND.cy)).toBeGreaterThan(WAVES.rockRadius + b.r);
    });

    it('later balls keep swimming (wander) instead of settling in the middle', () => {
      const speedAfter = (wave: number): number => {
        const s = createPond();
        s.wave = wave;
        s.env = envAt(wave);
        s.balls.push(...makeWave(s, mulberry32(4)));
        let sum = 0;
        let n = 0;
        for (let i = 0; i < 60 * 30; i++) {
          moveBalls(s.balls, 1000 / 60, s.env);
          if (i > 60 * 10) {
            s.balls.forEach((b) => {
              sum += Math.hypot(b.vx, b.vy);
              n++;
            });
          }
        }
        return sum / n;
      };
      expect(speedAfter(8)).toBeGreaterThan(speedAfter(0) * 2);
    });

    it('divers duck under water for a short while after a warning, and cannot be eaten then', () => {
      const d = { ...ball(0, 0), diver: true, diveOffset: 0 };
      const states = new Set<string>();
      let under = 0;
      for (let age = 0; age < WAVES.divePeriodMs; age += 10) {
        d.age = age;
        states.add(diveState(d));
        if (isUnder(d)) under += 10;
      }
      expect([...states].sort()).toEqual(['under', 'up', 'warn']);
      expect(under).toBeCloseTo(WAVES.diveUnderMs, -1);
      expect(WAVES.diveUnderMs).toBeLessThanOrEqual(1300); // a short dip
      expect(isUnder(ball(0, 0))).toBe(false); // plain balls never dive
      // eating skips a diver that is under
      const h = createHippo(0, W, H);
      startLunge(h, 700, 540);
      while (!stepHippo(h, 5));
      d.x = 700;
      d.y = 540;
      d.age = WAVES.divePeriodMs - 200; // under
      const up = { ...d, id: 2, age: 0 };
      const balls = [d, up];
      const eaten = eat(h, balls);
      expect(eaten.map((b) => b.id)).toEqual([2]);
      expect(balls).toEqual([d]);
    });

    it('from diveFromWave on a share of the pairs dive, before that nobody does', () => {
      const count = (w: number) => {
        let n = 0;
        for (let seed = 1; seed <= 30; seed++) {
          const s = createPond();
          s.wave = w;
          n += makeWave(s, mulberry32(seed)).filter((b) => b.diver).length;
        }
        return n;
      };
      expect(count(WAVES.diveFromWave - 1)).toBe(0);
      expect(count(WAVES.diveFromWave)).toBeGreaterThan(0);
    });
  });

  it('balls stay in the pond, keep moving gently and drift to the middle', () => {
    const s = createPond();
    const rng = mulberry32(9);
    stepPond(s, HIPPOS.wavePauseMs, rng);
    expect(s.balls.length).toBeGreaterThanOrEqual(2 * HIPPOS.wavePairsStart);
    let maxSp = 0;
    for (let i = 0; i < 60 * 40; i++) {
      moveBalls(s.balls, 1000 / 60, s.env);
      s.balls.forEach((b) => {
        expect(inPond(b)).toBe(true);
        maxSp = Math.max(maxSp, Math.hypot(b.vx, b.vy));
      });
    }
    expect(maxSp).toBeLessThanOrEqual(BALL.maxSpeed + 1);
    const avg = s.balls.reduce((a, b) => a + Math.hypot(b.x - POND.cx, b.y - POND.cy), 0) / s.balls.length;
    expect(avg).toBeLessThan(260);
  });

  it('balls do not overlap much after settling', () => {
    const s = createPond();
    stepPond(s, HIPPOS.wavePauseMs, mulberry32(4));
    for (let i = 0; i < 60 * 60; i++) moveBalls(s.balls, 1000 / 60, s.env);
    for (let i = 0; i < s.balls.length; i++)
      for (let j = i + 1; j < s.balls.length; j++) {
        const a = s.balls[i];
        const b = s.balls[j];
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan((a.r + b.r) * 0.8);
      }
  });

  it('the next wave drops after a pause once the pond is empty', () => {
    const s = createPond();
    const rng = mulberry32(1);
    expect(stepPond(s, HIPPOS.firstWaveMs - 10, rng).spawned).toHaveLength(0);
    expect(stepPond(s, 20, rng).spawned.length).toBeGreaterThanOrEqual(2 * HIPPOS.wavePairsStart);
    expect(s.wave).toBe(1);
    s.balls.length = 0;
    expect(stepPond(s, HIPPOS.wavePauseMs - 10, rng).spawned).toHaveLength(0);
    expect(stepPond(s, 20, rng).spawned.length).toBeGreaterThan(0);
    expect(s.wave).toBe(2);
    // not while balls are left
    expect(stepPond(s, 5000, rng).spawned).toHaveLength(0);
  });
});

describe('hippo lunge', () => {
  it('lunge target is the touch point, limited to the reach, never behind the hippo', () => {
    const h = createHippo(0, W, H);
    const near = lungeTarget(h, 700, 540);
    expect(near.x).toBeCloseTo(700);
    const far = lungeTarget(h, 940, 100);
    expect(Math.hypot(far.x - h.baseX, far.y - h.baseY)).toBeCloseTo(HIPPO.maxReach);
    const tiny = lungeTarget(h, h.baseX + 10, h.baseY);
    expect(Math.hypot(tiny.x - h.baseX, tiny.y - h.baseY)).toBeCloseTo(HIPPO.minReach);
    expect(lungeTarget(h, 0, 540).x).toBeGreaterThan(h.baseX);
  });

  it('reach covers the pond centre for both hippos; player 1 is the mirror image', () => {
    const a = createHippo(0, W, H);
    const b = createHippo(1, W, H);
    expect(a.baseX + HIPPO.maxReach).toBeGreaterThan(POND.cx + 20);
    expect(b.baseX - HIPPO.maxReach).toBeLessThan(POND.cx - 20);
    const ta = lungeTarget(a, 900, 300);
    const tb = lungeTarget(b, W - 900, 300);
    expect(tb.x).toBeCloseTo(W - ta.x);
    expect(tb.y).toBeCloseTo(ta.y);
  });

  it('timeline: chomp fires once at the peak, then it snaps back and can lunge again after the cooldown', () => {
    const h = createHippo(0, W, H);
    expect(startLunge(h, 700, 540)).toBe(true);
    expect(startLunge(h, 800, 540)).toBe(false); // busy
    let chomps = 0;
    let t = 0;
    while (h.phase !== 'idle' && t < 5000) {
      if (stepHippo(h, 10)) {
        chomps++;
        expect(h.open).toBe(1);
        expect(mouthPos(h).x).toBeCloseTo(700);
      }
      t += 10;
    }
    expect(chomps).toBe(1);
    expect(h.phase).toBe('idle');
    expect(t).toBeGreaterThanOrEqual(LUNGE_CYCLE_MS - 10);
    expect(t).toBeLessThanOrEqual(LUNGE_CYCLE_MS + 20);
    expect(HIPPO.backMs + HIPPO.restMs).toBeLessThanOrEqual(400); // short snap-back cooldown
    expect(startLunge(h, 700, 540)).toBe(true);
  });

  it('a big frame step still chomps exactly once', () => {
    const h = createHippo(1, W, H);
    startLunge(h, 1200, 500);
    let chomps = 0;
    for (let i = 0; i < 20; i++) if (stepHippo(h, 100)) chomps++;
    expect(chomps).toBe(1);
    expect(h.phase).toBe('idle');
  });

  it('eats exactly the balls inside the mouth at the peak (golden counts as 3)', () => {
    const h = createHippo(0, W, H);
    startLunge(h, 700, 540);
    while (!stepHippo(h, 5));
    const balls = [ball(700, 540), ball(700 + HIPPO.mouthRadius - 20, 540), ball(700, 540 + HIPPO.mouthRadius + BALL.radius + 20), ball(1100, 540), ball(710, 560, true)];
    balls.forEach((b, i) => (b.id = i));
    const eaten = eat(h, balls);
    expect(eaten.map((b) => b.id).sort()).toEqual([0, 1, 4]);
    expect(balls.map((b) => b.id)).toEqual([2, 3]);
    expect(eaten.reduce((a, b) => a + pointsFor(b), 0)).toBe(1 + 1 + 3);
    expect(h.eaten).toBe(3);
  });

  it('frantic tapping: a tap during a lunge is remembered briefly, a held finger always counts', () => {
    const m = { x: 0, y: 0, until: -1 };
    expect(nextTarget(m, null, 0)).toBeNull();
    rememberTap(m, 500, 400, 1000);
    expect(nextTarget(m, null, 1000 + HIPPO.tapBufferMs - 1)).toEqual({ x: 500, y: 400 });
    expect(nextTarget(m, null, 1000 + HIPPO.tapBufferMs + 1)).toBeNull();
    expect(nextTarget(m, { x: 1, y: 2 }, 99999)).toEqual({ x: 1, y: 2 });
  });
});

import { describe, expect, it } from 'vitest';
import { LAYOUT, MILKRACE, ROUND_RAMP } from '../../src/games/milkrace/config';
import {
  DEFAULT_PARAMS as P,
  advance,
  beatPhase,
  beatTime,
  bell,
  combo,
  createState,
  friskyAt,
  localToScreen,
  makeBellSchedule,
  makeFriskyPlan,
  mulberry32,
  reset,
  roundDifficulty,
  screenToLocal,
  squirtSize,
  stageBellSchedule,
  tap,
  type MilkState,
} from '../../src/games/milkrace/logic';

const D1 = roundDifficulty(1);

/** Plays alternating taps every `gap` ms of clock time (stageT advances with the clock) and returns ms until the stage changed or the tank was full. */
function fillStage(s: MilkState, gap: number, start = 0): number {
  const stage = s.stage;
  let t = start;
  let n = 0;
  while (s.stage === stage && s.level < 1 && n < 5000) {
    t += gap;
    advance(s, gap, D1);
    tap(s, (n % 2) as 0 | 1, t, P, D1);
    n++;
  }
  return t - start;
}

/** Plays the Rhythm stage: taps beat k when hit(k) is true (with `jitter` ms error), nothing otherwise. Returns ms taken. */
function rhythmStage(s: MilkState, hit: (k: number) => boolean, jitter = 30, d = D1): number {
  let now = 50000;
  let elapsed = 0;
  for (let k = 0; s.stage === 1 && k < 2000; k++) {
    const target = Math.max(beatTime(k, d) + (k % 2 ? jitter : -jitter), s.stageT + 1);
    const dt = target - s.stageT;
    elapsed += dt;
    now += dt;
    advance(s, dt, d);
    if (hit(k)) tap(s, (k % 2) as 0 | 1, now, P, d);
  }
  return elapsed;
}

describe('milk race logic', () => {
  it('alternating pads squirt, the first tap may use either pad', () => {
    const s = createState();
    expect(tap(s, 1, 1000).kind).toBe('squirt');
    expect(tap(s, 0, 1300).kind).toBe('squirt');
    expect(s.level).toBeGreaterThan(0);
  });

  it('the same pad twice splats: no milk and the combo drops', () => {
    const s = createState();
    tap(s, 0, 1000);
    tap(s, 1, 1200);
    tap(s, 0, 1400);
    const before = { level: s.level, rate: s.rate };
    expect(tap(s, 0, 1600).kind).toBe('splat');
    expect(s.level).toBe(before.level);
    expect(s.rate).toBeLessThan(before.rate);
    expect(tap(s, 1, 1800).kind).toBe('squirt'); // recovers right away
  });

  it('squirt size grows with the rate and is capped', () => {
    expect(squirtSize(0)).toBe(P.minSquirt);
    expect(squirtSize(P.slowRate)).toBe(P.minSquirt);
    expect(squirtSize(4)).toBeGreaterThan(squirtSize(2.5));
    expect(squirtSize(100)).toBe(P.maxSquirt);
  });

  it('a fast rhythm fills a stage faster than a slow one; a normal stage lasts 12-30 s', () => {
    expect(fillStage(createState(), 150)).toBeLessThan(fillStage(createState(), 400));
    const normal = fillStage(createState(), 250);
    expect(normal).toBeGreaterThan(12000);
    expect(normal).toBeLessThan(30000);
  });

  it('a stage ends at its tank mark: the level stops there, the next stage starts fresh', () => {
    const s = createState();
    s.level = 1 / 3 - 0.001;
    const r = tap(s, 0, 1000);
    expect(r.kind === 'squirt' && r.stageDone).toBe(true);
    expect(r.kind === 'squirt' && r.won).toBe(false);
    expect(s.level).toBeCloseTo(1 / 3);
    expect(s.stage).toBe(1);
    expect(s.stageT).toBe(0);
    expect(s.last).toBeNull();
    expect(tap(s, 0, 1100).kind).toBe('squirt'); // either pad may start the next stage
  });

  it('winning is reported once the whole tank is full and the state freezes', () => {
    const s = createState();
    s.stage = 2;
    s.level = 0.999;
    const r = tap(s, 0, 1000);
    expect(r.kind === 'squirt' && r.won).toBe(true);
    expect(s.level).toBe(1);
    expect(tap(s, 1, 2000).kind).toBe('ignored');
    expect(bell(s).won).toBe(false);
  });

  it('a whole round takes 45-70 s at a decent pace (warm-up, rhythm with 75% of the beats hit, frisky)', () => {
    const s = createState();
    let total = fillStage(s, 230); // warm-up, ~4.3 taps/s
    expect(s.stage).toBe(1);
    total += rhythmStage(s, (k) => k % 4 !== 3);
    expect(s.stage).toBe(2);
    total += fillStage(s, 300, 200000); // frisky: slower because the pads move
    expect(s.level).toBe(1);
    expect(total).toBeGreaterThan(45000);
    expect(total).toBeLessThan(70000);
  });

  it('ignores taps closer than the minimum gap', () => {
    const s = createState();
    tap(s, 0, 1000);
    expect(tap(s, 1, 1000 + P.minTapGapMs - 1).kind).toBe('ignored');
  });

  it('a long pause restarts the rhythm at the slow rate', () => {
    const s = createState();
    for (let i = 0; i < 6; i++) tap(s, (i % 2) as 0 | 1, i * 150);
    expect(s.rate).toBeGreaterThan(4);
    tap(s, 0, 10000);
    expect(s.rate).toBe(P.slowRate);
  });

  it('the bell adds a bonus, never past the end of its stage, and can win in the last stage', () => {
    const s = createState();
    expect(bell(s)).toEqual({ won: false, stageDone: false });
    expect(s.level).toBeCloseTo(P.bellBonus);
    s.level = 1 / 3 - 0.01;
    expect(bell(s).stageDone).toBe(true);
    expect(s.level).toBeCloseTo(1 / 3);
    s.stage = 2;
    s.level = 0.99;
    expect(bell(s).won).toBe(true);
  });

  it('combo meter follows the rate and fades while idle', () => {
    const s = createState();
    for (let i = 0; i < 8; i++) tap(s, (i % 2) as 0 | 1, i * 150);
    const now = 7 * 150;
    expect(combo(s, now)).toBeGreaterThan(0.6);
    expect(combo(s, now + 800)).toBeLessThan(combo(s, now));
    expect(combo(s, now + P.idleResetMs + 1)).toBe(0);
  });

  it('reset clears everything', () => {
    const s = createState();
    tap(s, 0, 100);
    s.stage = 2;
    reset(s);
    expect(s).toEqual(createState());
  });

  describe('rhythm stage', () => {
    const rhythm = (): MilkState => {
      const s = createState();
      s.stage = 1;
      s.level = 1 / 3;
      return s;
    };
    const tapAt = (s: MilkState, stageT: number, pad: 0 | 1, now: number) => {
      advance(s, stageT - s.stageT, D1);
      return tap(s, pad, now, P, D1);
    };

    it('on the beat squirts big, perfect bigger, off the beat only a little', () => {
      const s = rhythm();
      const perfect = tapAt(s, beatTime(0, D1), 0, 1000);
      const good = tapAt(s, beatTime(1, D1) + D1.beatGoodMs - 5, 1, 2000);
      const off = tapAt(s, beatTime(1, D1) + D1.beatPeriodMs / 2, 0, 3000);
      expect(perfect.kind === 'squirt' && perfect.beat).toBe('perfect');
      expect(good.kind === 'squirt' && good.beat).toBe('good');
      expect(off.kind === 'squirt' && off.beat).toBe('off');
      const a = (r: typeof perfect) => (r.kind === 'squirt' ? r.amount : 0);
      expect(a(perfect)).toBeGreaterThan(a(good));
      expect(a(good)).toBeGreaterThan(a(off) * 8);
      expect(a(off)).toBeGreaterThan(0); // never nothing, never negative
    });

    it('each beat pays out once; a second tap in the same window is off-beat', () => {
      const s = rhythm();
      tapAt(s, beatTime(0, D1), 0, 1000);
      const again = tapAt(s, beatTime(0, D1) + 60, 1, 1100);
      expect(again.kind === 'squirt' && again.beat).toBe('off');
    });

    it('a streak of on-beat taps pays a bonus, a missed beat resets it', () => {
      const s = rhythm();
      const amounts: number[] = [];
      for (let k = 0; k < 4; k++) {
        const r = tapAt(s, beatTime(k, D1), (k % 2) as 0 | 1, 1000 + k * 700);
        if (r.kind === 'squirt') amounts.push(r.amount);
      }
      expect(amounts[3]).toBeGreaterThan(amounts[0]);
      expect(combo(s, 0)).toBeGreaterThan(0);
      advance(s, D1.beatPeriodMs * 2, D1); // skip a beat
      expect(s.streak).toBe(0);
    });

    it('a full stage is 15-35 s with 70% of the beats hit; pure spamming off the beat is far slower', () => {
      const decent = rhythmStage(rhythm(), (k) => k % 10 < 7);
      expect(decent).toBeGreaterThan(15000);
      expect(decent).toBeLessThan(35000);
      const s = rhythm();
      let now = 1000;
      let spamT = 0;
      for (let i = 0; i < 400 && s.stage === 1; i++) {
        advance(s, 230, D1);
        now += 230;
        spamT += 230;
        tap(s, (i % 2) as 0 | 1, now, P, D1);
      }
      expect(spamT).toBeGreaterThan(40000);
    });

    it('beat phase runs 0 -> 1 toward the next beat', () => {
      const s = rhythm();
      advance(s, beatTime(0, D1) - D1.beatPeriodMs / 2, D1);
      expect(beatPhase(s, D1)).toBeCloseTo(0.5, 1);
      advance(s, D1.beatPeriodMs / 2, D1);
      expect(beatPhase(s, D1)).toBeCloseTo(1, 1);
    });
  });

  describe('frisky cow', () => {
    it('is seeded, never repeats a layout twice in a row, and shuffles about every shuffleMs', () => {
      const plan = makeFriskyPlan(9, 3000, LAYOUT.padSlots.length);
      expect(makeFriskyPlan(9, 3000, LAYOUT.padSlots.length)).toEqual(plan);
      expect(makeFriskyPlan(10, 3000, LAYOUT.padSlots.length)).not.toEqual(plan);
      expect(plan.slots[0]).toBe(0);
      for (let i = 1; i < plan.slots.length; i++) expect(plan.slots[i]).not.toBe(plan.slots[i - 1]);
      expect(plan.times[0]).toBe(MILKRACE.firstShuffleMs);
      for (let i = 1; i < plan.times.length; i++) {
        const gap = plan.times[i] - plan.times[i - 1];
        expect(gap).toBeGreaterThanOrEqual(3000 * 0.8 - 1);
        expect(gap).toBeLessThanOrEqual(3000 * 1.2 + 1);
      }
    });

    it('warns before moving, slides, then rests in the new layout', () => {
      const plan = makeFriskyPlan(3, 3000, LAYOUT.padSlots.length);
      const t0 = plan.times[0];
      expect(friskyAt(plan, 100)).toMatchObject({ from: 0, to: 0, warn: 0 });
      expect(friskyAt(plan, t0 - MILKRACE.shuffleWarnMs / 2).warn).toBeCloseTo(0.5);
      const mid = friskyAt(plan, t0 + MILKRACE.shuffleMoveMs / 2);
      expect(mid.from).toBe(0);
      expect(mid.to).toBe(plan.slots[1]);
      expect(mid.move).toBeCloseTo(0.5);
      expect(friskyAt(plan, t0 + MILKRACE.shuffleMoveMs + 10)).toMatchObject({ from: plan.slots[1], to: plan.slots[1], move: 1 });
    });

    it('all pad layouts keep the pads apart and clear of the tank', () => {
      for (const [a, b] of LAYOUT.padSlots) {
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(2 * LAYOUT.padR - 10);
        for (const q of [a, b]) expect(q.x + LAYOUT.padR).toBeLessThan(LAYOUT.bucketX - (LAYOUT.bucketW - 56) / 2);
      }
    });
  });

  it('the difficulty ramps up round by round and then stays', () => {
    const r1 = roundDifficulty(1);
    const r4 = roundDifficulty(4);
    expect(r4.beatPeriodMs).toBeLessThan(r1.beatPeriodMs);
    expect(r4.beatGoodMs).toBeLessThan(r1.beatGoodMs);
    expect(r4.shuffleMs).toBeLessThan(r1.shuffleMs);
    expect(r4.bellLifeMs).toBeLessThan(r1.bellLifeMs);
    expect(roundDifficulty(9)).toEqual(r4);
    expect(r4.beatGoodMs * 2).toBeLessThan(r4.beatPeriodMs); // windows never overlap
    expect(Math.min(...ROUND_RAMP.bellLifeMs)).toBeGreaterThanOrEqual(1800); // never too fast for a 5 year old
  });

  it('bell schedule is seeded, never the same spot twice in a row; Frisky has many more bells', () => {
    const a = makeBellSchedule(5, 8, 3);
    expect(makeBellSchedule(5, 8, 3)).toEqual(a);
    expect(makeBellSchedule(6, 8, 3)).not.toEqual(a);
    for (let i = 1; i < a.length; i++) {
      expect(a[i].spot).not.toBe(a[i - 1].spot);
      expect(a[i].at).toBeGreaterThan(a[i - 1].at + a[i - 1].life);
    }
    const count = (st: 0 | 1 | 2) => stageBellSchedule(1, 1, st, 3, 30).filter((e) => e.at < 20000).length;
    expect(count(2)).toBeGreaterThan(count(0));
    expect(stageBellSchedule(7, 2, 1, 3)).toEqual(stageBellSchedule(7, 2, 1, 3));
  });

  it('mulberry32 is deterministic', () => {
    expect(mulberry32(3)()).toBe(mulberry32(3)());
  });

  it('local <-> screen frames round-trip and "down" points at the player', () => {
    for (const p of [0, 1] as const) {
      const cx = p === 0 ? 480 : 1440;
      const sc = localToScreen(p, cx, 540, 70, 200);
      const back = screenToLocal(p, cx, 540, sc.x, sc.y);
      expect(back.x).toBeCloseTo(70);
      expect(back.y).toBeCloseTo(200);
    }
    expect(localToScreen(0, 480, 540, 0, 200).x).toBeLessThan(480); // player 0 sits at the left
    expect(localToScreen(1, 1440, 540, 0, 200).x).toBeGreaterThan(1440);
  });
});

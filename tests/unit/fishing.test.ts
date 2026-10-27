import { describe, expect, it } from 'vitest';
import { FISHING as C } from '../../src/games/fishing/config';
import {
  DEFAULT_PARAMS as P, computeCast, createPond, createReel, createRng, hookFish, inPond, makeNervous, patternSegments, pickKind, pickPattern, pointsFor, reelTell, resetFish, retireFish, rodTip, spookFish,
  stepPond, stepReel, tensionLevel, wiggleLure, REEL_PATTERNS,
  type Fish, type Lure, type Reel,
} from '../../src/games/fishing/logic';
import { W } from '../../src/core/layout';

const rng = () => createRng(7);

describe('casting', () => {
  it('ignores short or backward pulls', () => {
    expect(computeCast(0, { x: 10, y: 0 })).toBeNull();
    expect(computeCast(0, { x: -200, y: 0 })).toBeNull();
    expect(computeCast(1, { x: 200, y: 0 })).toBeNull();
  });
  it('pulls farther = lands farther, mirrored for player 1, always in the pond', () => {
    const a = computeCast(0, { x: 80, y: 0 })!;
    const b = computeCast(0, { x: 200, y: 0 })!;
    expect(b.to.x).toBeGreaterThan(a.to.x);
    expect(b.power).toBeGreaterThan(a.power);
    expect(b.durationMs).toBeGreaterThan(a.durationMs);
    const m = computeCast(1, { x: -200, y: 0 })!;
    expect(m.to.x).toBeCloseTo(W - b.to.x);
    for (const pull of [{ x: 5000, y: 5000 }, { x: 300, y: -5000 }, { x: 60, y: 60 }]) {
      for (const p of [0, 1] as const) {
        const c = computeCast(p, { x: pull.x * (p === 0 ? 1 : -1), y: pull.y });
        if (c) expect(inPond(c.to.x, c.to.y)).toBe(true);
      }
    }
  });
  it('pulling down aims down (slingshot) and the angle is limited', () => {
    const c = computeCast(0, { x: 100, y: 5000 })!;
    expect(c.to.y).toBeGreaterThan(rodTip(0).y);
    const ang = Math.atan2(c.to.y - rodTip(0).y, c.to.x - rodTip(0).x);
    expect(ang).toBeLessThanOrEqual((C.maxCastAngleDeg * Math.PI) / 180 + 1e-6);
  });
  it('wiggle stays near the landing spot and in the pond', () => {
    const land = { x: 900, y: 500 };
    let l = { ...land };
    for (let i = 0; i < 50; i++) l = wiggleLure(l, land, 40, 40);
    expect(Math.hypot(l.x - land.x, l.y - land.y)).toBeLessThanOrEqual(C.wiggleRange + 1e-6);
  });
});

const kindIdx = (id: string): number => C.kinds.findIndex((k) => k.id === id);

describe('fish', () => {
  it('stay in the pond, mix kinds, respect maxAlive', () => {
    const r = rng();
    const pond = createPond(r);
    expect(pond).toHaveLength(C.fishCount);
    expect(C.fishCount).toBeGreaterThanOrEqual(12);
    for (let i = 0; i < 6000; i++) stepPond(pond, [null, null], 16, r);
    for (const f of pond) expect(inPond(f.x, f.y)).toBe(true);
    const counts = new Array(C.kinds.length).fill(0);
    for (let i = 0; i < 6000; i++) counts[pickKind(r)]++;
    for (const c of counts) expect(c).toBeGreaterThan(0);
    expect(counts[kindIdx('minnow')]).toBeGreaterThan(counts[kindIdx('giant')]);
    expect(counts[kindIdx('golden')]).toBeLessThan(counts[kindIdx('minnow')]);
    // a golden fish already swimming => no second one
    const g = kindIdx('golden');
    for (let i = 0; i < 500; i++) expect(pickKind(r, P, [g])).not.toBe(g);
    for (let i = 0; i < 20; i++) expect(new Set(createPond(createRng(i)).map((f) => f.kind)).size).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < 20; i++) expect(createPond(createRng(i)).filter((f) => f.kind === g).length).toBeLessThanOrEqual(1);
  });

  it('points scale: junk 0-1, golden 6, every other kind 1-5, target needs a real match', () => {
    expect(pointsFor(kindIdx('boot'))).toBe(0);
    expect(pointsFor(kindIdx('can'))).toBeLessThanOrEqual(1);
    expect(pointsFor(kindIdx('golden'))).toBe(6);
    expect(pointsFor(kindIdx('trickster'))).toBe(4);
    expect(pointsFor(kindIdx('jumper'))).toBe(4);
    expect(pointsFor(kindIdx('shy'))).toBe(3);
    expect(pointsFor(kindIdx('darter'))).toBe(2);
    for (const k of C.kinds) expect(k.name.en.length > 0 && k.name.nl.length > 0).toBe(true);
    // expected points per catch (weighted) => ~13-20 catches needed to reach the target
    const tot = C.kinds.reduce((s, k) => s + k.weight, 0);
    const avg = C.kinds.reduce((s, k) => s + k.weight * k.points, 0) / tot;
    expect(C.targetScore / avg).toBeGreaterThan(11);
    expect(C.targetScore / avg).toBeLessThan(24);
  });

  const fishAt = (x: number, y: number, kind = 0): Fish => Object.assign(resetFish({ id: 0 } as Fish, rng()), { x, y, kind });
  const run = (f: Fish, lure: Lure | (() => Lure), maxMs: number, until: (ev: string[]) => boolean, seed = 7) => {
    const r = createRng(seed);
    const seen: string[] = [];
    for (let t = 0; t < maxMs && !until(seen); t += 16) {
      for (const e of stepPond([f], [typeof lure === 'function' ? lure() : lure, null], 16, r)) seen.push(e.type);
    }
    return seen;
  };

  it('a nearby fish approaches, nibbles, then bites; tapping hooks it', () => {
    const f = fishAt(900, 500);
    const seen = run(f, { x: 1000, y: 500, activity: 0 }, 20000, (s) => s.includes('bite'));
    expect(seen).toEqual(['nibble', 'bite']);
    expect(f.state).toBe('bite');
    expect(hookFish(f)).toBe(true);
    expect(f.state).toBe('hooked');
  });

  it('a missed bite makes the fish lose interest for a while', () => {
    const f = fishAt(1000, 500);
    const seen = run(f, { x: 1000, y: 500, activity: 0 }, 30000, (s) => s.includes('missed'));
    expect(seen).toEqual(['nibble', 'bite', 'missed']);
    expect(f.state).toBe('swim');
    expect(f.ignoreMs).toBeGreaterThan(0);
    expect(hookFish(f)).toBe(false);
  });

  it('far fish ignore the lure; wiggling widens the range; a lure belongs to one fish', () => {
    const r = rng();
    const far = fishAt(1000 + C.noticeRadius + 60, 500);
    const lure: Lure = { x: 1000, y: 500, activity: 0 };
    stepPond([far], [lure, null], 16, r);
    expect(far.state).toBe('swim');
    stepPond([far], [{ ...lure, activity: 1 }, null], 16, r);
    expect(far.state).toBe('approach');
    const a = fishAt(900, 500);
    const b = fishAt(920, 520);
    stepPond([a, b], [lure, null], 16, r);
    expect([a.state, b.state].filter((s) => s === 'approach')).toHaveLength(1);
  });

  it('releases the fish when the lure is pulled out', () => {
    const r = rng();
    const f = fishAt(900, 500);
    stepPond([f], [{ x: 1000, y: 500, activity: 0 }, null], 16, r);
    expect(f.state).toBe('approach');
    stepPond([f], [null, null], 16, r);
    expect(f.state).toBe('swim');
    expect(f.target).toBeNull();
  });

  it('a caught fish respawns later as a (possibly) different kind, away from the lures', () => {
    const r = rng();
    const pond = createPond(r);
    const f = pond[0];
    retireFish(f);
    expect(f.state).toBe('gone');
    const lure: Lure = { x: 900, y: 500, activity: 0 };
    let ev: string[] = [];
    for (let t = 0; t < C.respawnMs - 100; t += 16) ev = ev.concat(stepPond(pond, [lure, null], 16, r).map((e) => e.type));
    expect(f.state).toBe('gone');
    for (let t = 0; t < 400; t += 16) ev = ev.concat(stepPond(pond, [lure, null], 16, r).map((e) => e.type));
    expect(ev).toContain('respawn');
    expect(f.state).not.toBe('gone');
    expect(inPond(f.x, f.y)).toBe(true);
  });

  it('darter: fast and erratic, attracted by small wiggles but bolts when you wiggle too much', () => {
    const d = kindIdx('darter');
    expect(C.kinds[d].speed).toBeGreaterThan(2 * C.kinds[kindIdx('perch')].speed);
    expect(C.kinds[d].points).toBe(2);
    const f = fishAt(900, 500, d);
    const seen = run(f, { x: 1000, y: 500, activity: 0.4 }, 4000, (s) => s.includes('nibble'));
    expect(seen).toContain('nibble');
    const f2 = fishAt(900, 500, d);
    const seen2 = run(f2, { x: 1000, y: 500, activity: 1 }, 4000, (s) => s.includes('scared'));
    expect(seen2).toContain('scared');
    expect(f2.state).toBe('swim');
    expect(f2.ignoreMs).toBeGreaterThan(3000);
  });

  it('shy fish ignore a moving lure, wait while you wiggle, flee at big wiggles, and bite a still lure', () => {
    const s = kindIdx('shy');
    const moving = fishAt(950, 500, s);
    expect(run(moving, { x: 1000, y: 500, activity: 0.2 }, 6000, (e) => e.length > 0)).toEqual([]);
    expect(moving.state).toBe('swim');
    // approaching, then the lure moves a bit: it stops; moves a lot: it flees
    const r = createRng(3);
    const f = fishAt(900, 500, s);
    stepPond([f], [{ x: 1000, y: 500, activity: 0 }, null], 16, r);
    expect(f.state).toBe('approach');
    const x0 = f.x;
    for (let i = 0; i < 20; i++) stepPond([f], [{ x: 1000, y: 500, activity: 0.2 }, null], 16, r);
    expect(Math.abs(f.x - x0)).toBeLessThan(2);
    const ev = stepPond([f], [{ x: 1000, y: 500, activity: 0.9 }, null], 16, r);
    expect(ev.map((e) => e.type)).toEqual(['scared']);
    expect(f.state).toBe('swim');
    expect(f.ignoreMs).toBeGreaterThan(3000);
    const still = fishAt(900, 500, s);
    expect(run(still, { x: 1000, y: 500, activity: 0 }, 20000, (e) => e.includes('bite'))).toEqual(['nibble', 'bite']);
  });

  it('trickster: fake bites first (bobber dips, "?"), tapping one spooks it for 5 s, only the real bite hooks', () => {
    const t = kindIdx('trickster');
    // with the player never tapping: fake(s), then the real bite, then missed
    for (let seed = 1; seed <= 10; seed++) {
      const f = fishAt(900, 500, t);
      const seen = run(f, { x: 1000, y: 500, activity: 0 }, 60000, (e) => e.includes('missed'), seed);
      const i = seen.indexOf('bite');
      expect(seen.filter((e) => e === 'fake').length).toBeGreaterThanOrEqual(1);
      expect(seen.filter((e) => e === 'fake').length).toBeLessThanOrEqual(C.fakesMax);
      expect(seen.lastIndexOf('fake')).toBeLessThan(i);
      expect(seen.filter((e) => e === 'bite')).toHaveLength(1);
    }
    // during a fake: cannot hook; tapping spooks
    const f = fishAt(900, 500, t);
    run(f, { x: 1000, y: 500, activity: 0 }, 30000, (e) => e.includes('fake'));
    expect(f.state).toBe('bite');
    expect(f.fake).toBe(true);
    expect(hookFish(f)).toBe(false);
    expect(f.state).toBe('bite');
    expect(spookFish(f)).toBe(true);
    expect(f.state).toBe('swim');
    expect(f.ignoreMs).toBeGreaterThanOrEqual(C.spookMs - 20);
    // spooked: ignores the lure for the whole time
    const r = createRng(2);
    let noticed = false;
    for (let ms = 0; ms < C.spookMs - 500; ms += 16) {
      stepPond([f], [{ x: f.x + 30, y: f.y, activity: 0 }, null], 16, r);
      if (f.state !== 'swim') noticed = true;
    }
    expect(noticed).toBe(false);
    // the real bite can be hooked, and spookFish does nothing to it
    const g = fishAt(900, 500, t);
    run(g, { x: 1000, y: 500, activity: 0 }, 60000, (e) => e.includes('bite'));
    expect(g.fake).toBe(false);
    expect(spookFish(g)).toBe(false);
    expect(hookFish(g)).toBe(true);
  });

  it('an unanswered fake bite goes back to nibbling instead of being a miss', () => {
    const f = fishAt(900, 500, kindIdx('trickster'));
    const seen = run(f, { x: 1000, y: 500, activity: 0 }, 30000, (e) => e.includes('fake'));
    expect(seen.at(-1)).toBe('fake');
    const r = createRng(9);
    for (let ms = 0; ms < C.fakeWindowMs + 100; ms += 16) stepPond([f], [{ x: 1000, y: 500, activity: 0 }, null], 16, r);
    expect(f.state).toBe('nibble');
    expect(f.fake).toBe(false);
  });

  it('fast fish (darter, golden) give a shorter "!" window', () => {
    expect(C.kinds[kindIdx('golden')].biteScale).toBeLessThan(1);
    const f = fishAt(1000, 500, kindIdx('golden'));
    run(f, { x: 1000, y: 500, activity: 0 }, 20000, (e) => e.includes('bite'));
    expect(f.timerMs).toBeLessThan(C.biteWindowMs * 0.6);
  });

  it('hooking a fish makes nearby free fish nervous (they flee and ignore lures)', () => {
    const near = fishAt(900, 500);
    const far = fishAt(900 + C.nervousRadius + 200, 500);
    const hooked = fishAt(850, 500);
    const nibbling = Object.assign(fishAt(880, 520), { state: 'nibble' as const });
    expect(makeNervous([near, far, hooked, nibbling], { x: 850, y: 500 }, hooked)).toBe(1);
    expect(near.ignoreMs).toBeGreaterThan(2000);
    expect(near.nervousMs).toBeGreaterThan(0);
    expect(far.ignoreMs).toBe(0);
    expect(nibbling.state).toBe('nibble');
    const r = createRng(1);
    stepPond([near], [{ x: near.x + 20, y: near.y, activity: 1 }, null], 16, r);
    expect(near.state).toBe('swim');
  });
});

describe('reel fight', () => {
  type Policy = (r: Reel) => boolean;
  const play = (kind: number, mk: () => Policy, seed = 1, maxMs = 120000) => {
    const r = createRng(seed);
    const reel = createReel(kind, P, r);
    const pol = mk();
    for (let t = 0; t < maxMs; t += 16) {
      const res = stepReel(reel, 16, pol(reel), r);
      if (res) return { res, t, reel };
    }
    return { res: null, t: maxMs, reel };
  };
  /** Perfect: reels only while the fish rests, lets go for every burst and every leap. */
  const perfect = (): Policy => (r) => !(r.burst || r.leap !== 'none');
  /** Reacts `lagMs` late to what the fish does (a kid). */
  const lagged = (lagMs: number): Policy => {
    const hist: boolean[] = [];
    return (r) => {
      hist.push(perfect()(r));
      return hist[Math.max(0, hist.length - 1 - Math.round(lagMs / 16))];
    };
  };

  it('a perfect player lands every kind within a minute (every seed)', () => {
    for (let kind = 0; kind < C.kinds.length; kind++) {
      for (let seed = 1; seed <= 25; seed++) {
        const out = play(kind, perfect, seed);
        expect(out.res, `${C.kinds[kind].id} seed ${seed}`).toBe('caught');
        expect(out.t).toBeLessThan(60000);
      }
    }
  });
  it('bigger / stronger fish take longer than small ones and junk is a quick catch', () => {
    const avg = (id: string) => {
      let s = 0;
      for (let seed = 1; seed <= 20; seed++) s += play(kindIdx(id), perfect, seed).t;
      return s / 20;
    };
    expect(avg('giant')).toBeGreaterThan(avg('perch') * 1.5);
    expect(avg('golden')).toBeGreaterThan(avg('minnow') * 1.8);
    expect(avg('boot')).toBeLessThan(avg('minnow') * 0.6);
    expect(avg('boot')).toBeLessThan(6000);
  });
  it('fish stamina matters: a big fish needs several rest-reel cycles', () => {
    for (const id of ['giant', 'golden']) {
      const out = play(kindIdx(id), perfect, 4);
      expect(out.reel.patterns).toBeGreaterThanOrEqual(4);
    }
    const out = play(kindIdx('minnow'), perfect, 4);
    expect(out.reel.patterns).toBeLessThanOrEqual(5);
    // stamina drains while the fish bursts against a loose line, and a tired fish is reeled in faster
    const fresh = createReel(kindIdx('bass'), P, rng());
    const tired = createReel(kindIdx('bass'), P, rng());
    tired.stamina = 0.1;
    const r = createRng(1);
    fresh.timerMs = tired.timerMs = 9999;
    stepReel(fresh, 1000, true, r);
    stepReel(tired, 1000, true, r);
    expect(1 - tired.dist).toBeGreaterThan(1 - fresh.dist);
    const burst = createReel(kindIdx('bass'), P, rng());
    burst.burst = true;
    burst.timerMs = 9999;
    stepReel(burst, 1000, false, r);
    expect(burst.stamina).toBeLessThan(0.9);
  });
  it('a kid who reacts 350 ms late still lands small and mid fish most of the time', () => {
    for (const id of ['minnow', 'perch', 'darter', 'can']) {
      let wins = 0;
      for (let seed = 1; seed <= 30; seed++) if (play(kindIdx(id), () => lagged(350), seed).res === 'caught') wins++;
      expect(wins, id).toBeGreaterThanOrEqual(26);
    }
  });
  it('a kid who reacts 200 ms late lands every kind at least 80% of the time', () => {
    for (let kind = 0; kind < C.kinds.length; kind++) {
      let wins = 0;
      for (let seed = 1; seed <= 30; seed++) if (play(kind, () => lagged(200), seed).res === 'caught') wins++;
      expect(wins, C.kinds[kind].id).toBeGreaterThanOrEqual(24);
    }
  });
  it('never letting go snaps the line; never reeling never catches', () => {
    for (let kind = 0; kind < C.kinds.length; kind++) {
      // junk barely fights: holding the whole time just reels it in (comedy), every real fish snaps the line
      if (C.kinds[kind].behavior !== 'junk') expect(play(kind, () => () => true, 3).res, C.kinds[kind].id).toBe('snap');
      expect(play(kind, () => () => false, 3, 60000).res, C.kinds[kind].id).toBeNull();
    }
  });
  it('no instant snaps: the first seconds of a fight are safe even when holding, and a burst takes >= 0.7 s to snap', () => {
    for (let kind = 0; kind < C.kinds.length; kind++) {
      const r = createRng(kind + 1);
      const reel = createReel(kind, P, r);
      let t = 0;
      for (; t < 1000; t += 16) expect(stepReel(reel, 16, true, r)).toBeNull();
      // continuous holding: snap not before first burst has had time to build tension
      const k = C.kinds[kind];
      if (k.behavior === 'junk') continue;
      let res: string | null = null;
      for (; t < 20000 && !res; t += 16) res = stepReel(reel, 16, true, r);
      expect(res).toBe('snap');
      expect(t).toBeGreaterThan(1800);
    }
  });
  it('tension colour levels and bounds', () => {
    expect(tensionLevel(0.1)).toBe('ok');
    expect(tensionLevel(0.7)).toBe('warn');
    expect(tensionLevel(0.9)).toBe('danger');
    const reel = createReel(3, P, rng());
    const r = rng();
    for (let i = 0; i < 2000; i++) {
      stepReel(reel, 16, i % 7 < 4, r);
      expect(reel.tension).toBeGreaterThanOrEqual(0);
      expect(reel.dist).toBeLessThanOrEqual(1);
      expect(reel.stamina).toBeGreaterThanOrEqual(0);
      expect(reel.stamina).toBeLessThanOrEqual(1);
    }
  });
  it('the first moments of a fight are calm', () => {
    const reel = createReel(3);
    expect(reel.burst).toBe(false);
    expect(reel.timerMs).toBe(C.reel.firstRestMs);
    expect(reel.queue[0].power).toBeLessThan(1);
  });

  it('patterns: single, double (short gap), long pull and feint (twitch, fake rest, hard burst)', () => {
    const r = createRng(5);
    const single = patternSegments('single', r);
    expect(single.map((s) => s.burst)).toEqual([false, true]);
    const dbl = patternSegments('double', r);
    expect(dbl.map((s) => s.burst)).toEqual([false, true, false, true]);
    expect(dbl[2].ms).toBeLessThan(C.reel.restMs[0] / 2);
    expect(dbl[1].ms).toBeLessThan(C.reel.burstMs[0]);
    const long = patternSegments('long', r);
    expect(long[1].ms).toBeGreaterThanOrEqual(C.reel.longBurstMs[0]);
    expect(long[1].ms).toBeGreaterThan(single[1].ms * 1.3);
    const feint = patternSegments('feint', r);
    expect(feint.map((s) => s.burst)).toEqual([false, true, false, true]);
    expect(feint[1].power).toBeLessThan(0.5); // harmless twitch
    expect(feint[3].power).toBeGreaterThan(1.1); // the real thing
    expect(feint[0].tell).toBeLessThan(single[0].tell); // weaker warning
  });
  it('trickier fish pick the nasty patterns more often; all patterns occur in a long fight', () => {
    const count = (trick: number) => {
      const r = createRng(11);
      const c: Record<string, number> = {};
      for (let i = 0; i < 4000; i++) {
        const p = pickPattern(r, trick);
        c[p] = (c[p] ?? 0) + 1;
      }
      return c;
    };
    const easy = count(0.2);
    const hard = count(1.4);
    for (const p of REEL_PATTERNS) expect(hard[p]).toBeGreaterThan(0);
    expect(hard.feint).toBeGreaterThan(easy.feint * 2);
    expect(hard.single / 4000).toBeLessThan(easy.single / 4000);
  });
  it('the line twitches (tell) shortly before every burst, never during one', () => {
    const r = createRng(8);
    const reel = createReel(kindIdx('golden'), P, r);
    let burstsSeen = 0;
    let prevBurst = false;
    let tellBefore = false;
    for (let i = 0; i < 6000; i++) {
      stepReel(reel, 16, !reel.burst, r);
      if (reel.burst) expect(reelTell(reel)).toBe(false);
      if (reelTell(reel)) tellBefore = true;
      if (reel.burst && !prevBurst) {
        burstsSeen++;
        expect(tellBefore).toBe(true);
        tellBefore = false;
      }
      prevBurst = reel.burst;
      if (reel.dist <= 0 || reel.tension >= 1) {
        reel.dist = 1;
        reel.tension = 0;
      }
    }
    expect(burstsSeen).toBeGreaterThan(10);
  });

  it('jumper: warns with a JUMP! cue, holding in the air spikes tension, letting go is safe', () => {
    const j = kindIdx('jumper');
    const warnOnly = (holdInAir: boolean) => {
      const r = createRng(21);
      const reel = createReel(j, P, r);
      const phases: string[] = [];
      let snapped = false;
      let holdPastWarn = false;
      for (let t = 0; t < 40000 && !snapped; t += 16) {
        const rest = !(reel.burst || reel.leap !== 'none');
        const hold = reel.leap === 'air' ? holdInAir : rest;
        const res = stepReel(reel, 16, hold, r);
        if (phases[phases.length - 1] !== reel.leap) phases.push(reel.leap);
        if (reel.leap === 'air' && hold) holdPastWarn = true;
        if (res === 'snap') snapped = true;
        if (res === 'caught') {
          reel.dist = 1;
        }
      }
      return { snapped, phases, holdPastWarn };
    };
    const safe = warnOnly(false);
    expect(safe.snapped).toBe(false);
    expect(safe.phases).toEqual(expect.arrayContaining(['none', 'warn', 'air']));
    // warn always comes before air
    for (let i = 1; i < safe.phases.length; i++) if (safe.phases[i] === 'air') expect(safe.phases[i - 1]).toBe('warn');
    const risky = warnOnly(true);
    expect(risky.snapped).toBe(true);
    // non-jumpers never leap
    const r = createRng(2);
    const other = createReel(kindIdx('perch'), P, r);
    for (let i = 0; i < 4000; i++) {
      stepReel(other, 16, false, r);
      expect(other.leap).toBe('none');
    }
  });
  it('jumper: the cue is long enough to react (warn >= 600 ms) and the leap is short', () => {
    expect(C.reel.leapWarnMs).toBeGreaterThanOrEqual(600);
    expect(C.reel.leapAirMs).toBeLessThanOrEqual(1100);
    const reel = createReel(kindIdx('jumper'), P, rng());
    // a tense but alive fight (tension 0.35) survives 0.3 s of holding at the start of the leap
    reel.leap = 'air';
    reel.leapMs = 900;
    reel.timerMs = 9999;
    reel.tension = 0.3;
    const r = createRng(1);
    for (let i = 0; i < 18; i++) expect(stepReel(reel, 16, true, r)).toBeNull();
  });
});

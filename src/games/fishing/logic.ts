import { W } from '../../core/layout';
import type { PlayerId } from '../../core/types';
import { FISHING, type FishingConfig } from './config';

export type Params = FishingConfig;
export const DEFAULT_PARAMS: Params = FISHING;

export interface Pt {
  x: number;
  y: number;
}

export type Rng = () => number;

/** Small seedable RNG (mulberry32) so tests are deterministic. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rng: Rng, [a, b]: readonly [number, number]): number => a + (b - a) * rng();
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** +1 for player 0 (casts toward +x), -1 for player 1. */
export const forward = (p: PlayerId): number => (p === 0 ? 1 : -1);

export function rodTip(p: PlayerId, P: Params = DEFAULT_PARAMS): Pt {
  return { x: p === 0 ? P.tipInset : W - P.tipInset, y: P.tipY };
}

export function inPond(x: number, y: number, P: Params = DEFAULT_PARAMS): boolean {
  return x >= P.pond.l && x <= P.pond.r && y >= P.pond.t && y <= P.pond.b;
}

// ---------------------------------------------------------------- casting

export interface Cast {
  to: Pt;
  distance: number;
  /** 0..1 pull strength (for the power bar). */
  power: number;
  durationMs: number;
}

/**
 * Slingshot: `pull` = finger anchor minus finger position. Pulling back (away from the pond) casts forward;
 * pulling to the side aims to the other side. Returns null if the pull is too short or points the wrong way.
 */
export function computeCast(p: PlayerId, pull: Pt, P: Params = DEFAULT_PARAMS): Cast | null {
  const f = pull.x * forward(p);
  const len = Math.hypot(pull.x, pull.y);
  if (f < P.minPull || len < P.minPull) return null;
  const maxA = (P.maxCastAngleDeg * Math.PI) / 180;
  const ang = clamp(Math.atan2(pull.y, f), -maxA, maxA);
  const distance = clamp(len * P.pullScale, P.minCast, P.maxCast);
  const tip = rodTip(p, P);
  const m = P.landMargin;
  const to = {
    x: clamp(tip.x + forward(p) * Math.cos(ang) * distance, P.pond.l + m, P.pond.r - m),
    y: clamp(tip.y + Math.sin(ang) * distance, P.pond.t + m, P.pond.b - m),
  };
  const real = Math.hypot(to.x - tip.x, to.y - tip.y);
  const power = clamp((len * P.pullScale - P.minCast) / (P.maxCast - P.minCast), 0, 1);
  return { to, distance: real, power, durationMs: P.castBaseMs + real * P.castPerPx };
}

/** Move a waiting lure with the finger (wiggle): follows by wiggleGain, stays near where it landed and in the pond. */
export function wiggleLure(lure: Pt, land: Pt, dx: number, dy: number, P: Params = DEFAULT_PARAMS): Pt {
  let x = lure.x + dx * P.wiggleGain;
  let y = lure.y + dy * P.wiggleGain;
  const ox = x - land.x;
  const oy = y - land.y;
  const d = Math.hypot(ox, oy);
  if (d > P.wiggleRange) {
    x = land.x + (ox / d) * P.wiggleRange;
    y = land.y + (oy / d) * P.wiggleRange;
  }
  return { x: clamp(x, P.pond.l + 30, P.pond.r - 30), y: clamp(y, P.pond.t + 30, P.pond.b - 30) };
}

// ---------------------------------------------------------------- fish

export type FishState = 'swim' | 'approach' | 'nibble' | 'bite' | 'hooked' | 'gone';

export interface Fish {
  id: number;
  /** Index into P.kinds. */
  kind: number;
  x: number;
  y: number;
  heading: number;
  targetHeading: number;
  turnMs: number;
  state: FishState;
  /** The player whose lure it is going for. */
  target: PlayerId | null;
  timerMs: number;
  ignoreMs: number;
  /** Phase of the tail wiggle (radians). */
  wiggle: number;
  /** Trickster: this 'bite' is a fake ('?'), tapping it spooks the fish. */
  fake: boolean;
  /** Trickster: fake bites still to come before the real one. */
  fakesLeft: number;
  /** Fled / nervous: swims fast and ignores lures while > 0 (ms). */
  nervousMs: number;
}

/** `alive`: kind indices of the other fish in the pond, to respect maxAlive. */
export function pickKind(rng: Rng, P: Params = DEFAULT_PARAMS, alive: number[] = []): number {
  const w = P.kinds.map((k, i) => (k.maxAlive !== undefined && alive.filter((a) => a === i).length >= k.maxAlive ? 0 : k.weight));
  const total = w.reduce((s, v) => s + v, 0);
  let r = rng() * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (w[i] > 0 && r <= 0) return i;
  }
  return 0;
}

export const pointsFor = (kind: number, P: Params = DEFAULT_PARAMS): number => P.kinds[kind].points;

/** (Re)initialise a fish at a random spot at least 380px from every `avoid` point. `alive`: kinds of the other fish. */
export function resetFish(f: Fish, rng: Rng, P: Params = DEFAULT_PARAMS, avoid: Pt[] = [], alive: number[] = []): Fish {
  const m = P.edgeMargin;
  let x = 0;
  let y = 0;
  for (let i = 0; i < 12; i++) {
    x = P.pond.l + m + rng() * (P.pond.r - P.pond.l - 2 * m);
    y = P.pond.t + m + rng() * (P.pond.b - P.pond.t - 2 * m);
    if (avoid.every((a) => Math.hypot(a.x - x, a.y - y) > 380)) break;
  }
  f.kind = pickKind(rng, P, alive);
  f.x = x;
  f.y = y;
  f.heading = rng() * Math.PI * 2;
  f.targetHeading = f.heading;
  f.turnMs = between(rng, P.turnEveryMs);
  f.state = 'swim';
  f.target = null;
  f.timerMs = 0;
  f.ignoreMs = 0;
  f.wiggle = rng() * 6;
  f.fake = false;
  f.fakesLeft = 0;
  f.nervousMs = 0;
  return f;
}

export function createPond(rng: Rng, P: Params = DEFAULT_PARAMS): Fish[] {
  const fish: Fish[] = [];
  for (let i = 0; i < P.fishCount; i++) {
    fish.push(resetFish({ id: i } as Fish, rng, P, [], fish.map((f) => f.kind)));
  }
  return fish;
}

/** Take a caught fish out of the water; it comes back (as a new random kind, elsewhere) after P.respawnMs. */
export function retireFish(f: Fish, P: Params = DEFAULT_PARAMS): void {
  f.state = 'gone';
  f.target = null;
  f.timerMs = P.respawnMs;
  f.fake = false;
}

/** A lure in the water that fish can see. */
export interface Lure {
  x: number;
  y: number;
  /** 0..1: how much it was wiggled lately (attracts fish from farther away). */
  activity: number;
}

export interface PondEvent {
  type: 'nibble' | 'bite' | 'fake' | 'missed' | 'scared' | 'respawn';
  fish: Fish;
  player: PlayerId;
}

export function noticeRadius(lure: Lure, P: Params = DEFAULT_PARAMS): number {
  return P.noticeRadius + P.wiggleBonus * clamp(lure.activity, 0, 1);
}

const behaviorOf = (f: Fish, P: Params) => P.kinds[f.kind].behavior;

/** Lure activity above which this fish bolts (Infinity = never). */
function scareLevel(f: Fish, P: Params): number {
  const b = behaviorOf(f, P);
  return b === 'shy' ? P.shyScare : b === 'darter' ? P.darterScare : Infinity;
}

function swimStep(f: Fish, dtMs: number, speed: number, rng: Rng, P: Params, wander: boolean): void {
  const s = dtMs / 1000;
  const { l, t, r, b } = P.pond;
  const m = P.edgeMargin;
  const k = P.kinds[f.kind];
  if (wander) {
    if (f.x < l + m || f.x > r - m || f.y < t + m || f.y > b - m) {
      f.targetHeading = Math.atan2((t + b) / 2 - f.y, (l + r) / 2 - f.x);
    } else if (f.nervousMs <= 0) {
      f.turnMs -= dtMs;
      if (f.turnMs <= 0) {
        f.targetHeading = f.heading + (rng() * 2 - 1) * 1.3 * (k.turnAmt ?? 1);
        f.turnMs = between(rng, P.turnEveryMs) * (k.turnScale ?? 1);
      }
    }
  }
  const diff = wrap(f.targetHeading - f.heading);
  const step = P.turnRate * s * (wander ? 1 : 2.5) * (wander && k.turnAmt ? k.turnAmt : 1);
  f.heading = wrap(f.heading + clamp(diff, -step, step));
  f.x = clamp(f.x + Math.cos(f.heading) * speed * s, l, r);
  f.y = clamp(f.y + Math.sin(f.heading) * speed * s, t, b);
  f.wiggle += s * (3 + speed / 12);
}

const release = (f: Fish): void => {
  f.state = 'swim';
  f.target = null;
  f.timerMs = 0;
  f.fake = false;
};

/** The fish bolts away from `from` and ignores lures for a while. */
function flee(f: Fish, from: Pt, ignoreMs: number, P: Params): void {
  release(f);
  f.ignoreMs = Math.max(f.ignoreMs, ignoreMs);
  f.nervousMs = Math.max(f.nervousMs, P.fleeMs);
  f.targetHeading = Math.atan2(f.y - from.y, f.x - from.x);
}

/**
 * Advance the free-swimming fish and their interest in the lures. `lures[p]` is null if player p has no lure
 * in the water. Returns what happened (nibble starts, real bites, fake bites, missed bites, fish scared off, respawns).
 */
export function stepPond(fish: Fish[], lures: Array<Lure | null>, dtMs: number, rng: Rng, P: Params = DEFAULT_PARAMS): PondEvent[] {
  const events: PondEvent[] = [];
  const claimed = new Set<number>();
  for (const f of fish) if (f.target !== null && f.state !== 'swim' && f.state !== 'gone' && lures[f.target]) claimed.add(f.target);
  for (const f of fish) {
    if (f.state === 'hooked') continue;
    if (f.state === 'gone') {
      f.timerMs -= dtMs;
      if (f.timerMs <= 0) {
        const avoid = lures.filter((l): l is Lure => !!l);
        for (const p of [0, 1] as const) avoid.push({ ...rodTip(p, P), activity: 0 });
        resetFish(f, rng, P, avoid, fish.filter((o) => o !== f && o.state !== 'gone').map((o) => o.kind));
        events.push({ type: 'respawn', fish: f, player: 0 });
      }
      continue;
    }
    const k = P.kinds[f.kind];
    const beh = k.behavior;
    f.ignoreMs = Math.max(0, f.ignoreMs - dtMs);
    f.nervousMs = Math.max(0, f.nervousMs - dtMs);
    if (f.target !== null && !lures[f.target]) release(f);
    const lure = f.target !== null ? lures[f.target] : null;
    // skittish kinds bolt when the lure is wiggled too much
    if (lure && f.state !== 'bite' && lure.activity > scareLevel(f, P)) {
      claimed.delete(f.target as PlayerId);
      events.push({ type: 'scared', fish: f, player: f.target as PlayerId });
      flee(f, lure, P.scareIgnoreMs, P);
      continue;
    }
    switch (f.state) {
      case 'swim': {
        swimStep(f, dtMs, k.speed * (f.nervousMs > 0 ? P.fleeSpeedFactor : 1), rng, P, true);
        if (f.ignoreMs > 0) break;
        let best: PlayerId | null = null;
        let bestD = Infinity;
        for (const p of [0, 1] as const) {
          const l = lures[p];
          if (!l || claimed.has(p)) continue;
          if (beh === 'shy' && l.activity > P.shyStill) continue; // shy fish ignore a moving lure
          const d = Math.hypot(l.x - f.x, l.y - f.y);
          const rad = beh === 'shy' ? P.noticeRadius : noticeRadius(l, P);
          if (d < rad && d < bestD) {
            best = p;
            bestD = d;
          }
        }
        if (best !== null) {
          f.state = 'approach';
          f.target = best;
          f.fakesLeft = beh === 'trickster' ? 1 + Math.floor(rng() * P.fakesMax) : 0;
          claimed.add(best);
        }
        break;
      }
      case 'approach': {
        if (!lure) break;
        const d = Math.hypot(lure.x - f.x, lure.y - f.y);
        const rad = beh === 'shy' ? P.noticeRadius : noticeRadius(lure, P);
        if (d > rad * 1.4) {
          claimed.delete(f.target as PlayerId);
          release(f);
          break;
        }
        f.targetHeading = Math.atan2(lure.y - f.y, lure.x - f.x);
        const hesitate = beh === 'shy' && lure.activity > P.shyStill; // waits until the lure is still again
        swimStep(f, dtMs, hesitate ? 0 : k.speed * P.approachSpeedFactor, rng, P, false);
        if (d < P.nibbleDist) {
          f.state = 'nibble';
          f.timerMs = between(rng, P.nibbleMs);
          events.push({ type: 'nibble', fish: f, player: f.target as PlayerId });
        }
        break;
      }
      case 'nibble': {
        if (!lure) break;
        const d = Math.hypot(lure.x - f.x, lure.y - f.y);
        if (d > P.nibbleDist * 2.5) {
          f.state = 'approach';
          break;
        }
        f.targetHeading = Math.atan2(lure.y - f.y, lure.x - f.x);
        swimStep(f, dtMs, d > 24 ? 40 : 0, rng, P, false);
        if (beh === 'shy' && lure.activity > P.shyStill) break; // hovers until it is still
        f.timerMs -= dtMs;
        if (f.timerMs <= 0) {
          f.state = 'bite';
          if (f.fakesLeft > 0) {
            f.fakesLeft--;
            f.fake = true;
            f.timerMs = P.fakeWindowMs;
            events.push({ type: 'fake', fish: f, player: f.target as PlayerId });
          } else {
            f.fake = false;
            f.timerMs = P.biteWindowMs * (k.biteScale ?? 1);
            events.push({ type: 'bite', fish: f, player: f.target as PlayerId });
          }
        }
        break;
      }
      case 'bite': {
        if (!lure) break;
        f.wiggle += (dtMs / 1000) * 14;
        f.timerMs -= dtMs;
        if (f.timerMs <= 0) {
          if (f.fake) {
            // the trick is over: back to nibbling, the next bite may be the real one
            f.fake = false;
            f.state = 'nibble';
            f.timerMs = between(rng, P.nibbleMs);
            break;
          }
          events.push({ type: 'missed', fish: f, player: f.target as PlayerId });
          claimed.delete(f.target as PlayerId);
          release(f);
          f.ignoreMs = P.ignoreAfterMissMs;
          f.targetHeading = f.heading + Math.PI * (rng() < 0.5 ? 1 : -1) * (0.5 + rng() * 0.5);
        }
        break;
      }
    }
  }
  return events;
}

/** The player tapped during the '!' window. Fake ('?') bites cannot be hooked. */
export function hookFish(f: Fish): boolean {
  if (f.state !== 'bite' || f.fake) return false;
  f.state = 'hooked';
  return true;
}

/** The player tapped during a fake ('?') bite: the trickster is spooked for P.spookMs. Returns false if it was not a fake bite. */
export function spookFish(f: Fish, P: Params = DEFAULT_PARAMS): boolean {
  if (f.state !== 'bite' || !f.fake) return false;
  const from = { x: f.x - Math.cos(f.heading), y: f.y - Math.sin(f.heading) };
  flee(f, from, P.spookMs, P);
  return true;
}

/** A fish was just hooked at `at`: free-swimming fish nearby get nervous (flee, ignore lures for P.nervousMs). Returns how many. */
export function makeNervous(fish: Fish[], at: Pt, except: Fish, P: Params = DEFAULT_PARAMS): number {
  let n = 0;
  for (const f of fish) {
    if (f === except || (f.state !== 'swim' && f.state !== 'approach')) continue;
    if (Math.hypot(f.x - at.x, f.y - at.y) > P.nervousRadius) continue;
    flee(f, at, P.nervousMs, P);
    f.nervousMs = P.nervousMs / 2;
    n++;
  }
  return n;
}

// ---------------------------------------------------------------- reeling

export interface Seg {
  burst: boolean;
  ms: number;
  /** Burst strength multiplier. */
  power: number;
  /** Rest segment: how long before its end the line twitches (tell). */
  tell: number;
}

export type Leap = 'none' | 'warn' | 'air';

export interface Reel {
  kind: number;
  /** 1 = fish at the lure's spot, 0 = landed. */
  dist: number;
  /** 0..1; the line snaps at 1. */
  tension: number;
  /** True while the fish is pulling (burst), false while it rests. */
  burst: boolean;
  timerMs: number;
  /** Burst strength multiplier of the current segment. */
  power: number;
  /** Time before the current rest's end at which the tell starts. */
  tellMs: number;
  /** Upcoming segments. */
  queue: Seg[];
  /** 1 fresh .. 0 tired. */
  stamina: number;
  /** Jumper only. */
  leap: Leap;
  leapMs: number;
  patterns: number;
  /** Name of the last pattern (for tests / UI). */
  pattern: string;
}

export function createReel(kind: number, P: Params = DEFAULT_PARAMS, rng: Rng = createRng(kind + 11)): Reel {
  return {
    kind, dist: 1, tension: 0, burst: false, timerMs: P.reel.firstRestMs, power: 1, tellMs: P.reel.tellMs,
    queue: [{ burst: true, ms: 800, power: 0.8, tell: 0 }], stamina: 1, leap: 'none', leapMs: P.kinds[kind].behavior === 'jumper' ? between(rng, P.reel.leapFirstMs) : 0, patterns: 0, pattern: 'first',
  };
}

export const REEL_PATTERNS = ['single', 'double', 'long', 'feint'] as const;
export type ReelPattern = (typeof REEL_PATTERNS)[number];

/** Segments (starting with a rest) for one pattern. */
export function patternSegments(name: ReelPattern, rng: Rng, P: Params = DEFAULT_PARAMS): Seg[] {
  const R = P.reel;
  const rest = (tell: number): Seg => ({ burst: false, ms: between(rng, R.restMs), power: 1, tell });
  const burst = (ms: [number, number], power: number): Seg => ({ burst: true, ms: between(rng, ms), power, tell: 0 });
  switch (name) {
    case 'single':
      return [rest(R.tellMs), burst(R.burstMs, 1)];
    case 'double':
      return [rest(R.tellMs), burst(R.doubleBurstMs, 1), { burst: false, ms: between(rng, R.doubleGapMs), power: 1, tell: R.doubleGapMs[0] }, burst(R.doubleBurstMs, 1.1)];
    case 'long':
      return [rest(R.tellMs), burst(R.longBurstMs, 0.85)];
    case 'feint':
      // a small harmless twitch, a short fake rest, then the real burst
      return [rest(R.feintTellMs), { burst: true, ms: R.feintTwitchMs, power: 0.35, tell: 0 }, { burst: false, ms: R.feintGapMs, power: 1, tell: R.feintGapMs }, burst(R.feintBurstMs, 1.25)];
  }
}

export function pickPattern(rng: Rng, trick: number, P: Params = DEFAULT_PARAMS): ReelPattern {
  const W = P.reel.weights;
  const w = [W.single, W.double * (0.5 + trick), W.long * (0.3 + trick), W.feint * trick];
  const total = w.reduce((s, v) => s + v, 0);
  let r = rng() * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return REEL_PATTERNS[i];
  }
  return 'single';
}

export function tensionLevel(t: number, P: Params = DEFAULT_PARAMS): 'ok' | 'warn' | 'danger' {
  return t >= P.reel.danger ? 'danger' : t >= P.reel.warn ? 'warn' : 'ok';
}

/** True while the line twitches just before a burst (a fair warning). */
export const reelTell = (r: Reel): boolean => !r.burst && r.leap === 'none' && r.timerMs <= r.tellMs && r.queue.length > 0 && r.queue[0].burst;

/** Advance the fight by dtMs. `holding` = the player's finger is down (reeling). */
export function stepReel(r: Reel, dtMs: number, holding: boolean, rng: Rng, P: Params = DEFAULT_PARAMS): 'snap' | 'caught' | null {
  const s = dtMs / 1000;
  const R = P.reel;
  const k = P.kinds[r.kind];
  r.timerMs -= dtMs;
  if (r.timerMs <= 0) {
    if (r.queue.length === 0) {
      const name = pickPattern(rng, k.trick, P);
      r.pattern = name;
      r.patterns++;
      r.queue.push(...patternSegments(name, rng, P));
    }
    const seg = r.queue.shift() as Seg;
    r.burst = seg.burst;
    r.timerMs = seg.ms;
    r.power = seg.power;
    r.tellMs = r.queue.length > 0 && r.queue[0].burst ? seg.tell : 0;
  }
  // jumper: leaps out of the water now and then
  if (k.behavior === 'jumper') {
    r.leapMs -= dtMs;
    if (r.leapMs <= 0) {
      if (r.leap === 'none') {
        r.leap = 'warn';
        r.leapMs = R.leapWarnMs;
      } else if (r.leap === 'warn') {
        r.leap = 'air';
        r.leapMs = R.leapAirMs;
      } else {
        r.leap = 'none';
        r.leapMs = between(rng, R.leapEveryMs);
      }
    }
  }
  const fresh = R.minPull + (1 - R.minPull) * r.stamina;
  if (r.leap === 'air') {
    if (holding) r.tension += R.leapHoldUp * s;
    else {
      r.tension -= R.burstRelease * s;
      r.dist += R.leapPull * s;
    }
  } else if (r.burst) {
    const str = k.strength * r.power * fresh * (0.7 + 0.3 * r.dist);
    if (holding) {
      r.tension += R.burstHoldUp * str * s;
      r.dist += R.burstPullHeld * str * s;
    } else {
      r.tension -= R.burstRelease * s;
      r.dist += R.burstPull * str * s;
      r.stamina -= (R.tireBurst * r.power * s) / k.stamina;
    }
  } else if (holding) {
    r.tension += R.restHoldUp * s;
    r.dist -= R.reelSpeed * k.reel * (R.freshReel + (1 - R.freshReel) * (1 - r.stamina)) * s;
    r.stamina -= (R.tireReel * s) / k.stamina;
  } else {
    r.tension -= R.restRelease * s;
  }
  r.stamina = clamp(r.stamina, 0, 1);
  r.tension = Math.max(0, r.tension);
  r.dist = Math.min(1, r.dist);
  if (r.tension >= 1) return 'snap';
  if (r.dist <= 0) return 'caught';
  return null;
}

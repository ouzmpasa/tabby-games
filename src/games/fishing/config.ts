import { H } from '../../core/layout';

export type Behavior = 'normal' | 'darter' | 'shy' | 'trickster' | 'jumper' | 'junk' | 'golden';
export type Shape = 'fish' | 'boot' | 'can';

export interface FishKind {
  id: string;
  /** Text shown (facing the player) when it is caught. */
  name: { en: string; nl: string };
  behavior: Behavior;
  shape: Shape;
  /** Points scored for catching it (bigger = rarer = more). */
  points: number;
  /** Body length in px. */
  length: number;
  /** Swimming speed (px/s). */
  speed: number;
  /** Relative chance when a fish is (re)spawned. */
  weight: number;
  /** At most this many of the kind swim at once (default: unlimited). */
  maxAlive?: number;
  body: number;
  belly: number;
  fin: number;
  /** How hard it pulls while reeling (1 = normal). */
  strength: number;
  /** How fast it can be reeled in (1 = normal). */
  reel: number;
  /** Endurance (1 = normal): bigger fish need more rest-reel cycles before they tire. */
  stamina: number;
  /** 0..1.5: how often it uses the nasty reel patterns (double bursts, long pulls, feints). */
  trick: number;
  /** Multiplier on how long the '!' window stays (faster fish give less time). */
  biteScale?: number;
  /** Wander: multiplier on the time between direction changes (<1 = erratic) and on the size of the turns. */
  turnScale?: number;
  turnAmt?: number;
}

/**
 * Fishing Pond tuning knobs. Top-down view: lengths in the 1920x1080 design space, speeds in px/s, times in ms.
 * Kid-friendly but with real challenge: eleven kinds of fish that each behave differently (see `kinds`), a fair bite window,
 * and a reel fight (varied burst patterns, stamina) that is won by letting go at the right time.
 * Match length: ~40 points at ~2.5 points per fish and ~18 s per fish => roughly 4-5 minutes for a decent player.
 */
export const FISHING = {
  id: 'fishing',
  sceneKey: 'Fishing',

  /** Points needed to win (fish are worth 0-6 points; ~15 catches for the winner). Raise = longer match. */
  targetScore: 40,
  /** Gap between the separate score() calls of a multi-point fish. */
  pointStaggerMs: 280,

  /** Water area (screen px). */
  pond: { l: 400, t: 70, r: 1520, b: 1010 },
  /** Rod tip distance from the player's screen edge, and its y. */
  tipInset: 330,
  tipY: H / 2,
  /** Where the rod is held (drawn only). */
  baseInset: 150,
  baseDy: 150,

  /** Fish in the pond. A caught fish respawns somewhere else after respawnMs, so the pond never empties. */
  fishCount: 12,
  respawnMs: 5000,
  kinds: [
    { id: 'minnow', name: { en: 'Little fish', nl: 'Visje' }, behavior: 'normal', shape: 'fish', points: 1, length: 76, speed: 55, weight: 24, body: 0xffc857, belly: 0xfff1c1, fin: 0xff9f43, strength: 0.8, reel: 1.15, stamina: 0.6, trick: 0.2 },
    { id: 'perch', name: { en: 'Green fish', nl: 'Groene vis' }, behavior: 'normal', shape: 'fish', points: 2, length: 104, speed: 48, weight: 18, body: 0x5fd39b, belly: 0xd8f7e6, fin: 0x2fa36b, strength: 1, reel: 1, stamina: 0.9, trick: 0.5 },
    { id: 'bass', name: { en: 'Big fish!', nl: 'Grote vis!' }, behavior: 'normal', shape: 'fish', points: 3, length: 146, speed: 42, weight: 13, body: 0xff7a90, belly: 0xffd6de, fin: 0xd9455f, strength: 1.2, reel: 0.8, stamina: 1.3, trick: 0.9 },
    { id: 'giant', name: { en: 'GIANT fish!!', nl: 'REUZENVIS!!' }, behavior: 'normal', shape: 'fish', points: 5, length: 200, speed: 34, weight: 5, body: 0xb48cff, belly: 0xece0ff, fin: 0x7a4fe0, strength: 1.4, reel: 0.7, stamina: 1.7, trick: 1.1, maxAlive: 2 },
    // Darter: small and FAST, zig-zags; bolts away if you wiggle the lure too much.
    { id: 'darter', name: { en: 'Speedy darter!', nl: 'Snelle schicht!' }, behavior: 'darter', shape: 'fish', points: 2, length: 62, speed: 125, weight: 12, body: 0x4cc9f0, belly: 0xd9f4ff, fin: 0x1f8fb8, strength: 0.9, reel: 1.1, stamina: 0.7, trick: 0.6, biteScale: 0.6, turnScale: 0.3, turnAmt: 2.4 },
    // Shy fish: only comes to a lure that stays STILL; a wiggle sends it away.
    { id: 'shy', name: { en: 'Shy fish', nl: 'Schuwe vis' }, behavior: 'shy', shape: 'fish', points: 3, length: 110, speed: 40, weight: 10, body: 0xd6a5e8, belly: 0xf6e7fb, fin: 0xa66bc4, strength: 1, reel: 0.95, stamina: 1, trick: 0.6 },
    // Trickster: fake nibbles ('?'); tapping on a fake spooks it. Only the '!' counts.
    { id: 'trickster', name: { en: 'Trickster!', nl: 'Bedrieger!' }, behavior: 'trickster', shape: 'fish', points: 4, length: 118, speed: 50, weight: 9, body: 0xff9ecb, belly: 0xffe3f0, fin: 0xe0559a, strength: 1.05, reel: 0.9, stamina: 1.1, trick: 1, biteScale: 0.8 },
    // Jumper: leaps out of the water while reeling; let go at the 'JUMP!' cue.
    { id: 'jumper', name: { en: 'Jumping fish!', nl: 'Springvis!' }, behavior: 'jumper', shape: 'fish', points: 4, length: 120, speed: 58, weight: 8, body: 0x2ec4b6, belly: 0xcbf3f0, fin: 0xf4a261, strength: 1.1, reel: 0.9, stamina: 1.1, trick: 0.8 },
    // Junk: sluggish, barely fights, comedy.
    { id: 'boot', name: { en: 'An old boot...', nl: 'Een oude laars...' }, behavior: 'junk', shape: 'boot', points: 0, length: 110, speed: 16, weight: 4, maxAlive: 1, body: 0x7a5230, belly: 0xa77b4f, fin: 0x4b3320, strength: 0.4, reel: 2.2, stamina: 0.2, trick: 0 },
    { id: 'can', name: { en: 'Tin can!', nl: 'Blikje!' }, behavior: 'junk', shape: 'can', points: 1, length: 84, speed: 14, weight: 4, maxAlive: 1, body: 0xb8c4cf, belly: 0xe9eef2, fin: 0x7f8c99, strength: 0.4, reel: 2.2, stamina: 0.2, trick: 0 },
    // Golden fish: rare, fast, strong, skittish (short '!' window), 6 points.
    { id: 'golden', name: { en: 'GOLDEN FISH!!!', nl: 'GOUDEN VIS!!!' }, behavior: 'golden', shape: 'fish', points: 6, length: 132, speed: 105, weight: 3, maxAlive: 1, body: 0xffd23f, belly: 0xfff4b8, fin: 0xf59e0b, strength: 1.45, reel: 0.7, stamina: 1.7, trick: 1.5, biteScale: 0.55, turnScale: 0.6, turnAmt: 1.8 },
  ] as FishKind[],

  /** Wandering: how fast a fish turns (rad/s), and the distance from the shore where it turns back. */
  turnRate: 1.4,
  edgeMargin: 90,
  turnEveryMs: [1500, 4000] as [number, number],

  /** A fish within this distance of a lure comes to look at it. */
  noticeRadius: 250,
  /** Extra notice radius while the lure is being wiggled (scaled by recent wiggle activity 0..1). */
  wiggleBonus: 180,
  /** Fish swim toward the lure this much faster than usual. */
  approachSpeedFactor: 1.7,
  /** Fish this close to the lure start nibbling. */
  nibbleDist: 46,
  /** How long it nibbles before it really bites. */
  nibbleMs: [900, 2200] as [number, number],
  /** How long the '!' stays: time to tap and hook (generous; per-kind biteScale shortens it for fast fish). */
  biteWindowMs: 1500,
  /** A fish that was missed / escaped ignores lures for a while. */
  ignoreAfterMissMs: 4500,
  ignoreAfterSnapMs: 3500,

  /** Shy fish: only notices / keeps coming while lure activity (recent wiggle, 0..1, fades ~1.2/s) is below shyStill; above shyScare it flees. */
  shyStill: 0.08,
  shyScare: 0.35,
  /** Darter: bolts away when the lure activity is above this (small wiggles still attract it). */
  darterScare: 0.7,
  /** Fish that fled ignore lures this long and swim fast for fleeMs. */
  scareIgnoreMs: 4000,
  fleeMs: 1200,
  fleeSpeedFactor: 2.2,
  /** Trickster: 1..fakesMax fake bites ('?' for fakeWindowMs) before the real one. Tapping a fake spooks it for spookMs. */
  fakesMax: 2,
  fakeWindowMs: 1100,
  spookMs: 5000,
  /** Competition: when a fish is hooked, free-swimming fish within nervousRadius get nervous: they flee and ignore lures for nervousMs. */
  nervousRadius: 380,
  nervousMs: 2500,

  /** Slingshot cast: pull the finger back this far (px) to start aiming; shorter pulls do nothing. */
  minPull: 40,
  /** Landing distance = pull length * pullScale (clamped). */
  pullScale: 4.5,
  minCast: 220,
  maxCast: 1000,
  /** Widest angle (degrees) from straight-at-the-other-player. */
  maxCastAngleDeg: 62,
  /** Lure flight time = castBaseMs + distance * castPerPx. */
  castBaseMs: 300,
  castPerPx: 0.45,
  /** Landing spot stays this far inside the water edge. */
  landMargin: 60,

  /** Wiggle: lure follows the finger by this fraction, within wiggleRange of where it landed. */
  wiggleGain: 0.7,
  wiggleRange: 170,
  /** A touch shorter / shorter-travelling than this (ms / px) on a waiting lure reels it back in to recast. */
  recallTapMs: 380,
  recallTravel: 36,
  /** An unused lure is reeled back after this long. */
  waitTimeoutMs: 30000,

  /**
   * The reel fight. Tension 0..1 (snap at 1), dist 1 (far) .. 0 (landed); rates per second.
   * The fish alternates rests (reel it in) and bursts (let go!) in PATTERNS: single burst, double burst (short gap between),
   * long pull, feint (a harmless twitch, a fake rest, then a hard burst). Before a burst there is a short "tell" (line twitches).
   * Stamina: a fish tires when it wastes energy on bursts you let go through, and reels in faster the more tired it is.
   */
  reel: {
    /** Rest before each pattern's burst. */
    restMs: [1100, 1900] as [number, number],
    firstRestMs: 1200,
    /** Pattern burst lengths. */
    burstMs: [800, 1300] as [number, number],
    doubleBurstMs: [450, 650] as [number, number],
    doubleGapMs: [300, 450] as [number, number],
    longBurstMs: [1800, 2500] as [number, number],
    feintTwitchMs: 250,
    feintGapMs: 300,
    feintBurstMs: [900, 1300] as [number, number],
    /** Relative pattern weights (double/long/feint get multiplied up by the kind's `trick`). */
    weights: { single: 4, double: 2, long: 1, feint: 0.6 },
    /** The line twitches this long before a burst (feint: feintTellMs). */
    tellMs: 400,
    feintTellMs: 150,
    /** Burst while holding: tension rises (x fish strength x pattern power) and a little line is lost. */
    burstHoldUp: 0.95,
    burstPullHeld: 0.03,
    /** Burst while released: tension falls slowly, the fish takes line. */
    burstRelease: 0.45,
    burstPull: 0.12,
    /** Rest while holding: reel in (x fish reel factor); tension creeps up a tiny bit. */
    reelSpeed: 0.26,
    restHoldUp: 0.05,
    /** Rest while released: tension drops fast. */
    restRelease: 0.8,
    /** Stamina 1 (fresh) .. 0 (tired): drain per second (divided by the kind's stamina) while the fish bursts and you let go / while you reel. */
    tireBurst: 0.2,
    tireReel: 0.05,
    /** Reeling speed is x(freshReel + (1-freshReel) * (1-stamina)). */
    freshReel: 0.55,
    /** Bursts pull x(minPull + (1-minPull) * stamina). */
    minPull: 0.55,
    /** Jumper: first leap after leapFirstMs, then every leapEveryMs. 'JUMP!' warns for leapWarnMs, then the fish is in the air for leapAirMs. */
    leapFirstMs: [3200, 4500] as [number, number],
    leapEveryMs: [3000, 5000] as [number, number],
    leapWarnMs: 700,
    leapAirMs: 900,
    /** In the air: holding raises tension this fast (let go!), letting go drops it and the fish gains a bit of line. */
    leapHoldUp: 2.0,
    leapPull: 0.05,
    /** Tension colour thresholds. */
    warn: 0.6,
    danger: 0.8,
  },

  /** Time the caught fish is held up. */
  caughtMs: 2200,
  escapedMsgMs: 1600,
};

export type FishingConfig = typeof FISHING;

/** Hardcoded English text shown to players (RotatedLabel facing them). */
export const LABELS = {
  cast: 'Pull back and let go!',
  tap: 'TAP!',
  reel: 'Hold to reel in!',
  letGo: 'Let go!',
  escaped: 'Oh no, it got away!',
  recast: 'Tap to try again',
  jump: 'JUMP!',
  tricked: 'Tricked! Wait for the !',
  keepStill: 'Shh! Keep very still...',
  tooMuch: 'Too much wiggling!',
} as const;

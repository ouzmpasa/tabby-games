import { H, W } from '../../core/layout';

/**
 * Marble Flick tuning knobs. Top-down view: lengths in the 1920x1080 design space, speeds in px/s, times in ms.
 * Defaults are kid-friendly at the start (a roomy arena, grippy floor, no obstacles) and get harder every round (each time the
 * board is refilled): the arena shrinks, the floor gets slippier and bumper pegs appear (see `levels`). There is deliberately
 * NO aiming preview (no ghost marble, no target arrows, no power bar or ring): just the pull handle and a short dotted cue
 * that shows the direction only. Afterwards a fading trail shows where the shot went, so power can be learned.
 */
export const MARBLES = {
  id: 'marbles',
  sceneKey: 'Marbles',

  /** Points needed to win (one point per opponent marble knocked out). See tests/unit/marbles.test.ts notes for the simulated durations. */
  targetScore: 13,
  /** Difficulty goes up one level every this many points of the leader (applied when the board is next refilled). */
  pointsPerLevel: 2,

  /** Arena (a circle). A marble whose centre crosses the rim is out. (Level 0 values; later levels shrink it, see `levels`.) */
  centerX: W / 2,
  centerY: H / 2,
  arenaRadius: 440,

  /** Marbles per player and their radius. */
  perPlayer: 3,
  marbleRadius: 46,
  /** Start positions: distance from the arena centre along x, and vertical spacing between a player's marbles. */
  startOffsetX: 290,
  startSpacing: 150,

  /**
   * The difficulty ladder, one row per level:
   *  - arenaRadius: the rim comes in
   *  - damping:     rolling friction (lower = slippier = marbles roll farther and are harder to stop short of the rim)
   *  - pegs:        bumper pegs standing in the middle; marbles bounce off them (bank shots, blocked lines)
   */
  levels: [
    { arenaRadius: 440, damping: 1.9, pegs: 0 },
    { arenaRadius: 432, damping: 1.8, pegs: 0 },
    { arenaRadius: 424, damping: 1.7, pegs: 1 },
    { arenaRadius: 414, damping: 1.6, pegs: 2 },
    { arenaRadius: 404, damping: 1.5, pegs: 2 },
    { arenaRadius: 394, damping: 1.4, pegs: 3 },
    { arenaRadius: 384, damping: 1.3, pegs: 3 },
  ],
  /** Bumper pegs: radius, how bouncy they are, and where they may stand (distance from the centre line, px). */
  pegRadius: 36,
  pegRestitution: 0.92,
  pegMinX: 40,
  pegMaxX: 190,
  /** Direction cue: always this many dots, this far apart (never shows the power or the end point). */
  aimDots: 4,
  aimDotGap: 46,
  /** The trail of the last shot stays this long (ms). */
  trailMs: 2800,

  /** Slingshot: pulls shorter than minPull cancel the shot; maxPull is full power. A long pull range gives fine control over power. */
  minPull: 40,
  maxPull: 340,
  /** Launch speed at the weakest / strongest counted pull. */
  minShotSpeed: 420,
  maxShotSpeed: 2000,

  /** The first shot after the board is (re)filled is capped to this share of full power, so the starter cannot just sweep the board (simulated starter win rate ~50%). */
  openingPowerCap: 0.6,

  /** Physics. Rolling friction is exponential: speed *= exp(-damping * dt); under stopSpeed a marble rests. */
  damping: 1.9,
  stopSpeed: 14,
  /** Bounciness of marble-marble hits (1 = perfectly elastic). */
  restitution: 0.94,
  /** Hard cap on any marble's speed. */
  maxSpeed: 2400,

  /** A rolling shot is forced to rest after this long (never stalls). */
  rollTimeoutMs: 7000,
  /** If the active player does not shoot for this long, the turn passes. */
  aimIdleMs: 20000,
  /** Pause after marbles come to rest before the next turn. */
  settleDelayMs: 450,
  /** Pause when the board is refilled. */
  refillPauseMs: 900,
} as const;

/** Texts the players must read (en + nl). */
export const MARBLES_TEXT = {
  en: { hint: 'Pull back and let go!', hint2: 'Knock their marbles out' },
  nl: { hint: 'Trek terug en laat los!', hint2: 'Schiet hun knikkers eruit' },
} as const;

export type MarblesConfig = typeof MARBLES;

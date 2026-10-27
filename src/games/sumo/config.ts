import { H, W } from '../../core/layout';

/**
 * Sumo Bumpers tuning knobs. Lengths are in the 1920x1080 design space, speeds in px/s, accelerations in px/s^2.
 * Defaults are kid-friendly: big blobs, a wide platform, a slow shrink and a forgiving edge.
 */
export const SUMO = {
  id: 'sumo',
  sceneKey: 'Sumo',

  /** Rounds needed to win the match. */
  targetScore: 8,
  /**
   * Difficulty ramp. Match progress runs 0..1 (leader's rounds / (target-1), or total rounds / (2*(target-1)), whichever is
   * higher). Over the match the platform starts smaller (platformStart -> platformStartEnd), begins to crumble sooner
   * (shrinkDelaySec -> shrinkDelayEnd) and crumbles faster (shrinkPerSec -> shrinkPerSecEnd).
   */
  platformStartEnd: 350,
  shrinkDelayEnd: 2,
  shrinkPerSecEnd: 11,
  /** Blob radius (px). */
  blobRadius: 92,
  /** Platform radius at the start of a round. */
  platformStart: 430,
  /** Smallest the platform ever gets (cap, so a round always stays playable). */
  platformMin: 245,
  /** Seconds of calm before the platform starts to shrink. */
  shrinkDelaySec: 4,
  /** Platform shrink speed (px/s). 7 px/s reaches the cap about 30 s after the delay. */
  shrinkPerSec: 6.5,
  /** Fastest a blob walks toward the finger (px/s). Caps flicks so the blob never teleports. */
  blobMaxSpeed: 880,
  /** How strongly the blob chases the finger: desired speed = distance * gain (capped at max speed). */
  chaseGain: 7,
  /** How fast the blob can change its velocity (px/s^2). Lower = heavier. */
  blobAccel: 4200,
  /** Slow-down while no finger is steering (px/s^2). */
  idleBrake: 2200,
  /** Bounciness of blob vs blob (1 = perfect). Low on purpose: bumps are a pushing contest, not a pinball, so a round lasts several exchanges. */
  restitution: 0.55,
  /** Extra shove when a blob hits at speed: impulse multiplier = 1 + dashBonus * (closing speed / max speed). */
  dashBonus: 0.2,
  /**
   * Wobble: every solid bump makes the blob that was hit wobblier (damage 0..1, up to damagePerBump * closing speed / max speed per
   * bump). A wobbly blob is lighter, so it is shoved further (inverse mass = 1 + damageLight * damage). Rounds start with
   * everybody sturdy, so the first bumps barely move anyone and rounds last longer. Resets every round.
   */
  damagePerBump: 0.14,
  damageLight: 1.6,
  /** A blob is out when its centre is farther than the platform radius times this from the middle. */
  edgeForgiveness: 1.0,
  /** Physics substeps per frame. */
  substeps: 4,
  /** How long a blob takes to fall off (ms). */
  fallMs: 900,
  /** Pause after a round before the countdown (ms). */
  roundPauseMs: 1300,
  /** Starting distance of each blob from the centre (never more than startOffsetFrac of the platform radius). */
  startOffset: 230,
  startOffsetFrac: 0.55,
  /**
   * Hazards (chosen per round from the match progress): an ICE patch in the middle (blobs slide: acceleration x iceAccel, braking
   * x iceBrake), two BUMPERS above and below the middle (pinball posts that kick a blob away at least bumperKick px/s), and
   * later both. They start showing up at hazardFromProgress; the chance of a hazard round rises to hazardChanceEnd.
   */
  hazardFromProgress: 0.1,
  hazardChanceEnd: 0.9,
  bumpersFromProgress: 0.25,
  bothFromProgress: 0.6,
  iceRadius: 175,
  iceAccel: 0.35,
  iceBrake: 0.2,
  bumperRadius: 46,
  bumperOffset: 175,
  bumperKick: 430,
  /**
   * Dash charge: keep your finger still near your blob for chargeSec and it glows; then swipe away from it for a short DASH
   * (dashSpeedFactor x top speed, dashSec long) that shoves much harder. A bonus for players who learn it, never needed.
   */
  chargeSec: 0.9,
  chargeRadius: 120,
  dashTriggerDist: 170,
  dashSec: 0.3,
  dashSpeedFactor: 1.7,
} as const;

/** Platform centre. */
export const CENTER = { x: W / 2, y: H / 2 } as const;

export const SUMO_STRINGS = { out: { en: 'OUT!', nl: 'ERUIT!' } } as const;
export type SumoConfig = typeof SUMO;

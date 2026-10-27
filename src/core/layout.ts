import type { PlayerId, Rect, Zone } from './types';

/** Logical canvas size; Phaser scales it to fit the screen (landscape). */
export const W = 1920;
export const H = 1080;

/**
 * Players sit at the two SHORT ends of the landscape tablet:
 * player 0 at the LEFT end (looking right), player 1 at the RIGHT end (looking left).
 * Anything meant to be read by a player is rotated so its top points away from them.
 */
export function facingRotation(p: PlayerId): number {
  return p === 0 ? Math.PI / 2 : -Math.PI / 2;
}

export const facingDegrees = (p: PlayerId): number => (facingRotation(p) * 180) / Math.PI;

/** The half of the screen that belongs to a player. */
export function halfZone(p: PlayerId): Zone {
  return { player: p, x: p === 0 ? 0 : W / 2, y: 0, w: W / 2, h: H };
}

export const defaultZones = (): Zone[] => [halfZone(0), halfZone(1)];

/** Point at a player's end of the screen, `inset` px from their edge, `along` px from centre line (screen y). */
export function endAnchor(p: PlayerId, inset: number, along = 0): { x: number; y: number; rotation: number } {
  return { x: p === 0 ? inset : W - inset, y: H / 2 + along, rotation: facingRotation(p) };
}

export const inRect = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

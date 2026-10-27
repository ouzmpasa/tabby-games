import type { PlayerId, Zone } from '../types';

/** Which player's zone contains this point? First matching zone wins; null if none. */
export function assignPlayer(x: number, y: number, zones: readonly Zone[]): PlayerId | null {
  for (const z of zones) {
    if (x >= z.x && x < z.x + z.w && y >= z.y && y < z.y + z.h) return z.player;
  }
  return null;
}

/**
 * Pure pointer ownership: a pointer belongs to the zone it went DOWN in until it is released,
 * even if the finger slides into the other player's half.
 */
export class PointerTracker {
  private owners = new Map<number, PlayerId>();

  constructor(private zones: Zone[]) {}

  setZones(zones: Zone[]): void {
    this.zones = zones;
  }

  down(id: number, x: number, y: number): PlayerId | null {
    const p = assignPlayer(x, y, this.zones);
    if (p === null) return null;
    this.owners.set(id, p);
    return p;
  }

  owner(id: number): PlayerId | null {
    return this.owners.get(id) ?? null;
  }

  up(id: number): PlayerId | null {
    const p = this.owners.get(id) ?? null;
    this.owners.delete(id);
    return p;
  }

  clear(): void {
    this.owners.clear();
  }

  /** Owners of all pointers currently down, sorted by pointer id. */
  activeOwners(): PlayerId[] {
    return [...this.owners.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
  }

  count(player?: PlayerId): number {
    if (player === undefined) return this.owners.size;
    let n = 0;
    for (const p of this.owners.values()) if (p === player) n++;
    return n;
  }
}

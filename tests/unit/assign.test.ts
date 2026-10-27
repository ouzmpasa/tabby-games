import { describe, expect, it } from 'vitest';
import { assignPlayer, PointerTracker } from '../../src/core/input/assign';
import { defaultZones, H, W } from '../../src/core/layout';

describe('assignPlayer', () => {
  const zones = defaultZones();
  it('left half is player 0, right half is player 1', () => {
    expect(assignPlayer(10, 10, zones)).toBe(0);
    expect(assignPlayer(W / 2 - 1, H - 1, zones)).toBe(0);
    expect(assignPlayer(W / 2, 0, zones)).toBe(1);
    expect(assignPlayer(W - 1, H / 2, zones)).toBe(1);
  });
  it('returns null outside every zone', () => {
    expect(assignPlayer(-5, 10, zones)).toBeNull();
    expect(assignPlayer(10, H + 1, zones)).toBeNull();
  });
});

describe('PointerTracker', () => {
  it('keeps a pointer with the zone it went down in', () => {
    const t = new PointerTracker(defaultZones());
    expect(t.down(1, 100, 100)).toBe(0);
    expect(t.owner(1)).toBe(0); // even if it later slides to x = 1500
    expect(t.up(1)).toBe(0);
    expect(t.owner(1)).toBeNull();
  });
  it('tracks four simultaneous pointers', () => {
    const t = new PointerTracker(defaultZones());
    t.down(0, 100, 100);
    t.down(1, 200, 900);
    t.down(2, 1500, 100);
    t.down(3, 1700, 900);
    expect(t.activeOwners()).toEqual([0, 0, 1, 1]);
    expect(t.count(1)).toBe(2);
    t.up(2);
    expect(t.count()).toBe(3);
  });
  it('ignores pointers outside zones and unknown ups', () => {
    const t = new PointerTracker(defaultZones());
    expect(t.down(1, -1, -1)).toBeNull();
    expect(t.up(99)).toBeNull();
  });
  it('supports custom zones (e.g. a smaller play area)', () => {
    const t = new PointerTracker([{ player: 1, x: 0, y: 0, w: 100, h: 100 }]);
    expect(t.down(1, 50, 50)).toBe(1);
    expect(t.down(2, 500, 50)).toBeNull();
  });
});

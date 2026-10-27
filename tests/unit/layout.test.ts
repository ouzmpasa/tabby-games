import { describe, expect, it } from 'vitest';
import { endAnchor, facingDegrees, facingRotation, halfZone, H, inRect, W } from '../../src/core/layout';
import { hold } from './holdHelper';

describe('layout', () => {
  it('rotates text 90deg toward each end', () => {
    expect(facingDegrees(0)).toBe(90);
    expect(facingDegrees(1)).toBe(-90);
    expect(facingRotation(0)).toBeCloseTo(Math.PI / 2);
  });
  it('halves tile the screen without overlap', () => {
    const a = halfZone(0), b = halfZone(1);
    expect(a.x + a.w).toBe(b.x);
    expect(b.x + b.w).toBe(W);
    expect(a.h).toBe(H);
  });
  it('end anchors sit at the short ends', () => {
    expect(endAnchor(0, 70).x).toBe(70);
    expect(endAnchor(1, 70).x).toBe(W - 70);
    expect(endAnchor(0, 70, 100).y).toBe(H / 2 + 100);
  });
  it('inRect is half-open', () => {
    expect(inRect({ x: 0, y: 0, w: 10, h: 10 }, 10, 5)).toBe(false);
    expect(inRect({ x: 0, y: 0, w: 10, h: 10 }, 0, 0)).toBe(true);
  });
  it('hold progress clamps to 0..1 over 2 s', () => {
    expect(hold(-5)).toBe(0);
    expect(hold(1000)).toBe(0.5);
    expect(hold(2500)).toBe(1);
  });
});

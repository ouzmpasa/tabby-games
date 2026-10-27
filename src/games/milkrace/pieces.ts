import type Phaser from 'phaser';
import { COLORS, PLAYER } from '../../core/theme';
import type { PlayerId } from '../../core/types';
import { LAYOUT } from './config';

/** Everything below is drawn in a player's local frame: x to their right, y toward them (their "down"). */

const MILK = 0xfdfcf6;
const MILK_SHADE = 0xe4e9f2;

export function drawCow(g: Phaser.GameObjects.Graphics, p: PlayerId): void {
  const hide = 0xf7f3ea;
  const spot = 0x3a4152;
  g.fillStyle(0x080e1a, 0.3).fillEllipse(8, -10, 440, 600);
  // hooves + legs
  for (const [x, y] of [[-215, -170], [215, -170], [-205, 90], [205, 90]]) {
    g.fillStyle(0xd9cfc0, 1).fillEllipse(x, y, 70, 120);
    g.fillStyle(0x6b5a4a, 1).fillEllipse(x + (x < 0 ? -8 : 8), y - 40, 50, 36);
  }
  // body
  g.fillStyle(hide, 1).fillEllipse(0, -30, 420, 560);
  g.fillStyle(spot, 1).fillEllipse(-110, -90, 150, 120).fillEllipse(120, 40, 130, 150).fillEllipse(-90, 110, 90, 70).fillEllipse(95, -170, 90, 80);
  // collar in the player's colour with a bell
  g.fillStyle(PLAYER[p].main, 1).fillEllipse(0, -250, 250, 76);
  g.fillStyle(PLAYER[p].light, 1).fillEllipse(0, -262, 230, 40);
  // head
  g.fillStyle(0xe8dcc6, 1).fillEllipse(-62, -445, 44, 80).fillEllipse(62, -445, 44, 80); // horns
  g.fillStyle(0xf2e9da, 1).fillEllipse(-135, -350, 90, 54).fillEllipse(135, -350, 90, 54); // ears
  g.fillStyle(0xffb3c1, 1).fillEllipse(-135, -350, 56, 30).fillEllipse(135, -350, 56, 30);
  g.fillStyle(hide, 1).fillEllipse(0, -350, 220, 200);
  g.fillStyle(spot, 1).fillEllipse(-62, -388, 74, 60);
  g.fillStyle(0xffb3c1, 1).fillEllipse(0, -300, 150, 92); // snout
  g.fillStyle(0xe58aa0, 1).fillEllipse(-30, -300, 22, 30).fillEllipse(30, -300, 22, 30);
  for (const x of [-52, 52]) {
    g.fillStyle(0xffffff, 1).fillCircle(x, -372, 22);
    g.fillStyle(0x1e2a3d, 1).fillCircle(x + (x < 0 ? 4 : -4), -366, 11);
    g.fillStyle(0xffffff, 1).fillCircle(x + (x < 0 ? 8 : 0), -372, 4);
  }
  // udder behind the pads
  g.fillStyle(0xffa5b8, 1).fillEllipse(0, 235, 330, 130);
}

export interface PadDraw {
  /** Pad index 0 = pad A, 1 = pad B. */
  pad: 0 | 1;
  /** Pad centre in the player's frame. */
  x: number;
  y: number;
  /** 0..1 press squash. */
  press: number;
  /** 0..1 how strongly it pulses as "tap me next". */
  glow: number;
  /** Time in ms, for the pulse. */
  t: number;
  /** Draw the left/right arrow (off while the pads move around). */
  arrow?: boolean;
  /** Rhythm stage: ring closing in on the pad (0 = far .. 1 = on the beat), or -1 for none. */
  ring?: number;
  /** 0..1 wobble when the cow is about to shuffle the pads. */
  wobble?: number;
}

/** Normal (slot 0) pad centre for pad A / B. */
export function padCentre(pad: 0 | 1): { x: number; y: number } {
  return LAYOUT.padSlots[0][pad];
}

export function drawPad(g: Phaser.GameObjects.Graphics, p: PlayerId, d: PadDraw): void {
  const wob = d.wobble ? Math.sin(d.t / 40 + d.pad * 2) * 9 * d.wobble : 0;
  const x = d.x + wob;
  const y = d.y;
  const r = LAYOUT.padR * (1 - 0.1 * d.press);
  // teat nub
  g.fillStyle(0xf58aa4, 1).fillRoundedRect(x - 24, y + r - 12, 48, 44, 18);
  g.fillStyle(0x080e1a, 0.3).fillCircle(x, y + 10, r);
  g.fillStyle(d.press > 0.3 ? 0xff9bb3 : 0xffb6c8, 1).fillCircle(x, y, r);
  g.lineStyle(10, PLAYER[p].main, 1).strokeCircle(x, y, r - 5);
  g.fillStyle(0xffffff, 0.35).fillEllipse(x - r * 0.3, y - r * 0.4, r * 0.7, r * 0.4);
  if (d.glow > 0) {
    const k = 0.5 + 0.5 * Math.sin(d.t / 150);
    g.lineStyle(10, PLAYER[p].light, d.glow * (0.35 + 0.65 * k)).strokeCircle(x, y, r + 8 + 10 * k);
  }
  if (d.ring !== undefined && d.ring >= 0) {
    // Metronome ring: closes in on the pad, touches its rim exactly on the beat.
    const rr = r + 6 + (1 - d.ring) * 120;
    g.lineStyle(14, 0xffe38a, 0.25 + 0.75 * d.ring).strokeCircle(x, y, rr);
  }
  if (d.arrow !== false) {
    // arrow telling which side it is
    const s = d.pad === 0 ? -1 : 1;
    g.fillStyle(PLAYER[p].dark, 0.85).fillTriangle(x + s * 34, y, x - s * 18, y - 40, x - s * 18, y + 40);
  }
}

/** The big tank on the player's right with the milk drawn at `shown` (0..1) and three marked sections (`stage` = the one being filled). */
export function drawBucket(g: Phaser.GameObjects.Graphics, shown: number, t: number, stage = 0): void {
  const top = LAYOUT.bucketTop;
  const bot = LAYOUT.bucketBottom;
  const cx = LAYOUT.bucketX;
  const wt = LAYOUT.bucketW;
  const wb = LAYOUT.bucketW - 56;
  const half = (y: number): number => (wb + ((wt - wb) * (y - top)) / (bot - top)) / 2;
  const trap = (y0: number, y1: number, inset: number): Phaser.Types.Math.Vector2Like[] => [
    { x: cx - half(y0) + inset, y: y0 },
    { x: cx + half(y0) - inset, y: y0 },
    { x: cx + half(y1) - inset, y: y1 },
    { x: cx - half(y1) + inset, y: y1 },
  ];
  g.fillStyle(0x080e1a, 0.3).fillPoints(trap(top + 12, bot + 12, 0), true);
  g.fillStyle(0x9aa7bd, 1).fillPoints(trap(top, bot, 0), true);
  g.fillStyle(COLORS.inset, 1).fillPoints(trap(top + 12, bot - 12, 14), true);
  const inner = bot - top - 24;
  const secY = (k: number): number => bot - 12 - (inner * k) / 3;
  // The section being filled is a little lighter, so it is clear where the milk is going.
  g.fillStyle(0x34476a, 1).fillPoints(trap(secY(stage + 1), secY(stage), 14), true);
  const fillTop = bot - 12 - inner * Math.max(0, Math.min(1, shown));
  if (shown > 0.002) {
    g.fillStyle(MILK, 1).fillPoints(trap(fillTop, bot - 12, 14), true);
    const w = half(fillTop) - 14;
    g.fillStyle(MILK_SHADE, 1).fillEllipse(cx + Math.sin(t / 200) * 6, fillTop, w * 1.9, 16);
  }
  // Section dividers (metal bands) with a knob on each side, gold once that section is full.
  for (const k of [1, 2]) {
    const y = secY(k);
    const done = shown >= k / 3 - 0.001;
    g.lineStyle(12, done ? 0xffc928 : 0x6e7c95, 1).lineBetween(cx - half(y), y, cx + half(y), y);
    g.fillStyle(done ? 0xffc928 : 0x6e7c95, 1).fillCircle(cx - half(y), y, 11).fillCircle(cx + half(y), y, 11);
  }
  g.lineStyle(12, 0x9aa7bd, 1).strokeEllipse(cx, top - 6, wt - 20, 40);
  // "full" marker
  g.fillStyle(0xffc928, 1).fillTriangle(cx - wt / 2 - 6, top + 12, cx - wt / 2 - 40, top - 8, cx - wt / 2 - 40, top + 32);
}

/** Local y of the middle of tank section `k` (0 = bottom). */
export function sectionMidY(k: number): number {
  const inner = LAYOUT.bucketBottom - LAYOUT.bucketTop - 24;
  return LAYOUT.bucketBottom - 12 - (inner * (k + 0.5)) / 3;
}

export function drawMeter(g: Phaser.GameObjects.Graphics, p: PlayerId, v: number): void {
  const w = 56;
  const x = LAYOUT.meterX - w / 2;
  const y = LAYOUT.meterTop;
  const h = LAYOUT.meterBottom - LAYOUT.meterTop;
  g.fillStyle(0x080e1a, 0.3).fillRoundedRect(x, y + 8, w, h, 24);
  g.fillStyle(COLORS.surface, 1).fillRoundedRect(x, y, w, h, 24);
  const fh = Math.max(0, Math.min(1, v)) * (h - 12);
  if (fh > 4) g.fillStyle(v > 0.85 ? 0xffc928 : PLAYER[p].main, 1).fillRoundedRect(x + 6, y + h - 6 - fh, w - 12, fh, 18);
  g.lineStyle(4, COLORS.border, 1).strokeRoundedRect(x, y, w, h, 24);
}

export function drawBell(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0xffe38a, 0.35).fillCircle(0, 0, 104);
  g.fillStyle(0xffc928, 1).fillCircle(0, -66, 16);
  g.fillStyle(0xffc928, 1).fillEllipse(0, -20, 128, 110).fillRoundedRect(-72, 12, 144, 38, 14);
  g.fillStyle(0xffe58a, 1).fillEllipse(-24, -34, 36, 62);
  g.fillStyle(0xb98a00, 1).fillCircle(0, 66, 18);
  g.lineStyle(6, 0xb98a00, 1).strokeRoundedRect(-72, 12, 144, 38, 14);
}

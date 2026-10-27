import Phaser from 'phaser';
import { H, W } from '../../core/layout';
import { COLORS, PLAYER } from '../../core/theme';
import { PLAYERS, type PlayerId } from '../../core/types';
import { FISHING, type FishKind } from './config';

export const WATER = 0x2a5f7e;
export const WATER_DEEP = 0x214f6d;

type P2 = { x: number; y: number };

/** Top-down cartoon fish: body, belly, tail that wags, two side fins, two big eyes. `wiggle` is the tail phase. */
export function drawFish(g: Phaser.GameObjects.Graphics, x: number, y: number, heading: number, k: FishKind, wiggle: number, opts: { scale?: number; alpha?: number; shadow?: boolean; sway?: number } = {}): void {
  const L = k.length * (opts.scale ?? 1);
  const a = opts.alpha ?? 1;
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const T = (lx: number, ly: number): P2 => ({ x: x + lx * cos - ly * sin, y: y + lx * sin + ly * cos });
  const sway = Math.sin(wiggle) * L * (0.12 + (opts.sway ?? 0));
  if (opts.shadow !== false) {
    g.fillStyle(0x0c2233, 0.28 * a).fillPoints(ellipse(T, 6, 10, L * 0.5, L * 0.2), true);
  }
  if (k.shape === 'boot') return drawBoot(g, T, L, k, a, wiggle);
  if (k.shape === 'can') return drawCan(g, T, L, k, a, wiggle);
  const slim = k.behavior === 'darter' ? 0.72 : 1;
  // tail
  g.fillStyle(k.fin, a).fillPoints([T(-L * 0.38, 0), T(-L * 0.68, -L * 0.2 + sway), T(-L * 0.6, sway * 0.8), T(-L * 0.68, L * 0.2 + sway)], true);
  // side fins
  const fs = Math.sin(wiggle + 1) * L * 0.05;
  g.fillStyle(k.fin, a);
  g.fillPoints([T(L * 0.1, -L * 0.14), T(-L * 0.06, -L * 0.3 + fs), T(-L * 0.14, -L * 0.14)], true);
  g.fillPoints([T(L * 0.1, L * 0.14), T(-L * 0.06, L * 0.3 - fs), T(-L * 0.14, L * 0.14)], true);
  // body + lighter back stripe
  g.fillStyle(k.body, a).fillPoints(ellipse(T, 0, 0, L * 0.5, L * 0.22 * slim), true);
  g.fillStyle(k.belly, a * 0.85).fillPoints(ellipse(T, -L * 0.02, 0, L * 0.34, L * 0.09), true);
  decorate(g, T, L, k, a, wiggle);
  // eyes
  for (const s of [-1, 1]) {
    const e = T(L * 0.3, s * L * 0.115);
    g.fillStyle(0xffffff, a).fillCircle(e.x, e.y, L * 0.075);
    const pu = T(L * 0.32, s * L * 0.115);
    g.fillStyle(0x1e2a3d, a).fillCircle(pu.x, pu.y, L * 0.04);
  }
}

/** Per-kind markings so every behaviour is recognisable from afar. */
function decorate(g: Phaser.GameObjects.Graphics, T: (lx: number, ly: number) => P2, L: number, k: FishKind, a: number, wiggle: number): void {
  const dark = (c: number, f: number): number => {
    const r = Math.round(((c >> 16) & 255) * f);
    const gg = Math.round(((c >> 8) & 255) * f);
    const b = Math.round((c & 255) * f);
    return (r << 16) | (gg << 8) | b;
  };
  switch (k.behavior) {
    case 'darter': // racing stripes
      g.fillStyle(0xffffff, a * 0.9).fillPoints([T(L * 0.3, -L * 0.03), T(-L * 0.3, -L * 0.03), T(-L * 0.3, L * 0.03), T(L * 0.3, L * 0.03)], true);
      break;
    case 'shy': // blushing spots
      for (const [x, y] of [[-0.05, -0.1], [-0.18, 0.08], [0.08, 0.1], [-0.28, -0.05]] as const) g.fillStyle(dark(k.body, 0.7), a * 0.8).fillCircle(T(L * x, L * y).x, T(L * x, L * y).y, L * 0.04);
      break;
    case 'trickster': // zig-zag stripes
      g.lineStyle(Math.max(2, L * 0.03), dark(k.fin, 0.8), a);
      for (let i = 0; i < 4; i++) {
        const x = L * (0.15 - i * 0.14);
        g.lineBetween(T(x, -L * 0.2).x, T(x, -L * 0.2).y, T(x - L * 0.05, -L * 0.04).x, T(x - L * 0.05, -L * 0.04).y);
        g.lineBetween(T(x - L * 0.05, -L * 0.04).x, T(x - L * 0.05, -L * 0.04).y, T(x, L * 0.1).x, T(x, L * 0.1).y);
      }
      break;
    case 'jumper': // bright dorsal stripe and big tail tips
      g.fillStyle(k.fin, a).fillPoints([T(L * 0.3, 0), T(L * 0.05, -L * 0.04), T(-L * 0.3, -L * 0.02), T(-L * 0.3, L * 0.02), T(L * 0.05, L * 0.04)], true);
      break;
    case 'golden': {
      g.lineStyle(Math.max(2, L * 0.02), 0xfff8d0, a * 0.9);
      for (let i = 0; i < 5; i++) {
        const x = L * (0.2 - i * 0.12);
        g.lineBetween(T(x, -L * 0.1).x, T(x, -L * 0.1).y, T(x - L * 0.05, 0).x, T(x - L * 0.05, 0).y);
        g.lineBetween(T(x - L * 0.05, 0).x, T(x - L * 0.05, 0).y, T(x, L * 0.1).x, T(x, L * 0.1).y);
      }
      // sparkles
      const tw = 0.5 + 0.5 * Math.sin(wiggle * 0.8);
      for (const [x, y, r] of [[0.1, -0.34, 0.07], [-0.3, 0.32, 0.055], [0.45, 0.2, 0.05]] as const) {
        const c = T(L * x, L * y);
        const rr = L * r * (0.6 + tw * 0.6);
        g.fillStyle(0xffffff, a * (0.6 + 0.4 * tw)).fillTriangle(c.x, c.y - rr * 1.6, c.x + rr * 0.4, c.y, c.x - rr * 0.4, c.y).fillTriangle(c.x, c.y + rr * 1.6, c.x + rr * 0.4, c.y, c.x - rr * 0.4, c.y);
        g.fillTriangle(c.x - rr * 1.6, c.y, c.x, c.y + rr * 0.4, c.x, c.y - rr * 0.4).fillTriangle(c.x + rr * 1.6, c.y, c.x, c.y + rr * 0.4, c.x, c.y - rr * 0.4);
      }
      break;
    }
    default:
      break;
  }
}

/** Old boot, seen from above: a long shaft and a rounded toe with laces. */
function drawBoot(g: Phaser.GameObjects.Graphics, T: (lx: number, ly: number) => P2, L: number, k: FishKind, a: number, wiggle: number): void {
  const sway = Math.sin(wiggle * 0.5) * L * 0.02;
  g.fillStyle(k.fin, a).fillPoints([T(-L * 0.5, -L * 0.2 + sway), T(-L * 0.12, -L * 0.2), T(-L * 0.12, L * 0.2), T(-L * 0.5, L * 0.2 + sway)], true); // shaft
  g.fillStyle(k.body, a).fillPoints(ellipse(T, L * 0.1, 0, L * 0.42, L * 0.2), true); // foot
  g.fillStyle(k.belly, a).fillPoints(ellipse(T, L * 0.32, 0, L * 0.18, L * 0.14), true); // toe cap
  g.fillStyle(0x2b1c10, a).fillPoints(ellipse(T, -L * 0.4, 0, L * 0.12, L * 0.12), true); // opening
  g.lineStyle(Math.max(2, L * 0.025), 0xf3e9d8, a);
  for (let i = 0; i < 3; i++) {
    const x = L * (0.08 - i * 0.1);
    g.lineBetween(T(x, -L * 0.1).x, T(x, -L * 0.1).y, T(x - L * 0.04, L * 0.1).x, T(x - L * 0.04, L * 0.1).y);
  }
}

/** Tin can, seen from above: a ring with a lid and a pull tab. */
function drawCan(g: Phaser.GameObjects.Graphics, T: (lx: number, ly: number) => P2, L: number, k: FishKind, a: number, wiggle: number): void {
  const c = T(0, 0);
  const r = L * 0.34;
  g.fillStyle(k.fin, a).fillCircle(c.x, c.y, r);
  g.fillStyle(k.body, a).fillCircle(c.x, c.y, r * 0.9);
  g.lineStyle(Math.max(2, L * 0.02), k.fin, a).strokeCircle(c.x, c.y, r * 0.62);
  g.fillStyle(k.belly, a).fillCircle(c.x, c.y, r * 0.5);
  const tab = T(L * 0.05, 0);
  g.fillStyle(0xd94f4f, a).fillCircle(tab.x, tab.y, r * 0.14);
  const gl = 0.5 + 0.5 * Math.sin(wiggle * 0.7);
  g.fillStyle(0xffffff, a * (0.35 + 0.35 * gl)).fillCircle(c.x - r * 0.45, c.y - r * 0.45, r * 0.12);
}

function ellipse(T: (lx: number, ly: number) => P2, cx: number, cy: number, rx: number, ry: number): P2[] {
  const pts: P2[] = [];
  for (let i = 0; i < 18; i++) {
    const t = (i / 18) * Math.PI * 2;
    const taper = 1 + 0.18 * Math.cos(t); // fatter at the head
    pts.push(T(cx + Math.cos(t) * rx, cy + Math.sin(t) * ry * taper));
  }
  return pts;
}

/** Bobber in the player's colour, centred on (x, y). `dip` 0..1 sinks it. */
export function drawBobber(g: Phaser.GameObjects.Graphics, x: number, y: number, p: PlayerId, scale = 1, dip = 0): void {
  const r = 20 * scale * (1 - 0.25 * dip);
  g.fillStyle(0x0c2233, 0.3).fillCircle(x + 3, y + 5, r);
  g.fillStyle(0xffffff, 1).fillCircle(x, y, r);
  g.fillStyle(PLAYER[p].main, 1).fillCircle(x, y, r * 0.66);
  g.fillStyle(0xffffff, 0.8).fillCircle(x - r * 0.25, y - r * 0.25, r * 0.2);
}

/** Static scene: dusk bank, pond, lily pads, and a wooden dock for each player. */
export function drawPond(scene: Phaser.Scene): void {
  scene.add.rectangle(W / 2, H / 2, W, H, 0x2b4538);
  const g = scene.add.graphics();
  const { l, t, r, b } = FISHING.pond;
  for (const p of PLAYERS) {
    const x0 = p === 0 ? 0 : W - 330;
    g.fillStyle(PLAYER[p].main, 0.14).fillRect(x0, 0, 330, H);
  }
  // shore ring, water, deeper middle
  g.fillStyle(0x080e1a, 0.3).fillRoundedRect(l - 36, t - 36 + 12, r - l + 72, b - t + 72, 150);
  g.fillStyle(0x4a6c55, 1).fillRoundedRect(l - 36, t - 36, r - l + 72, b - t + 72, 150);
  g.fillStyle(WATER, 1).fillRoundedRect(l - 14, t - 14, r - l + 28, b - t + 28, 135);
  g.fillStyle(WATER_DEEP, 1).fillRoundedRect(l + 90, t + 90, r - l - 180, b - t - 180, 110);
  g.fillStyle(0x1b4260, 0.8).fillRoundedRect(l + 230, t + 200, r - l - 460, b - t - 400, 100);
  // lily pads + reeds along the top/bottom shore
  const pads: Array<[number, number, number]> = [[620, 190, 34], [660, 225, 22], [1290, 880, 36], [1250, 915, 22], [900, 150, 26], [1100, 940, 28], [470, 880, 24], [1450, 170, 24]];
  for (const [px, py, pr] of pads) {
    g.fillStyle(0x3f8a5a, 1).fillCircle(px, py, pr);
    g.fillStyle(WATER, 1).fillTriangle(px, py, px + pr * 1.1, py - pr * 0.3, px + pr * 1.1, py + pr * 0.3);
    g.lineStyle(2, 0x2c6a43, 1).strokeCircle(px, py, pr);
  }
  g.fillStyle(0xff9fb8, 1).fillCircle(655, 215, 9).fillCircle(1285, 876, 9);
  // docks
  for (const p of PLAYERS) {
    const dir = p === 0 ? 1 : -1;
    const ex = p === 0 ? 0 : W;
    const tipX = ex + dir * (FISHING.tipInset + 70);
    const y0 = FISHING.tipY - 105;
    const x = Math.min(ex, tipX);
    const w = Math.abs(tipX - ex);
    g.fillStyle(0x080e1a, 0.3).fillRoundedRect(x, y0 + 12, w, 210, 12);
    g.fillStyle(0x8a6a4a, 1).fillRoundedRect(x, y0, w, 210, 12);
    g.lineStyle(4, 0x6d5238, 1);
    for (let i = 1; i < 7; i++) g.lineBetween(x, y0 + i * 30, x + w, y0 + i * 30);
    g.fillStyle(0x5a4230, 1).fillCircle(tipX, y0 + 8, 14).fillCircle(tipX, y0 + 202, 14);
  }
}

/** Home tile icon: a bit of pond with waves, a fish and a bobber. */
export function drawFishingIcon(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(WATER, 1).fillRoundedRect(28, 44, 184, 102, 26);
  g.fillStyle(WATER_DEEP, 1).fillRoundedRect(50, 62, 140, 66, 20);
  g.lineStyle(3, 0xa9d8f0, 0.7);
  for (const [wx, wy] of [[48, 70], [150, 124], [140, 66]] as const) {
    g.beginPath().moveTo(wx, wy);
    for (let i = 1; i <= 16; i++) g.lineTo(wx + i * 2.5, wy + Math.sin(i * 0.8) * 3);
    g.strokePath();
  }
  // fish
  const k = FISHING.kinds[2];
  const cx = 104;
  const cy = 100;
  const L = 74;
  g.fillStyle(k.fin, 1).fillTriangle(cx - L * 0.35, cy, cx - L * 0.72, cy - L * 0.24, cx - L * 0.72, cy + L * 0.24);
  g.fillStyle(k.body, 1).fillEllipse(cx, cy, L, L * 0.5);
  g.fillStyle(k.belly, 0.85).fillEllipse(cx, cy + 2, L * 0.6, L * 0.2);
  g.fillStyle(0xffffff, 1).fillCircle(cx + L * 0.24, cy - L * 0.08, 6);
  g.fillStyle(COLORS.btnFg, 1).fillCircle(cx + L * 0.26, cy - L * 0.08, 3);
  // line + bobber
  g.lineStyle(2.5, COLORS.text2, 0.9).lineBetween(172, 40, 172, 74);
  g.fillStyle(0xffffff, 1).fillCircle(172, 82, 11);
  g.fillStyle(PLAYER[0].main, 1).fillCircle(172, 82, 7);
  g.lineStyle(2, 0xa9d8f0, 0.9).strokeEllipse(172, 94, 34, 9);
}

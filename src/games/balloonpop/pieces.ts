import Phaser from 'phaser';
import { PLAYER } from '../../core/theme';
import type { PlayerId } from '../../core/types';
import type { Balloon, BalloonKind } from './logic';

/** Bright balloon colours (index chosen by the spawn schedule). */
export const BALLOON_COLOURS = [0xff4d6a, 0xffd23f, 0x3ddc84, 0xb46bff, 0xff7ac8, 0x3fd0ff] as const;
const GOLD = 0xffc928;
const RAINBOW = [0xff4d4d, 0xff9a3d, 0xffe14d, 0x4ddc7a, 0x4db8ff, 0xa06bff];

export const colourOf = (b: Pick<Balloon, 'kind' | 'colour'>): number =>
  b.kind === 'star' ? GOLD : b.kind === 'grumpy' ? 0x1b1d2a : b.kind === 'bomb' ? 0x6b4a9e : b.kind === 'chain' ? RAINBOW[0] : BALLOON_COLOURS[b.colour % BALLOON_COLOURS.length];

const shade = (c: number, f: number): number => {
  const k = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return (k((c >> 16) & 255) << 16) | (k((c >> 8) & 255) << 8) | k(c & 255);
};

function star(g: Phaser.GameObjects.Graphics, r: number, color: number): void {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(new Phaser.Math.Vector2(Math.cos(a) * rr, Math.sin(a) * rr));
  }
  g.fillStyle(color, 1).fillPoints(pts, true);
}

/** A balloon drawn once into a container centred on the balloon's middle; the scene only moves it. */
export function makeBalloonView(scene: Phaser.Scene, b: Balloon): Phaser.GameObjects.Container {
  const r = b.r;
  const hh = r * 1.15; // balloons are a little taller than wide
  const col = colourOf(b);
  const g = scene.add.graphics();
  // string
  g.lineStyle(4, 0xe1e8f2, 0.8);
  const sy = hh + 10;
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i <= 8; i++) pts.push(new Phaser.Math.Vector2(Math.sin(i * 0.9) * 9, sy + i * 9));
  g.strokePoints(pts, false);
  if (b.kind === 'grumpy') {
    g.fillStyle(0x3a3d52, 1);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const bx = ca * r * 0.92;
      const by = sa * hh * 0.92;
      g.fillTriangle(bx - sa * 13, by + ca * 13, bx + sa * 13, by - ca * 13, ca * (r + 22), sa * (hh + 22));
    }
  }
  // body
  g.fillStyle(0x080e1a, 0.18).fillEllipse(4, 6, r * 2, hh * 2);
  if (b.kind === 'chain') {
    RAINBOW.forEach((c, i) => g.fillStyle(c, 1).fillEllipse(0, 0, r * 2 * (1 - i * 0.15), hh * 2 * (1 - i * 0.15)));
  } else {
    g.fillStyle(shade(col, 0.82), 1).fillEllipse(0, 0, r * 2, hh * 2);
    g.fillStyle(col, 1).fillEllipse(-r * 0.08, -hh * 0.06, r * 1.78, hh * 1.82);
  }
  // knot
  g.fillStyle(shade(col, 0.75), 1).fillTriangle(0, hh - 2, -11, hh + 14, 11, hh + 14);
  // shine
  g.fillStyle(0xffffff, b.kind === 'grumpy' ? 0.18 : 0.4).fillEllipse(-r * 0.45, -hh * 0.5, r * 0.3, hh * 0.38);
  decorate(g, b.kind, r, hh);
  return scene.add.container(b.x, b.y, [g]);
}

function decorate(g: Phaser.GameObjects.Graphics, kind: BalloonKind, r: number, hh: number): void {
  const dark = 0x1e2a3d;
  if (kind === 'star') {
    star(g, r * 0.55, 0xffffff);
    star(g, r * 0.42, 0xffe14d);
  } else if (kind === 'grumpy') {
    g.fillStyle(0xffffff, 1).fillCircle(-r * 0.3, -hh * 0.05, r * 0.2).fillCircle(r * 0.3, -hh * 0.05, r * 0.2);
    g.fillStyle(0xe13b3b, 1).fillCircle(-r * 0.27, 0, r * 0.1).fillCircle(r * 0.27, 0, r * 0.1);
    g.lineStyle(7, 0xffffff, 1).lineBetween(-r * 0.55, -hh * 0.38, -r * 0.1, -hh * 0.2).lineBetween(r * 0.55, -hh * 0.38, r * 0.1, -hh * 0.2);
    g.lineStyle(6, 0xffffff, 1).beginPath().arc(0, hh * 0.52, r * 0.3, Math.PI * 1.15, Math.PI * 1.85).strokePath();
  } else if (kind === 'bomb') {
    // A little black bomb with a lit fuse on a stormy purple balloon.
    g.fillStyle(0xd9d2ee, 0.9).fillEllipse(-r * 0.55, hh * 0.3, r * 0.7, hh * 0.4).fillEllipse(r * 0.55, hh * 0.3, r * 0.7, hh * 0.4);
    g.fillStyle(0x14161f, 1).fillCircle(0, hh * 0.08, r * 0.42);
    g.fillStyle(0xffffff, 0.35).fillCircle(-r * 0.15, -hh * 0.06, r * 0.1);
    g.lineStyle(6, 0xe1c9a0, 1).lineBetween(r * 0.2, -hh * 0.2, r * 0.38, -hh * 0.42);
    g.fillStyle(0xffd23f, 1).fillCircle(r * 0.4, -hh * 0.46, r * 0.13);
    g.fillStyle(0xff5a3d, 1).fillCircle(r * 0.4, -hh * 0.46, r * 0.07);
  } else if (kind === 'chain') {
    g.fillStyle(0xffffff, 1).fillCircle(0, 0, r * 0.2);
    g.fillStyle(dark, 1).fillCircle(0, 0, r * 0.1);
  } else if (kind !== 'small') {
    g.fillStyle(dark, 1).fillCircle(-r * 0.28, -hh * 0.04, r * 0.09).fillCircle(r * 0.28, -hh * 0.04, r * 0.09);
    g.lineStyle(5, dark, 1).beginPath().arc(0, hh * 0.06, r * 0.28, Math.PI * 0.15, Math.PI * 0.85).strokePath();
  }
}

/** Frosty cover over a player's half while they are frozen. */
export function makeFrost(scene: Phaser.Scene, p: PlayerId, x: number, w: number, h: number): Phaser.GameObjects.Container {
  const g = scene.add.graphics();
  g.fillStyle(0xcfeaff, 0.38).fillRect(x, 0, w, h);
  g.lineStyle(14, 0xf0f9ff, 0.7).strokeRect(x + 7, 7, w - 14, h - 14);
  // snowflakes on a fixed grid
  g.lineStyle(6, 0xffffff, 0.75);
  for (let i = 0; i < 12; i++) {
    const cx = x + 120 + ((i * 197) % (w - 240));
    const cy = 100 + ((i * 331) % (h - 200));
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI) / 3;
      g.lineBetween(cx - Math.cos(a) * 34, cy - Math.sin(a) * 34, cx + Math.cos(a) * 34, cy + Math.sin(a) * 34);
    }
  }
  // icy tint of the player's colour at the edge they sit on
  g.fillStyle(PLAYER[p].light, 0.15).fillRect(x, 0, w, h);
  return scene.add.container(0, 0, [g]).setDepth(45).setVisible(false);
}

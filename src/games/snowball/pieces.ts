import Phaser from 'phaser';
import { COLORS, PLAYER } from '../../core/theme';
import type { PlayerId } from '../../core/types';

export interface KidView {
  /** Positioned at the kid; mirrored for player 1 so the kid always faces the opponent. */
  root: Phaser.GameObjects.Container;
  /** The kid itself (scaled down while ducking). */
  body: Phaser.GameObjects.Container;
  /** Snowball in the hands (visible while loaded). */
  held: Phaser.GameObjects.Arc;
  /** Snow splotches on the face. */
  snow: Phaser.GameObjects.Graphics;
  /** The mound the kid crouches behind. */
  mound: Phaser.GameObjects.Graphics;
}

const SKIN = 0xffd9b8;

/** A snow mound drawn around (0,0). */
export function drawMound(g: Phaser.GameObjects.Graphics, r: number, shadow = true): void {
  if (shadow) g.fillStyle(0x5b7aa0, 0.3).fillEllipse(r * 0.1, r * 0.2, r * 2.3, r * 1.9);
  g.fillStyle(0xc4d8ee, 1).fillEllipse(0, 0, r * 2.1, r * 1.8);
  g.fillStyle(0xeaf3fc, 1).fillEllipse(-r * 0.08, -r * 0.1, r * 1.7, r * 1.4);
  g.fillStyle(0xf8fbff, 1).fillEllipse(-r * 0.2, -r * 0.22, r * 0.9, r * 0.6);
  g.lineStyle(3, 0xa9c2dd, 0.8).strokeEllipse(0, 0, r * 2.1, r * 1.8);
}

/** A top-down kid in a bobble hat, drawn facing +x. */
export function makeKid(scene: Phaser.Scene, p: PlayerId): KidView {
  const c = PLAYER[p];
  const g = scene.add.graphics();
  g.fillStyle(0x4a6486, 0.3).fillEllipse(4, 8, 120, 100); // shadow
  // mitts + arms
  g.fillStyle(c.dark, 1).fillEllipse(8, -40, 44, 24).fillEllipse(8, 40, 44, 24);
  g.fillStyle(0xf5f7fa, 1).fillCircle(26, -38, 13).fillCircle(26, 38, 13);
  // body (puffy jacket) + scarf
  g.fillStyle(c.dark, 1).fillEllipse(-4, 0, 54, 92);
  g.fillStyle(c.main, 1).fillEllipse(-6, -2, 50, 86);
  g.fillStyle(0xf5f7fa, 1).fillEllipse(10, 0, 22, 60);
  // head
  g.fillStyle(SKIN, 1).fillCircle(10, 0, 31);
  g.fillStyle(0xf59d9d, 0.8).fillCircle(26, -17, 6).fillCircle(26, 17, 6);
  g.fillStyle(COLORS.btnFg, 1).fillCircle(30, -10, 4.5).fillCircle(30, 10, 4.5);
  g.lineStyle(3, COLORS.btnFg, 1).beginPath().arc(30, 0, 8, -0.6, 0.6, false).strokePath();
  // bobble hat: covers the back of the head, white band, pompom on top
  g.fillStyle(c.dark, 1).fillCircle(-2, 0, 33);
  g.fillStyle(c.main, 1).fillCircle(-4, 0, 30);
  g.lineStyle(7, 0xf5f7fa, 1).beginPath().arc(4, 0, 30, -1.45, 1.45, false).strokePath();
  g.fillStyle(0xffffff, 1).fillCircle(-6, 0, 13);
  g.fillStyle(0xd9e6f4, 1).fillCircle(-3, 3, 6);

  const held = scene.add.circle(40, 0, 15, 0xffffff, 1).setStrokeStyle(3, 0xb4c9e0);
  const snow = scene.add.graphics();
  snow.fillStyle(0xffffff, 1).fillCircle(28, -4, 15).fillCircle(20, 14, 12).fillCircle(32, 14, 10).fillCircle(18, -16, 10).fillCircle(36, -14, 8);
  snow.setVisible(false);
  const body = scene.add.container(0, 0, [g, held, snow]);
  const mound = scene.add.graphics();
  drawMound(mound, 64);
  mound.setPosition(46, 0).setVisible(false);
  const root = scene.add.container(0, 0, [body, mound]).setDepth(10);
  root.setScale(p === 0 ? 1 : -1, 1);
  return { root, body, held, snow, mound };
}

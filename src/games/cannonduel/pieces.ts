import Phaser from 'phaser';
import { COLORS, PLAYER } from '../../core/theme';
import type { PlayerId } from '../../core/types';
import { CANNONDUEL } from './config';
import { cannonPos } from './logic';

export interface CannonView {
  root: Phaser.GameObjects.Container;
  /** Rotating barrel (rotation = world angle of the shot). */
  barrel: Phaser.GameObjects.Container;
}

/** A chunky tank-cannon in the player's colour. Container origin is the barrel pivot (= hit centre). */
export function makeCannon(scene: Phaser.Scene, p: PlayerId): CannonView {
  const c = PLAYER[p];
  const pos = cannonPos(p);
  const gy = CANNONDUEL.groundY - pos.y; // pivot -> ground distance
  const L = CANNONDUEL.barrelLength;
  const g = scene.add.graphics();
  g.fillStyle(0x080e1a, 0.35).fillEllipse(0, gy, 230, 34);
  // tracks and hull
  g.fillStyle(COLORS.surface, 1).fillRoundedRect(-92, gy - 52, 184, 52, 26);
  g.fillStyle(0x10192a, 1).fillCircle(-58, gy - 26, 24).fillCircle(0, gy - 26, 24).fillCircle(58, gy - 26, 24);
  g.fillStyle(COLORS.icon, 1).fillCircle(-58, gy - 26, 11).fillCircle(0, gy - 26, 11).fillCircle(58, gy - 26, 11);
  g.fillStyle(c.dark, 1).fillRoundedRect(-80, gy - 80, 160, 46, 18);
  g.fillStyle(c.main, 1).fillRoundedRect(-80, gy - 80, 160, 36, 18);
  // turret
  g.fillStyle(c.dark, 1).fillCircle(0, 0, 50);
  g.fillStyle(c.main, 1).fillCircle(-3, -4, 44);
  g.fillStyle(c.light, 1).fillCircle(-12, -14, 16);

  const bg = scene.add.graphics();
  bg.fillStyle(c.dark, 1).fillRoundedRect(0, -20, L, 40, 12);
  bg.fillStyle(c.main, 1).fillRoundedRect(0, -20, L, 30, 12);
  bg.fillStyle(COLORS.btnFg, 1).fillRoundedRect(L - 8, -24, 20, 48, 8);
  const barrel = scene.add.container(0, 0, [bg]);
  const root = scene.add.container(pos.x, pos.y, [g, barrel]).setDepth(10);
  return { root, barrel };
}

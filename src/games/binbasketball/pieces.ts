import Phaser from 'phaser';
import { COLORS, PLAYER } from '../../core/theme';
import type { PlayerId } from '../../core/types';
import { BINBASKETBALL } from './config';

/** Crumpled-paper ball in the player's colour, with a soft shadow. Origin is its centre. */
export function makeBall(scene: Phaser.Scene, p: PlayerId): Phaser.GameObjects.Container {
  const R = BINBASKETBALL.ballRadius;
  const c = PLAYER[p];
  const g = scene.add.graphics();
  g.fillStyle(c.main, 1).fillCircle(0, 0, R);
  g.fillStyle(c.dark, 1).fillCircle(R * 0.3, R * 0.25, R * 0.55);
  g.fillStyle(c.light, 1).fillCircle(-R * 0.3, -R * 0.3, R * 0.4);
  g.lineStyle(3, c.dark, 0.9);
  g.beginPath().moveTo(-R * 0.7, R * 0.1).lineTo(-R * 0.1, R * 0.35).lineTo(R * 0.4, -R * 0.2).lineTo(R * 0.7, R * 0.05).strokePath();
  g.beginPath().moveTo(-R * 0.1, -R * 0.75).lineTo(0, -R * 0.2).lineTo(-R * 0.25, R * 0.35).strokePath();
  const shadow = scene.add.circle(0, 0, R, 0x080e1a, 0.4);
  const c2 = scene.add.container(0, 0, [shadow, g]).setDepth(20);
  c2.setData('shadow', shadow);
  return c2;
}

/** Top-down bin: dark inside, light rim, drop shadow. Origin is its centre. */
export function makeBin(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const R = BINBASKETBALL.binRadius;
  return scene.add
    .container(0, 0, [
      scene.add.circle(0, 14, R * 1.04, 0x080e1a, 0.4),
      scene.add.circle(0, 0, R * 1.06, COLORS.border),
      scene.add.circle(0, 0, R, COLORS.icon),
      scene.add.circle(0, 0, R * 0.86, COLORS.surface),
      scene.add.circle(0, 0, R * 0.8, 0x10192a),
      scene.add.circle(0, 0, R * 0.5, 0x0a111d),
    ])
    .setDepth(10);
}

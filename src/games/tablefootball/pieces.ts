import Phaser from 'phaser';
import { COLORS, PLAYER } from '../../core/theme';
import type { PlayerId } from '../../core/types';
import { TABLEFOOTBALL } from './config';

/** A figure seen from above: shadow, body disc in the player's colour, darker ring, light head. */
export function makeFigure(scene: Phaser.Scene, p: PlayerId): Phaser.GameObjects.Container {
  const R = TABLEFOOTBALL.figureRadius;
  const c = PLAYER[p];
  const foot = p === 0 ? R * 0.35 : -R * 0.35; // little "boot" toward the opponent
  return scene.add
    .container(0, 0, [
      scene.add.circle(0, 8, R, 0x080e1a, 0.4),
      scene.add.circle(0, 0, R * 1.2, c.main, 0.14).setName('glow').setVisible(false),
      scene.add.circle(0, 0, R, c.main),
      scene.add.circle(0, 0, R * 0.68, c.dark),
      scene.add.circle(0, 0, R * 0.38, c.light),
      scene.add.circle(foot * 2.2, 0, R * 0.26, c.light),
    ])
    .setDepth(10);
}

/** Ball: white with a ring and a shadow. */
export function makeBall(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const R = TABLEFOOTBALL.ballRadius;
  return scene.add
    .container(0, 0, [
      scene.add.circle(0, 5, R, 0x080e1a, 0.45),
      scene.add.circle(0, 0, R, COLORS.puck),
      scene.add.circle(0, 0, R * 0.55).setStrokeStyle(2, COLORS.puckRing),
    ])
    .setDepth(12);
}

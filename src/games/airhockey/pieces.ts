import Phaser from 'phaser';
import { COLORS, PLAYER } from '../../core/theme';
import type { PlayerId } from '../../core/types';
import { AIRHOCKEY } from './config';

/** Mallet look from the mockup: main disc, darker inner ring, lighter knob, soft shadow. */
export function makeMallet(scene: Phaser.Scene, p: PlayerId): Phaser.GameObjects.Container {
  const R = AIRHOCKEY.malletRadius;
  const c = PLAYER[p];
  return scene.add
    .container(0, 0, [
      scene.add.circle(0, 10, R, 0x080e1a, 0.4),
      scene.add.circle(0, 0, R * 1.18, c.main, 0.14),
      scene.add.circle(0, 0, R, c.main),
      scene.add.circle(0, 0, R * 0.6, c.dark),
      scene.add.circle(0, 0, R * 0.3, c.light),
    ])
    .setDepth(10);
}

/** Puck: white disc with a thin ring and a shadow. */
export function makePuck(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const R = AIRHOCKEY.puckRadius;
  return scene.add
    .container(0, 0, [
      scene.add.circle(0, 6, R, 0x080e1a, 0.45),
      scene.add.circle(0, 0, R, COLORS.puck),
      scene.add.circle(0, 0, R * 0.6).setStrokeStyle(2, COLORS.puckRing),
    ])
    .setDepth(12);
}

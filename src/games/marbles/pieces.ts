import Phaser from 'phaser';
import { PLAYER } from '../../core/theme';
import type { PlayerId } from '../../core/types';
import { MARBLES } from './config';

/** A glassy marble in the player's colour. Child 0 is the shadow (offset it when the marble "falls"). */
export function makeMarble(scene: Phaser.Scene, owner: PlayerId): Phaser.GameObjects.Container {
  const r = MARBLES.marbleRadius;
  const c = PLAYER[owner];
  const shadow = scene.add.circle(0, 8, r, 0x080e1a, 0.35);
  const body = scene.add.circle(0, 0, r, c.main).setStrokeStyle(6, c.dark);
  const core = scene.add.circle(r * 0.08, r * 0.1, r * 0.58, c.dark, 0.5);
  const swirl = scene.add.circle(-r * 0.22, -r * 0.26, r * 0.34, c.light, 0.85);
  const glint = scene.add.circle(-r * 0.3, -r * 0.34, r * 0.13, 0xffffff, 0.95);
  const box = scene.add.container(0, 0, [shadow, body, core, swirl, glint]);
  box.setData('shadow', shadow);
  return box;
}

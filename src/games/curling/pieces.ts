import Phaser from 'phaser';
import { PLAYER } from '../../core/theme';
import type { PlayerId } from '../../core/types';
import { CURLING } from './config';

/** A big, readable curling stone in the player's colour: dark rim, light ring and a round handle. Origin = centre. */
export function makeStone(scene: Phaser.Scene, p: PlayerId): Phaser.GameObjects.Container {
  const r = CURLING.stoneRadius;
  const pal = PLAYER[p];
  const shadow = scene.add.circle(4, 10, r + 2, 0x080e1a, 0.3);
  const g = scene.add.graphics();
  g.fillStyle(0x59687f, 1).fillCircle(0, 0, r); // granite rim
  g.fillStyle(pal.main, 1).fillCircle(0, 0, r - 7);
  g.lineStyle(4, pal.light, 1).strokeCircle(0, 0, r * 0.62);
  g.fillStyle(pal.dark, 1).fillCircle(0, 0, r * 0.36);
  g.fillStyle(pal.light, 1).fillCircle(0, 0, r * 0.2);
  g.fillStyle(0xffffff, 0.8).fillCircle(-r * 0.4, -r * 0.45, r * 0.12);
  const c = scene.add.container(0, 0, [shadow, g]);
  c.setData('shadow', shadow);
  return c;
}

import Phaser from 'phaser';
import { PLAYER } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { MILKRACE } from './config';
import { MilkRaceScene } from './MilkRaceScene';

/** Home tile icon: a spotted cow face with a milk bucket, two player-coloured drops. */
function drawIcon(g: Phaser.GameObjects.Graphics): void {
  // bucket
  g.fillStyle(0x9aa7bd, 1).fillPoints([new Phaser.Geom.Point(150, 80), new Phaser.Geom.Point(232, 80), new Phaser.Geom.Point(222, 148), new Phaser.Geom.Point(160, 148)], true);
  g.fillStyle(0xfdfcf6, 1).fillPoints([new Phaser.Geom.Point(156, 98), new Phaser.Geom.Point(226, 98), new Phaser.Geom.Point(220, 142), new Phaser.Geom.Point(162, 142)], true);
  g.lineStyle(6, 0x6e7c95, 1).lineBetween(150, 80, 232, 80);
  // cow head
  g.fillStyle(0xe8dcc6, 1).fillEllipse(58, 62, 14, 26).fillEllipse(110, 62, 14, 26);
  g.fillStyle(0xf2e9da, 1).fillEllipse(34, 92, 32, 18).fillEllipse(134, 92, 32, 18);
  g.fillStyle(0xf7f3ea, 1).fillEllipse(84, 98, 90, 82);
  g.fillStyle(0x3a4152, 1).fillEllipse(62, 82, 28, 22);
  g.fillStyle(0xffb3c1, 1).fillEllipse(84, 120, 58, 36);
  g.fillStyle(0xe58aa0, 1).fillEllipse(74, 120, 8, 12).fillEllipse(94, 120, 8, 12);
  g.fillStyle(0x1e2a3d, 1).fillCircle(66, 98, 6).fillCircle(102, 98, 6);
  // squirt drops
  g.fillStyle(0xfdfcf6, 1).fillCircle(142, 52, 7).fillCircle(168, 40, 6).fillCircle(194, 52, 7);
  g.fillStyle(PLAYER[0].main, 1).fillCircle(48, 142, 7);
  g.fillStyle(PLAYER[1].main, 1).fillCircle(120, 142, 7);
}

export const milkRaceGame: GameModule = {
  id: MILKRACE.id,
  titleKey: 'milkraceTitle',
  title: { en: 'Milk Race', nl: 'Melkrace' },
  drawIcon,
  color: 0x2fb7a3,
  sceneKey: MILKRACE.sceneKey,
  scenes: [MilkRaceScene],
};

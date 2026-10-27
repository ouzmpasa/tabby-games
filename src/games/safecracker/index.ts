import type Phaser from 'phaser';
import { COLORS, PLAYER } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { SAFECRACKER } from './config';
import { SafeCrackerScene } from './SafeCrackerScene';

/** Home tile icon: a steel safe with a dial and three lock lights. */
function drawIcon(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x080e1a, 0.4).fillRoundedRect(58, 50, 152, 106, 16);
  g.fillStyle(0x56688a, 1).fillRoundedRect(58, 42, 152, 106, 16);
  g.lineStyle(5, PLAYER[0].main, 1).strokeRoundedRect(61, 45, 146, 100, 14);
  g.fillStyle(0x8fa0bd, 1).fillRoundedRect(72, 56, 124, 78, 8);
  g.fillStyle(0x1e2a3d, 1).fillCircle(134, 95, 33);
  g.fillStyle(COLORS.icon, 1).fillCircle(134, 95, 29);
  g.fillStyle(COLORS.muted, 1).fillCircle(134, 95, 15);
  g.fillStyle(PLAYER[1].main, 1).fillTriangle(134, 66, 127, 80, 141, 80);
  g.lineStyle(4, PLAYER[1].main, 1).lineBetween(134, 80, 134, 95);
  g.fillStyle(0x3ddc84, 1).fillCircle(86, 70, 5).fillCircle(86, 90, 5).fillStyle(COLORS.inset, 1).fillCircle(86, 110, 5);
  g.fillStyle(0xffd84d, 1).fillCircle(222, 138, 9).fillCircle(40, 138, 9);
}

export const safeCrackerGame: GameModule = {
  id: SAFECRACKER.id,
  titleKey: 'safecrackerTitle',
  title: { en: 'Safe Cracker', nl: 'Kluiskrakers' },
  drawIcon,
  color: PLAYER[1].main,
  sceneKey: SAFECRACKER.sceneKey,
  scenes: [SafeCrackerScene],
};

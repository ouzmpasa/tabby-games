import Phaser from 'phaser';
import { COLORS, PLAYER } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { SNAKE } from './config';
import { SnakeDuelScene } from './SnakeDuelScene';

/** Home tile icon: a rounded arena with an orange and a blue snake and an apple between them. */
function drawIcon(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x080e1a, 0.35).fillRoundedRect(36, 46, 196, 110, 26);
  g.fillStyle(COLORS.inset, 1).fillRoundedRect(36, 40, 196, 110, 26);
  g.lineStyle(3, COLORS.line, 1).strokeRoundedRect(36, 40, 196, 110, 26);
  const snake = (pts: Array<[number, number]>, p: 0 | 1, head: [number, number]) => {
    const c = PLAYER[p];
    pts.forEach(([x, y], i) => g.fillStyle(i % 2 ? c.main : c.light, 1).fillCircle(x, y, 10));
    g.fillStyle(c.dark, 1).fillCircle(head[0], head[1] + 2, 15);
    g.fillStyle(c.main, 1).fillCircle(head[0], head[1], 14);
    const d = p === 0 ? 1 : -1;
    for (const s of [-1, 1]) {
      g.fillStyle(0xffffff, 1).fillCircle(head[0] + d * 3, head[1] + s * 6, 5);
      g.fillStyle(0x1e2a3d, 1).fillCircle(head[0] + d * 5, head[1] + s * 6, 2.5);
    }
    g.lineStyle(3, 0xe5484d, 1).lineBetween(head[0] + d * 14, head[1], head[0] + d * 22, head[1]);
  };
  snake([[54, 120], [66, 128], [80, 126], [92, 116], [104, 108]], 0, [118, 100]);
  snake([[214, 70], [202, 62], [188, 64], [176, 74], [164, 82]], 1, [150, 90]);
  g.fillStyle(0xf05561, 1).fillCircle(134, 64, 11);
  g.fillStyle(0x58c27d, 1).fillEllipse(141, 50, 10, 5);
}

export const snakeDuelGame: GameModule = {
  id: SNAKE.id,
  titleKey: 'snakeduelTitle',
  title: { en: 'Snake Duel', nl: 'Slangenduel' },
  drawIcon,
  color: PLAYER[1].main,
  sceneKey: SNAKE.sceneKey,
  scenes: [SnakeDuelScene],
};

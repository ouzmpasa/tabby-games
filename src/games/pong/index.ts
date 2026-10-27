import type Phaser from 'phaser';
import { COLORS, PLAYER } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { PONG } from './config';
import { PongScene } from './PongScene';

/** Home tile icon: two paddles, a dashed centre line and the ball. */
function drawIcon(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(COLORS.dots, 1).fillRoundedRect(28, 40, 212, 110, 18);
  g.fillStyle(COLORS.line, 1);
  for (let y = 48; y < 144; y += 18) g.fillRect(132, y, 4, 10);
  g.fillStyle(PLAYER[0].main, 1).fillRoundedRect(46, 66, 16, 58, 8);
  g.fillStyle(PLAYER[1].main, 1).fillRoundedRect(206, 66, 16, 58, 8);
  g.fillStyle(COLORS.puck, 1).fillCircle(150, 88, 11);
  g.fillStyle(COLORS.puck, 0.3).fillCircle(124, 102, 8).fillCircle(102, 114, 5);
}

export const pongGame: GameModule = {
  id: PONG.id,
  titleKey: 'pongTitle',
  title: { en: 'Pong', nl: 'Pong' },
  drawIcon,
  color: PLAYER[0].main,
  sceneKey: PONG.sceneKey,
  scenes: [PongScene],
};

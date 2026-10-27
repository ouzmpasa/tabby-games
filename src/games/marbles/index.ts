import { COLORS, PLAYER } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { MARBLES } from './config';
import { MarblesScene } from './MarblesScene';

const ORANGE = PLAYER[0];
const BLUE = PLAYER[1];

/** Home tile icon: a round arena with an orange and a blue marble about to collide. */
function drawIcon(g: Phaser.GameObjects.Graphics): void {
  const cx = 134;
  const cy = 98;
  g.fillStyle(COLORS.inset, 1).fillCircle(cx, cy, 62);
  g.lineStyle(3, COLORS.border, 1).strokeCircle(cx, cy, 62);
  g.lineStyle(2, COLORS.line, 1).lineBetween(cx, cy - 61, cx, cy + 61).strokeCircle(cx, cy, 20);
  for (const [x, y, p] of [[cx - 34, cy + 22, ORANGE], [cx + 8, cy - 4, BLUE], [cx + 34, cy + 28, BLUE]] as const) {
    g.fillStyle(0x080e1a, 0.3).fillCircle(x, y + 3, 17);
    g.fillStyle(p.main, 1).fillCircle(x, y, 17).lineStyle(2.5, p.dark, 1).strokeCircle(x, y, 17);
    g.fillStyle(p.light, 0.85).fillCircle(x - 5, y - 5, 6);
    g.fillStyle(0xffffff, 0.95).fillCircle(x - 7, y - 7, 2.5);
  }
  // dotted shot line from the orange marble
  g.fillStyle(ORANGE.main, 0.9);
  for (let i = 1; i <= 3; i++) g.fillCircle(cx - 34 + i * 10, cy + 22 - i * 5.6, 3);
  // a marble flying off the rim
  g.fillStyle(ORANGE.main, 1).fillCircle(cx + 56, cy - 48, 11).lineStyle(2, ORANGE.dark, 1).strokeCircle(cx + 56, cy - 48, 11);
}

export const marblesGame: GameModule = {
  id: MARBLES.id,
  titleKey: 'marblesTitle',
  title: { en: 'Marble Flick', nl: 'Knikkers' },
  drawIcon,
  color: PLAYER[0].main,
  sceneKey: MARBLES.sceneKey,
  scenes: [MarblesScene],
};

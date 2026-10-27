import { COLORS, PLAYER } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { CURLING } from './config';
import { CurlingScene } from './CurlingScene';

const ORANGE = PLAYER[0];
const BLUE = PLAYER[1];

function stone(g: Phaser.GameObjects.Graphics, x: number, y: number, p: typeof ORANGE, r = 15): void {
  g.fillStyle(0x080e1a, 0.3).fillCircle(x + 1, y + 3, r);
  g.fillStyle(0x59687f, 1).fillCircle(x, y, r);
  g.fillStyle(p.main, 1).fillCircle(x, y, r - 3);
  g.fillStyle(p.dark, 1).fillCircle(x, y, r * 0.38);
  g.fillStyle(p.light, 1).fillCircle(x, y, r * 0.2);
}

/** Home tile icon: the house (blue, white, orange rings and a button) with two stones in it and a dotted throw line. */
function drawIcon(g: Phaser.GameObjects.Graphics): void {
  const cx = 150;
  const cy = 96;
  g.fillStyle(0xe6f1fb, 1).fillRoundedRect(30, 46, 208, 100, 22);
  g.lineStyle(3, COLORS.border, 1).strokeRoundedRect(30, 46, 208, 100, 22);
  g.fillStyle(BLUE.light, 1).fillCircle(cx, cy, 46);
  g.fillStyle(0xffffff, 1).fillCircle(cx, cy, 33);
  g.fillStyle(ORANGE.light, 1).fillCircle(cx, cy, 21);
  g.fillStyle(0xffffff, 1).fillCircle(cx, cy, 9);
  g.fillStyle(0xd0e0f0, 1);
  for (let i = 1; i <= 3; i++) g.fillCircle(60 + i * 17, cy, 3.5);
  stone(g, 48, cy, ORANGE);
  stone(g, cx + 6, cy - 8, BLUE);
  stone(g, cx - 14, cy + 14, ORANGE);
}

export const curlingGame: GameModule = {
  id: CURLING.id,
  titleKey: 'curlingTitle',
  title: { en: 'Curling', nl: 'Curling' },
  drawIcon,
  color: BLUE.main,
  sceneKey: CURLING.sceneKey,
  scenes: [CurlingScene],
};

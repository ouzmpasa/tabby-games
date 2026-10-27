import Phaser from 'phaser';
import { COLORS, PLAYER } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { SNOWBALL } from './config';
import { SnowballScene } from './SnowballScene';

/** Home tile icon: two bobble-hat kids either side of a snow mound, a dotted snowball arc between them. */
function drawIcon(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0xdbe9f7, 1).fillRoundedRect(28, 44, 212, 104, 16);
  g.fillStyle(0xf8fbff, 1).fillCircle(134, 128, 22);
  for (const p of [0, 1] as const) {
    const cx = p === 0 ? 62 : 206;
    g.fillStyle(PLAYER[p].dark, 1).fillEllipse(cx, 108, 40, 30);
    g.fillStyle(0xffd9b8, 1).fillCircle(cx, 92, 17);
    g.fillStyle(PLAYER[p].main, 1).fillCircle(cx, 86, 17).fillRect(cx - 17, 86, 34, 4);
    g.fillStyle(0xffd9b8, 1).fillRect(cx - 14, 90, 28, 10);
    g.fillStyle(COLORS.btnFg, 1).fillCircle(cx - 5, 96, 2.5).fillCircle(cx + 5, 96, 2.5);
    g.fillStyle(0xffffff, 1).fillCircle(cx, 66, 7);
  }
  g.fillStyle(PLAYER[0].dark, 1);
  for (let i = 1; i <= 5; i++) {
    const t = i / 6;
    g.fillCircle(84 + t * 100, 84 - Math.sin(Math.PI * t) * 38, 4);
  }
  g.fillStyle(0xffffff, 1).fillCircle(140, 50, 9).lineStyle(2, 0xb4c9e0, 1).strokeCircle(140, 50, 9);
}

export const snowballGame: GameModule = {
  id: SNOWBALL.id,
  titleKey: 'snowballTitle',
  title: { en: 'Snowball Fight', nl: 'Sneeuwballengevecht' },
  color: PLAYER[1].main,
  sceneKey: SNOWBALL.sceneKey,
  scenes: [SnowballScene],
  drawIcon,
};

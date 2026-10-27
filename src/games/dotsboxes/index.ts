import type Phaser from 'phaser';
import { COLORS, PLAYER } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { DOTSBOXES } from './config';
import { DotsBoxesScene } from './DotsBoxesScene';

/** Home tile icon: a 3x3 dot grid with a few lines and two coloured boxes. */
function drawIcon(g: Phaser.GameObjects.Graphics): void {
  const x0 = 62;
  const y0 = 46;
  const s = 52;
  const px = (c: number) => x0 + c * s;
  const py = (r: number) => y0 + r * s;
  g.fillStyle(PLAYER[0].main, 0.55).fillRect(px(0), py(0), s, s);
  g.fillStyle(PLAYER[1].main, 0.55).fillRect(px(1), py(0), s, s);
  const seg = (c1: number, r1: number, c2: number, r2: number, p: 0 | 1) =>
    g.lineStyle(8, PLAYER[p].main, 1).lineBetween(px(c1), py(r1), px(c2), py(r2));
  seg(0, 0, 1, 0, 0);
  seg(0, 0, 0, 1, 0);
  seg(0, 1, 1, 1, 0);
  seg(1, 0, 1, 1, 1);
  seg(1, 0, 2, 0, 1);
  seg(2, 0, 2, 1, 1);
  seg(1, 1, 2, 1, 1);
  seg(0, 1, 0, 2, 0);
  g.lineStyle(4, COLORS.line, 1).lineBetween(px(1), py(1), px(1), py(2)).lineBetween(px(0), py(2), px(1), py(2));
  g.fillStyle(COLORS.text, 1);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g.fillCircle(px(c), py(r), 8);
}

export const dotsBoxesGame: GameModule = {
  id: DOTSBOXES.id,
  titleKey: 'dotsboxesTitle',
  title: { en: 'Dots & Boxes', nl: 'Stippen & Vakjes' },
  color: PLAYER[0].main,
  sceneKey: DOTSBOXES.sceneKey,
  scenes: [DotsBoxesScene],
  drawIcon,
};

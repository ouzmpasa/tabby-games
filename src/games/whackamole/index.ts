import type Phaser from 'phaser';
import { COLORS, PLAYER } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { WHACKAMOLE } from './config';
import { WhackAMoleScene } from './WhackAMoleScene';

/** Home tile icon: two mounds with a mole peeking out of the left one and a golden one on the right. */
function drawIcon(g: Phaser.GameObjects.Graphics): void {
  const mole = (cx: number, base: number, body: number, belly: number): void => {
    g.fillStyle(body, 1).fillEllipse(cx, base - 22, 54, 52);
    g.fillStyle(belly, 1).fillEllipse(cx, base - 12, 32, 26);
    g.fillStyle(0xffffff, 1).fillCircle(cx - 11, base - 32, 6).fillCircle(cx + 11, base - 32, 6);
    g.fillStyle(0x1e2a3d, 1).fillCircle(cx - 11, base - 31, 3).fillCircle(cx + 11, base - 31, 3);
    g.fillStyle(0xff8fa3, 1).fillEllipse(cx, base - 22, 14, 10);
  };
  const hole = (cx: number, cy: number): void => {
    g.fillStyle(0x080e1a, 0.45).fillEllipse(cx, cy + 4, 92, 36);
    g.fillStyle(COLORS.inset, 1).fillEllipse(cx, cy, 92, 36);
  };
  hole(84, 120);
  mole(84, 120, 0x8b5a3c, 0xc9a07a);
  g.fillStyle(0x6b4a33, 1).fillEllipse(84, 130, 100, 26); // front lip
  g.fillStyle(0x8b6a4a, 1).fillEllipse(84, 128, 92, 20);
  hole(188, 128);
  mole(188, 128, 0xffc928, 0xffe58a);
  g.fillStyle(0x6b4a33, 1).fillEllipse(188, 138, 100, 26);
  g.fillStyle(0x8b6a4a, 1).fillEllipse(188, 136, 92, 20);
  g.fillStyle(PLAYER[0].main, 1).fillCircle(48, 62, 7);
  g.fillStyle(PLAYER[1].main, 1).fillCircle(224, 62, 7);
}

export const whackAMoleGame: GameModule = {
  id: WHACKAMOLE.id,
  titleKey: 'whackamoleTitle',
  title: { en: 'Whack-a-Mole', nl: 'Mollenjacht' },
  drawIcon,
  color: PLAYER[0].main,
  sceneKey: WHACKAMOLE.sceneKey,
  scenes: [WhackAMoleScene],
};

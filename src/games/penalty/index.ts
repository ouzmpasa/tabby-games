import Phaser from 'phaser';
import { COLORS, PLAYER } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { PENALTY } from './config';
import { PenaltyScene } from './PenaltyScene';

/** Home tile icon: a top-down goal on the right with a keeper, ball and a dotted kick line. */
function drawIcon(g: Phaser.GameObjects.Graphics): void {
  const O = PLAYER[0];
  const B = PLAYER[1];
  // pitch
  g.fillStyle(COLORS.inset, 1).fillRoundedRect(28, 44, 212, 104, 14);
  g.lineStyle(2, COLORS.line, 1).strokeRoundedRect(28, 44, 212, 104, 14);
  // goal (right) with net
  g.fillStyle(COLORS.dots, 1).fillRect(210, 70, 26, 52);
  g.lineStyle(2, COLORS.text2, 1).strokeRect(210, 70, 26, 52);
  g.lineStyle(1, COLORS.line, 1).lineBetween(223, 70, 223, 122).lineBetween(210, 96, 236, 96);
  // keeper
  g.fillStyle(B.main, 1).fillRoundedRect(194, 78, 12, 36, 6);
  g.fillStyle(B.light, 1).fillCircle(200, 96, 6);
  // dotted kick line
  g.fillStyle(O.light, 1);
  for (let i = 0; i < 6; i++) g.fillCircle(84 + i * 18, 108 - i * 3, 3);
  // ball
  g.fillStyle(O.main, 1).fillCircle(64, 110, 15);
  g.fillStyle(O.dark, 1).fillCircle(68, 114, 8);
  g.fillStyle(O.light, 1).fillCircle(59, 105, 6);
}

export const penaltyGame: GameModule = {
  id: PENALTY.id,
  titleKey: 'penaltyTitle',
  title: { en: 'Penalty Shootout', nl: 'Penalty’s' },
  color: PLAYER[0].main,
  sceneKey: PENALTY.sceneKey,
  scenes: [PenaltyScene],
  drawIcon,
};

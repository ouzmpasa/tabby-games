import Phaser from 'phaser';
import { COLORS, PLAYER } from '../../core/theme';
import type { GameModule, PlayerId } from '../../core/types';
import { YARNCATCH } from './config';
import { drawYarnBall } from './pieces';
import { YarnCatchScene } from './YarnCatchScene';

/** A small cat head (pointy ears for 0, round for 1) at (cx, cy). */
function catHead(g: Phaser.GameObjects.Graphics, p: PlayerId, cx: number, cy: number): void {
  const pal = PLAYER[p];
  for (const s of [-1, 1]) {
    if (p === 0) {
      g.fillStyle(pal.main, 1).fillTriangle(cx + s * 34, cy - 10, cx + s * 10, cy - 30, cx + s * 26, cy - 52);
      g.fillStyle(0xff8fa3, 1).fillTriangle(cx + s * 27, cy - 16, cx + s * 15, cy - 28, cx + s * 24, cy - 42);
    } else {
      g.fillStyle(pal.main, 1).fillCircle(cx + s * 24, cy - 28, 14);
      g.fillStyle(0xff8fa3, 1).fillCircle(cx + s * 24, cy - 28, 8);
    }
  }
  g.fillStyle(pal.main, 1).fillCircle(cx, cy, 36);
  g.fillStyle(p === 0 ? 0xffe2c2 : 0xf5f7fa, 1).fillEllipse(cx, cy + 14, 36, 24);
  g.fillStyle(0xffffff, 1).fillCircle(cx - 13, cy - 6, 8).fillCircle(cx + 13, cy - 6, 8);
  g.fillStyle(0x1e2a3d, 1).fillCircle(cx - 13, cy - 5, 4.5).fillCircle(cx + 13, cy - 5, 4.5);
  g.fillStyle(0xff8fa3, 1).fillTriangle(cx - 5, cy + 6, cx + 5, cy + 6, cx, cy + 12);
  if (p === 0) {
    g.lineStyle(4, pal.dark, 0.9).lineBetween(cx, cy - 34, cx, cy - 20).lineBetween(cx - 9, cy - 33, cx - 10, cy - 22).lineBetween(cx + 9, cy - 33, cx + 10, cy - 22);
  }
}

/** Home tile icon: an orange and a blue cat reaching for a ball of yarn between them. */
function drawIcon(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x080e1a, 0.3).fillEllipse(134, 146, 170, 16);
  // Loose thread curling out of the ball
  g.lineStyle(6, PLAYER[0].light, 1).beginPath().moveTo(150, 120).lineTo(168, 138).lineTo(148, 146).lineTo(120, 142).strokePath();
  catHead(g, 0, 72, 104);
  catHead(g, 1, 196, 104);
  // Paws reaching in
  g.fillStyle(PLAYER[0].main, 1).fillCircle(112, 128, 13);
  g.fillStyle(PLAYER[1].main, 1).fillCircle(156, 128, 13);
  g.fillStyle(0xff8fa3, 1).fillCircle(113, 130, 6).fillCircle(155, 130, 6);
  g.save();
  g.translateCanvas(134, 92);
  drawYarnBall(g, 0, 30);
  g.restore();
  g.fillStyle(COLORS.text, 1).fillCircle(46, 56, 5).fillCircle(222, 52, 7);
}

export const yarnCatchGame: GameModule = {
  id: YARNCATCH.id,
  titleKey: 'yarncatchTitle',
  title: { en: 'Yarn Catch', nl: 'Garenbal Vangen' },
  drawIcon,
  color: PLAYER[1].main,
  sceneKey: YARNCATCH.sceneKey,
  scenes: [YarnCatchScene],
};

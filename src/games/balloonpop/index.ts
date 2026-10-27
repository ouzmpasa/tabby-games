import type Phaser from 'phaser';
import { COLORS, PLAYER } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { BALLOONPOP } from './config';
import { BalloonPopScene } from './BalloonPopScene';

/** Home tile icon: three balloons on strings (orange, blue, golden star) over a little cloud. */
function drawIcon(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0xffffff, 0.14).fillEllipse(134, 140, 190, 36).fillEllipse(100, 130, 80, 40).fillEllipse(170, 126, 90, 48);
  const balloon = (cx: number, cy: number, r: number, col: number, dark: number): void => {
    g.lineStyle(3, COLORS.text2, 0.8).lineBetween(cx, cy + r * 1.15 + 8, cx + 4, 148);
    g.fillStyle(dark, 1).fillEllipse(cx, cy, r * 2, r * 2.3);
    g.fillStyle(col, 1).fillEllipse(cx - 2, cy - 2, r * 1.8, r * 2.1);
    g.fillStyle(dark, 1).fillTriangle(cx, cy + r * 1.15 - 2, cx - 6, cy + r * 1.15 + 9, cx + 6, cy + r * 1.15 + 9);
    g.fillStyle(0xffffff, 0.4).fillEllipse(cx - r * 0.45, cy - r * 0.55, r * 0.3, r * 0.45);
  };
  balloon(70, 88, 28, PLAYER[0].main, PLAYER[0].dark);
  balloon(198, 88, 28, PLAYER[1].main, PLAYER[1].dark);
  balloon(134, 74, 34, 0xffc928, 0xd9a010);
  g.fillStyle(0xffffff, 1);
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? 16 : 7;
    pts.push({ x: 134 + Math.cos(a) * rr, y: 74 + Math.sin(a) * rr } as Phaser.Math.Vector2);
  }
  g.fillPoints(pts, true);
}

export const balloonPopGame: GameModule = {
  id: BALLOONPOP.id,
  titleKey: 'balloonpopTitle',
  title: { en: 'Balloon Pop Race', nl: 'Ballonnenrace' },
  drawIcon,
  color: 0xff4d6a,
  sceneKey: BALLOONPOP.sceneKey,
  scenes: [BalloonPopScene],
};

import type Phaser from 'phaser';
import type { PlayerId } from '../../core/types';
import { PLAYER } from '../../core/theme';

/** Orange circle (player 0), drawn centred on (x,y) of the graphics' local space. */
export function drawNought(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, w: number, color: number): void {
  g.lineStyle(w, color, 1).strokeCircle(x, y, r);
}

/** Blue cross (player 1). */
export function drawCross(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, w: number, color: number): void {
  g.lineStyle(w, color, 1);
  g.lineBetween(x - r, y - r, x + r, y + r);
  g.lineBetween(x + r, y - r, x - r, y + r);
  // round caps
  g.fillStyle(color, 1);
  for (const [dx, dy] of [[-1, -1], [1, 1], [1, -1], [-1, 1]] as const) g.fillCircle(x + dx * r, y + dy * r, w / 2);
}

export const drawMark = (g: Phaser.GameObjects.Graphics, p: PlayerId, x: number, y: number, r: number, w: number): void =>
  p === 0 ? drawNought(g, x, y, r, w, PLAYER[0].main) : drawCross(g, x, y, r, w, PLAYER[1].main);

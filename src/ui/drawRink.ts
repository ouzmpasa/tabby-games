import Phaser from 'phaser';
import { H, W } from '../core/layout';
import { CARD, COLORS, PLAYER } from '../core/theme';

/** "Dusk" ground with a recessed rink, centre line and end zones tinted per player. */
export function drawRink(scene: Phaser.Scene): void {
  scene.add.rectangle(W / 2, H / 2, W, H, COLORS.bg);
  const g = scene.add.graphics();
  const m = 40;
  const r = CARD.radius + 10;
  g.fillStyle(0x080e1a, 0.3).fillRoundedRect(m, m + 14, W - 2 * m, H - 2 * m, r);
  g.fillStyle(COLORS.inset, 1).fillRoundedRect(m, m, W - 2 * m, H - 2 * m, r);
  g.fillStyle(PLAYER[0].main, 0.16).fillRoundedRect(m, m, 220, H - 2 * m, { tl: r, bl: r, tr: 0, br: 0 });
  g.fillStyle(PLAYER[1].main, 0.16).fillRoundedRect(W - m - 220, m, 220, H - 2 * m, { tl: 0, bl: 0, tr: r, br: r });
  g.lineStyle(6, COLORS.line, 1).lineBetween(W / 2, m, W / 2, H - m).strokeCircle(W / 2, H / 2, 140);
  g.fillStyle(COLORS.dots, 1).fillCircle(W / 2, H / 2, 14);
}

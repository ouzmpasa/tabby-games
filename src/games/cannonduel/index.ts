import Phaser from 'phaser';
import { COLORS, PLAYER } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { CannonDuelScene } from './CannonDuelScene';
import { CANNONDUEL } from './config';

/** Home tile icon: two little cannons either side of a hill, one dotted shot arcing over it. */
function drawIcon(g: Phaser.GameObjects.Graphics): void {
  const gy = 138;
  g.fillStyle(COLORS.inset, 1).fillRoundedRect(28, 48, 212, 102, 14);
  // hill
  g.fillStyle(COLORS.line, 1).fillPoints(
    Array.from({ length: 21 }, (_, i) => {
      const x = 98 + i * 7;
      return new Phaser.Geom.Point(x, gy - 46 * (0.5 + 0.5 * Math.cos(((i - 10) / 10) * Math.PI)));
    }).concat([new Phaser.Geom.Point(238, gy), new Phaser.Geom.Point(98, gy)]),
    true,
  );
  g.fillStyle(COLORS.dots, 1).fillRect(28, gy, 212, 12);
  // cannons
  for (const p of [0, 1] as const) {
    const s = p === 0 ? 1 : -1;
    const cx = p === 0 ? 58 : 210;
    g.fillStyle(PLAYER[p].dark, 1).fillRoundedRect(cx - 20, gy - 16, 40, 16, 6);
    g.fillStyle(PLAYER[p].main, 1).fillCircle(cx, gy - 18, 12);
    g.lineStyle(9, PLAYER[p].main, 1).lineBetween(cx, gy - 18, cx + s * 24, gy - 36);
  }
  // dotted arc from the left cannon over the hill
  g.fillStyle(PLAYER[0].onDark, 1);
  for (let i = 1; i <= 6; i++) {
    const t = i / 7;
    g.fillCircle(84 + t * 112, gy - 38 - 4 * Math.sin(Math.PI * t) * 11 + 0 * t, 3.5);
  }
}

export const cannonDuelGame: GameModule = {
  id: CANNONDUEL.id,
  titleKey: 'cannonduelTitle',
  title: { en: 'Cannon Duel', nl: 'Kanonduel' },
  color: PLAYER[0].main,
  sceneKey: CANNONDUEL.sceneKey,
  scenes: [CannonDuelScene],
  drawIcon,
};

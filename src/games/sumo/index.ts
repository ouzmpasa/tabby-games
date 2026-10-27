import Phaser from 'phaser';
import { COLORS, PLAYER } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { SUMO } from './config';
import { SumoScene } from './SumoScene';

/** Home tile icon: a round platform with two blobs about to bump. */
function drawIcon(g: Phaser.GameObjects.Graphics): void {
  const cx = 134;
  const cy = 98;
  g.fillStyle(0x080e1a, 0.35).fillCircle(cx, cy + 6, 62);
  g.fillStyle(COLORS.tile, 1).fillCircle(cx, cy, 62);
  g.fillStyle(COLORS.inset, 1).fillCircle(cx, cy, 52);
  g.lineStyle(3, COLORS.line, 1).strokeCircle(cx, cy, 52);
  for (const [x, p] of [[cx - 26, PLAYER[0]], [cx + 26, PLAYER[1]]] as const) {
    g.fillStyle(p.dark, 1).fillCircle(x, cy + 3, 28);
    g.fillStyle(p.main, 1).fillCircle(x, cy, 28);
    g.fillStyle(0xffffff, 1).fillCircle(x - 9, cy - 5, 6).fillCircle(x + 9, cy - 5, 6);
    g.fillStyle(0x1e2a3d, 1).fillCircle(x - 8, cy - 4, 3).fillCircle(x + 8, cy - 4, 3);
    g.lineStyle(3, 0x1e2a3d, 1).beginPath().arc(x, cy + 3, 8, 0.2, Math.PI - 0.2, false).strokePath();
  }
}

export const sumoGame: GameModule = {
  id: SUMO.id,
  titleKey: 'sumoTitle',
  title: { en: 'Sumo Bumpers', nl: 'Sumo Botsen' },
  drawIcon,
  color: PLAYER[0].main,
  sceneKey: SUMO.sceneKey,
  scenes: [SumoScene],
};

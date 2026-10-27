import Phaser from 'phaser';
import { t } from '../core/i18n';
import { endAnchor } from '../core/layout';
import { COLORS, PLAYER } from '../core/theme';
import { PLAYERS, type PlayerId } from '../core/types';
import { RotatedLabel } from './RotatedLabel';

/** "You win!" for the winner, "Good game!" for the other, each facing their player. */
export function showWinBanner(scene: Phaser.Scene, winner: PlayerId): void {
  for (const p of PLAYERS) {
    const a = endAnchor(p, 330);
    const won = p === winner;
    const label = new RotatedLabel(scene, a.x, a.y, won ? t('youWin') : t('goodGame'), p, {
      size: won ? 150 : 90,
      color: won ? PLAYER[p].onDark : COLORS.muted,
      display: true,
    }).setDepth(150);
    if (won) scene.tweens.add({ targets: label, scale: 1.12, yoyo: true, repeat: -1, duration: 500 });
  }
}

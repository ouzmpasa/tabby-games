import Phaser from 'phaser';
import { endAnchor, facingRotation } from '../core/layout';
import { CARD, COLORS, PLAYER } from '../core/theme';
import type { PlayerId } from '../core/types';
import { RotatedLabel } from './RotatedLabel';

const SIZE = 120;

/** Score panel: rounded surface card with a coloured edge (thicker when active), facing its player. */
export class ScoreBadge extends Phaser.GameObjects.Container {
  private label: RotatedLabel;
  private card: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, readonly player: PlayerId, inset = 90, along = 0) {
    const a = endAnchor(player, inset, along);
    super(scene, a.x, a.y);
    this.card = scene.add.graphics();
    this.label = new RotatedLabel(scene, 0, 0, '0', null, { size: 96, color: PLAYER[player].onDark, display: true });
    this.add([this.card, this.label]);
    this.setRotation(facingRotation(player));
    this.setActiveEdge(false);
    scene.add.existing(this);
  }

  /** Highlight the coloured edge for the player whose turn / serve it is. */
  setActiveEdge(active: boolean): void {
    const g = this.card.clear();
    const r = CARD.radius;
    g.fillStyle(0x080e1a, 0.3).fillRoundedRect(-SIZE / 2, -SIZE / 2 + 10, SIZE, SIZE, r);
    g.fillStyle(COLORS.surface, 1).fillRoundedRect(-SIZE / 2, -SIZE / 2, SIZE, SIZE, r);
    g.lineStyle(active ? 10 : 4, PLAYER[this.player].main, 1).strokeRoundedRect(-SIZE / 2, -SIZE / 2, SIZE, SIZE, r);
  }

  setScore(n: number): void {
    this.label.setText(String(n));
    this.scene.tweens.add({ targets: this, scale: { from: 1.3, to: 1 }, duration: 250, ease: 'Back.Out' });
  }
}

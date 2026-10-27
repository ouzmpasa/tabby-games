import { BaseGameScene } from '../../core/BaseGameScene';
import { t } from '../../core/i18n';
import { endAnchor } from '../../core/layout';
import { COLORS, PLAYER_COLOR } from '../../core/theme';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { DUMMY } from './config';

/** Test game: tap your half to score a point. First to 5 wins. */
export class DummyScene extends BaseGameScene {
  constructor() {
    super(DUMMY.sceneKey, DUMMY.id, DUMMY.target);
  }

  protected onCreate(): void {
    for (const p of [0, 1] as const) {
      const a = endAnchor(p, 700);
      new RotatedLabel(this, a.x, a.y, t('dummyHint'), p, { size: 64, color: COLORS.text2 });
    }
    this.players.on('down', ({ player, x, y }: { player: 0 | 1; x: number; y: number }) => {
      if (!this.running) return;
      const dot = this.add.circle(x, y, 40, PLAYER_COLOR[player]);
      this.tweens.add({ targets: dot, scale: 2.5, alpha: 0, duration: 400, onComplete: () => dot.destroy() });
      this.score(player);
    });
  }
}

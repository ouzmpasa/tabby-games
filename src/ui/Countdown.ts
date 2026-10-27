import Phaser from 'phaser';
import { Sfx } from '../core/audio/Sfx';
import { endAnchor } from '../core/layout';
import { t } from '../core/i18n';
import { COLORS, PLAYER } from '../core/theme';
import { PLAYERS } from '../core/types';
import { RotatedLabel } from './RotatedLabel';

/** 3-2-1-GO shown to both players, each facing them. Calls onDone after GO. */
export function runCountdown(scene: Phaser.Scene, onDone: () => void, from = 3): void {
  const labels = PLAYERS.map((p) => {
    const a = endAnchor(p, 380);
    return new RotatedLabel(scene, a.x, a.y, '', p, { size: 260, color: PLAYER[p].onDark, stroke: COLORS.inset, display: true }).setDepth(100);
  });
  const show = (text: string) => {
    labels.forEach((l) => l.setText(text).setAlpha(1).setScale(1.5));
    scene.tweens.add({ targets: labels, scale: 1, duration: 300, ease: 'Back.Out' });
  };
  let n = from;
  const step = () => {
    if (n > 0) {
      show(String(n));
      Sfx.tick();
      n--;
      scene.time.delayedCall(800, step);
    } else {
      show(t('go'));
      Sfx.go();
      scene.time.delayedCall(600, () => {
        labels.forEach((l) => l.destroy());
        onDone();
      });
    }
  };
  step();
}

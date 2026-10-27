import Phaser from 'phaser';
import { t } from '../core/i18n';
import { endAnchor } from '../core/layout';
import { PLAYERS } from '../core/types';
import { Button } from '../ui/Button';
import { Overlay } from '../ui/Overlay';
import { RotatedLabel } from '../ui/RotatedLabel';
import { COLORS, PLAYER } from '../core/theme';

interface PauseData {
  gameId: string;
  sceneKey: string;
}

/** Overlay on top of a paused game; each player gets Resume and Home facing them. */
export class PauseScene extends Phaser.Scene {
  constructor() {
    super('Pause');
  }
  create(data: PauseData): void {
    new Overlay(this);
    for (const p of PLAYERS) {
      const a = endAnchor(p, 290);
      new RotatedLabel(this, a.x, a.y, t('pause'), p, { size: 110, color: PLAYER[p].onDark, display: true });
      const r = endAnchor(p, 400, -160);
      new Button(this, r.x, r.y, t('resume'), () => this.resume(data), { player: p });
      const h = endAnchor(p, 400, 160);
      new Button(this, h.x, h.y, t('home'), () => this.home(data), { player: p, fill: COLORS.tile, textColor: COLORS.text });
    }
  }
  private resume(data: PauseData): void {
    this.scene.resume(data.sceneKey);
    this.scene.stop();
  }
  private home(data: PauseData): void {
    this.scene.stop(data.sceneKey);
    this.scene.start('Home');
  }
}

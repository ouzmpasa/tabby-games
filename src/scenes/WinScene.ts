import Phaser from 'phaser';
import { t } from '../core/i18n';
import { endAnchor } from '../core/layout';
import { COLORS } from '../core/theme';
import { PLAYERS, type PlayerId } from '../core/types';
import { Button } from '../ui/Button';
import { confetti } from '../ui/Confetti';
import { Overlay } from '../ui/Overlay';
import { showWinBanner } from '../ui/WinBanner';

interface WinData {
  gameId: string;
  sceneKey: string;
  winner: PlayerId;
  scores: [number, number];
}

export class WinScene extends Phaser.Scene {
  constructor() {
    super('Win');
  }
  create(data: WinData): void {
    new Overlay(this, 0.85);
    showWinBanner(this, data.winner);
    confetti(this);
    for (const p of PLAYERS) {
      const a = endAnchor(p, 560, -160);
      new Button(this, a.x, a.y, t('playAgain'), () => this.scene.start(data.sceneKey, { gameId: data.gameId }), { player: p });
      const h = endAnchor(p, 560, 160);
      new Button(this, h.x, h.y, t('home'), () => this.scene.start('Home'), { player: p, fill: COLORS.tile, textColor: COLORS.text });
    }
  }
}

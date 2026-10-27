import Phaser from 'phaser';
import { getGame } from '../core/registry';
import { H, W } from '../core/layout';
import { COLORS } from '../core/theme';
import { RotatedLabel } from '../ui/RotatedLabel';

/** Waits for the bundled Barlow fonts (no network), then goes to the Splash (or Home with ?nosplash, or straight into a game with ?game=<id>). */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }
  create(): void {
    new RotatedLabel(this, W / 2, H / 2, 'Tabby Games', null, { size: 110, color: COLORS.text, display: true });
    const go = () => {
      const params = new URLSearchParams(location.search);
      const id = params.get('game');
      const game = id ? getGame(id) : undefined;
      if (game) this.scene.start(game.sceneKey, { gameId: game.id });
      else this.scene.start(params.has('nosplash') ? 'Home' : 'Splash');
    };
    Promise.race([Promise.all([document.fonts.load("500 24px 'Barlow'"), document.fonts.load("700 24px 'Barlow'"), document.fonts.load("700 48px 'Barlow Condensed'")]), new Promise((r) => setTimeout(r, 2000))]).then(go, go);
  }
}

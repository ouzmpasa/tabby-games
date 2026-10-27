import Phaser from 'phaser';
import { COLORS } from '../core/theme';

/** Boot -> Preload. Sets a background and (dev) jumps straight into a game via ?game=<id>. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }
  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.scene.start('Preload');
  }
}

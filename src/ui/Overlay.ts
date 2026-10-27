import Phaser from 'phaser';
import { H, W } from '../core/layout';
import { COLORS } from '../core/theme';

/** Full-screen dimmer that also swallows taps. */
export class Overlay extends Phaser.GameObjects.Rectangle {
  constructor(scene: Phaser.Scene, alpha = 0.7) {
    super(scene, W / 2, H / 2, W, H, COLORS.inset, alpha);
    this.setInteractive();
    scene.add.existing(this);
  }
}

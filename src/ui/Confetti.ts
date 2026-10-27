import Phaser from 'phaser';
import { H, W } from '../core/layout';
import { COLORS, PLAYER } from '../core/theme';

const PALETTE = [PLAYER[0].main, PLAYER[1].main, PLAYER[0].light, PLAYER[1].light, COLORS.text];

/** Falling confetti rectangles (no textures needed). */
export function confetti(scene: Phaser.Scene, count = 70): void {
  for (let i = 0; i < count; i++) {
    const c = scene.add
      .rectangle(Phaser.Math.Between(0, W), -40, Phaser.Math.Between(14, 26), Phaser.Math.Between(8, 14), Phaser.Utils.Array.GetRandom(PALETTE))
      .setDepth(200)
      .setRotation(Math.random() * Math.PI);
    scene.tweens.add({
      targets: c,
      y: H + 60,
      x: c.x + Phaser.Math.Between(-150, 150),
      rotation: c.rotation + Phaser.Math.Between(-6, 6),
      duration: Phaser.Math.Between(1800, 3600),
      delay: Phaser.Math.Between(0, 1200),
      onComplete: () => c.destroy(),
    });
  }
}

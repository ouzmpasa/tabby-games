import Phaser from 'phaser';
import { HOLD_MS, holdProgress } from '../core/hold';
import { COLORS } from '../core/theme';
import { Button, type ButtonOptions } from './Button';

/** Button that only fires after being held for 2 s (guards parent/dev areas from kids). */
export class HoldButton extends Button {
  private ring: Phaser.GameObjects.Graphics;
  private startedAt: number | null = null;
  private fired = false;

  constructor(scene: Phaser.Scene, x: number, y: number, label: string, onComplete: () => void, opts: ButtonOptions = {}, private holdMs = HOLD_MS) {
    super(scene, x, y, label, () => {}, { fill: COLORS.tile, textColor: COLORS.text, ...opts });
    this.ring = scene.add.graphics();
    this.add(this.ring);
    this.on('pointerdown', () => {
      this.startedAt = scene.time.now;
      this.fired = false;
    });
    const cancel = () => {
      this.startedAt = null;
      this.ring.clear();
    };
    this.on('pointerup', cancel);
    this.on('pointerout', cancel);
    this.onComplete = onComplete;
    scene.events.on('update', this.tick, this);
    this.once('destroy', () => scene.events.off('update', this.tick, this));
  }

  private onComplete: () => void;

  private tick(): void {
    if (this.startedAt === null || this.fired) return;
    const p = holdProgress(this.scene.time.now - this.startedAt, this.holdMs);
    const { bw: w, bh: h } = this;
    this.ring.clear().fillStyle(COLORS.border, 1).fillRoundedRect(-w / 2, -h / 2, w * p, h, h / 2.4).setAlpha(0.8);
    if (p >= 1) {
      this.fired = true;
      this.startedAt = null;
      this.ring.clear();
      this.onComplete();
    }
  }
}

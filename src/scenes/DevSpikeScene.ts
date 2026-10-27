import Phaser from 'phaser';
import { Sfx } from '../core/audio/Sfx';
import { H, W } from '../core/layout';
import { COLORS, PLAYER } from '../core/theme';
import { Button } from '../ui/Button';
import { RotatedLabel } from '../ui/RotatedLabel';

const TRAIL = [PLAYER[0].main, PLAYER[1].main, PLAYER[0].light, PLAYER[1].light, COLORS.text];

/**
 * Device spike: shows a circle per live finger, max simultaneous touches, FPS (current/min/avg),
 * input event delay and reported audio latency. Run on the real tablet, see docs/TESTING.md.
 */
export class DevSpikeScene extends Phaser.Scene {
  private text!: Phaser.GameObjects.Text;
  private circles = new Map<number, Phaser.GameObjects.Arc>();
  private maxTouches = 0;
  private fpsSum = 0;
  private fpsN = 0;
  private fpsMin = Infinity;
  private maxDelay = 0;
  private startedAt = 0;

  constructor() {
    super('DevSpike');
  }

  create(): void {
    this.circles.clear();
    this.maxTouches = this.fpsSum = this.fpsN = this.maxDelay = 0;
    this.fpsMin = Infinity;
    this.startedAt = this.time.now;
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg);
    this.text = new RotatedLabel(this, W / 2, 200, '', null, { size: 40 }).setAlign('center');
    new Button(this, W / 2, H - 150, 'Beep', () => Sfx.tone(880, 0.15, 'square'), { w: 260, h: 100, size: 48 });
    new Button(this, 190, H - 90, 'Home', () => this.scene.start('Home'), { w: 260, h: 90, size: 40, fill: COLORS.tile, textColor: COLORS.text });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      Sfx.unlock();
      const c = this.add.circle(p.x, p.y, 70, TRAIL[p.id % TRAIL.length], 0.8).setStrokeStyle(6, COLORS.text);
      this.circles.set(p.id, c);
      this.maxDelay = Math.max(this.maxDelay, Math.round(performance.now() - (p.event as Event).timeStamp));
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.circles.get(p.id)?.setPosition(p.x, p.y));
    const up = (p: Phaser.Input.Pointer) => {
      this.circles.get(p.id)?.destroy();
      this.circles.delete(p.id);
    };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
  }

  update(): void {
    const fps = this.game.loop.actualFps;
    if (fps > 0) {
      this.fpsSum += fps;
      this.fpsN++;
      this.fpsMin = Math.min(this.fpsMin, fps);
    }
    this.maxTouches = Math.max(this.maxTouches, this.circles.size);
    const secs = Math.round((this.time.now - this.startedAt) / 1000);
    const lat = Sfx.latencyMs();
    this.text.setText(
      [
        `Touches now: ${this.circles.size}   max: ${this.maxTouches}`,
        `FPS now: ${fps.toFixed(0)}   min: ${this.fpsMin === Infinity ? '-' : this.fpsMin.toFixed(0)}   avg: ${this.fpsN ? (this.fpsSum / this.fpsN).toFixed(0) : '-'}`,
        `Input event delay (max ms): ${this.maxDelay}`,
        `Audio output latency (ms, reported): ${lat ?? 'tap Beep first'}`,
        `Running: ${Math.floor(secs / 60)}m ${secs % 60}s   online: ${navigator.onLine}`,
      ].join('\n'),
    );
  }
}

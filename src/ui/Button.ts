import Phaser from 'phaser';
import { Sfx } from '../core/audio/Sfx';
import { facingRotation } from '../core/layout';
import { CARD, COLORS } from '../core/theme';
import type { PlayerId } from '../core/types';
import { RotatedLabel } from './RotatedLabel';

export interface ButtonOptions {
  w?: number;
  h?: number;
  fill?: number;
  textColor?: number;
  size?: number;
  /** Rotate the whole button toward this player. */
  player?: PlayerId | null;
  /** Fully round (circle for square w/h), e.g. the 64 px pause button. */
  round?: boolean;
}

/** Flat rounded primary button (white with dark text by default). Fires onClick on release inside. */
export class Button extends Phaser.GameObjects.Container {
  protected bg: Phaser.GameObjects.Graphics;
  protected bw: number;
  protected bh: number;
  protected fill: number;
  private radius: number;

  constructor(scene: Phaser.Scene, x: number, y: number, label: string, onClick: () => void, opts: ButtonOptions = {}) {
    super(scene, x, y);
    this.bw = opts.w ?? 320;
    this.bh = opts.h ?? 120;
    this.fill = opts.fill ?? COLORS.btnBg;
    this.radius = opts.round ? Math.min(this.bw, this.bh) / 2 : Math.min(CARD.radius + 6, this.bh / 2);
    this.bg = scene.add.graphics();
    this.add(this.bg);
    this.add(new RotatedLabel(scene, 0, -2, label, null, { size: opts.size ?? 52, color: opts.textColor ?? COLORS.btnFg }));
    if (opts.player !== undefined && opts.player !== null) this.setRotation(facingRotation(opts.player));
    this.draw(false);
    this.setSize(this.bw, this.bh);
    this.setInteractive({ useHandCursor: true });
    this.on('pointerdown', () => {
      Sfx.click();
      this.draw(true);
    });
    this.on('pointerout', () => this.draw(false));
    this.on('pointerup', () => {
      this.draw(false);
      onClick();
    });
    scene.add.existing(this);
  }

  protected draw(pressed: boolean): void {
    const { bw: w, bh: h, radius } = this;
    const g = this.bg.clear();
    g.fillStyle(0x080e1a, 0.3).fillRoundedRect(-w / 2, -h / 2 + (pressed ? 3 : 10), w, h, radius);
    g.fillStyle(this.fill, 1).fillRoundedRect(-w / 2, -h / 2 + (pressed ? 4 : 0), w, h, radius);
  }
}

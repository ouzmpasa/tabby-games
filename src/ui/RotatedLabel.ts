import Phaser from 'phaser';
import { FONT_BODY, FONT_DISPLAY, COLORS, hex } from '../core/theme';
import { facingRotation } from '../core/layout';
import type { PlayerId } from '../core/types';

export interface LabelStyle {
  size?: number;
  color?: number;
  stroke?: number;
  /** Use Barlow Condensed (titles, numbers, scores) instead of Barlow. */
  display?: boolean;
}

/** Text centred on (x, y), rotated to face a player (or upright when player is null). */
export class RotatedLabel extends Phaser.GameObjects.Text {
  constructor(scene: Phaser.Scene, x: number, y: number, text: string, player: PlayerId | null, style: LabelStyle = {}) {
    super(scene, x, y, text, {
      fontFamily: style.display ? FONT_DISPLAY : FONT_BODY,
      fontStyle: '700',
      fontSize: `${style.size ?? 56}px`,
      color: hex(style.color ?? COLORS.text),
      stroke: style.stroke !== undefined ? hex(style.stroke) : undefined,
      strokeThickness: style.stroke !== undefined ? 6 : 0,
    });
    this.setOrigin(0.5);
    if (player !== null) this.setRotation(facingRotation(player));
    scene.add.existing(this);
  }
}

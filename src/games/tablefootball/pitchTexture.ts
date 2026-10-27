import Phaser from 'phaser';
import { COLORS, PLAYER } from '../../core/theme';
import { H, W } from '../../core/layout';
import { PITCH, RODS, TABLEFOOTBALL } from './config';

export const PITCH_TEXTURE = 'tablefootball-pitch';

/** Draws the whole table once into a texture: rails, striped pitch, markings, goals and the rod tracks. */
export function ensurePitchTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(PITCH_TEXTURE)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const { x, y, w, h } = PITCH;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = 60;
  g.fillStyle(COLORS.bg, 1).fillRect(0, 0, W, H);
  g.fillStyle(0x080e1a, 0.35).fillRoundedRect(x - 14, y - 14 + 14, w + 28, h + 28, r + 14);
  g.fillStyle(COLORS.tile, 1).fillRoundedRect(x - 14, y - 14, w + 28, h + 28, r + 14);
  g.fillStyle(COLORS.surface, 1).fillRoundedRect(x, y, w, h, r);
  // mowing stripes (clipped by drawing only the middle band; the rounded ends stay plain)
  const stripes = 10;
  const sw = w / stripes;
  g.fillStyle(0x31425f, 1);
  for (let i = 1; i < stripes - 1; i += 2) g.fillRect(x + i * sw, y + 2, sw, h - 4);
  g.lineStyle(3, COLORS.border, 1).strokeRoundedRect(x, y, w, h, r);
  // rod tracks
  g.lineStyle(6, 0x1b2638, 0.35);
  for (const d of RODS) {
    g.lineBetween(x + d.dx, y + 6, x + d.dx, y + h - 6);
    g.lineBetween(x + w - d.dx, y + 6, x + w - d.dx, y + h - 6);
  }
  // centre line, circle, dot
  g.lineStyle(3, COLORS.line, 1).lineBetween(cx, y + 3, cx, y + h - 3).strokeCircle(cx, cy, 110);
  g.fillStyle(COLORS.line, 1).fillCircle(cx, cy, 7);
  // goal areas and goals
  const gw = TABLEFOOTBALL.goalWidth;
  for (const p of [0, 1] as const) {
    const col = PLAYER[p].main;
    const ex = p === 0 ? x : x + w;
    const boxW = 150;
    const boxH = gw + 160;
    g.lineStyle(3, col, 0.5).strokeRect(p === 0 ? ex : ex - boxW, cy - boxH / 2, boxW, boxH);
    g.fillStyle(col, 0.07).fillRect(p === 0 ? ex : ex - boxW, cy - boxH / 2, boxW, boxH);
    // the goal mouths themselves are drawn live by the scene (they narrow and can move)
  }
  g.generateTexture(PITCH_TEXTURE, W, H);
  g.destroy();
}

import Phaser from 'phaser';
import { COLORS, PLAYER } from '../../core/theme';
import { H, W } from '../../core/layout';
import { AIRHOCKEY, RINK } from './config';

export const RINK_TEXTURE = 'airhockey-rink';
const S = 1.35; // mockup (1280x800) -> design space scale

/** Draws the whole table once into a texture (air holes are too many to redraw every frame). */
export function ensureRinkTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(RINK_TEXTURE)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const { x, y, w, h } = RINK;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const r = 48 * S;
  g.fillStyle(COLORS.bg, 1).fillRect(0, 0, W, H);
  // rail + soft shadow + surface
  g.fillStyle(0x080e1a, 0.35).fillRoundedRect(x - 10 * S, y - 10 * S + 14, w + 20 * S, h + 20 * S, r + 10 * S);
  g.fillStyle(COLORS.tile, 1).fillRoundedRect(x - 10 * S, y - 10 * S, w + 20 * S, h + 20 * S, r + 10 * S);
  g.fillStyle(COLORS.surface, 1).fillRoundedRect(x, y, w, h, r);
  // air holes, clipped to the rounded surface by skipping dots too close to the corners
  g.fillStyle(0x3a4b69, 1);
  const step = 22 * S;
  for (let py = y + step / 2; py < y + h; py += step) {
    for (let px = x + step / 2; px < x + w; px += step) {
      const ex = Math.max(0, Math.max(x + r - px, px - (x + w - r)));
      const ey = Math.max(0, Math.max(y + r - py, py - (y + h - r)));
      if (ex * ex + ey * ey < (r - 6) * (r - 6)) g.fillCircle(px, py, 1.9);
    }
  }
  g.lineStyle(2 * S, COLORS.border, 1).strokeRoundedRect(x, y, w, h, r);
  // goal creases (half circles) and mouths
  const cr = 120 * S;
  for (const p of [0, 1] as const) {
    const col = PLAYER[p].main;
    const ex = p === 0 ? x : x + w;
    const [a0, a1] = p === 0 ? [-Math.PI / 2, Math.PI / 2] : [Math.PI / 2, (3 * Math.PI) / 2];
    g.fillStyle(col, 0.08).beginPath().moveTo(ex, cy - cr).arc(ex, cy, cr, a0, a1, false).closePath().fillPath();
    g.lineStyle(2 * S, col, 0.6).beginPath().arc(ex, cy, cr, a0, a1, false).strokePath();
    for (let i = 3; i >= 1; i--) {
      g.fillStyle(col, 0.08).fillRoundedRect(p === 0 ? ex : ex - 8 * i, cy - AIRHOCKEY.goalWidth / 2 - 2 * i, 8 * i, AIRHOCKEY.goalWidth + 4 * i, 4);
    }
    g.fillStyle(col, 1).fillRoundedRect(p === 0 ? ex : ex - 8, cy - AIRHOCKEY.goalWidth / 2, 8, AIRHOCKEY.goalWidth, 4);
  }
  // centre line, circle and dot
  g.lineStyle(2 * S, COLORS.line, 1).lineBetween(cx, y + 2, cx, y + h - 2).strokeCircle(cx, cy, 80 * S);
  g.fillStyle(COLORS.line, 1).fillCircle(cx, cy, 5 * S);
  g.generateTexture(RINK_TEXTURE, W, H);
  g.destroy();
}

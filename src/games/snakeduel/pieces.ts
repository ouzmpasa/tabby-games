import Phaser from 'phaser';
import { COLORS, PLAYER } from '../../core/theme';
import type { PlayerId } from '../../core/types';
import { SNAKE } from './config';
import type { ArenaRect, Fruit, Rock, Snake } from './logic';

/** Arena floor: the full-size arena shows as a red danger zone, the safe floor sits on top and shrinks. */
export function drawArena(g: Phaser.GameObjects.Graphics, a: ArenaRect, full: ArenaRect, danger: number): void {
  g.clear();
  g.fillStyle(0x080e1a, 0.35).fillRoundedRect(full.x, full.y + 12, full.w, full.h, full.corner);
  g.fillStyle(0x6a2f45, 0.55 + 0.3 * danger).fillRoundedRect(full.x, full.y, full.w, full.h, full.corner);
  g.fillStyle(COLORS.surface, 1).fillRoundedRect(a.x, a.y, a.w, a.h, a.corner);
  // Each half is softly tinted for its player.
  const cx = full.x + full.w / 2;
  g.fillStyle(PLAYER[0].main, 0.07).fillRoundedRect(a.x, a.y, cx - a.x, a.h, { tl: a.corner, bl: a.corner, tr: 0, br: 0 });
  g.fillStyle(PLAYER[1].main, 0.07).fillRoundedRect(cx, a.y, a.x + a.w - cx, a.h, { tl: 0, bl: 0, tr: a.corner, br: a.corner });
  g.lineStyle(4, COLORS.line, 0.6);
  for (let y = a.y + 20; y < a.y + a.h - 20; y += 40) g.lineBetween(cx, y, cx, y + 20);
  g.lineStyle(10, danger > 0 ? 0xe5484d : COLORS.border, 1).strokeRoundedRect(a.x, a.y, a.w, a.h, a.corner);
}

/**
 * Draws a snake: a chain of overlapping discs (outline pass, then body pass) tapering to the tail, with a head
 * that has eyes looking where it is going and a flicking tongue. `alpha` is used for the spawn blink / fade.
 */
export function drawSnake(g: Phaser.GameObjects.Graphics, sn: Snake, p: PlayerId, t: number, alpha: number, sad: boolean): void {
  const c = PLAYER[p];
  const pts = [{ x: sn.x, y: sn.y }, ...sn.body];
  const n = pts.length;
  const rad = (i: number) => SNAKE.bodyRadius * (0.55 + 0.45 * Math.min(1, (n - i) / 8));
  // Speed boost (gold fruit): a golden halo along the body.
  if (sn.boostT > 0) for (let i = n - 1; i >= 0; i -= 2) g.fillStyle(0xffd36b, alpha * (0.18 + 0.1 * Math.sin(t * 20 + i))).fillCircle(pts[i].x, pts[i].y, rad(i) + 11);
  for (let i = n - 1; i >= 0; i--) g.fillStyle(c.dark, alpha).fillCircle(pts[i].x, pts[i].y + 4, rad(i) + 3);
  for (let i = n - 1; i >= 1; i--) {
    g.fillStyle(i % 2 ? c.main : c.light, alpha).fillCircle(pts[i].x, pts[i].y, rad(i));
  }
  const h = sn.heading;
  const dx = Math.cos(h);
  const dy = Math.sin(h);
  // Tongue.
  const flick = 0.5 + 0.5 * Math.sin(t * 14);
  const tl = 22 + 10 * flick;
  const tx = sn.x + dx * (SNAKE.headRadius + 2);
  const ty = sn.y + dy * (SNAKE.headRadius + 2);
  g.lineStyle(6, 0xe5484d, alpha).lineBetween(tx, ty, tx + dx * tl, ty + dy * tl);
  g.lineBetween(tx + dx * tl, ty + dy * tl, tx + dx * (tl + 9) - dy * 8, ty + dy * (tl + 9) + dx * 8);
  g.lineBetween(tx + dx * tl, ty + dy * tl, tx + dx * (tl + 9) + dy * 8, ty + dy * (tl + 9) - dx * 8);
  // Head.
  g.fillStyle(c.dark, alpha).fillCircle(sn.x, sn.y + 4, SNAKE.headRadius + 3);
  g.fillStyle(c.main, alpha).fillCircle(sn.x, sn.y, SNAKE.headRadius);
  g.fillStyle(c.light, alpha * 0.8).fillCircle(sn.x - dx * 8 - 6, sn.y - dy * 8 - 6, 7);
  for (const s of [-1, 1]) {
    const ex = sn.x + dx * 8 - dy * s * 15;
    const ey = sn.y + dy * 8 + dx * s * 15;
    g.fillStyle(0xffffff, alpha).fillCircle(ex, ey, 10);
    g.fillStyle(0x1e2a3d, alpha).fillCircle(ex + dx * 3, ey + dy * 3, sad ? 3 : 5.5);
  }
}

export function drawFruits(g: Phaser.GameObjects.Graphics, fruits: Fruit[], t: number): void {
  g.clear();
  fruits.forEach((f, i) => {
    const bob = Math.sin(t * 4 + i * 2) * 4;
    const k = 1 + 0.06 * Math.sin(t * 6 + i);
    const kind = f.kind ?? 'apple';
    g.fillStyle(0x080e1a, 0.35).fillEllipse(f.x, f.y + f.r + 6, f.r * 1.5, f.r * 0.5);
    if (kind === 'gold') {
      // golden apple with a sparkle ring
      g.lineStyle(4, 0xffe9a8, 0.5 + 0.3 * Math.sin(t * 8)).strokeCircle(f.x, f.y + bob, f.r * 1.4 * k);
      g.fillStyle(0xd9a21b, 1).fillCircle(f.x, f.y + bob + 3, f.r * k);
      g.fillStyle(0xffd36b, 1).fillCircle(f.x, f.y + bob, f.r * k);
    } else if (kind === 'trim') {
      // blue gem with scissor blades: makes the other snake shorter
      g.fillStyle(0x2a8fc9, 1).fillCircle(f.x, f.y + bob + 3, f.r * k);
      g.fillStyle(0x6fd0ff, 1).fillCircle(f.x, f.y + bob, f.r * k);
      g.lineStyle(7, 0xffffff, 0.95);
      g.lineBetween(f.x - f.r * 0.5, f.y + bob - f.r * 0.5, f.x + f.r * 0.5, f.y + bob + f.r * 0.5);
      g.lineBetween(f.x + f.r * 0.5, f.y + bob - f.r * 0.5, f.x - f.r * 0.5, f.y + bob + f.r * 0.5);
    } else {
      g.fillStyle(0xc92d3a, 1).fillCircle(f.x, f.y + bob + 3, f.r * k);
      g.fillStyle(0xf05561, 1).fillCircle(f.x, f.y + bob, f.r * k);
    }
    g.fillStyle(0xffffff, 0.55).fillCircle(f.x - f.r * 0.35, f.y + bob - f.r * 0.35, f.r * 0.22);
    if (kind !== 'trim') {
      g.lineStyle(5, 0x6b4a2b, 1).lineBetween(f.x, f.y + bob - f.r * 0.8, f.x + 4, f.y + bob - f.r * 1.3);
      g.fillStyle(0x58c27d, 1).fillEllipse(f.x + 14, f.y + bob - f.r * 1.1, 18, 9);
    }
  });
}

/** Rocks: a pulsing dashed warning ring while they are about to land, then a solid grey boulder. `inside` = still on the floor. */
export function drawRocks(g: Phaser.GameObjects.Graphics, rocks: Rock[], time: number, warnSec: number, inside: (r: Rock) => boolean, clock: number): void {
  g.clear();
  for (const r of rocks) {
    if (!inside(r)) continue;
    if (r.active) {
      g.fillStyle(0x080e1a, 0.4).fillCircle(r.x, r.y + 10, r.r);
      g.fillStyle(0x56637a, 1).fillCircle(r.x, r.y, r.r);
      g.fillStyle(0x7d8ca6, 1).fillCircle(r.x - 5, r.y - 6, r.r * 0.78);
      g.fillStyle(0xa9b7cf, 0.8).fillCircle(r.x - r.r * 0.3, r.y - r.r * 0.35, r.r * 0.24);
    } else if (time > r.t0 - warnSec) {
      const k = 0.5 + 0.5 * Math.sin(clock * 14);
      g.lineStyle(7, 0xe5484d, 0.45 + 0.4 * k).strokeCircle(r.x, r.y, r.r * (1.15 + 0.2 * k));
      g.fillStyle(0xe5484d, 0.12 + 0.1 * k).fillCircle(r.x, r.y, r.r);
    }
  }
}

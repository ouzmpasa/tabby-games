import Phaser from 'phaser';
import { Sfx } from '../core/audio/Sfx';
import { COLORS, PLAYER } from '../core/theme';
import { RotatedLabel } from './RotatedLabel';

/** Home screen mockup is 1280x800; we scale it by S and centre it in the 1920x1080 design space. */
export const S = 1.35;
export const OX = (1920 - 1280 * S) / 2;
export const mx = (v: number): number => OX + v * S;
export const my = (v: number): number => v * S;

export type TileIcon = 'rink' | 'tug' | 'football' | 'connect4' | 'bin';

export interface TileSpec {
  /** Position and size in mockup units. */
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  icon: TileIcon;
  /** Custom icon (games added later); replaces `icon` when given. */
  drawIcon?: (g: Phaser.GameObjects.Graphics) => void;
  onTap: () => void;
  /** Big tile: eyebrow label above the title. */
  eyebrow?: string;
}

const ORANGE = PLAYER[0];
const BLUE = PLAYER[1];

/** Draws one tile (card + icon + title + round play button) and returns its interactive container. */
export function makeTile(scene: Phaser.Scene, spec: TileSpec): Phaser.GameObjects.Container {
  const { x, y, w, h } = spec;
  const big = spec.icon === 'rink';
  const radius = big ? 32 : 28;
  const g = scene.add.graphics();
  g.fillStyle(0x080e1a, 0.3).fillRoundedRect(-w / 2, -h / 2 + 10, w, h, radius);
  g.fillStyle(COLORS.surface, 1).fillRoundedRect(-w / 2, -h / 2, w, h, radius);
  g.lineStyle(1, COLORS.border, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
  const ic = scene.add.graphics();
  ic.setPosition(-w / 2, -h / 2);
  if (spec.drawIcon) spec.drawIcon(ic);
  else drawIcon(ic, spec.icon);
  const play = scene.add.graphics();
  const pr = big ? 56 : 32;
  const pcx = w / 2 - (big ? 48 : 20) - pr;
  const pcy = h / 2 - (big ? 56 : 20) - pr;
  play.fillStyle(COLORS.btnBg, 1).fillCircle(pcx, pcy, pr);
  const k = big ? 40 / 24 : 1;
  play.fillStyle(COLORS.btnFg, 1).fillPoints(
    [
      new Phaser.Geom.Point(pcx + (8 - 12) * k, pcy + (5.5 - 12) * k),
      new Phaser.Geom.Point(pcx + (8 - 12) * k, pcy + (18.5 - 12) * k),
      new Phaser.Geom.Point(pcx + (18.5 - 12) * k, pcy),
    ],
    true,
  );
  const c = scene.add.container(mx(x + w / 2), my(y + h / 2), [g, ic, play]).setScale(S);
  c.setSize(w, h).setInteractive({ useHandCursor: true });
  c.on('pointerdown', () => {
    Sfx.click();
    c.setScale(S * 0.97);
  });
  c.on('pointerout', () => c.setScale(S));
  c.on('pointerup', () => {
    c.setScale(S);
    spec.onTap();
  });
  // Text is placed in real pixels (not inside the scaled container) so it stays crisp.
  const left = mx(x + (big ? 48 : 28));
  const bottom = my(y + h - (big ? 56 : 28));
  const title = new RotatedLabel(scene, left, bottom, spec.title, null, { size: (big ? 64 : 26) * S, color: COLORS.text, display: true }).setOrigin(0, 1);
  // small tiles: wrap long titles to two lines so they stay clear of the play button
  if (!big) title.setWordWrapWidth((w - 110) * S, true);
  if (spec.eyebrow) {
    const e = new RotatedLabel(scene, left, bottom - 64 * S * 0.95 - 8 * S, spec.eyebrow.toUpperCase(), null, { size: 15 * S, color: COLORS.muted }).setOrigin(0, 1);
    e.setLetterSpacing(2);
  }
  void title;
  return c;
}

/** The big rink drawing, scaled down to fit a small tile. */
export function drawRinkIcon(g: Phaser.GameObjects.Graphics): void {
  g.setScale(0.4);
  g.x += 24;
  g.y += 30;
  drawIcon(g, 'rink');
}

function drawIcon(g: Phaser.GameObjects.Graphics, icon: TileIcon): void {
  const line = (w: number, col: number, a = 1) => g.lineStyle(w, col, a);
  switch (icon) {
    case 'rink': {
      // SVG 568x392 inside the 568x624 tile
      g.fillStyle(COLORS.inset, 1).fillRoundedRect(48, 56, 472, 280, 36);
      line(2, COLORS.line).strokeRoundedRect(48, 56, 472, 280, 36);
      g.fillStyle(COLORS.dots, 1);
      for (let py = 75; py < 326; py += 18) for (let px = 67; px < 508; px += 18) {
        if ((px < 80 || px > 488) && (py < 84 || py > 308)) continue;
        g.fillCircle(px, py, 1.3);
      }
      line(2, COLORS.line).lineBetween(284, 57, 284, 335).strokeCircle(284, 196, 48);
      line(2, ORANGE.main, 0.55).beginPath().arc(49, 196, 60, -Math.PI / 2, Math.PI / 2, false).strokePath();
      line(2, BLUE.main, 0.6).beginPath().arc(519, 196, 60, Math.PI / 2, (3 * Math.PI) / 2, false).strokePath();
      g.fillStyle(ORANGE.main, 1).fillRoundedRect(45, 146, 6, 100, 3);
      g.fillStyle(BLUE.main, 1).fillRoundedRect(517, 146, 6, 100, 3);
      for (const [cx, cy, p] of [[150, 212, ORANGE], [418, 168, BLUE]] as const) {
        g.fillStyle(p.main, 1).fillCircle(cx, cy, 38).fillStyle(p.dark, 1).fillCircle(cx, cy, 23).fillStyle(p.light, 1).fillCircle(cx, cy, 11);
      }
      line(2, COLORS.puck, 0.22).lineBetween(250, 216, 292, 220);
      line(2, COLORS.puck, 0.14).lineBetween(262, 230, 294, 228);
      g.fillStyle(COLORS.puck, 1).fillCircle(318, 222, 17);
      line(1.5, COLORS.puckRing).strokeCircle(318, 222, 11);
      break;
    }
    case 'tug':
      line(4, COLORS.icon).lineBetween(54, 92, 152, 92);
      g.fillStyle(ORANGE.main, 1).fillCircle(44, 92, 13);
      g.fillStyle(BLUE.main, 1).fillCircle(162, 92, 13);
      line(3, COLORS.text2).lineBetween(103, 92, 103, 62).lineBetween(103, 62, 123, 70).lineBetween(123, 70, 103, 78);
      break;
    case 'football':
      line(2, COLORS.icon).strokeRoundedRect(31, 47, 134, 82, 14).lineBetween(98, 48, 98, 128);
      g.fillStyle(ORANGE.main, 1).fillRoundedRect(28, 76, 6, 24, 3).fillRoundedRect(58, 66, 12, 12, 4).fillRoundedRect(58, 98, 12, 12, 4);
      g.fillStyle(BLUE.main, 1).fillRoundedRect(162, 76, 6, 24, 3).fillRoundedRect(126, 66, 12, 12, 4).fillRoundedRect(126, 98, 12, 12, 4);
      g.fillStyle(COLORS.text2, 1).fillCircle(98, 88, 7);
      break;
    case 'connect4':
      line(2, COLORS.icon).strokeRoundedRect(32, 52, 102, 76, 10).strokeCircle(57, 76, 9).strokeCircle(83, 76, 9);
      g.fillStyle(BLUE.main, 1).fillCircle(109, 76, 9).fillCircle(109, 104, 9);
      g.fillStyle(ORANGE.main, 1).fillCircle(57, 104, 9).fillCircle(83, 104, 9);
      break;
    case 'bin':
      line(2.5, COLORS.icon).strokePoints([new Phaser.Geom.Point(68, 82), new Phaser.Geom.Point(118, 82), new Phaser.Geom.Point(112, 128), new Phaser.Geom.Point(74, 128)], true).strokeEllipse(93, 82, 50, 12);
      g.fillStyle(ORANGE.main, 1).fillCircle(110, 58, 11);
      g.fillStyle(BLUE.main, 1).fillCircle(54, 108, 11);
      break;
  }
}

/** Short "Coming soon!" toast over a tile. */
export function toast(scene: Phaser.Scene, x: number, y: number, text: string): void {
  const lbl = new RotatedLabel(scene, x, y, text, null, { size: 40, color: COLORS.btnFg }).setDepth(60);
  const pad = scene.add.rectangle(x, y, lbl.width + 60, 76, COLORS.btnBg).setDepth(59);
  scene.tweens.add({ targets: [lbl, pad], alpha: 0, delay: 1100, duration: 300, onComplete: () => { lbl.destroy(); pad.destroy(); } });
}

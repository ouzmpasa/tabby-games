import Phaser from 'phaser';
import { facingRotation, H, W } from '../../core/layout';
import { COLORS, PLAYER } from '../../core/theme';
import type { PlayerId } from '../../core/types';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { LAYOUT, SAFECRACKER, TEXT } from './config';
import type { Dir } from './logic';

const D2R = Math.PI / 180;
const TIMER_W = 360;

/** Screen centre of a player's safe (and dial). */
export const safeCentre = (p: PlayerId): { x: number; y: number } => ({ x: p === 0 ? LAYOUT.centreInset : W - LAYOUT.centreInset, y: LAYOUT.centreY });

/**
 * Draws with Graphics ONCE into a texture. Phaser re-tessellates a Graphics object's whole command list every frame,
 * which is slow on tablets, so everything static (and the tinted ring/arrows) is a plain Image.
 * `draw` works in a frame whose origin is the centre of the w x h texture.
 */
function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void): string {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.translateCanvas(w / 2, h / 2);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}

function lockIcon(g: Phaser.GameObjects.Graphics, on: boolean): void {
  g.fillStyle(on ? 0x3ddc84 : COLORS.inset, 1).fillCircle(0, 0, 34);
  g.lineStyle(6, on ? 0xb9ffd5 : COLORS.line, 1).strokeCircle(0, 0, 34);
  const ic = on ? 0x0f3d24 : COLORS.muted;
  g.fillStyle(ic, 1).fillRoundedRect(-14, -4, 28, 20, 4);
  g.lineStyle(5, ic, 1).beginPath();
  if (on) g.arc(8, -6, 11, Math.PI, Math.PI * 1.9, false);
  else g.arc(0, -4, 10, Math.PI, 0, false);
  g.strokePath();
}

function arrowShape(g: Phaser.GameObjects.Graphics, dir: Dir): void {
  const r = LAYOUT.arrowRadius;
  const half = 38 * D2R;
  const top = -Math.PI / 2;
  g.lineStyle(20, 0x080e1a, 0.25).beginPath().arc(0, 4, r, top - half, top + half, false).strokePath();
  g.lineStyle(14, 0xffffff, 1).beginPath().arc(0, 0, r, top - half, top + half, false).strokePath();
  const a = dir === 1 ? top + half : top - half;
  const tx = Math.cos(a) * r, ty = Math.sin(a) * r;
  const tangent = a + (dir === 1 ? Math.PI / 2 : -Math.PI / 2);
  const nx = Math.cos(a), ny = Math.sin(a);
  g.fillStyle(0xffffff, 1).fillTriangle(tx + Math.cos(tangent) * 34, ty + Math.sin(tangent) * 34, tx + nx * 28, ty + ny * 28, tx - nx * 28, ty - ny * 28);
}

/** One player's safe: frame, door with dial, hot/cold ring, direction arrow and lock lights. Drawn in the player's own frame. */
export class SafeView {
  readonly root: Phaser.GameObjects.Container;
  private door: Phaser.GameObjects.Container;
  private dial: Phaser.GameObjects.Image;
  private ring: Phaser.GameObjects.Image;
  private glow: Phaser.GameObjects.Image;
  private arrow: Phaser.GameObjects.Image;
  private lights: Phaser.GameObjects.Image[] = [];
  private lightsRow: Phaser.GameObjects.Container;
  private interior: Phaser.GameObjects.Image;
  private timerBg: Phaser.GameObjects.Rectangle;
  private timerFill: Phaser.GameObjects.Rectangle;
  private lockCount = 3;
  private redUntil = 0;

  constructor(private scene: Phaser.Scene, readonly player: PlayerId) {
    const c = safeCentre(player);
    const F = LAYOUT.frameHalf;
    const A = LAYOUT.faceHalf;
    const R = LAYOUT.dialRadius;
    const col = PLAYER[player];

    const frameKey = bake(scene, `sc-frame-${player}`, 2 * F + 40, 2 * F + 40, (g) => {
      g.fillStyle(0x080e1a, 0.35).fillRoundedRect(-F, -F + 14, 2 * F, 2 * F, 36);
      g.fillStyle(0x56688a, 1).fillRoundedRect(-F, -F, 2 * F, 2 * F, 36);
      g.lineStyle(10, col.main, 1).strokeRoundedRect(-F + 5, -F + 5, 2 * F - 10, 2 * F - 10, 32);
      g.fillStyle(0x3b4a66, 1).fillRoundedRect(-A - 8, -A - 8, 2 * A + 16, 2 * A + 16, 24);
    });
    const insideKey = bake(scene, 'sc-inside', 2 * A, 2 * A, (g) => {
      g.fillStyle(0x16202f, 1).fillRoundedRect(-A, -A, 2 * A, 2 * A, 18);
      for (let r = 0; r < 3; r++) for (let k = 0; k < 4 - r; k++) {
        const x = (k - (3 - r) / 2) * 150, y = 190 - r * 70;
        g.fillStyle(0xb8860b, 1).fillRoundedRect(x - 62, y - 28, 124, 56, 10);
        g.fillStyle(0xffd84d, 1).fillRoundedRect(x - 58, y - 28, 116, 40, 10);
      }
      for (let i = 0; i < 9; i++) {
        const x = -200 + i * 50, y = -60 + ((i * 37) % 70);
        g.fillStyle(0xb8860b, 1).fillCircle(x, y, 28).fillStyle(0xffd84d, 1).fillCircle(x, y, 22);
      }
    });
    const faceKey = bake(scene, 'sc-face', 2 * A, 2 * A, (g) => {
      g.fillStyle(0x8fa0bd, 1).fillRoundedRect(-A, -A, 2 * A, 2 * A, 18);
      g.fillStyle(0xa9b8d2, 1).fillRoundedRect(-A + 8, -A + 8, 2 * A - 16, 2 * A - 16, 14);
      g.fillStyle(0x6a7fa0, 1);
      for (const [bx, by] of [[-A + 22, -A + 22], [A - 22, -A + 22], [-A + 22, A - 22], [A - 22, A - 22]]) g.fillCircle(bx, by, 9);
    });
    const dialKey = bake(scene, `sc-dial-${player}`, 2 * R + 40, 2 * R + 40, (d) => {
      d.fillStyle(0x080e1a, 0.4).fillCircle(0, 10, R + 6);
      d.fillStyle(0x1e2a3d, 1).fillCircle(0, 0, R + 4);
      d.fillStyle(COLORS.icon, 1).fillCircle(0, 0, R - 6);
      for (let i = 0; i < 48; i++) {
        const a = i * 7.5 * D2R, big = i % 4 === 0, len = big ? 34 : 22;
        d.lineStyle(big ? 7 : 4, 0x1e2a3d, 1).lineBetween(Math.cos(a) * (R - 8), Math.sin(a) * (R - 8), Math.cos(a) * (R - len), Math.sin(a) * (R - len));
      }
      d.fillStyle(COLORS.muted, 1).fillCircle(0, 0, R - 58);
      d.fillStyle(0x6a7fa0, 1).fillCircle(0, 0, R - 70);
      // A big chunky pointer so turning is easy to see.
      d.fillStyle(col.main, 1).fillTriangle(0, -R + 6, -26, -R + 56, 26, -R + 56);
      d.fillStyle(col.main, 1).fillRoundedRect(-17, -R + 40, 34, R - 40, 12);
      d.fillStyle(col.light, 1).fillCircle(0, 0, 44);
      d.lineStyle(6, 0x1e2a3d, 0.7).strokeCircle(0, 0, 44);
    });
    const ringR = LAYOUT.ringRadius;
    const ringKey = bake(scene, 'sc-ring', 2 * ringR + 80, 2 * ringR + 80, (g) => g.lineStyle(14, 0xffffff, 1).strokeCircle(0, 0, ringR));
    const glowKey = bake(scene, 'sc-glow', 2 * ringR + 140, 2 * ringR + 140, (g) => {
      for (let i = 4; i >= 0; i--) g.lineStyle(26 + i * 12, 0xffffff, i === 0 ? 0.7 : 0.14).strokeCircle(0, 0, ringR);
    });
    const arrKeys = [-1, 1].map((d) => bake(scene, `sc-arrow${d}`, 2 * LAYOUT.arrowRadius + 120, 2 * LAYOUT.arrowRadius + 120, (g) => arrowShape(g, d as Dir)));
    const onKey = bake(scene, 'sc-light-on', 84, 84, (g) => lockIcon(g, true));
    const offKey = bake(scene, 'sc-light-off', 84, 84, (g) => lockIcon(g, false));
    this.keys = { on: onKey, off: offKey, arrows: arrKeys };

    const frame = scene.add.image(0, 0, frameKey);
    this.interior = scene.add.image(0, 0, insideKey).setAlpha(0);

    // Door: hinged on its local-left edge.
    this.door = scene.add.container(-A, 0);
    const face = scene.add.image(A, 0, faceKey);
    this.glow = scene.add.image(A, 0, glowKey);
    this.ring = scene.add.image(A, 0, ringKey);
    this.arrow = scene.add.image(A, 0, arrKeys[1]);
    this.dial = scene.add.image(A, 0, dialKey);
    this.door.add([face, this.glow, this.ring, this.dial, this.arrow]);

    this.lightsRow = scene.add.container(0, -LAYOUT.lightsY);
    // Lock time limit bar (hidden when a round has no limit), beyond the lock lights.
    this.timerBg = scene.add.rectangle(0, -LAYOUT.lightsY - 62, TIMER_W, 16, 0x080e1a, 0.55).setVisible(false);
    this.timerFill = scene.add.rectangle(-TIMER_W / 2, -LAYOUT.lightsY - 62, TIMER_W, 16, 0x3ddc84).setOrigin(0, 0.5).setVisible(false);
    this.root = scene.add.container(c.x, c.y, [frame, this.interior, this.door, this.lightsRow, this.timerBg, this.timerFill]);
    this.root.setRotation(facingRotation(player)).setDepth(5);
    this.reset(1, SAFECRACKER.maxLocks);
  }

  private keys: { on: string; off: string; arrows: string[] };

  /** Rebuilds the lock lights for a safe with `n` locks. */
  private buildLights(n: number): void {
    this.lockCount = n;
    this.lightsRow.removeAll(true);
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * LAYOUT.lightsGap;
      const shadow = this.scene.add.circle(x, 5, 36, 0x080e1a, 0.35);
      const img = this.scene.add.image(x, 0, this.keys.off);
      this.lights.push(img);
      this.lightsRow.add([shadow, img]);
    }
  }

  /** Fresh closed safe with `locks` locks at the start of a round. */
  reset(firstDir: Dir, locks: number): void {
    this.buildLights(locks);
    this.redUntil = 0;
    this.setTimer(null);
    this.scene.tweens.killTweensOf(this.root);
    this.root.setRotation(facingRotation(this.player));
    const c = safeCentre(this.player);
    this.root.setPosition(c.x, c.y);
    this.scene.tweens.killTweensOf([this.door, this.interior, this.dial, this.lightsRow]);
    this.door.setScale(1, 1);
    this.interior.setAlpha(0);
    this.dial.setRotation(0).setScale(1).setAlpha(1);
    this.arrow.setAlpha(1);
    this.lightsRow.setScale(1);
    this.setLocks(0);
    this.setArrow(firstDir);
    this.setHeat(0, false);
  }

  setAngleDeg(deg: number): void {
    this.dial.setRotation(deg * D2R);
  }

  setLocks(n: number): void {
    this.lights.forEach((img, i) => img.setTexture(i < n ? this.keys.on : this.keys.off));
  }

  /** Curved arrow over the dial showing which way to turn. */
  setArrow(dir: Dir): void {
    this.arrow.setTexture(this.keys.arrows[dir === 1 ? 1 : 0]).setTint(0xffffff);
  }

  /** Hot/cold glow: colour from heat, brighter as it warms. `wrong` = right spot but wrong way (arrow turns red). */
  setHeat(h: number, wrong: boolean, color = 0x3a6ff7): void {
    this.ring.setTint(color).setAlpha(0.65 + 0.35 * h);
    this.glow.setTint(color).setAlpha(0.25 + 0.75 * h);
    this.arrow.setTint(wrong ? 0xff6b6b : 0xffffff);
    if (this.scene.time.now < this.redUntil) {
      this.ring.setTint(0xff4d4d).setAlpha(1);
      this.glow.setTint(0xff4d4d).setAlpha(1);
    }
  }

  /** Lock time limit bar: `frac` 1 -> 0 (null hides it). Turns red when nearly out. */
  setTimer(frac: number | null): void {
    const on = frac !== null;
    this.timerBg.setVisible(on);
    this.timerFill.setVisible(on && frac > 0);
    if (frac === null) return;
    this.timerFill.setScale(Math.max(0.001, frac), 1).setFillStyle(frac < 0.25 ? 0xff5a5a : frac < 0.5 ? 0xffd84d : 0x3ddc84);
  }

  /** Wobble the whole safe sideways (in its own frame), for jams. */
  private shake(amount: number): void {
    const c = safeCentre(this.player);
    const s = this.scene;
    s.tweens.killTweensOf(this.root);
    this.root.setPosition(c.x, c.y);
    s.tweens.add({ targets: this.root, y: { from: c.y - amount, to: c.y + amount }, duration: 55, yoyo: true, repeat: 4, onComplete: () => this.root.setPosition(c.x, c.y) });
  }

  /** A decoy was held to the end: it was a fake click. The glow flashes red and the safe rattles. */
  fakeClick(): void {
    this.redUntil = this.scene.time.now + 600;
    this.shake(7);
  }

  /** The lock's time limit ran out: its spot was hidden somewhere new. */
  rehide(): void {
    this.redUntil = this.scene.time.now + 700;
    this.shake(12);
  }

  /** A lock clicked: pop the lights and the dial. */
  lockClick(count: number): void {
    this.setLocks(count);
    this.scene.tweens.add({ targets: this.dial, scale: { from: 1.1, to: 1 }, duration: 260, ease: 'Back.Out' });
    this.scene.tweens.add({ targets: this.lightsRow, scale: { from: 1.15, to: 1 }, duration: 260, ease: 'Back.Out' });
    const c = safeCentre(this.player);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const dot = this.scene.add.circle(c.x, c.y, 10, 0x3ddc84, 1).setDepth(30);
      this.scene.tweens.add({ targets: dot, x: c.x + Math.cos(a) * 250, y: c.y + Math.sin(a) * 250, alpha: 0, scale: 0.3, duration: 450, ease: 'Quad.Out', onComplete: () => dot.destroy() });
    }
  }

  /** Door swings open, sparkles and coins fly, "OPEN!" in the player's reading direction. */
  openDoor(): void {
    const s = this.scene;
    this.setLocks(this.lockCount);
    this.interior.setAlpha(1);
    s.tweens.add({ targets: this.door, scaleX: 0.06, duration: 700, ease: 'Cubic.InOut' });
    s.tweens.add({ targets: [this.dial, this.ring, this.glow, this.arrow], alpha: 0, duration: 300 });
    const c = safeCentre(this.player);
    const colors = [0xffd84d, 0xfff3b0, 0xffffff, PLAYER[this.player].light];
    for (let k = 0; k < 36; k++) {
      const a = Math.random() * Math.PI * 2, dist = 140 + Math.random() * 340;
      const isCoin = k % 2 === 0;
      const o = isCoin
        ? s.add.circle(c.x, c.y, 20, 0xffd84d, 1).setStrokeStyle(5, 0xb8860b)
        : s.add.star(c.x, c.y, 4, 5, 16, colors[k % colors.length], 1);
      o.setDepth(40);
      s.tweens.add({
        targets: o,
        x: c.x + Math.cos(a) * dist,
        y: c.y + Math.sin(a) * dist + (isCoin ? 120 : 0),
        rotation: Math.random() * 6,
        alpha: { from: 1, to: 0 },
        duration: 900 + Math.random() * 600,
        delay: 300 + Math.random() * 300,
        ease: 'Quad.Out',
        onComplete: () => o.destroy(),
      });
    }
    const lbl = new RotatedLabel(s, c.x, H / 2, TEXT.open, this.player, { size: 150, color: 0xffd84d, stroke: COLORS.inset, display: true }).setDepth(60).setAlpha(0);
    s.tweens.add({ targets: lbl, alpha: 1, scale: { from: 0.5, to: 1 }, duration: 350, delay: 500, ease: 'Back.Out' });
    s.time.delayedCall(SAFECRACKER.doorOpenMs, () => lbl.destroy());
  }
}

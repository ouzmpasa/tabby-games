import Phaser from 'phaser';
import { COLORS, PLAYER } from '../../core/theme';
import type { PlayerId } from '../../core/types';
import { BALL, HIPPO, WAVES } from './config';
import { diveState, mouthPos, type Ball, type Hippo } from './logic';

/** A marble: coloured glass ball with a shine; the golden one glows. Local origin = ball centre. */
export class BallView extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, readonly ball: Ball) {
    super(scene, ball.x, ball.y);
    const r = ball.r;
    const g = scene.add.graphics();
    const col = ball.golden ? BALL.golden : BALL.colors[ball.color % BALL.colors.length];
    const dark = Phaser.Display.Color.IntegerToColor(col).darken(28).color;
    const light = Phaser.Display.Color.IntegerToColor(col).lighten(35).color;
    g.fillStyle(0x080e1a, 0.3).fillEllipse(4, r * 0.28 + 4, r * 2, r * 1.9); // shadow in the water
    if (ball.golden) g.fillStyle(0xffe58a, 0.28).fillCircle(0, 0, r * 1.5);
    g.fillStyle(dark, 1).fillCircle(0, 0, r);
    g.fillStyle(col, 1).fillCircle(-r * 0.06, -r * 0.08, r * 0.9);
    // Swirl band.
    g.lineStyle(r * 0.22, light, 0.55).beginPath().arc(0, 0, r * 0.55, 0.5, 2.4).strokePath();
    if (ball.golden) {
      // Star in the middle.
      g.fillStyle(0xfff3b0, 1);
      const pts: Phaser.Geom.Point[] = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r * 0.62 : r * 0.28;
        pts.push(new Phaser.Geom.Point(Math.cos(a) * rr, Math.sin(a) * rr));
      }
      g.fillPoints(pts, true);
    }
    g.fillStyle(0xffffff, 0.85).fillEllipse(-r * 0.36, -r * 0.4, r * 0.4, r * 0.26);
    g.fillStyle(0xffffff, 0.5).fillCircle(r * 0.34, r * 0.38, r * 0.08);
    this.add(g);
    this.setDepth(5);
    scene.add.existing(this);
    if (ball.golden) {
      scene.tweens.add({ targets: g, scale: { from: 1, to: 1.1 }, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    }
  }

  /** Set once the drop-in tween is over; until then it owns scale and alpha. */
  private landed = false;

  sync(): void {
    this.setPosition(this.ball.x, this.ball.y);
    if (!this.landed) return;
    const b = this.ball;
    const dive = diveState(b);
    if (dive === 'under') this.setAlpha(0.22).setScale(0.78);
    else if (dive === 'warn') this.setAlpha(0.55 + 0.45 * Math.sin(b.age / 40)).setScale(1);
    else if (b.ttl < 1600) this.setAlpha(Math.sin(b.ttl / 90) > 0 ? 1 : 0.35).setScale(1); // a golden ball about to float away blinks
    else this.setAlpha(1).setScale(1);
  }

  /** A golden ball nobody ate floats away. */
  floatAway(): void {
    this.landed = false;
    this.scene.tweens.add({ targets: this, y: this.y - 60, alpha: 0, scale: 1.4, duration: 500, ease: 'Quad.Out', onComplete: () => this.destroy() });
  }

  /** Drop-in: falls from above the water with a splash. */
  dropIn(delay: number): void {
    this.setScale(2.4).setAlpha(0);
    this.scene.tweens.add({
      targets: this,
      scale: 1,
      alpha: 1,
      delay,
      duration: 380,
      ease: 'Quad.In',
      onComplete: () => {
        this.landed = true;
        splash(this.scene, this.ball.x, this.ball.y, this.ball.r);
      },
    });
  }
}

/** The rock island in the middle of the pond (appears from a later wave on). */
export function makeRock(scene: Phaser.Scene, x: number, y: number): Phaser.GameObjects.Container {
  const r = WAVES.rockRadius;
  const g = scene.add.graphics();
  g.fillStyle(0x080e1a, 0.35).fillEllipse(6, 14, r * 2.2, r * 2);
  g.fillStyle(0xe8dfc8, 0.5).fillEllipse(0, 4, r * 2.35, r * 2.1); // wet sand ring
  g.fillStyle(0x6f7a88, 1).fillEllipse(0, 0, r * 2, r * 1.8);
  g.fillStyle(0x8d99a8, 1).fillEllipse(-r * 0.12, -r * 0.14, r * 1.55, r * 1.35);
  g.fillStyle(0xaab6c4, 1).fillEllipse(-r * 0.22, -r * 0.3, r * 0.9, r * 0.7);
  g.fillStyle(0x5f8f55, 1).fillEllipse(r * 0.35, r * 0.25, r * 0.5, r * 0.3).fillEllipse(-r * 0.5, r * 0.3, r * 0.34, r * 0.22);
  g.fillStyle(0xffffff, 0.35).fillEllipse(-r * 0.35, -r * 0.45, r * 0.4, r * 0.18);
  return scene.add.container(x, y, [g]).setDepth(2);
}

/** Expanding water rings. */
export function splash(scene: Phaser.Scene, x: number, y: number, r: number): void {
  for (let i = 0; i < 2; i++) {
    const ring = scene.add.circle(x, y, r, 0xffffff, 0).setStrokeStyle(6 - i * 2, 0xffffff, 0.7).setDepth(4);
    scene.tweens.add({ targets: ring, scale: 2.2 + i * 0.7, alpha: 0, delay: i * 90, duration: 520, ease: 'Quad.Out', onComplete: () => ring.destroy() });
  }
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.random();
    const d = scene.add.circle(x, y, 6, 0xdff3ff, 0.9).setDepth(6);
    scene.tweens.add({ targets: d, x: x + Math.cos(a) * (r + 40), y: y + Math.sin(a) * (r + 40), alpha: 0, duration: 380, ease: 'Quad.Out', onComplete: () => d.destroy() });
  }
}

/**
 * One hippo, seen from above. Local frame of `root`: origin at the body anchor, +x toward the pond
 * (the container is mirrored with scaleX = -1 for the right-hand player).
 */
export class HippoView {
  readonly root: Phaser.GameObjects.Container;
  readonly head: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Graphics;
  private neck: Phaser.GameObjects.Graphics;
  private headG: Phaser.GameObjects.Graphics;
  private belly = 0;
  private bellyPulse = 0;
  private lastOpen = -1;
  private wiggleT = Math.random() * 6;
  private palette: { main: number; dark: number; light: number };

  constructor(private scene: Phaser.Scene, readonly player: PlayerId, private h: Hippo) {
    const pal = PLAYER[player];
    this.palette = { main: pal.main, dark: pal.dark, light: pal.light };
    this.body = scene.add.graphics();
    this.neck = scene.add.graphics();
    this.headG = scene.add.graphics();
    this.head = scene.add.container(HIPPO.idleReach, 0, [this.headG]);
    this.root = scene.add.container(h.baseX, h.baseY, [this.body, this.neck, this.head]).setScale(h.dir, 1).setDepth(3);
    this.head.setDepth(8);
    this.drawBody();
    this.refresh();
  }

  private drawBody(): void {
    const { main, dark, light } = this.palette;
    const g = this.body.clear();
    const bulge = this.belly + this.bellyPulse;
    g.fillStyle(0x080e1a, 0.3).fillEllipse(-14, 14, 330, 470);
    // feet
    g.fillStyle(dark, 1).fillCircle(60, -225, 34).fillCircle(60, 225, 34);
    g.fillStyle(main, 1).fillEllipse(-30, 0, 320 * (1 + bulge * 0.4), 450 * (1 + bulge));
    g.fillStyle(light, 1).fillEllipse(0, 0, 190 * (1 + bulge * 1.4), 300 * (1 + bulge * 1.2));
    g.fillStyle(0xffffff, 0.18).fillEllipse(-14, -92, 70, 36);
    // little tail bump behind
    g.fillStyle(dark, 1).fillCircle(-190, 0, 20);
  }

  private drawHead(open: number): void {
    const { main, dark, light } = this.palette;
    const g = this.headG.clear();
    // skull
    g.fillStyle(dark, 1).fillCircle(-120, -98, 24).fillCircle(-120, 98, 24); // ears
    g.fillStyle(0x080e1a, 0.25).fillEllipse(-40, 10, 240, 226);
    g.fillStyle(main, 1).fillEllipse(-45, 0, 240, 226);
    g.fillStyle(light, 1).fillEllipse(25, 0, 200, 196); // snout
    // eyes
    for (const s of [-1, 1]) {
      g.fillStyle(main, 1).fillCircle(-75, s * 78, 32);
      g.fillStyle(0xffffff, 1).fillCircle(-70, s * 78, 23);
      g.fillStyle(0x1e2a3d, 1).fillCircle(-62, s * 78, 12);
      g.fillStyle(0xffffff, 1).fillCircle(-58, s * 78 - 4, 4);
    }
    if (open < 0.05) {
      // closed: nostrils and a smile
      g.fillStyle(dark, 1).fillEllipse(58, -42, 16, 22).fillEllipse(58, 42, 16, 22);
      g.lineStyle(7, dark, 1).beginPath().arc(30, 0, 62, -0.9, 0.9).strokePath();
    } else {
      const w = 70 + 70 * open;
      const hgt = 30 + 150 * open;
      g.fillStyle(dark, 1).fillEllipse(32, 0, w + 14, hgt + 14);
      g.fillStyle(0x5a1f2e, 1).fillEllipse(32, 0, w, hgt);
      g.fillStyle(0xff8fa3, 1).fillEllipse(20, 0, w * 0.6, hgt * 0.5);
      g.fillStyle(0xffffff, 1);
      for (const s of [-1, 1]) for (const k of [-1, 0, 1]) g.fillRoundedRect(32 + k * 26 - 8, s * hgt * 0.5 * 0.82 - 8, 16, 16, 5);
      g.fillStyle(dark, 1).fillEllipse(-4, -54, 14, 18).fillEllipse(-4, 54, 14, 18);
    }
  }

  /** Eat pulse: the belly grows a bit and the whole hippo squishes. */
  eat(count: number): void {
    this.belly = Math.min(HIPPO.bellyMax, this.h.eaten * HIPPO.bellyGrow);
    this.scene.tweens.addCounter({
      from: 0.16,
      to: 0,
      duration: 380,
      ease: 'Quad.Out',
      onUpdate: (t) => {
        this.bellyPulse = t.getValue() ?? 0;
        this.drawBody();
      },
    });
    this.scene.tweens.add({ targets: this.root, scaleY: { from: 1.08 + count * 0.02, to: 1 }, duration: 260, ease: 'Back.Out' });
  }

  /** World position of the body anchor / mouth, and the mouth screen point. */
  mouth(): { x: number; y: number } {
    return mouthPos(this.h);
  }

  update(dt: number): void {
    this.wiggleT += dt / 1000;
    this.refresh();
  }

  private refresh(): void {
    const h = this.h;
    const m = mouthPos(h);
    const lx = (m.x - h.baseX) * h.dir;
    const ly = m.y - h.baseY;
    const ang = Math.atan2(ly, lx);
    // Idle wiggle: a gentle sway of the head; stronger while the head is out.
    const sway = h.phase === 'idle' ? Math.sin(this.wiggleT * 3.2) * 0.07 : 0;
    this.head.setPosition(lx, ly + (h.phase === 'idle' ? Math.sin(this.wiggleT * 2.4) * 8 : 0));
    this.head.setRotation(ang + sway);
    const g = this.neck.clear();
    const { main, dark } = this.palette;
    const nx = this.head.x - 70;
    const ny = this.head.y;
    g.lineStyle(150, dark, 1).lineBetween(-20, 0, nx, ny);
    g.lineStyle(132, main, 1).lineBetween(-20, 0, nx, ny);
    g.fillStyle(dark, 1).fillCircle(nx, ny, 75);
    g.fillStyle(main, 1).fillCircle(nx, ny, 66);
    const open = h.open;
    if (Math.abs(open - this.lastOpen) > 0.02) {
      this.drawHead(open);
      this.lastOpen = open;
    }
  }

  destroy(): void {
    this.root.destroy();
  }
}

/** Soft target ring that shows where the mouth will end up before the lunge happens. */
export function drawTargetRing(g: Phaser.GameObjects.Graphics, x: number, y: number, player: PlayerId): void {
  g.lineStyle(8, PLAYER[player].light, 0.85).strokeCircle(x, y, HIPPO.mouthRadius);
  g.lineStyle(4, COLORS.text, 0.55).strokeCircle(x, y, HIPPO.mouthRadius + 10);
  g.fillStyle(PLAYER[player].light, 0.18).fillCircle(x, y, HIPPO.mouthRadius);
}

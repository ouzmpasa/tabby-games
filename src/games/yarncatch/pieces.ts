import Phaser from 'phaser';
import { PLAYER } from '../../core/theme';
import type { PlayerId } from '../../core/types';
import { LANE } from './config';

/** All drawing here is in LANE-local coordinates: x across the player's end, y negative = away from the player. */

const INK = 0x1e2a3d;
const PINK = 0xff8fa3;
const CREAM = 0xfff1de;

/** Ellipse polygon with rotation (Graphics.fillEllipse cannot rotate). */
function rotEllipse(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rx: number, ry: number, rot: number): void {
  const pts: Phaser.Geom.Point[] = [];
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    pts.push(new Phaser.Geom.Point(cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)));
  }
  g.fillPoints(pts, true);
}

/** Thick curved stroke drawn as overlapping discs along a quadratic bezier. */
function thickCurve(g: Phaser.GameObjects.Graphics, p0: [number, number], p1: [number, number], p2: [number, number], w0: number, w1: number): void {
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    const x = (1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
    const y = (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
    g.fillCircle(x, y, (w0 + (w1 - w0) * t) / 2);
  }
}

export const star = (g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number): void => {
  const pts: Phaser.Geom.Point[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(new Phaser.Geom.Point(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr));
  }
  g.fillStyle(color, 1).fillPoints(pts, true);
};

export const heart = (g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, color: number): void => {
  g.fillStyle(color, 1);
  g.fillCircle(cx - r * 0.5, cy - r * 0.3, r * 0.55).fillCircle(cx + r * 0.5, cy - r * 0.3, r * 0.55);
  g.fillTriangle(cx - r * 1.0, cy - r * 0.1, cx + r * 1.0, cy - r * 0.1, cx, cy + r * 1.05);
};

/** Ball of yarn drawn at (0,0): wound strands as tilted loops, a shine and a little loose end. */
export function drawYarnBall(g: Phaser.GameObjects.Graphics, p: PlayerId, r: number): void {
  const pal = PLAYER[p];
  g.fillStyle(pal.light, 1).fillCircle(0, 0, r);
  g.lineStyle(Math.max(3, r * 0.1), pal.dark, 0.9);
  for (const a of [0.3, 1.35, 2.4]) {
    g.save();
    g.rotateCanvas(a);
    g.strokeEllipse(0, 0, r * 1.84, r * 0.92);
    g.restore();
  }
  g.lineStyle(Math.max(2, r * 0.06), 0xffffff, 0.45);
  for (const a of [0.85, 1.9]) {
    g.save();
    g.rotateCanvas(a);
    g.strokeEllipse(0, 0, r * 1.5, r * 0.55);
    g.restore();
  }
  g.lineStyle(Math.max(3, r * 0.09), pal.dark, 1).strokeCircle(0, 0, r);
  g.fillStyle(0xffffff, 0.55).fillEllipse(-r * 0.38, -r * 0.42, r * 0.5, r * 0.28);
}

/** A kneeling cat seen from above: orange tabby with pointy ears (player 0), blue cat with round ears and white socks (player 1). */
export class Cat {
  readonly back: Phaser.GameObjects.Container;
  readonly front: Phaser.GameObjects.Graphics;
  /** Thread wrapped around the cat; draw it above the paws. */
  readonly wrapG: Phaser.GameObjects.Graphics;
  private head: Phaser.GameObjects.Container;
  private eyes: Phaser.GameObjects.Graphics;
  private clap = 0;
  private fur: number;
  private furLight: number;

  constructor(private scene: Phaser.Scene, private p: PlayerId) {
    this.fur = PLAYER[p].main;
    this.furLight = p === 0 ? 0xffe2c2 : 0xf5f7fa;
    const body = scene.add.graphics();
    this.drawBody(body);
    this.head = scene.add.container(0, LANE.headY);
    const hg = scene.add.graphics();
    this.drawHead(hg);
    this.eyes = scene.add.graphics();
    this.head.add([hg, this.eyes]);
    this.back = scene.add.container(0, 0, [body, this.head]);
    this.front = scene.add.graphics();
    this.wrapG = scene.add.graphics();
    this.setFace('normal');
    this.renderHands();
  }

  private drawBody(g: Phaser.GameObjects.Graphics): void {
    const { fur, p } = this;
    // Tail curling out to the side
    g.fillStyle(fur, 1);
    if (p === 0) {
      thickCurve(g, [110, -40], [250, -60], [215, -190], 44, 28);
      g.fillStyle(PLAYER[0].dark, 1);
      for (const [x, y] of [[238, -86], [236, -122], [226, -158]] as const) g.fillEllipse(x, y, 30, 12);
      g.fillStyle(CREAM, 1).fillCircle(215, -192, 15);
    } else {
      thickCurve(g, [-110, -40], [-250, -50], [-205, -200], 44, 30);
      g.fillStyle(0xf5f7fa, 1).fillCircle(-205, -203, 17);
    }
    // Round soft body with a lighter chest
    g.fillStyle(0x080e1a, 0.25).fillEllipse(4, -62, 300, 140);
    g.fillStyle(fur, 1).fillEllipse(0, -70, 300, 140);
    g.fillStyle(PLAYER[p].dark, 1).fillEllipse(0, -34, 220, 52);
    g.fillStyle(this.furLight, 1).fillEllipse(0, -92, 120, 56);
    if (p === 0) {
      g.lineStyle(9, PLAYER[0].dark, 0.8);
      for (const s of [-1, 1]) g.lineBetween(s * 100, -110, s * 128, -90).lineBetween(s * 112, -78, s * 138, -62);
    }
  }

  private drawHead(g: Phaser.GameObjects.Graphics): void {
    const { fur, furLight, p } = this;
    const dark = PLAYER[p].dark;
    // Ears: pointy for the orange cat, round for the blue one
    for (const s of [-1, 1]) {
      if (p === 0) {
        g.fillStyle(fur, 1).fillTriangle(s * 86, -18, s * 24, -70, s * 66, -134);
        g.fillStyle(PINK, 1).fillTriangle(s * 68, -38, s * 38, -66, s * 62, -108);
      } else {
        g.fillStyle(fur, 1).fillCircle(s * 62, -84, 36);
        g.fillStyle(PINK, 1).fillCircle(s * 62, -84, 20);
      }
    }
    g.fillStyle(fur, 1).fillCircle(0, 0, 84);
    if (p === 0) {
      // Tabby stripes on the forehead and cheeks
      g.lineStyle(8, dark, 0.85);
      g.lineBetween(0, -14, 0, 20).lineBetween(-22, -12, -26, 16).lineBetween(22, -12, 26, 16);
      for (const s of [-1, 1]) g.lineBetween(s * 70, 28, s * 52, 34).lineBetween(s * 72, 44, s * 54, 46);
    } else {
      // White blaze, fluffy cheeks and a tuft
      g.fillStyle(furLight, 1);
      rotEllipse(g, -54, 24, 34, 26, 0.5);
      rotEllipse(g, 54, 24, 34, 26, -0.5);
      g.fillTriangle(-9, 4, 9, 4, 0, -34);
    }
    // Muzzle, nose, mouth
    g.fillStyle(furLight, 1).fillEllipse(0, -58, 62, 44);
    g.fillStyle(PINK, 1).fillTriangle(-9, -72, 9, -72, 0, -62);
    g.lineStyle(3, INK, 0.75).beginPath().arc(-8, -58, 8, 0.1, Math.PI * 0.9, false).strokePath().beginPath().arc(8, -58, 8, 0.1, Math.PI * 0.9, false).strokePath();
    g.lineStyle(3, INK, 0.5);
    for (const s of [-1, 1]) g.lineBetween(s * 30, -62, s * 86, -72).lineBetween(s * 30, -54, s * 88, -52);
  }

  /** Face: eyes watch ahead; happy (closed smiling eyes) after a catch, swirly when tangled. */
  setFace(mode: 'normal' | 'happy' | 'tangled'): void {
    const g = this.eyes.clear();
    for (const s of [-1, 1]) {
      const x = s * 34;
      if (mode === 'normal') {
        g.fillStyle(0xffffff, 1).fillEllipse(x, -34, 30, 36);
        g.fillStyle(p0Eye(this.p), 1).fillEllipse(x, -38, 22, 28);
        g.fillStyle(INK, 1).fillEllipse(x, -38, 9, 22);
        g.fillStyle(0xffffff, 1).fillCircle(x + 4, -46, 4);
      } else if (mode === 'happy') {
        g.lineStyle(8, INK, 1).beginPath().arc(x, -30, 14, Math.PI, 0, false).strokePath();
      } else {
        g.fillStyle(0xffffff, 1).fillCircle(x, -34, 20);
        g.lineStyle(4, INK, 1).beginPath();
        for (let i = 0; i <= 40; i++) {
          const a = i * 0.45;
          const rr = 1.5 + i * 0.4;
          const px = x + Math.cos(a) * rr;
          const py = -34 + Math.sin(a) * rr;
          if (i === 0) g.moveTo(px, py);
          else g.lineTo(px, py);
        }
        g.strokePath();
      }
    }
  }

  /** Clap amount 0 (paws open wide) .. 1 (paws together). */
  setClap(c: number): void {
    this.clap = c;
    this.renderHands();
  }

  private renderHands(): void {
    const g = this.front.clear();
    const hx = 104 - this.clap * 66;
    const hy = LANE.handsY;
    for (const s of [-1, 1]) {
      const x = s * hx;
      // Furry foreleg from the shoulder to the paw, darker rim underneath.
      const mx = s * (120 - (120 - hx) * 0.45);
      g.lineStyle(62, PLAYER[this.p].dark, 1).lineBetween(s * 120, -95, mx, hy + 190).lineBetween(mx, hy + 190, x, hy + 30);
      g.lineStyle(50, this.fur, 1).lineBetween(s * 120, -95, mx, hy + 190).lineBetween(mx, hy + 190, x, hy + 30);
      // Big open paw: palm, three toes, pink pads
      g.fillStyle(this.p === 1 ? 0xf5f7fa : this.fur, 1).fillCircle(x, hy + 4, 48);
      for (let k = -1; k <= 1; k++) g.fillCircle(x + k * 28 - s * 2, hy - 38 + Math.abs(k) * 9, 17);
      g.fillStyle(PINK, 1).fillEllipse(x, hy + 10, 46, 38);
      g.fillCircle(x - 22, hy - 24, 8).fillCircle(x, hy - 32, 8).fillCircle(x + 22, hy - 24, 8);
    }
  }

  tweenClap(to: number, ms: number): void {
    const o = { c: this.clap };
    this.scene.tweens.add({ targets: o, c: to, duration: ms, ease: 'Quad.Out', onUpdate: () => this.setClap(o.c) });
  }

  /** Thread loops round the body: more loops = more wrapped. `tangle` scribbles over the head too. */
  wrap(loops: number, tangle: boolean): void {
    const g = this.wrapG.clear();
    const col = PLAYER[this.p].light;
    const dark = PLAYER[this.p].dark;
    for (let i = 0; i < loops; i++) {
      const y = -118 + i * 17 + (i % 2) * 5;
      const w = 258 - Math.abs(i - loops / 2) * 8;
      g.lineStyle(9, i % 2 ? col : dark, 1).strokeEllipse((i % 3 - 1) * 5, y, w, 42);
    }
    if (tangle) {
      g.lineStyle(7, col, 1);
      for (let i = 0; i < 7; i++) {
        g.save();
        g.translateCanvas(0, LANE.headY - 4);
        g.rotateCanvas(i * 0.9);
        g.strokeEllipse(0, 0, 182 + (i % 3) * 8, 70 + (i % 2) * 24);
        g.restore();
      }
    }
  }

  /** Little wobble of the whole head, for a clumsy catch. */
  wobble(): void {
    this.scene.tweens.add({ targets: this.head, angle: { from: -12, to: 0 }, duration: 700, ease: 'Elastic.Out' });
    this.scene.tweens.add({ targets: this.head, x: { from: 14, to: 0 }, duration: 700, ease: 'Elastic.Out' });
  }

  /** The yarn bounced off the head: squash, dizzy swirls. */
  bounced(): void {
    this.setFace('tangled');
    this.scene.tweens.add({ targets: this.head, scaleY: { from: 0.75, to: 1 }, scaleX: { from: 1.15, to: 1 }, duration: 380, ease: 'Elastic.Out' });
    this.scene.tweens.add({ targets: this.head, angle: { from: -9, to: 0 }, duration: 600, ease: 'Elastic.Out' });
  }

  hop(): void {
    this.scene.tweens.add({ targets: this.head, y: LANE.headY - 22, yoyo: true, duration: 140, ease: 'Quad.Out' });
  }

  reset(): void {
    this.setFace('normal');
    this.setClap(0);
    this.wrapG.clear();
    this.head.setScale(1).setAngle(0).setPosition(0, LANE.headY);
  }
}

function p0Eye(p: PlayerId): number {
  return p === 0 ? 0xf2c230 : 0x5ad1c8;
}

/**
 * The tumbling ball of yarn plus the loose thread it unspools behind it.
 * The container sits at the ball's lane position; the thread graphics lives in lane coordinates (add it under the cat).
 */
export class Yarn extends Phaser.GameObjects.Container {
  readonly thread: Phaser.GameObjects.Graphics;
  private ball: Phaser.GameObjects.Container;
  private shadow: Phaser.GameObjects.Graphics;
  private trail: { x: number; y: number }[] = [];
  private t = 0;
  private spinAngle = 0;

  constructor(scene: Phaser.Scene, private p: PlayerId) {
    super(scene, 0, LANE.startY);
    this.thread = scene.add.graphics();
    this.shadow = scene.add.graphics();
    this.shadow.fillStyle(0x080e1a, 0.3).fillEllipse(0, 0, 100, 40);
    const g = scene.add.graphics();
    drawYarnBall(g, p, 58);
    // Loose end hanging out of the ball
    g.lineStyle(7, PLAYER[p].light, 1).beginPath().moveTo(30, 44).lineTo(44, 62).lineTo(34, 78).strokePath();
    this.ball = scene.add.container(0, 0, [g]);
    this.add([this.shadow, this.ball]);
    scene.add.existing(this);
  }

  /** Put the ball at (x,y) (lane coords); `lift` 0..1 is the hop height, `rolled` the distance rolled (spin). Extends the thread. */
  place(x: number, y: number, lift: number, rolled: number, leave = true): void {
    this.setPosition(x, y);
    this.spinAngle = rolled * 0.02;
    this.ball.setY(-lift * 70).setScale(1 + lift * 0.18, 1 + lift * 0.18).setRotation(this.spinAngle);
    this.shadow.setScale(1 - lift * 0.35).setAlpha(1 - lift * 0.5).setY(14);
    if (leave) {
      const last = this.trail[this.trail.length - 1];
      if (!last || Math.hypot(last.x - x, last.y - y) > 7) {
        this.trail.push({ x, y });
        if (this.trail.length > 80) this.trail.shift();
      }
    }
    this.drawThread();
  }

  /** Squash on landing (0..1). */
  squash(k: number): void {
    this.ball.setScale(1 + k * 0.2, 1 - k * 0.2);
  }

  private drawThread(): void {
    const g = this.thread.clear();
    const n = this.trail.length;
    if (n < 2) return;
    this.t += 0.15;
    const col = PLAYER[this.p].light;
    g.lineStyle(7, col, 1).beginPath();
    g.moveTo(this.x + 30, this.y + 40);
    for (let i = n - 1; i >= 0; i--) {
      const age = n - 1 - i;
      const wob = Math.sin(age * 0.55 + this.t) * Math.min(22, 2 + age * 0.9);
      g.lineTo(this.trail[i].x + wob, this.trail[i].y + 40);
    }
    g.strokePath();
    g.lineStyle(3, 0xffffff, 0.35).beginPath().moveTo(this.x + 32, this.y + 38);
    for (let i = n - 1; i >= 0; i -= 2) {
      const age = n - 1 - i;
      g.lineTo(this.trail[i].x + Math.sin(age * 0.55 + this.t) * Math.min(22, 2 + age * 0.9) + 2, this.trail[i].y + 38);
    }
    g.strokePath();
  }

  clearThread(): void {
    this.trail = [];
    this.thread.clear().setAlpha(1);
  }

  resetTo(y: number): void {
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.killTweensOf(this.thread);
    this.clearThread();
    this.setAlpha(1);
    this.place(0, y, 0, 0, false);
  }
}

/** Comic stars circling over a head, then fading (dizzy cat). */
export function dizzyStars(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number): void {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    star(g, Math.cos(a) * 118, Math.sin(a) * 118, 26, i % 2 ? 0xffd23f : 0xffffff);
  }
  c.add(g);
  parent.add(c);
  scene.tweens.add({ targets: c, angle: 540, duration: 1500, ease: 'Sine.Out' });
  scene.tweens.add({ targets: c, alpha: 0, delay: 1000, duration: 500, onComplete: () => c.destroy() });
}

/** Sparkles (and, when perfect, hearts) bursting out where the paws meet the yarn. */
export function catchSparks(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, x: number, y: number, perfect: boolean): void {
  const n = perfect ? 12 : 6;
  for (let i = 0; i < n; i++) {
    const g = scene.add.graphics();
    star(g, 0, 0, perfect ? 22 : 15, i % 2 ? 0xffd23f : 0xffffff);
    g.setPosition(x, y);
    parent.add(g);
    const a = (i / n) * Math.PI * 2;
    const d = perfect ? 190 : 130;
    scene.tweens.add({ targets: g, x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, alpha: 0, angle: 200, scale: 0.4, duration: 650, ease: 'Quad.Out', onComplete: () => g.destroy() });
  }
  if (!perfect) return;
  for (let i = 0; i < 5; i++) {
    const g = scene.add.graphics();
    heart(g, 0, 0, 20 + (i % 2) * 6, i % 2 ? 0xff8fa3 : 0xff5d7e);
    g.setPosition(x + (i - 2) * 46, y + 50).setAlpha(0);
    parent.add(g);
    scene.tweens.add({ targets: g, y: y - 110 - i * 14, alpha: { from: 1, to: 0 }, delay: i * 90, duration: 1100, ease: 'Sine.Out', onStart: () => g.setAlpha(1), onComplete: () => g.destroy() });
  }
}

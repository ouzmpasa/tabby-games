import Phaser from 'phaser';
import { facingRotation } from '../../core/layout';
import type { PlayerId } from '../../core/types';
import { GRID, WHACKAMOLE } from './config';
import type { MoleKind } from './logic';

const BOSS_SCALE = 1.2;
const HIDDEN_Y = 200; // holder y (local) when the mole is fully inside the hole
const MASK = { x0: -120, x1: 120, y0: -260, y1: 22 }; // local rect in which moles are visible

/** One hole with its mole. Local frame: the container is rotated to face the player, "up" is -y. */
export class HoleView {
  readonly root: Phaser.GameObjects.Container;
  private holder: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Graphics;
  private face: Phaser.GameObjects.Graphics;
  private maskG: Phaser.GameObjects.Graphics;
  private state: 'hidden' | 'up' | 'hit' = 'hidden';
  private kind: MoleKind = 'normal';
  private hp = 1;
  private shine?: Phaser.Tweens.Tween;

  constructor(private scene: Phaser.Scene, readonly x: number, readonly y: number, player: PlayerId) {
    const rot = facingRotation(player);
    const back = scene.add.graphics();
    back.fillStyle(0x080e1a, 0.35).fillEllipse(0, 8, GRID.holeW + 30, GRID.holeH + 24);
    back.fillStyle(0x7a5a3e, 1).fillEllipse(0, 0, GRID.holeW + 30, GRID.holeH + 24); // dirt ring
    back.fillStyle(0x160f0a, 1).fillEllipse(0, 0, GRID.holeW, GRID.holeH);
    this.body = scene.add.graphics();
    this.face = scene.add.graphics();
    this.holder = scene.add.container(0, HIDDEN_Y, [this.body, this.face]).setVisible(false);
    const lip = scene.add.graphics();
    // Front lip: the lower rim, drawn over the mole so it seems to come out of the ground.
    lip.fillStyle(0x9a7650, 1);
    lip.fillPoints(this.lipPoints(GRID.holeW / 2 + 15, GRID.holeH / 2 + 12, GRID.holeW / 2 - 6, GRID.holeH / 2 - 8), true);
    this.root = scene.add.container(x, y, [back, this.holder, lip]).setRotation(rot).setDepth(5);
    // Geometry mask in world space so the mole is only visible above the hole's middle line.
    this.maskG = scene.make.graphics({}, false);
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const pts = [
      [MASK.x0, MASK.y0],
      [MASK.x1, MASK.y0],
      [MASK.x1, MASK.y1],
      [MASK.x0, MASK.y1],
    ].map(([lx, ly]) => new Phaser.Geom.Point(x + lx * c - ly * s, y + lx * s + ly * c));
    this.maskG.fillStyle(0xffffff).fillPoints(pts, true);
    this.holder.setMask(this.maskG.createGeometryMask());
  }

  /** Crescent for the front (lower) half of the hole's rim, in local coords. */
  private lipPoints(ox: number, oy: number, ix: number, iy: number): Phaser.Geom.Point[] {
    const pts: Phaser.Geom.Point[] = [];
    const n = 20;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI;
      pts.push(new Phaser.Geom.Point(Math.cos(a) * ox, 4 + Math.sin(a) * oy));
    }
    for (let i = n; i >= 0; i--) {
      const a = (i / n) * Math.PI;
      pts.push(new Phaser.Geom.Point(Math.cos(a) * ix, 4 + Math.sin(a) * iy));
    }
    return pts;
  }

  private drawMole(kind: MoleKind, hit: boolean): void {
    if (kind === 'friend') return this.drawBunny(hit);
    if (kind === 'boss') return this.drawBoss(hit);
    const gold = kind === 'golden';
    const b = this.body.clear();
    const body = gold ? 0xffc928 : 0x8b5a3c;
    const dark = gold ? 0xe0a400 : 0x6e4429;
    const belly = gold ? 0xffe58a : 0xd2a77f;
    b.fillStyle(dark, 1).fillCircle(-52, -138, 20).fillCircle(52, -138, 20); // ears
    b.fillStyle(0xff9fb0, 1).fillCircle(-52, -138, 11).fillCircle(52, -138, 11);
    b.fillStyle(body, 1).fillEllipse(0, -72, 160, 150);
    b.fillStyle(belly, 1).fillEllipse(0, -44, 96, 70);
    b.fillStyle(dark, 1).fillEllipse(-62, -8, 40, 24).fillEllipse(62, -8, 40, 24); // paws
    if (gold) {
      b.fillStyle(0xfff3b0, 1).fillEllipse(-36, -112, 26, 14);
      b.fillStyle(0xff8a3d, 1).fillTriangle(-34, -140, -18, -176, -2, -140).fillTriangle(-12, -140, 4, -182, 20, -140).fillTriangle(8, -140, 24, -176, 40, -140);
    }
    const f = this.face.clear();
    if (hit) {
      f.lineStyle(7, 0x1e2a3d, 1);
      for (const ex of [-30, 30]) f.lineBetween(ex - 11, -111, ex + 11, -89).lineBetween(ex + 11, -111, ex - 11, -89);
      f.fillStyle(0x1e2a3d, 1).fillEllipse(0, -52, 24, 18);
    } else {
      f.fillStyle(0xffffff, 1).fillCircle(-30, -100, 15).fillCircle(30, -100, 15);
      f.fillStyle(0x1e2a3d, 1).fillCircle(-28, -98, 8).fillCircle(32, -98, 8);
      f.fillStyle(0xffffff, 1).fillCircle(-25, -101, 3).fillCircle(35, -101, 3);
      f.fillStyle(0xffffff, 1).fillRoundedRect(-11, -58, 22, 20, 4);
      f.lineStyle(3, 0xc9c9c9, 1).lineBetween(0, -58, 0, -38);
      f.fillStyle(0xff9fb0, 0.55).fillCircle(-58, -74, 11).fillCircle(58, -74, 11);
    }
    f.fillStyle(0xff7d94, 1).fillEllipse(0, -76, 38, 26);
    f.fillStyle(0xffffff, 0.5).fillEllipse(-7, -81, 10, 6);
  }

  /** The friendly bunny (decoy): soft white with long pink ears and a blue bow tie, a gentle smile, no teeth. */
  private drawBunny(hit: boolean): void {
    const b = this.body.clear();
    b.fillStyle(0xf1e4ea, 1).fillEllipse(-44, -190, 40, 130).fillEllipse(44, -190, 40, 130); // ears
    b.fillStyle(0xffb3c8, 1).fillEllipse(-44, -190, 20, 100).fillEllipse(44, -190, 20, 100);
    b.fillStyle(0xfaf2f5, 1).fillEllipse(0, -72, 160, 150);
    b.fillStyle(0xffffff, 1).fillEllipse(0, -40, 96, 66);
    b.fillStyle(0xe9d9e0, 1).fillEllipse(-62, -8, 40, 24).fillEllipse(62, -8, 40, 24); // paws
    b.fillStyle(0x4aa8ff, 1).fillTriangle(0, -34, -34, -52, -34, -16).fillTriangle(0, -34, 34, -52, 34, -16).fillCircle(0, -34, 9);
    const f = this.face.clear();
    if (hit) {
      f.lineStyle(7, 0x1e2a3d, 1);
      for (const ex of [-30, 30]) f.lineBetween(ex - 11, -111, ex + 11, -89).lineBetween(ex + 11, -111, ex - 11, -89);
    } else {
      f.fillStyle(0x1e2a3d, 1).fillCircle(-30, -98, 11).fillCircle(30, -98, 11);
      f.fillStyle(0xffffff, 1).fillCircle(-27, -102, 4).fillCircle(33, -102, 4);
    }
    f.fillStyle(0xff9fb0, 0.6).fillCircle(-58, -74, 11).fillCircle(58, -74, 11);
    f.fillStyle(0xff7d94, 1).fillEllipse(0, -80, 26, 18);
    f.lineStyle(4, 0xb87a8a, 1).beginPath().arc(-9, -68, 10, 0.2, Math.PI - 0.2).strokePath().beginPath().arc(9, -68, 10, 0.2, Math.PI - 0.2).strokePath();
  }

  /** The boss mole: big, purple, grumpy, with a little gold crown; pips on its belly show the hits it has left. */
  private drawBoss(hit: boolean): void {
    const b = this.body.clear();
    b.fillStyle(0x4a2f78, 1).fillCircle(-56, -134, 22).fillCircle(56, -134, 22); // ears
    b.fillStyle(0x6a4a9c, 1).fillEllipse(0, -72, 170, 156);
    b.fillStyle(0xc9b3e8, 1).fillEllipse(0, -40, 104, 74);
    b.fillStyle(0x4a2f78, 1).fillEllipse(-66, -8, 44, 26).fillEllipse(66, -8, 44, 26); // paws
    b.fillStyle(0xffc928, 1).fillTriangle(-44, -138, -36, -176, -20, -140).fillTriangle(-16, -140, 0, -184, 16, -140).fillTriangle(20, -140, 36, -176, 44, -138);
    b.fillRect(-44, -144, 88, 12);
    const f = this.face.clear();
    if (hit) {
      f.lineStyle(7, 0x1e2a3d, 1);
      for (const ex of [-30, 30]) f.lineBetween(ex - 11, -111, ex + 11, -89).lineBetween(ex + 11, -111, ex - 11, -89);
      f.fillStyle(0x1e2a3d, 1).fillEllipse(0, -64, 26, 20);
    } else {
      f.fillStyle(0xffffff, 1).fillCircle(-30, -100, 15).fillCircle(30, -100, 15);
      f.fillStyle(0x1e2a3d, 1).fillCircle(-28, -96, 8).fillCircle(32, -96, 8);
      f.lineStyle(8, 0x1e2a3d, 1).lineBetween(-48, -128, -14, -114).lineBetween(48, -128, 14, -114); // grumpy brows
      f.fillStyle(0xffffff, 1).fillRoundedRect(-14, -66, 28, 22, 4);
    }
    f.fillStyle(0xff7d94, 1).fillEllipse(0, -80, 38, 26);
    for (let i = 0; i < WHACKAMOLE.bossHp; i++) {
      f.fillStyle(i < this.hp ? 0xffc928 : 0x8a78ad, 1).fillCircle((i - (WHACKAMOLE.bossHp - 1) / 2) * 30, -22, 10);
    }
  }

  get isUp(): boolean {
    return this.state === 'up';
  }

  popUp(kind: MoleKind, hp = 1): void {
    this.kind = kind;
    this.hp = hp;
    this.state = 'up';
    this.scene.tweens.killTweensOf(this.holder);
    this.shine?.stop();
    this.drawMole(kind, false);
    this.holder.setVisible(true).setScale(kind === 'boss' ? BOSS_SCALE : 1).setAlpha(1).setY(HIDDEN_Y);
    this.scene.tweens.add({ targets: this.holder, y: 0, duration: WHACKAMOLE.riseMs, ease: 'Back.Out' });
    if (kind === 'golden') {
      this.shine = this.scene.tweens.add({ targets: this.holder, alpha: { from: 1, to: 0.8 }, duration: 160, yoyo: true, repeat: -1 });
    }
  }

  /** A boss took a hit and stays up: wobble, show the fewer pips. */
  bossHit(hpLeft: number): void {
    this.hp = hpLeft;
    this.drawMole(this.kind, true);
    this.scene.tweens.killTweensOf(this.holder);
    this.holder.setY(0).setScale(BOSS_SCALE * 1.15, BOSS_SCALE * 0.8);
    this.scene.tweens.add({
      targets: this.holder,
      scaleX: BOSS_SCALE,
      scaleY: BOSS_SCALE,
      duration: 220,
      ease: 'Back.Out',
      onComplete: () => this.state === 'up' && this.drawMole(this.kind, false),
    });
  }

  /** Mole ran out of time: duck back down. */
  sink(): void {
    if (this.state !== 'up') return;
    this.state = 'hidden';
    this.shine?.stop();
    this.holder.setAlpha(1);
    this.scene.tweens.killTweensOf(this.holder);
    this.scene.tweens.add({ targets: this.holder, y: HIDDEN_Y, duration: WHACKAMOLE.sinkMs, ease: 'Quad.In', onComplete: () => this.holder.setVisible(false) });
  }

  /** Mole was whacked: squash, dizzy face, then sink. */
  squash(): void {
    this.state = 'hit';
    this.shine?.stop();
    this.holder.setAlpha(1);
    this.scene.tweens.killTweensOf(this.holder);
    this.drawMole(this.kind, true);
    this.holder.setY(0).setScale(this.kind === 'boss' ? BOSS_SCALE * 1.25 : 1.25, 0.45);
    this.scene.tweens.add({
      targets: this.holder,
      scaleX: this.kind === 'boss' ? BOSS_SCALE : 1,
      scaleY: this.kind === 'boss' ? BOSS_SCALE * 0.7 : 0.7,
      duration: 110,
      ease: 'Quad.Out',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.holder,
          y: HIDDEN_Y,
          duration: 260,
          delay: 120,
          ease: 'Quad.In',
          onComplete: () => {
            this.holder.setVisible(false).setScale(1);
            this.state = 'hidden';
          },
        });
      },
    });
  }

  destroy(): void {
    this.maskG.destroy();
    this.root.destroy();
  }
}

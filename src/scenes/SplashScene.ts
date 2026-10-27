import Phaser from 'phaser';
import { H, W } from '../core/layout';
import { COLORS } from '../core/theme';
import { RotatedLabel } from '../ui/RotatedLabel';

const SHOW_MS = 3200;
const FUR = 0x9c6b46;
const FUR_DARK = 0x8a5c38;
const FUR_LIGHT = 0xc99a6e;
const BELLY = 0xd4aa7d;
const NOSE = 0x3b2a22;

/** Splash: a dancing capybara with the app name. Tap to skip. Goes to Home. */
export class SplashScene extends Phaser.Scene {
  private leaving = false;

  constructor() {
    super('Splash');
  }

  create(): void {
    this.leaving = false;
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg);
    this.add.circle(W / 2, H / 2 - 40, 430, COLORS.surface, 0.55);
    this.add.ellipse(W / 2, 860, 520, 70, 0x080e1a, 0.3);

    const capy = this.buildCapybara().setPosition(W / 2, 600).setScale(1.25);
    this.dance(capy);

    const title = new RotatedLabel(this, W / 2, 925, 'TabbyGames :D', null, { size: 130, color: COLORS.text, display: true });
    this.tweens.add({ targets: title, scale: { from: 0.96, to: 1.04 }, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    this.time.addEvent({ delay: 450, loop: true, callback: () => this.note() });
    this.cameras.main.fadeIn(300, 0x45, 0x58, 0x73);
    this.time.delayedCall(SHOW_MS, () => this.leave());
    this.input.once('pointerdown', () => this.leave());
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(250, 0x45, 0x58, 0x73);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Home'));
  }

  /** Front-facing capybara built from graphics; the container's origin is the middle of the body. */
  private buildCapybara(): Phaser.GameObjects.Container {
    const mk = (parts: Phaser.GameObjects.GameObject[]) => this.add.container(0, 0, parts);
    const gfx = (draw: (g: Phaser.GameObjects.Graphics) => void) => {
      const g = this.add.graphics();
      draw(g);
      return g;
    };

    const leg = (x: number) => {
      const c = mk([gfx((g) => g.fillStyle(FUR_DARK, 1).fillRoundedRect(-30, 0, 60, 90, 24).fillStyle(NOSE, 1).fillRoundedRect(-30, 74, 60, 18, 9))]);
      return c.setPosition(x, 150);
    };
    const arm = (x: number) => {
      const c = mk([gfx((g) => g.fillStyle(FUR, 1).fillRoundedRect(-20, 0, 40, 95, 20).fillStyle(FUR_DARK, 1).fillCircle(0, 95, 24))]);
      return c.setPosition(x, -20);
    };

    const body = gfx((g) => {
      g.fillStyle(FUR, 1).fillEllipse(0, 60, 300, 270);
      g.fillStyle(BELLY, 1).fillEllipse(0, 85, 180, 175);
    });

    const head = mk([
      gfx((g) => {
        g.fillStyle(FUR_DARK, 1).fillEllipse(-84, -62, 36, 26).fillEllipse(84, -62, 36, 26); // small low ears
        g.fillStyle(FUR, 1).fillRoundedRect(-118, -58, 236, 156, 52); // boxy head
        g.fillStyle(FUR_LIGHT, 1).fillRoundedRect(-92, -6, 184, 104, 40); // wide blunt muzzle
        g.fillStyle(NOSE, 1).fillRoundedRect(-48, -16, 96, 46, 22); // big flat nose
        g.fillStyle(0x15100d, 1).fillEllipse(-18, 7, 11, 15).fillEllipse(18, 7, 11, 15); // nostrils
        g.lineStyle(5, NOSE, 1).beginPath().arc(0, 52, 24, 0.3, Math.PI - 0.3, false).strokePath(); // smile
        for (const sx of [-1, 1]) {
          g.fillStyle(0x15100d, 1).fillCircle(sx * 66, -28, 11); // small eyes set wide and high
          g.fillStyle(0xffffff, 1).fillCircle(sx * 66 + 4, -32, 4);
        }
      }),
    ]).setPosition(0, -170);

    const legL = leg(-72);
    const legR = leg(72);
    const armL = arm(-140);
    const armR = arm(140);
    const root = this.add.container(0, 0, [legL, legR, body, armL, armR, head]);
    root.setData({ head, legL, legR, armL, armR });
    return root;
  }

  private dance(root: Phaser.GameObjects.Container): void {
    const get = (k: string) => root.getData(k) as Phaser.GameObjects.Container;
    const loop = (targets: object, props: object, duration: number, delay = 0) =>
      this.tweens.add({ targets, ...props, duration, delay, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    const beat = 340;

    loop(root, { y: root.y - 34 }, beat); // bounce to the beat
    loop(root, { angle: { from: -7, to: 7 } }, beat * 2); // sway side to side
    loop(get('head'), { angle: { from: -10, to: 10 }, y: get('head').y + 8 }, beat, beat / 2); // head bop
    loop(get('armL'), { angle: { from: 140, to: 200 } }, beat); // arms in the air, waving
    loop(get('armR'), { angle: { from: -140, to: -200 } }, beat, beat);
    loop(get('legL'), { y: get('legL').y - 26 }, beat); // stomp
    loop(get('legR'), { y: get('legR').y - 26 }, beat, beat);
  }

  /** Little music note drifting up beside the capybara. */
  private note(): void {
    const left = Math.random() < 0.5;
    const x = W / 2 + (left ? -1 : 1) * Phaser.Math.Between(330, 520);
    const n = this.add
      .text(x, 640, Math.random() < 0.5 ? '♪' : '♫', { fontFamily: 'system-ui, sans-serif', fontSize: `${Phaser.Math.Between(70, 110)}px`, color: '#f5f7fa' })
      .setOrigin(0.5)
      .setAlpha(0.9);
    this.tweens.add({
      targets: n,
      y: 300,
      x: x + (left ? -60 : 60),
      alpha: 0,
      angle: Phaser.Math.Between(-25, 25),
      duration: 1500,
      ease: 'Sine.Out',
      onComplete: () => n.destroy(),
    });
  }
}

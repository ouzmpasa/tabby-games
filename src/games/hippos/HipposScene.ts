import { Sfx } from '../../core/audio/Sfx';
import { BaseGameScene } from '../../core/BaseGameScene';
import type { PlayerPointer } from '../../core/input/PlayerInput';
import { H, W } from '../../core/layout';
import { settings } from '../../core/settings';
import { CARD, COLORS, PLAYER } from '../../core/theme';
import { PLAYERS, type PlayerId } from '../../core/types';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { HIPPOS, POND } from './config';
import { createHippo, createPond, eat, mulberry32, nextTarget, pointsFor, rememberTap, startLunge, stepHippo, stepPond, lungeTarget, type Hippo, type PondState, type Pt, type TapMemory } from './logic';
import { BallView, drawTargetRing, HippoView, makeRock, splash } from './pieces';

/** Text a player must read (hardcoded, like the other games). */
export const HIPPOS_TEXT = {
  hint: { en: 'Tap to chomp!', nl: 'Tik om te happen!' },
} as const;

export class HipposScene extends BaseGameScene {
  /** Simulation state (public so tests and tuning can poke it). */
  pond!: PondState;
  hippos!: [Hippo, Hippo];
  private views: HippoView[] = [];
  private ballViews = new Map<number, BallView>();
  private taps: [TapMemory, TapMemory] = [
    { x: 0, y: 0, until: -1 },
    { x: 0, y: 0, until: -1 },
  ];
  /** Fingers currently down per player, oldest first. */
  private held: [Map<number, Pt>, Map<number, Pt>] = [new Map(), new Map()];
  private aim!: Phaser.GameObjects.Graphics;
  private rock?: Phaser.GameObjects.Container;
  private clock = 0;
  private rng: () => number = Math.random;

  constructor() {
    super(HIPPOS.sceneKey, HIPPOS.id, HIPPOS.targetScore);
  }

  protected drawBackground(): void {
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg);
    const g = this.add.graphics();
    const m = 40;
    const r = CARD.radius + 10;
    g.fillStyle(0x080e1a, 0.3).fillRoundedRect(m, m + 14, W - 2 * m, H - 2 * m, r);
    g.fillStyle(0x3b5a43, 1).fillRoundedRect(m, m, W - 2 * m, H - 2 * m, r); // grassy bank
    g.fillStyle(PLAYER[0].main, 0.2).fillRoundedRect(m, m, W / 2 - m, H - 2 * m, { tl: r, bl: r, tr: 0, br: 0 });
    g.fillStyle(PLAYER[1].main, 0.2).fillRoundedRect(W / 2, m, W / 2 - m, H - 2 * m, { tl: 0, bl: 0, tr: r, br: r });
    g.fillStyle(PLAYER[0].main, 0.5).fillRoundedRect(m, m, 16, H - 2 * m, { tl: r, bl: r, tr: 0, br: 0 });
    g.fillStyle(PLAYER[1].main, 0.5).fillRoundedRect(W - m - 16, m, 16, H - 2 * m, { tl: 0, bl: 0, tr: r, br: r });
    const rnd = mulberry32(11);
    g.lineStyle(5, 0x4f7c5c, 0.8);
    for (let i = 0; i < 60; i++) {
      const x = m + 30 + rnd() * (W - 2 * m - 60);
      const y = m + 30 + rnd() * (H - 2 * m - 60);
      const q = ((x - POND.cx) / (POND.a + 70)) ** 2 + ((y - POND.cy) / (POND.b + 70)) ** 2;
      if (q < 1) continue;
      g.lineBetween(x, y, x - 6, y - 16).lineBetween(x, y, x + 6, y - 16).lineBetween(x, y, x, y - 20);
    }
    // The pond: muddy rim, sandy shore, water.
    g.fillStyle(0x080e1a, 0.3).fillEllipse(POND.cx, POND.cy + 12, 2 * (POND.a + 50), 2 * (POND.b + 50));
    g.fillStyle(0x8b6f4e, 1).fillEllipse(POND.cx, POND.cy, 2 * (POND.a + 50), 2 * (POND.b + 50));
    g.fillStyle(0xc9b184, 1).fillEllipse(POND.cx, POND.cy, 2 * (POND.a + 26), 2 * (POND.b + 26));
    g.fillStyle(0x2f7ea6, 1).fillEllipse(POND.cx, POND.cy, 2 * POND.a, 2 * POND.b);
    g.fillStyle(0x3c97bd, 1).fillEllipse(POND.cx, POND.cy, 2 * (POND.a - 60), 2 * (POND.b - 60));
    g.fillStyle(0x4aaed0, 0.7).fillEllipse(POND.cx, POND.cy, 2 * (POND.a - 150), 2 * (POND.b - 130));
    g.lineStyle(5, 0xffffff, 0.12).lineBetween(W / 2, POND.cy - POND.b, W / 2, POND.cy + POND.b);
    // Ripples and lily pads.
    g.lineStyle(4, 0xffffff, 0.14);
    const rr = mulberry32(5);
    for (let i = 0; i < 14; i++) {
      const a = rr() * Math.PI * 2;
      const d = 0.3 + rr() * 0.6;
      const x = POND.cx + Math.cos(a) * POND.a * d;
      const y = POND.cy + Math.sin(a) * POND.b * d;
      g.beginPath().arc(x, y, 26 + rr() * 22, 3.6, 5.6).strokePath();
    }
    for (const [x, y] of [[POND.cx - 330, POND.cy - 250], [POND.cx + 340, POND.cy + 260], [POND.cx + 120, POND.cy - 320]]) {
      g.fillStyle(0x3f9d62, 1).fillCircle(x, y, 34);
      g.fillStyle(0x3c97bd, 1).fillTriangle(x, y, x + 40, y - 12, x + 40, y + 12);
      g.fillStyle(0xff9fc0, 1).fillCircle(x - 8, y - 6, 8);
    }
  }

  protected onCreate(): void {
    this.rng = Math.random;
    this.clock = 0;
    this.pond = createPond();
    this.hippos = [createHippo(0, W, H), createHippo(1, W, H)];
    this.ballViews = new Map();
    this.rock = undefined;
    this.taps = [
      { x: 0, y: 0, until: -1 },
      { x: 0, y: 0, until: -1 },
    ];
    this.held = [new Map(), new Map()];
    this.aim = this.add.graphics().setDepth(7);
    this.views = PLAYERS.map((p) => new HippoView(this, p, this.hippos[p]));
    // Badges in the free top-left / bottom-right corners, away from the hippos and the pause buttons.
    this.badges[0].setPosition(100, 150);
    this.badges[1].setPosition(W - 100, H - 150);
    this.players.on('down', this.onDown, this);
    this.players.on('move', this.onMove, this);
    this.players.on('up', this.onUp, this);
    this.events.on('resume', this.releaseFingers, this);
    this.events.once('shutdown', () => this.events.off('resume', this.releaseFingers, this));
    this.hint();
  }

  /** Test hook: use a seeded RNG for repeatable waves. */
  seed(n: number): void {
    this.rng = mulberry32(n);
  }

  private hint(): void {
    const lang = settings.get().lang === 'nl' ? 'nl' : 'en';
    for (const p of PLAYERS) {
      const x = p === 0 ? 300 : W - 300;
      const y = p === 0 ? H - 230 : 230;
      const l = new RotatedLabel(this, x, y, HIPPOS_TEXT.hint[lang], p, { size: 54, color: PLAYER[p].onDark, stroke: COLORS.inset, display: true }).setDepth(40);
      this.tweens.add({ targets: l, alpha: 0, delay: 6000, duration: 600, onComplete: () => l.destroy() });
    }
  }

  private onDown(e: PlayerPointer): void {
    if (this.match.over) return;
    this.held[e.player].set(e.id, { x: e.x, y: e.y });
    rememberTap(this.taps[e.player], e.x, e.y, this.clock);
  }

  private onMove(e: PlayerPointer): void {
    const f = this.held[e.player].get(e.id);
    if (f) {
      f.x = e.x;
      f.y = e.y;
    }
  }

  private onUp(e: PlayerPointer): void {
    this.held[e.player].delete(e.id);
  }

  private releaseFingers(): void {
    this.held = [new Map(), new Map()];
    this.taps.forEach((t) => (t.until = -1));
    this.players.tracker.clear();
  }

  /** The most recent finger still down (Map keeps insertion order; re-set on move would not reorder, which is fine). */
  private heldTarget(p: PlayerId): Pt | null {
    let last: Pt | null = null;
    for (const v of this.held[p].values()) last = v;
    return last;
  }

  protected onTick(_time: number, delta: number): void {
    const dt = Math.min(delta, 100);
    this.clock += dt;

    // Pond: balls drift, new waves drop in.
    const res = stepPond(this.pond, dt, this.rng);
    if (res.spawned.length) this.dropWave(res.spawned);
    res.expired.forEach((b) => {
      this.ballViews.get(b.id)?.floatAway();
      this.ballViews.delete(b.id);
    });
    this.pond.balls.forEach((b) => this.ballViews.get(b.id)?.sync());

    const aim = this.aim.clear();
    for (const p of PLAYERS) {
      const h = this.hippos[p];
      if (this.match.over) break;
      if (h.phase === 'idle') {
        const tgt = nextTarget(this.taps[p], this.heldTarget(p), this.clock);
        if (tgt && startLunge(h, tgt.x, tgt.y)) {
          this.taps[p].until = -1;
          Sfx.tone(260, 0.09, 'sine', 0.08);
        }
      }
      if (stepHippo(h, dt)) this.chomp(p);
      // Aiming preview: where the mouth will end up, shown while a finger is down.
      const held = this.heldTarget(p);
      if (held) {
        const t = lungeTarget(h, held.x, held.y);
        drawTargetRing(aim, t.x, t.y, p);
      }
      this.views[p].update(dt);
    }
  }

  private dropWave(balls: typeof this.pond.balls): void {
    if (this.pond.env.rock && !this.rock) {
      this.rock = makeRock(this, POND.cx, POND.cy).setScale(0.1).setAlpha(0);
      this.tweens.add({ targets: this.rock, scale: 1, alpha: 1, duration: 600, ease: 'Back.Out' });
      splash(this, POND.cx, POND.cy, 90);
    }
    balls.forEach((b, i) => {
      const v = new BallView(this, b);
      this.ballViews.set(b.id, v);
      v.dropIn(80 + i * 70);
    });
    [520, 660, 800].forEach((f, i) => Sfx.tone(f, 0.08, 'sine', 0.1, i * 0.09));
  }

  private chomp(p: PlayerId): void {
    const h = this.hippos[p];
    const mouth = { ...this.views[p].mouth() };
    const eaten = eat(h, this.pond.balls);
    Sfx.tone(eaten.length ? 150 : 200, 0.1, 'square', 0.16);
    if (eaten.length === 0) return;
    Sfx.tone(300, 0.08, 'square', 0.12, 0.05);
    Sfx.vibrate(15);
    this.views[p].eat(eaten.length);
    let delay = 0;
    for (const b of eaten) {
      const v = this.ballViews.get(b.id);
      this.ballViews.delete(b.id);
      if (v) {
        v.setDepth(9);
        this.tweens.killTweensOf(v);
        this.tweens.add({ targets: v, x: mouth.x, y: mouth.y, scale: 0.85, duration: 70, ease: 'Quad.Out' });
        this.tweens.add({ targets: v, x: h.baseX + 20 * h.dir, y: h.baseY, scale: 0.1, alpha: 0.2, delay: 90, duration: 320, ease: 'Quad.In', onComplete: () => v.destroy() });
      }
      splash(this, mouth.x, mouth.y, 50);
      const pts = pointsFor(b);
      for (let k = 0; k < pts; k++) {
        this.time.delayedCall(delay, () => {
          if (!this.match.over) this.score(p);
        });
        delay += HIPPOS.goldenPointGapMs;
      }
      this.floatLabel(p, mouth.x, mouth.y, `+${pts}`, b.golden);
    }
  }

  private floatLabel(p: PlayerId, x: number, y: number, text: string, golden: boolean): void {
    const dir = p === 0 ? 1 : -1;
    const l = new RotatedLabel(this, x, y, text, p, { size: golden ? 130 : 96, color: golden ? 0xffd84d : COLORS.text, stroke: COLORS.inset, display: true }).setDepth(40);
    this.tweens.add({ targets: l, x: x + dir * 110, alpha: 0, scale: { from: 0.6, to: 1.2 }, duration: 800, ease: 'Quad.Out', onComplete: () => l.destroy() });
  }
}

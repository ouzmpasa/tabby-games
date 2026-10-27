import Phaser from 'phaser';
import { BaseGameScene } from '../../core/BaseGameScene';
import type { PlayerPointer } from '../../core/input/PlayerInput';
import { endAnchor, H, W } from '../../core/layout';
import { COLORS, PLAYER } from '../../core/theme';
import { PLAYERS, type PlayerId } from '../../core/types';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { Sfx } from '../../core/audio/Sfx';
import { settings } from '../../core/settings';
import { BINBASKETBALL, BINBASKETBALL_TEXT } from './config';
import {
  applyWind,
  binCentre,
  catchUp,
  comboBonus,
  computeAim,
  createBall,
  createBin,
  cueDots,
  homePos,
  launch,
  levelDef,
  levelFor,
  mercy,
  rollWind,
  stepBall,
  stepBin,
  type Ball,
  type Bin,
  type Pt,
  type Throw,
} from './logic';
import { makeBall, makeBin } from './pieces';

export class BinBasketballScene extends BaseGameScene {
  /** Simulation state (public so tests can poke it). */
  balls!: [Ball, Ball];
  /** Milliseconds of play so far (the bin's clock). */
  binTime = 0;
  /** The moving bin (position, eased size and sway). */
  bin: Bin = createBin();
  /** Difficulty level (follows the leader's score). */
  level = 0;
  /** Current wind (px/s). */
  wind: Pt = { x: 0, y: 0 };
  /** Hits in a row per player (resets on a miss or when the other player scores). */
  streak: [number, number] = [0, 0];
  private windMs = 0;
  private marks: Array<{ x: number; y: number; bx: number; by: number; age: number; player: PlayerId; hit: boolean }> = [];
  private markG!: Phaser.GameObjects.Graphics;
  private trackG!: Phaser.GameObjects.Graphics;
  private windG!: Phaser.GameObjects.Graphics;
  private hints: RotatedLabel[][] = [[], []];
  private acted: [boolean, boolean] = [false, false];
  private trackKey = '';
  /** The one finger (pointer id) that is currently flicking for each player. */
  private fingers: [number | null, number | null] = [null, null];
  /** Where each player's finger touched down (the slingshot anchor) and where it is now. */
  private anchors: [Pt | null, Pt | null] = [null, null];
  private pulls: [Pt | null, Pt | null] = [null, null];
  private aim!: Phaser.GameObjects.Graphics;
  private ballViews: Phaser.GameObjects.Container[] = [];
  private binView!: Phaser.GameObjects.Container;

  constructor() {
    super(BINBASKETBALL.sceneKey, BINBASKETBALL.id, BINBASKETBALL.targetScore);
  }

  protected drawBackground(): void {
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg);
    const g = this.add.graphics();
    const m = 40;
    const r = 40;
    g.fillStyle(0x080e1a, 0.3).fillRoundedRect(m, m + 14, W - 2 * m, H - 2 * m, r);
    g.fillStyle(COLORS.inset, 1).fillRoundedRect(m, m, W - 2 * m, H - 2 * m, r);
    g.fillStyle(PLAYER[0].main, 0.16).fillRoundedRect(m, m, 520, H - 2 * m, { tl: r, bl: r, tr: 0, br: 0 });
    g.fillStyle(PLAYER[1].main, 0.16).fillRoundedRect(W - m - 520, m, 520, H - 2 * m, { tl: 0, bl: 0, tr: r, br: r });
    // home pads
    for (const p of PLAYERS) {
      const h = homePos(p);
      g.lineStyle(6, PLAYER[p].main, 0.5).strokeCircle(h.x, h.y, BINBASKETBALL.ballRadius * 1.9);
    }
  }

  protected onCreate(): void {
    this.fingers = [null, null];
    this.anchors = [null, null];
    this.pulls = [null, null];
    this.binTime = 0;
    this.bin = createBin();
    this.level = 0;
    this.wind = { x: 0, y: 0 };
    this.windMs = 0;
    this.streak = [0, 0];
    this.marks = [];
    this.acted = [false, false];
    this.trackKey = '';
    this.trackG = this.add.graphics().setDepth(1);
    this.markG = this.add.graphics().setDepth(8);
    this.windG = this.add.graphics().setDepth(6);
    this.aim = this.add.graphics().setDepth(15);
    this.balls = [createBall(0), createBall(1)];
    this.binView = makeBin(this);
    this.ballViews = PLAYERS.map((p) => makeBall(this, p));
    PLAYERS.forEach((p) => {
      const a = endAnchor(p, 100, -300);
      this.badges[p].setPosition(a.x, a.y);
    });
    this.players.on('down', this.onDown, this);
    this.players.on('move', this.onMove, this);
    this.players.on('up', this.onUp, this);
    this.events.on('resume', this.releaseFingers, this);
    this.events.once('shutdown', () => this.events.off('resume', this.releaseFingers, this));
    this.makeHints();
    this.render();
  }

  private makeHints(): void {
    const txt = BINBASKETBALL_TEXT[settings.get().lang === 'nl' ? 'nl' : 'en'];
    PLAYERS.forEach((p) => {
      const a = endAnchor(p, 470, p === 0 ? 250 : -250); // beside the throwing line, point-symmetric
      const d = p === 0 ? 1 : -1; // second line sits further from the player's edge
      this.hints[p] = [
        new RotatedLabel(this, a.x, a.y, txt.hint, p, { size: 42, color: PLAYER[p].onDark, display: true }).setDepth(30).setAlpha(0.95),
        new RotatedLabel(this, a.x + d * 60, a.y, txt.hint2, p, { size: 34, color: PLAYER[p].onDark, display: true }).setDepth(30).setAlpha(0.8),
      ];
    });
  }

  private markActed(p: PlayerId): void {
    if (this.acted[p]) return;
    this.acted[p] = true;
    this.tweens.add({ targets: this.hints[p], alpha: 0, duration: 400 });
  }

  private onDown(e: PlayerPointer): void {
    if (!this.running || this.match.over || this.fingers[e.player] !== null) return; // one finger per player
    this.fingers[e.player] = e.id;
    this.anchors[e.player] = { x: e.x, y: e.y };
    this.pulls[e.player] = null;
  }

  private onMove(e: PlayerPointer): void {
    const a = this.anchors[e.player];
    if (this.fingers[e.player] !== e.id || !a) return;
    this.pulls[e.player] = { x: a.x - e.x, y: a.y - e.y };
  }

  private onUp(e: PlayerPointer): void {
    const p = e.player;
    if (this.fingers[p] !== e.id) return;
    const pull = this.pulls[p];
    this.fingers[p] = null;
    this.anchors[p] = null;
    this.pulls[p] = null;
    const ball = this.balls[p];
    if (!this.running || ball.phase !== 'ready' || !pull) return;
    const th = computeAim(p, { x: ball.x, y: ball.y }, pull);
    if (th) {
      this.throwBall(p, applyWind(th, this.wind));
      this.markActed(p);
    }
  }

  /** Start a throw (also used by tests). */
  throwBall(p: PlayerId, th: Throw): void {
    launch(this.balls[p], th);
    // the pitch of the throw sound tells how hard it was thrown (feedback for learning the pull)
    Sfx.tone(260 + 0.32 * th.distance, 0.09, 'triangle', 0.16);
    Sfx.vibrate(8);
  }

  private releaseFingers(): void {
    this.fingers = [null, null];
    this.anchors = [null, null];
    this.pulls = [null, null];
    this.players.tracker.clear();
  }

  protected onTick(_time: number, delta: number): void {
    const dt = Math.min(delta, 50);
    this.binTime += dt;
    const lvl = levelFor(Math.max(this.match.scores[0], this.match.scores[1]));
    if (lvl !== this.level) this.levelUp(lvl);
    stepBin(this.bin, dt, this.level);
    this.windMs += dt;
    if (this.windMs > BINBASKETBALL.windEveryMs) this.newWind();
    const bin = binCentre(this.bin);
    const m = mercy(this.binTime);
    for (const p of PLAYERS) {
      const behind = Math.max(0, this.match.scores[1 - p] - this.match.scores[p]);
      const ev = stepBall(this.balls[p], dt, bin, undefined, this.bin.radius * catchUp(behind) * m);
      if (ev.landed) this.onLanded(p, ev.landed === 'hit', bin);
    }
    for (const k of this.marks) k.age += dt;
    this.marks = this.marks.filter((k) => k.age < BINBASKETBALL.landMarkMs);
    this.render();
  }

  private levelUp(lvl: number): void {
    const up = lvl > this.level;
    this.level = lvl;
    this.newWind();
    if (!up) return;
    Sfx.tone(392, 0.12, 'square', 0.12);
    Sfx.tone(587, 0.16, 'square', 0.12, 0.12);
    PLAYERS.forEach((p) => {
      const a = endAnchor(p, 700, 0);
      const l = new RotatedLabel(this, a.x, a.y, `LEVEL ${lvl + 1}`, p, { size: 84, color: PLAYER[p].onDark, stroke: COLORS.inset, display: true }).setDepth(100);
      this.tweens.add({ targets: l, scale: { from: 0.5, to: 1 }, duration: 300, ease: 'Back.Out' });
      this.tweens.add({ targets: l, alpha: 0, delay: 1300, duration: 400, onComplete: () => l.destroy() });
    });
  }

  private newWind(): void {
    this.windMs = 0;
    this.wind = rollWind(this.level);
  }

  /** A ball has landed: leave a mark where it came down (so players can learn the pull), then score if it was a hit. */
  private onLanded(p: PlayerId, hit: boolean, bin: Pt): void {
    const b = this.balls[p];
    this.marks.push({ x: b.to.x, y: b.to.y, bx: bin.x, by: bin.y, age: 0, player: p, hit });
    if (this.marks.length > 8) this.marks.shift();
    if (hit) {
      this.onHit(p, bin);
    } else {
      Sfx.tone(150, 0.12, 'sine', 0.14);
    }
    const other: PlayerId = p === 0 ? 1 : 0;
    this.streak[p] = hit ? this.streak[p] + 1 : 0;
    if (hit) this.streak[other] = 0;
  }

  private onHit(p: PlayerId, bin: { x: number; y: number }): void {
    if (this.match.over) return;
    this.score(p);
    Sfx.vibrate(30);
    if (comboBonus(this.streak[p] + 1) && !this.match.over) {
      this.score(p);
      const c = endAnchor(p, 400, 0);
      const t = BINBASKETBALL_TEXT[settings.get().lang === 'nl' ? 'nl' : 'en'].combo;
      const cl = new RotatedLabel(this, c.x, c.y, t, p, { size: 100, color: 0xffffff, stroke: COLORS.inset, display: true }).setDepth(100);
      this.tweens.add({ targets: cl, scale: { from: 0.4, to: 1.1 }, duration: 300, ease: 'Back.Out' });
      this.tweens.add({ targets: cl, alpha: 0, delay: 800, duration: 300, onComplete: () => cl.destroy() });
    }
    this.newWind();
    const ring = this.add.circle(bin.x, bin.y, this.bin.radius, PLAYER[p].main, 0.5).setDepth(30);
    this.tweens.add({ targets: ring, scale: 2.2, alpha: 0, duration: 600, onComplete: () => ring.destroy() });
    const a = endAnchor(p, 560, 0);
    const l = new RotatedLabel(this, a.x, a.y, '+1', p, { size: 160, color: PLAYER[p].onDark, stroke: COLORS.inset, display: true }).setDepth(100);
    this.tweens.add({ targets: l, scale: { from: 0.4, to: 1.1 }, duration: 300, ease: 'Back.Out' });
    this.tweens.add({ targets: l, alpha: 0, delay: 500, duration: 300, onComplete: () => l.destroy() });
    this.tweens.add({ targets: this.binView, angle: { from: -8, to: 0 }, duration: 300, ease: 'Bounce.Out' });
  }

  /**
   * Slingshot guide: the rubber band, and a short dotted cue showing only the DIRECTION (always the same length, so it never
   * tells how far the ball will go). Judging the pull length is the skill; the mark where the ball lands teaches it.
   */
  private drawAim(): void {
    const g = this.aim.clear();
    for (const p of PLAYERS) {
      const pull = this.pulls[p];
      const anchor = this.anchors[p];
      const ball = this.balls[p];
      if (!pull || !anchor || ball.phase !== 'ready') continue;
      const col = PLAYER[p].main;
      const fx = anchor.x - pull.x;
      const fy = anchor.y - pull.y;
      g.lineStyle(10, col, 0.5).lineBetween(anchor.x, anchor.y, fx, fy);
      g.fillStyle(col, 0.35).fillCircle(anchor.x, anchor.y, 30);
      g.fillStyle(col, 1).fillCircle(fx, fy, 22);
      const th = computeAim(p, { x: ball.x, y: ball.y }, pull);
      if (!th) continue;
      for (const d of cueDots({ x: ball.x, y: ball.y }, th.to, BINBASKETBALL.aimDots, BINBASKETBALL.aimDotGap)) g.fillStyle(col, 0.85).fillCircle(d.x, d.y, 8);
    }
  }

  /** The bin's track (wide enough for its sway at the current level). */
  private drawTrack(): void {
    const { binX, binMinY, binMaxY } = BINBASKETBALL;
    const w = this.bin.radius + 24 + this.bin.drift;
    const key = `${Math.round(w)}`;
    if (key === this.trackKey) return;
    this.trackKey = key;
    const r = this.bin.radius + 24;
    this.trackG.clear().fillStyle(COLORS.dots, 1).fillRoundedRect(binX - w, binMinY - r, 2 * w, binMaxY - binMinY + 2 * r, r);
  }

  /** Where each ball last came down, with a thin line to where the bin was at that moment. */
  private drawMarks(): void {
    const g = this.markG.clear();
    for (const k of this.marks) {
      const f = 1 - k.age / BINBASKETBALL.landMarkMs;
      const col = PLAYER[k.player].main;
      if (!k.hit) {
        g.lineStyle(4, col, 0.5 * f);
        const n = 7;
        for (let i = 0; i < n; i += 2) {
          const a = i / n;
          const b = (i + 1) / n;
          g.lineBetween(k.x + (k.bx - k.x) * a, k.y + (k.by - k.y) * a, k.x + (k.bx - k.x) * b, k.y + (k.by - k.y) * b);
        }
      }
      g.lineStyle(8, col, 0.9 * f).strokeCircle(k.x, k.y, 26 + 10 * (1 - f));
      g.fillStyle(col, 0.5 * f).fillCircle(k.x, k.y, 9);
    }
  }

  /** Two wind socks (one near each player's far corner): the ribbon points where the wind blows, longer = stronger. */
  private drawWind(): void {
    const g = this.windG.clear();
    const s = Math.hypot(this.wind.x, this.wind.y);
    const top = levelDef(this.level).wind || 1;
    const strength = Math.min(1, s / Math.max(top, 1));
    for (const [cx, cy] of [[W / 2 - 440, 118], [W / 2 + 440, H - 118]] as const) {
      g.fillStyle(0x080e1a, 0.35).fillCircle(cx, cy, 44);
      g.lineStyle(4, COLORS.line, 0.9).strokeCircle(cx, cy, 44);
      if (s < 1) {
        g.fillStyle(COLORS.muted, 0.7).fillCircle(cx, cy, 8);
        continue;
      }
      const ang = Math.atan2(this.wind.y, this.wind.x);
      const len = 22 + 60 * strength;
      const t = this.time.now / 260;
      g.fillStyle(COLORS.text, 1).fillCircle(cx, cy, 8);
      let px = cx;
      let py = cy;
      for (let i = 1; i <= 6; i++) {
        const u = i / 6;
        const wob = Math.sin(t - u * 4) * 5 * u;
        const nx = cx + Math.cos(ang) * len * u - Math.sin(ang) * wob;
        const ny = cy + Math.sin(ang) * len * u + Math.cos(ang) * wob;
        g.lineStyle(16 * (1 - u * 0.5), 0xffb878, 0.95).lineBetween(px, py, nx, ny);
        px = nx;
        py = ny;
      }
      // arrow head at the tip so the direction reads at a glance
      g.fillStyle(0xffb878, 1).fillTriangle(px + Math.cos(ang) * 18, py + Math.sin(ang) * 18, px - Math.sin(ang) * 14, py + Math.cos(ang) * 14, px + Math.sin(ang) * 14, py - Math.cos(ang) * 14);
    }
  }

  private render(): void {
    this.drawAim();
    this.drawTrack();
    this.drawMarks();
    this.drawWind();
    const bin = binCentre(this.bin);
    this.binView.setPosition(bin.x, bin.y).setScale(this.bin.radius / BINBASKETBALL.binRadius);
    PLAYERS.forEach((p) => {
      const b = this.balls[p];
      const v = this.ballViews[p];
      v.setPosition(b.x, b.y).setScale(b.scale);
      v.setDepth(b.phase === 'flight' ? 25 : b.phase === 'sink' ? 9 : 20);
      const shadow = v.getData('shadow') as Phaser.GameObjects.Arc;
      shadow.setPosition(0, b.phase === 'flight' ? 14 + 40 * (b.scale - 0.8) : 6);
      // ready balls pulse a little to invite a flick
      if (b.phase === 'ready' && this.running) v.setScale(1 + 0.04 * Math.sin(this.time.now / 250));
    });
  }
}

import Phaser from 'phaser';
import { BaseGameScene } from '../../core/BaseGameScene';
import type { PlayerPointer } from '../../core/input/PlayerInput';
import { endAnchor, H, W } from '../../core/layout';
import { CARD, COLORS, PLAYER } from '../../core/theme';
import { PLAYERS, type PlayerId } from '../../core/types';
import { Sfx } from '../../core/audio/Sfx';
import { runCountdown } from '../../ui/Countdown';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { TRACK, TUGOFWAR, TUGOFWAR_STRINGS } from './config';
import { advance, createState, grabToken, isBoosted, markerX, reset, roundParams, roundTokens, tap, type TokenEvent, type TugParams, type TugState } from './logic';

type Phase = 'countdown' | 'play' | 'point' | 'over';

export class TugOfWarScene extends BaseGameScene {
  /** Simulation state (public so tests can poke it). */
  sim!: TugState;
  phase: Phase = 'countdown';
  round = 0;
  params: TugParams = roundParams(1);
  /** Power tokens of this round (the same for both players, mirrored). */
  tokens: TokenEvent[] = [];
  /** Per player: index of the token being shown / waiting, and whether it is up right now. */
  tokenIdx: [number, number] = [0, 0];
  tokenOn: [boolean, boolean] = [false, false];
  private seed = 1;
  private fx!: Phaser.GameObjects.Graphics;
  private steady: RotatedLabel[] = [];
  private marker!: Phaser.GameObjects.Container;
  private rope!: Phaser.GameObjects.Graphics;
  private hints: RotatedLabel[] = [];

  constructor() {
    super(TUGOFWAR.sceneKey, TUGOFWAR.id, TUGOFWAR.targetScore);
  }

  protected drawBackground(): void {
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg);
    const g = this.add.graphics();
    const m = 40;
    const r = CARD.radius + 10;
    g.fillStyle(0x080e1a, 0.3).fillRoundedRect(m, m + 14, W - 2 * m, H - 2 * m, r);
    g.fillStyle(COLORS.inset, 1).fillRoundedRect(m, m, W - 2 * m, H - 2 * m, r);
    // Each half is tinted for its player; the winning ends are bold.
    g.fillStyle(PLAYER[0].main, 0.1).fillRoundedRect(m, m, W / 2 - m, H - 2 * m, { tl: r, bl: r, tr: 0, br: 0 });
    g.fillStyle(PLAYER[1].main, 0.1).fillRoundedRect(W / 2, m, W / 2 - m, H - 2 * m, { tl: 0, bl: 0, tr: r, br: r });
    g.fillStyle(PLAYER[0].main, 0.35).fillRoundedRect(m, m, TRACK.x - m, H - 2 * m, { tl: r, bl: r, tr: 0, br: 0 });
    g.fillStyle(PLAYER[1].main, 0.35).fillRoundedRect(TRACK.x + TRACK.w, m, W - m - (TRACK.x + TRACK.w), H - 2 * m, { tl: 0, bl: 0, tr: r, br: r });
    // Ground stripe under the rope.
    g.fillStyle(COLORS.tile, 1).fillRoundedRect(TRACK.x, TRACK.y - 90, TRACK.w, 180, 40);
    g.lineStyle(6, COLORS.line, 1).lineBetween(W / 2, m, W / 2, H - m);
    for (let i = 1; i < 10; i++) g.fillStyle(COLORS.dots, 1).fillCircle(TRACK.x + (TRACK.w * i) / 10, TRACK.y + 70, 8);
  }

  protected onCreate(): void {
    this.running = true; // phases gate the taps
    this.phase = 'countdown';
    this.sim = createState();
    this.round = 0;
    this.seed = Math.floor(Math.random() * 1e6);
    this.rope = this.add.graphics().setDepth(5);
    this.fx = this.add.graphics().setDepth(8);
    this.marker = this.makeMarker();
    PLAYERS.forEach((p) => {
      const a = endAnchor(p, 160);
      this.badges[p].setPosition(a.x, a.y);
    });
    this.hints = PLAYERS.map((p) => {
      const a = endAnchor(p, 380, 0);
      return new RotatedLabel(this, a.x, a.y, TUGOFWAR_STRINGS.tap, p, { size: 150, color: PLAYER[p].onDark, stroke: COLORS.inset, display: true }).setDepth(20).setAlpha(0);
    });
    this.steady = PLAYERS.map((p) => {
      const a = endAnchor(p, 380, 0);
      return new RotatedLabel(this, a.x, a.y, TUGOFWAR_STRINGS.steady, p, { size: 130, color: 0xffd84d, stroke: COLORS.inset, display: true }).setDepth(20).setAlpha(0);
    });
    this.players.on('down', this.onDown, this);
    this.render();
    this.startCountdown();
  }

  private makeMarker(): Phaser.GameObjects.Container {
    const g = this.add.graphics();
    g.fillStyle(0x080e1a, 0.35).fillCircle(0, 10, TRACK.markerRadius);
    g.fillStyle(COLORS.puck, 1).fillCircle(0, 0, TRACK.markerRadius);
    g.lineStyle(8, COLORS.puckRing, 1).strokeCircle(0, 0, TRACK.markerRadius - 8);
    g.fillStyle(0xe5484d, 1).fillCircle(0, 0, 20);
    return this.add.container(0, TRACK.y, [g]).setDepth(10);
  }

  /** Test hook: seed the token schedule. */
  setSeed(n: number): void {
    this.seed = n;
    this.tokens = roundTokens(this.seed, this.round);
  }

  private startCountdown(): void {
    this.phase = 'countdown';
    this.round++;
    this.params = roundParams(this.round);
    this.tokens = roundTokens(this.seed, this.round);
    this.tokenIdx = [0, 0];
    this.tokenOn = [false, false];
    reset(this.sim);
    this.render();
    runCountdown(this, () => {
      if (this.phase === 'over') return;
      this.phase = 'play';
      this.hints.forEach((h) => {
        h.setAlpha(0.8);
        this.tweens.add({ targets: h, alpha: 0, delay: 900, duration: 400 });
      });
    });
  }

  protected onTick(_time: number, delta: number): void {
    if (this.phase === 'play') {
      advance(this.sim, Math.min(delta, 100), this.params);
      for (const p of PLAYERS) this.updateToken(p);
    }
    for (const p of PLAYERS) {
      const low = this.phase === 'play' && this.sim.energy[p] < 0.3;
      this.steady[p].setAlpha(low ? 0.9 : 0);
    }
    this.render();
  }

  /** Token position for a player: the schedule is for player 0's half, player 1 gets the mirror image. */
  tokenPos(p: PlayerId, ev: TokenEvent): { x: number; y: number } {
    return { x: p === 0 ? ev.x : W - ev.x, y: ev.y };
  }

  private updateToken(p: PlayerId): void {
    const ev = this.tokens[this.tokenIdx[p]];
    if (!ev) return;
    const t = this.sim.elapsed;
    if (!this.tokenOn[p] && t >= ev.at && t < ev.at + ev.life) {
      this.tokenOn[p] = true;
      Sfx.tone(988, 0.1, 'triangle', 0.1);
    } else if (t >= ev.at + ev.life) {
      this.tokenOn[p] = false;
      this.tokenIdx[p]++;
    }
  }

  private onDown(e: PlayerPointer): void {
    if (this.phase !== 'play') return;
    const p = e.player;
    const ev = this.tokens[this.tokenIdx[p]];
    if (this.tokenOn[p] && ev) {
      const c = this.tokenPos(p, ev);
      if (Math.hypot(e.x - c.x, e.y - c.y) <= TUGOFWAR.tokenRadius) {
        this.onToken(p, c);
        return;
      }
    }
    const w = tap(this.sim, p, this.time.now, this.params);
    Sfx.tick();
    this.bump(p);
    this.render();
    if (w !== null) this.onRound(w);
  }

  private onToken(p: PlayerId, c: { x: number; y: number }): void {
    this.tokenOn[p] = false;
    this.tokenIdx[p]++;
    const w = grabToken(this.sim, p, this.params);
    Sfx.tone(784, 0.1, 'triangle', 0.2);
    Sfx.tone(1175, 0.18, 'triangle', 0.2, 0.08);
    Sfx.vibrate([20, 20, 40]);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const dot = this.add.circle(c.x, c.y, 12, 0xffd84d, 1).setDepth(30);
      this.tweens.add({ targets: dot, x: c.x + Math.cos(a) * 150, y: c.y + Math.sin(a) * 150, alpha: 0, scale: 0.3, duration: 450, ease: 'Quad.Out', onComplete: () => dot.destroy() });
    }
    const l = new RotatedLabel(this, c.x, c.y, TUGOFWAR_STRINGS.power, p, { size: 110, color: 0xffd84d, stroke: COLORS.inset, display: true }).setDepth(40);
    this.tweens.add({ targets: l, alpha: 0, scale: { from: 0.6, to: 1.3 }, duration: 800, ease: 'Quad.Out', onComplete: () => l.destroy() });
    this.render();
    if (w !== null) this.onRound(w);
  }

  /** Little squash on the marker so every tap feels like a tug. */
  private bump(p: PlayerId): void {
    this.tweens.killTweensOf(this.marker);
    this.marker.setScale(1.12, 0.92);
    this.tweens.add({ targets: this.marker, scaleX: 1, scaleY: 1, duration: 120, ease: 'Quad.Out' });
    const a = endAnchor(p, 100 + Phaser.Math.Between(0, 40), Phaser.Math.Between(-300, 300));
    const dot = this.add.circle(a.x, a.y, 24, PLAYER[p].main, 0.5).setDepth(3);
    this.tweens.add({ targets: dot, scale: 2.5, alpha: 0, duration: 350, onComplete: () => dot.destroy() });
  }

  private onRound(winner: PlayerId): void {
    this.phase = 'point';
    this.tokenOn = [false, false];
    this.score(winner);
    const x = winner === 0 ? TRACK.x : TRACK.x + TRACK.w;
    const glow = this.add.circle(x, H / 2, 160, PLAYER[winner].main, 0.55).setDepth(40);
    this.tweens.add({ targets: glow, scale: 5, alpha: 0, duration: 800, onComplete: () => glow.destroy() });
    for (const p of PLAYERS) {
      const a = endAnchor(p, 380);
      const l = new RotatedLabel(this, a.x, a.y, TUGOFWAR_STRINGS.pull, p, { size: 200, color: PLAYER[winner].onDark, stroke: COLORS.inset, display: true }).setDepth(100);
      this.tweens.add({ targets: l, scale: { from: 0.4, to: 1.1 }, duration: 350, ease: 'Back.Out' });
      this.tweens.add({ targets: l, alpha: 0, delay: 700, duration: 300, onComplete: () => l.destroy() });
    }
    this.cameras.main.shake(180, 0.004);
    Sfx.vibrate([30, 30, 60]);
    if (this.match.over) {
      this.phase = 'over';
      return;
    }
    this.time.delayedCall(TUGOFWAR.roundPauseMs, () => this.startCountdown());
  }

  private render(): void {
    const mx = markerX(this.sim.pos, TRACK.x, TRACK.w);
    this.marker.setPosition(mx, TRACK.y);
    const g = this.rope.clear();
    const y = TRACK.y;
    // Rope: a thick tan line with twisted stripes, drawn in each player's colour on their side of the marker.
    g.lineStyle(26, 0xd9b982, 1).lineBetween(TRACK.x - 60, y, TRACK.x + TRACK.w + 60, y);
    for (let x = TRACK.x - 60; x < TRACK.x + TRACK.w + 60; x += 28) {
      g.lineStyle(5, 0xb08d57, 1).lineBetween(x, y - 11, x + 14, y + 11);
    }
    g.lineStyle(14, PLAYER[0].main, 1).lineBetween(TRACK.x - 60, y, mx - TRACK.markerRadius, y);
    g.lineStyle(14, PLAYER[1].main, 1).lineBetween(mx + TRACK.markerRadius, y, TRACK.x + TRACK.w + 60, y);
    // End lines.
    g.lineStyle(10, PLAYER[0].light, 1).lineBetween(TRACK.x, y - 120, TRACK.x, y + 120);
    g.lineStyle(10, PLAYER[1].light, 1).lineBetween(TRACK.x + TRACK.w, y - 120, TRACK.x + TRACK.w, y + 120);
    this.renderFx();
  }

  /** Stamina bars, power-boost glow and the power tokens. */
  private renderFx(): void {
    const g = this.fx.clear();
    const t = this.time.now;
    const play = this.phase === 'play';
    for (const p of PLAYERS) {
      const x0 = p === 0 ? 40 : TRACK.x + TRACK.w;
      const w = p === 0 ? TRACK.x - 40 : W - 40 - (TRACK.x + TRACK.w);
      if (play && isBoosted(this.sim, p)) {
        const k = 0.5 + 0.5 * Math.sin(t / 90);
        g.fillStyle(PLAYER[p].light, 0.06 + 0.06 * k).fillRect(x0, 80, w, H - 160);
        g.lineStyle(10, 0xffd84d, 0.45 + 0.4 * k).strokeRect(x0 + 5, 85, w - 10, H - 170);
      }
      // Stamina bar along the inside of the end zone: only shown once mashing has drained it a bit.
      const e = this.sim.energy[p];
      if (play && e < 0.97) {
        const bx = p === 0 ? TRACK.x - 38 : TRACK.x + TRACK.w + 18;
        const bh = 360;
        g.fillStyle(0x080e1a, 0.4).fillRoundedRect(bx, H / 2 - bh / 2, 20, bh, 10);
        g.fillStyle(e < 0.4 ? 0xe5484d : PLAYER[p].light, 1).fillRoundedRect(bx + 3, H / 2 + bh / 2 - 3 - (bh - 6) * e, 14, (bh - 6) * e, 7);
      }
      const ev = this.tokens[this.tokenIdx[p]];
      if (play && this.tokenOn[p] && ev) {
        const c = this.tokenPos(p, ev);
        const left = Math.max(0, 1 - (this.sim.elapsed - ev.at) / ev.life);
        const k = 0.5 + 0.5 * Math.sin(t / 120);
        g.fillStyle(0xffe38a, 0.3 + 0.2 * k).fillCircle(c.x, c.y, TUGOFWAR.tokenRadius * (0.9 + 0.12 * k));
        g.fillStyle(0xffc928, 1).fillCircle(c.x, c.y, 62);
        g.fillStyle(0xfff3b0, 1);
        const pts: Phaser.Geom.Point[] = [];
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const rr = i % 2 === 0 ? 50 : 22;
          pts.push(new Phaser.Geom.Point(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr));
        }
        g.fillPoints(pts, true);
        g.lineStyle(10, PLAYER[p].light, 0.9).beginPath().arc(c.x, c.y, 82, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left).strokePath();
      }
    }
  }
}

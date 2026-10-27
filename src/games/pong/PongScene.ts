import Phaser from 'phaser';
import { Sfx } from '../../core/audio/Sfx';
import { BaseGameScene } from '../../core/BaseGameScene';
import type { PlayerPointer } from '../../core/input/PlayerInput';
import { t } from '../../core/i18n';
import { endAnchor, H, W } from '../../core/layout';
import { COLORS, PLAYER } from '../../core/theme';
import { other, PLAYERS, type PlayerId } from '../../core/types';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { runCountdown } from '../../ui/Countdown';
import { FIELD, PONG } from './config';
import { createState, DEFAULT_PARAMS, matchProgress, movePaddles, paddleX, paramsFor, pickRound, serve, step, updatePillars, type PongParams, type PongState } from './logic';

type Phase = 'countdown' | 'play' | 'goal' | 'over';

export class PongScene extends BaseGameScene {
  /** Simulation state (public so tests and tuning can poke it). */
  sim!: PongState;
  phase: Phase = 'countdown';
  private fingers: [number | null, number | null] = [null, null];
  /** Target paddle centre y per player (finger y + the grab offset). */
  private targets: [number | null, number | null] = [null, null];
  /** paddle.y - finger.y at touch-down, so the paddle never jumps. */
  private grab: [number, number] = [0, 0];
  private paddleViews: Phaser.GameObjects.Container[] = [];
  private ballView!: Phaser.GameObjects.Arc;
  private trail!: Phaser.GameObjects.Graphics;
  private history: { x: number; y: number }[] = [];
  /** Physics for the current point (paddle size, speeds follow the match progress). */
  private params: PongParams = DEFAULT_PARAMS;
  private paddleGfx: Phaser.GameObjects.Graphics[] = [];
  private drawnPaddleH = -1;
  private extraView!: Phaser.GameObjects.Arc;
  private pillarG!: Phaser.GameObjects.Graphics;
  private pillarPop = 1;
  private clock = 0;

  constructor() {
    super(PONG.sceneKey, PONG.id, PONG.targetScore);
  }

  protected drawBackground(): void {
    const g = this.add.graphics();
    g.fillStyle(COLORS.bg, 1).fillRect(0, 0, W, H);
    g.fillStyle(0x080e1a, 0.3).fillRoundedRect(FIELD.x - 6, FIELD.y + 8, FIELD.w + 12, FIELD.h + 12, 36);
    g.fillStyle(COLORS.inset, 1).fillRoundedRect(FIELD.x, FIELD.y, FIELD.w, FIELD.h, 32);
    // each player's end gets a faint tint of their colour
    g.fillStyle(PLAYER[0].main, 0.08).fillRoundedRect(FIELD.x, FIELD.y, 150, FIELD.h, { tl: 32, bl: 32, tr: 0, br: 0 });
    g.fillStyle(PLAYER[1].main, 0.08).fillRoundedRect(FIELD.x + FIELD.w - 150, FIELD.y, 150, FIELD.h, { tl: 0, bl: 0, tr: 32, br: 32 });
    g.lineStyle(4, COLORS.line, 1).strokeRoundedRect(FIELD.x, FIELD.y, FIELD.w, FIELD.h, 32);
    // dashed centre line and circle
    g.fillStyle(COLORS.line, 0.7);
    for (let y = FIELD.y + 26; y < FIELD.y + FIELD.h - 30; y += 50) g.fillRoundedRect(W / 2 - 4, y, 8, 28, 4);
    g.lineStyle(4, COLORS.line, 0.5).strokeCircle(W / 2, H / 2, 120);
    // slim lanes the paddles slide in
    for (const p of PLAYERS) {
      g.fillStyle(PLAYER[p].main, 0.14).fillRoundedRect(paddleX(p) - 8, FIELD.y + 16, 16, FIELD.h - 32, 8);
    }
  }

  protected onCreate(): void {
    this.running = true; // phases gate the ball, so paddles stay live during countdowns
    this.phase = 'countdown';
    this.fingers = [null, null];
    this.targets = [null, null];
    this.grab = [0, 0];
    this.history = [];
    this.sim = createState();
    this.params = DEFAULT_PARAMS;
    this.clock = 0;
    this.pillarPop = 1;
    this.trail = this.add.graphics().setDepth(5);
    this.pillarG = this.add.graphics().setDepth(6);
    this.paddleGfx = [];
    this.drawnPaddleH = PONG.paddleH;
    this.paddleViews = PLAYERS.map((p) => this.makePaddle(p));
    this.ballView = this.add.circle(W / 2, H / 2, PONG.ballRadius, COLORS.puck).setStrokeStyle(6, COLORS.puckRing).setDepth(10);
    this.extraView = this.add.circle(W / 2, H / 2, PONG.ballRadius, COLORS.muted).setStrokeStyle(6, COLORS.puckRing).setDepth(10).setVisible(false);
    PLAYERS.forEach((p) => {
      const a = endAnchor(p, 90);
      this.badges[p].setPosition(a.x, a.y);
    });
    this.players.on('down', this.onDown, this);
    this.players.on('move', this.onMove, this);
    this.players.on('up', this.onUp, this);
    this.events.on('resume', this.releaseFingers, this);
    this.events.once('shutdown', () => this.events.off('resume', this.releaseFingers, this));
    this.render();
    this.startCountdown(null);
  }

  private makePaddle(p: PlayerId): Phaser.GameObjects.Container {
    const g = this.add.graphics();
    this.paddleGfx[p] = g;
    this.drawPaddle(p, PONG.paddleH);
    return this.add.container(paddleX(p), H / 2, [g]).setDepth(8);
  }

  private drawPaddle(p: PlayerId, h: number): void {
    const w = PONG.paddleW;
    const g = this.paddleGfx[p].clear();
    g.fillStyle(PLAYER[p].dark, 1).fillRoundedRect(-w / 2, -h / 2 + 6, w, h, w / 2);
    g.fillStyle(PLAYER[p].main, 1).fillRoundedRect(-w / 2, -h / 2, w, h, w / 2);
    g.fillStyle(PLAYER[p].light, 0.9).fillRoundedRect(-w / 2 + 7, -h / 2 + 14, 9, h - 28, 4);
  }

  private onDown(e: PlayerPointer): void {
    if (this.phase === 'over' || this.fingers[e.player] !== null) return;
    this.fingers[e.player] = e.id;
    this.grab[e.player] = this.sim.paddles[e.player].y - e.y;
    this.targets[e.player] = this.sim.paddles[e.player].y;
  }

  private onMove(e: PlayerPointer): void {
    if (this.fingers[e.player] === e.id) this.targets[e.player] = e.y + this.grab[e.player];
  }

  private onUp(e: PlayerPointer): void {
    if (this.fingers[e.player] !== e.id) return;
    this.fingers[e.player] = null;
    this.targets[e.player] = null;
  }

  private releaseFingers(): void {
    this.fingers = [null, null];
    this.targets = [null, null];
    this.players.tracker.clear();
  }

  private startCountdown(conceder: PlayerId | null): void {
    this.phase = 'countdown';
    this.history = [];
    // Every point is set up from the match progress: smaller paddles, faster balls, pillars, sometimes two balls.
    const progress = matchProgress(this.match.scores, this.match.target);
    this.params = paramsFor(progress);
    const round = pickRound(progress, Math.random, this.params);
    this.sim.pillars = round.pillars;
    updatePillars(this.sim, 0, 0);
    this.pillarPop = round.pillars.length ? 0 : 1;
    if (round.pillars.length) this.tweens.addCounter({ from: 0, to: 1, duration: 600, ease: 'Back.Out', onUpdate: (tw) => (this.pillarPop = tw.getValue() ?? 1) });
    if (this.params.paddleH !== this.drawnPaddleH) {
      this.drawnPaddleH = this.params.paddleH;
      PLAYERS.forEach((p) => this.drawPaddle(p, this.params.paddleH));
    }
    const server: PlayerId = conceder ?? (Math.random() < 0.5 ? 0 : 1);
    serve(this.sim, null, 0, Math.random, this.params, round.twin, server);
    this.render();
    runCountdown(this, () => {
      if (this.phase === 'over') return;
      this.phase = 'play';
      serve(this.sim, server, this.params.serveSpeed, Math.random, this.params, round.twin);
    });
  }

  protected onTick(_time: number, delta: number): void {
    this.clock += delta / 1000;
    if (this.phase === 'over') return;
    if (this.phase === 'play') {
      const r = step(this.sim, delta, this.targets, this.params);
      if (r.hit !== null) this.onHit(r.hit);
      else if (r.wall) Sfx.tone(300, 0.05, 'sine', 0.1);
      if (r.goal !== null) this.onGoal(r.goal);
    } else {
      movePaddles(this.sim, delta, this.targets, this.params);
    }
    this.render();
  }

  private onHit(p: PlayerId): void {
    Sfx.tone(480 + this.sim.hits * 25, 0.08, 'triangle', 0.22);
    Sfx.vibrate(10);
    const v = this.paddleViews[p];
    this.tweens.killTweensOf(v);
    v.setScale(1);
    this.tweens.add({ targets: v, scaleX: 1.5, scaleY: 0.94, duration: 70, yoyo: true, ease: 'Sine.Out' });
  }

  private onGoal(scorer: PlayerId): void {
    this.phase = 'goal';
    this.sim.ball.vx = 0;
    this.sim.ball.vy = 0;
    if (this.sim.extra) {
      this.sim.extra.vx = 0;
      this.sim.extra.vy = 0;
    }
    this.history = [];
    this.score(scorer);
    this.flash(scorer);
    if (this.match.over) {
      this.phase = 'over';
      return;
    }
    this.time.delayedCall(PONG.goalPauseMs, () => this.startCountdown(other(scorer)));
  }

  private flash(scorer: PlayerId): void {
    const conceded = other(scorer);
    const x = conceded === 0 ? FIELD.x : FIELD.x + FIELD.w;
    const glow = this.add.circle(x, this.sim.ball.y, 140, PLAYER[scorer].main, 0.55).setDepth(40);
    this.tweens.add({ targets: glow, scale: 5, alpha: 0, duration: 800, onComplete: () => glow.destroy() });
    const tint = this.add.rectangle(W / 2, H / 2, W, H, PLAYER[scorer].main, 0.18).setDepth(39);
    this.tweens.add({ targets: tint, alpha: 0, duration: 700, onComplete: () => tint.destroy() });
    for (const p of PLAYERS) {
      const a = endAnchor(p, 380);
      const l = new RotatedLabel(this, a.x, a.y, t('goal'), p, { size: 200, color: PLAYER[scorer].onDark, stroke: COLORS.inset, display: true }).setDepth(100);
      this.tweens.add({ targets: l, scale: { from: 0.4, to: 1.1 }, duration: 350, ease: 'Back.Out' });
      this.tweens.add({ targets: l, alpha: 0, delay: 650, duration: 300, onComplete: () => l.destroy() });
    }
    Sfx.vibrate([30, 30, 60]);
  }

  private drawPillars(): void {
    const g = this.pillarG.clear();
    const pop = Math.max(0.01, this.pillarPop);
    for (const pl of this.sim.pillars) {
      if (pl.amp > 0) {
        g.lineStyle(6, COLORS.line, 0.35);
        for (let y = pl.baseY - pl.amp; y < pl.baseY + pl.amp; y += 36) g.lineBetween(pl.x, y, pl.x, y + 16);
      }
      const r = pl.r * pop;
      const pulse = 1 + 0.04 * Math.sin(this.clock * 6);
      g.fillStyle(0x080e1a, 0.4).fillCircle(pl.x, pl.y + 10, r);
      g.fillStyle(COLORS.border, 1).fillCircle(pl.x, pl.y, r * pulse);
      g.fillStyle(COLORS.icon, 1).fillCircle(pl.x, pl.y, r * 0.78);
      g.fillStyle(COLORS.text, 0.9).fillCircle(pl.x, pl.y, r * 0.38);
    }
  }

  private render(): void {
    this.drawPillars();
    this.sim.paddles.forEach((p, i) => this.paddleViews[i].setY(p.y));
    const b = this.sim.ball;
    this.ballView.setPosition(b.x, b.y);
    const ex = this.sim.extra;
    this.extraView.setVisible(!!ex);
    if (ex) this.extraView.setPosition(ex.x, ex.y);
    this.history.push({ x: b.x, y: b.y });
    if (this.history.length > 8) this.history.shift();
    const g = this.trail.clear();
    if (Math.hypot(b.vx, b.vy) > 100) {
      this.history.forEach((h, i) => g.fillStyle(COLORS.puck, 0.03 + (0.1 * i) / 8).fillCircle(h.x, h.y, PONG.ballRadius * (0.5 + (0.45 * i) / 8)));
    }
  }
}

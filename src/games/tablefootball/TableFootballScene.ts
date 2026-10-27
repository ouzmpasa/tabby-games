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
import { PITCH, TABLEFOOTBALL, TABLEFOOTBALL_STRINGS } from './config';
import { settings } from '../../core/settings';
import {
  clampRod, createState, DEFAULT_PARAMS, figureY, matchProgress, moveRods, paramsFor, pickMode, serve, serveSpeedFor, setupPoint, step,
  type Params, type PointMode, type TableFootballState,
} from './logic';
import { makeBall, makeFigure } from './pieces';
import { ensurePitchTexture, PITCH_TEXTURE } from './pitchTexture';

type Phase = 'countdown' | 'play' | 'goal' | 'over';

interface Grab {
  id: number;
  /** One finger drives ALL of the player's rods; `offsets[i]` is finger y minus that rod's centre at touch-down, so rods do not jump. */
  rods: { rod: number; offset: number }[];
}

export class TableFootballScene extends BaseGameScene {
  /** Simulation state (public so tests and tuning can poke it). */
  sim!: TableFootballState;
  phase: Phase = 'countdown';
  /** The one finger that currently drives all of a player's rods. */
  private grabs: [Grab | null, Grab | null] = [null, null];
  /** Target centre per rod, null = stay. */
  private targets: (number | null)[] = [];
  private figureViews: Phaser.GameObjects.Container[][] = [];
  private ballView!: Phaser.GameObjects.Container;
  private trail!: Phaser.GameObjects.Graphics;
  private history: { x: number; y: number }[] = [];
  /** Physics for the current point (goal width, speeds follow the match progress and the point mode). */
  private params: Params = DEFAULT_PARAMS;
  private mode: PointMode = 'classic';
  private goalG!: Phaser.GameObjects.Graphics;
  private notes: Phaser.GameObjects.GameObject[] = [];

  constructor() {
    super(TABLEFOOTBALL.sceneKey, TABLEFOOTBALL.id, TABLEFOOTBALL.targetScore);
  }

  protected drawBackground(): void {
    ensurePitchTexture(this);
    this.add.image(W / 2, H / 2, PITCH_TEXTURE);
  }

  protected onCreate(): void {
    this.running = true; // phases (not `running`) gate the ball, so rods stay live during countdowns
    this.phase = 'countdown';
    this.grabs = [null, null];
    this.sim = createState();
    this.targets = this.sim.rods.map(() => null);
    this.history = [];
    this.params = DEFAULT_PARAMS;
    this.mode = 'classic';
    this.notes = [];
    this.goalG = this.add.graphics().setDepth(4);
    this.trail = this.add.graphics().setDepth(5);
    this.figureViews = this.sim.rods.map((r) => r.offsets.map(() => makeFigure(this, r.player)));
    this.ballView = makeBall(this);
    PLAYERS.forEach((p) => {
      const a = endAnchor(p, 160);
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

  /** One finger moves all of its player's rods together, keeping each rod's offset from the finger. */
  private onDown(e: PlayerPointer): void {
    if (this.phase === 'over' || this.grabs[e.player] !== null) return;
    const rods: Grab['rods'] = [];
    this.sim.rods.forEach((r, i) => {
      if (r.player === e.player) rods.push({ rod: i, offset: e.y - r.y });
    });
    this.grabs[e.player] = { id: e.id, rods };
    rods.forEach(({ rod }) => this.setGlow(rod, true));
    this.onMove(e);
  }

  private onMove(e: PlayerPointer): void {
    const g = this.grabs[e.player];
    if (g && g.id === e.id) g.rods.forEach(({ rod, offset }) => (this.targets[rod] = clampRod(this.sim.rods[rod], e.y - offset)));
  }

  private onUp(e: PlayerPointer): void {
    const g = this.grabs[e.player];
    if (!g || g.id !== e.id) return;
    g.rods.forEach(({ rod }) => {
      this.targets[rod] = null;
      this.setGlow(rod, false);
    });
    this.grabs[e.player] = null;
  }

  private releaseFingers(): void {
    this.grabs = [null, null];
    this.targets = this.sim.rods.map(() => null);
    this.sim.rods.forEach((_, i) => this.setGlow(i, false));
    this.players.tracker.clear();
  }

  private setGlow(rod: number, on: boolean): void {
    this.figureViews[rod].forEach((f) => (f.getByName('glow') as Phaser.GameObjects.Arc).setVisible(on));
  }

  private startCountdown(conceder: PlayerId | null): void {
    this.phase = 'countdown';
    // Every point is set up from the match progress: narrower goals, a faster ball and maybe a special point.
    const progress = matchProgress(this.match.scores, this.match.target);
    this.mode = pickMode(progress);
    this.params = paramsFor(progress, this.mode);
    setupPoint(this.sim, this.mode, progress, Math.random, this.params);
    serve(this.sim, null, 0);
    this.announce();
    this.render();
    const server: PlayerId = conceder ?? (Math.random() < 0.5 ? 0 : 1);
    runCountdown(this, () => {
      if (this.phase === 'over') return;
      this.phase = 'play';
      serve(this.sim, server, serveSpeedFor(progress, this.mode), this.params);
      this.clearNotes();
    });
  }

  private clearNotes(): void {
    this.notes.forEach((n) => n.destroy());
    this.notes = [];
  }

  /** Tells both players (each facing them) what is special about this point. */
  private announce(): void {
    this.clearNotes();
    if (this.mode === 'classic') return;
    const lang = settings.get().lang === 'nl' ? 'nl' : 'en';
    const text = TABLEFOOTBALL_STRINGS[this.mode][lang];
    for (const p of PLAYERS) {
      const a = endAnchor(p, 530); // in the gap between keeper and defence, clear of the figures
      const l = new RotatedLabel(this, a.x, a.y, text, p, { size: 54, color: this.mode === 'sweep' ? PLAYER[p].onDark : 0xffd36b, stroke: COLORS.inset, display: true }).setDepth(60);
      this.tweens.add({ targets: l, scale: { from: 0.5, to: 1 }, duration: 350, ease: 'Back.Out' });
      this.notes.push(l);
    }
  }

  protected onTick(_time: number, delta: number): void {
    if (this.phase === 'over') return;
    if (this.phase === 'play') {
      const r = step(this.sim, delta, this.targets, this.params);
      if (r.goal !== null) this.onGoal(r.goal);
    } else {
      moveRods(this.sim, delta, this.targets, this.params);
    }
    this.render();
  }

  private onGoal(scorer: PlayerId): void {
    this.phase = 'goal';
    this.sim.ball.vx = 0;
    this.sim.ball.vy = 0;
    this.history = [];
    this.score(scorer);
    this.flash(scorer);
    if (this.match.over) {
      this.phase = 'over';
      return;
    }
    this.time.delayedCall(TABLEFOOTBALL.goalPauseMs, () => this.startCountdown(other(scorer)));
  }

  /** Goal celebration: coloured glow over the goal that was hit, "GOAL!" toward both players. */
  private flash(scorer: PlayerId): void {
    const conceded = other(scorer);
    const x = conceded === 0 ? PITCH.x : PITCH.x + PITCH.w;
    const glow = this.add.circle(x, this.sim.goalY[conceded], 160, PLAYER[scorer].main, 0.55).setDepth(40);
    this.tweens.add({ targets: glow, scale: 5, alpha: 0, duration: 800, onComplete: () => glow.destroy() });
    const tint = this.add.rectangle(W / 2, H / 2, W, H, PLAYER[scorer].main, 0.18).setDepth(39);
    this.tweens.add({ targets: tint, alpha: 0, duration: 700, onComplete: () => tint.destroy() });
    for (const p of PLAYERS) {
      const a = endAnchor(p, 380);
      const l = new RotatedLabel(this, a.x, a.y, t('goal'), p, { size: 200, color: PLAYER[scorer].onDark, stroke: COLORS.inset, display: true }).setDepth(100);
      this.tweens.add({ targets: l, scale: { from: 0.4, to: 1.1 }, duration: 350, ease: 'Back.Out' });
      this.tweens.add({ targets: l, alpha: 0, delay: 700, duration: 300, onComplete: () => l.destroy() });
    }
    this.cameras.main.shake(180, 0.004);
    Sfx.vibrate([30, 30, 60]);
  }

  /** The goal mouths: a bar in the owner's colour on the end line, as wide as the (current) opening. */
  private drawGoals(): void {
    const g = this.goalG.clear();
    const gw = this.params.goalWidth;
    for (const p of PLAYERS) {
      const col = PLAYER[p].main;
      const ex = p === 0 ? PITCH.x : PITCH.x + PITCH.w;
      const y = this.sim.goalY[p];
      for (let i = 3; i >= 1; i--) g.fillStyle(col, 0.08).fillRoundedRect(p === 0 ? ex - 8 * i : ex, y - gw / 2 - 2 * i, 8 * i, gw + 4 * i, 4);
      g.fillStyle(col, 1).fillRoundedRect(p === 0 ? ex - 8 : ex, y - gw / 2, 8, gw, 4);
    }
  }

  private render(): void {
    this.drawGoals();
    this.sim.rods.forEach((r, i) => this.figureViews[i].forEach((f, j) => f.setPosition(r.x, figureY(r, j))));
    const b = this.sim.ball;
    this.ballView.setPosition(b.x, b.y);
    this.history.push({ x: b.x, y: b.y });
    if (this.history.length > 7) this.history.shift();
    const g = this.trail.clear();
    if (Math.hypot(b.vx, b.vy) > 350) {
      const hot = this.mode === 'turbo' || this.mode === 'combo' ? 0xffd36b : COLORS.puck;
      this.history.forEach((h, i) => g.fillStyle(hot, 0.03 + (0.1 * i) / 7).fillCircle(h.x, h.y, TABLEFOOTBALL.ballRadius * (0.5 + (0.4 * i) / 7)));
    }
  }
}

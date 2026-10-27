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
import { AIRHOCKEY, RINK } from './config';
import { createState, DEFAULT_PARAMS, matchProgress, moveMallets, paramsFor, pickBumpers, serve, serveSpeedFor, step, updateBumpers, type AirHockeyState, type Params, type Target } from './logic';
import { makeMallet, makePuck } from './pieces';
import { ensureRinkTexture, RINK_TEXTURE } from './rinkTexture';

type Phase = 'countdown' | 'play' | 'goal' | 'over';

export class AirHockeyScene extends BaseGameScene {
  /** Simulation state (public so tests and tuning can poke it). */
  sim!: AirHockeyState;
  phase: Phase = 'countdown';
  /** The one finger (pointer id) that currently drives each player's mallet. */
  private fingers: [number | null, number | null] = [null, null];
  private targets: [Target | null, Target | null] = [null, null];
  private malletViews: Phaser.GameObjects.Container[] = [];
  private puckView!: Phaser.GameObjects.Container;
  private trail!: Phaser.GameObjects.Graphics;
  private history: Target[] = [];
  /** Physics for the current point (goal width follows the match progress). */
  private params: Params = DEFAULT_PARAMS;
  private goalG!: Phaser.GameObjects.Graphics;
  private bumperG!: Phaser.GameObjects.Graphics;
  private drawnGoalWidth = -1;
  private clock = 0;
  /** 0..1 pop-in of the bumpers at the start of a point. */
  private bumperPop = 1;
  private lastHitSfx = 0;

  constructor() {
    super(AIRHOCKEY.sceneKey, AIRHOCKEY.id, AIRHOCKEY.targetScore);
  }

  protected drawBackground(): void {
    ensureRinkTexture(this);
    this.add.image(W / 2, H / 2, RINK_TEXTURE);
  }

  protected onCreate(): void {
    this.running = true; // phases (not `running`) gate the puck, so mallets stay live during countdowns
    this.phase = 'countdown';
    this.fingers = [null, null];
    this.targets = [null, null];
    this.history = [];
    this.sim = createState();
    this.params = DEFAULT_PARAMS;
    this.drawnGoalWidth = -1;
    this.clock = 0;
    this.bumperPop = 1;
    this.goalG = this.add.graphics().setDepth(3);
    this.bumperG = this.add.graphics().setDepth(6);
    this.trail = this.add.graphics().setDepth(5);
    this.malletViews = PLAYERS.map((p) => makeMallet(this, p));
    this.puckView = makePuck(this);
    // Score badges sit in the end margins, like the mockup.
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

  private onDown(e: PlayerPointer): void {
    if (this.phase === 'over' || this.fingers[e.player] !== null) return; // one mallet finger per player
    this.fingers[e.player] = e.id;
    this.targets[e.player] = { x: e.x, y: e.y };
  }

  private onMove(e: PlayerPointer): void {
    if (this.fingers[e.player] === e.id) this.targets[e.player] = { x: e.x, y: e.y };
  }

  private onUp(e: PlayerPointer): void {
    if (this.fingers[e.player] !== e.id) return;
    this.fingers[e.player] = null;
    this.targets[e.player] = null;
  }

  /** After a pause the old touches are gone from this scene's point of view; start clean. */
  private releaseFingers(): void {
    this.fingers = [null, null];
    this.targets = [null, null];
    this.players.tracker.clear();
  }

  private startCountdown(conceder: PlayerId | null): void {
    this.phase = 'countdown';
    // Every point is set up from the match progress: narrower goals, a faster serve and maybe a bumper table.
    const progress = matchProgress(this.match.scores, this.match.target);
    this.params = paramsFor(progress);
    this.sim.bumpers = pickBumpers(progress, Math.random, this.params);
    updateBumpers(this.sim, 0, 0);
    this.bumperPop = this.sim.bumpers.length ? 0 : 1;
    if (this.sim.bumpers.length) this.tweens.addCounter({ from: 0, to: 1, duration: 600, ease: 'Back.Out', onUpdate: (tw) => (this.bumperPop = tw.getValue() ?? 1) });
    const server: PlayerId = conceder ?? (Math.random() < 0.5 ? 0 : 1);
    serve(this.sim, null, 0, this.params, server);
    this.render();
    runCountdown(this, () => {
      if (this.phase === 'over') return;
      this.phase = 'play';
      serve(this.sim, server, serveSpeedFor(progress), this.params);
    });
  }

  protected onTick(_time: number, delta: number): void {
    this.clock += delta / 1000;
    if (this.phase === 'over') return;
    if (this.phase === 'play') {
      const r = step(this.sim, delta, this.targets, this.params);
      if (r.hit && this.clock - this.lastHitSfx > 0.08) {
        this.lastHitSfx = this.clock;
        Sfx.tone(260 + Math.min(10, this.sim.rally) * 30, 0.05, 'triangle', 0.12);
      }
      if (r.goal !== null) this.onGoal(r.goal);
    } else {
      moveMallets(this.sim, delta, this.targets, this.params);
    }
    this.render();
  }

  private onGoal(scorer: PlayerId): void {
    this.phase = 'goal';
    this.sim.puck.vx = 0;
    this.sim.puck.vy = 0;
    this.history = [];
    this.score(scorer); // badge, sound, vibration; switches to Win when the target is reached
    this.flash(scorer);
    if (this.match.over) {
      this.phase = 'over';
      return;
    }
    this.time.delayedCall(AIRHOCKEY.goalPauseMs, () => this.startCountdown(other(scorer)));
  }

  /** Goal celebration: coloured glow over the goal that was hit, "GOAL!" toward both players. */
  private flash(scorer: PlayerId): void {
    const conceded = other(scorer);
    const x = conceded === 0 ? RINK.x : RINK.x + RINK.w;
    const glow = this.add.circle(x, H / 2, 160, PLAYER[scorer].main, 0.55).setDepth(40);
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

  /** Walls that narrow the goal mouths: cover the outer parts of the printed goal and cap the ends in the player's colour. */
  private drawGoals(): void {
    const gw = this.params.goalWidth;
    if (gw === this.drawnGoalWidth) return;
    this.drawnGoalWidth = gw;
    const g = this.goalG.clear();
    const cy = RINK.y + RINK.h / 2;
    const full = AIRHOCKEY.goalWidth;
    if (gw >= full) return;
    const cover = (full - gw) / 2;
    for (const p of PLAYERS) {
      const ex = p === 0 ? RINK.x : RINK.x + RINK.w;
      g.fillStyle(COLORS.tile, 1);
      g.fillRoundedRect(ex - 16, cy - full / 2 - 8, 32, cover + 8, 6);
      g.fillRoundedRect(ex - 16, cy + gw / 2, 32, cover + 8, 6);
      g.fillStyle(PLAYER[p].main, 1);
      g.fillCircle(ex, cy - gw / 2, 9);
      g.fillCircle(ex, cy + gw / 2, 9);
    }
  }

  private drawBumpers(): void {
    const g = this.bumperG.clear();
    const pop = Math.max(0.01, this.bumperPop);
    for (const b of this.sim.bumpers) {
      if (b.amp > 0) {
        g.lineStyle(6, COLORS.line, 0.35);
        for (let y = b.baseY - b.amp; y < b.baseY + b.amp; y += 36) g.lineBetween(b.x, y, b.x, y + 16);
      }
      const r = b.r * pop;
      const pulse = 1 + 0.04 * Math.sin(this.clock * 6);
      g.fillStyle(0x080e1a, 0.4).fillCircle(b.x, b.y + 10, r);
      g.fillStyle(COLORS.border, 1).fillCircle(b.x, b.y, r * pulse);
      g.fillStyle(COLORS.icon, 1).fillCircle(b.x, b.y, r * 0.78);
      g.fillStyle(COLORS.text, 0.9).fillCircle(b.x, b.y, r * 0.38);
      g.lineStyle(4, COLORS.text, 0.6).strokeCircle(b.x, b.y, r * 0.58);
    }
  }

  private render(): void {
    this.drawGoals();
    this.drawBumpers();
    this.sim.mallets.forEach((m, i) => this.malletViews[i].setPosition(m.x, m.y));
    const pk = this.sim.puck;
    this.puckView.setPosition(pk.x, pk.y);
    this.history.push({ x: pk.x, y: pk.y });
    if (this.history.length > 7) this.history.shift();
    const g = this.trail.clear();
    if (Math.hypot(pk.vx, pk.vy) > 350) {
      this.history.forEach((h, i) => g.fillStyle(COLORS.puck, 0.03 + (0.1 * i) / 7).fillCircle(h.x, h.y, AIRHOCKEY.puckRadius * (0.5 + (0.4 * i) / 7)));
    }
  }
}

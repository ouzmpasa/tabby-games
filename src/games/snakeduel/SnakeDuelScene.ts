import Phaser from 'phaser';
import { Sfx } from '../../core/audio/Sfx';
import { BaseGameScene } from '../../core/BaseGameScene';
import type { PlayerPointer } from '../../core/input/PlayerInput';
import { settings } from '../../core/settings';
import { endAnchor, H, W } from '../../core/layout';
import { COLORS, PLAYER } from '../../core/theme';
import { other, PLAYERS, type PlayerId } from '../../core/types';
import { runCountdown } from '../../ui/Countdown';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { SNAKE, SNAKE_STRINGS } from './config';
import { arenaAt, arenaInset, createState, DEFAULT_PARAMS, insideArena, matchProgress, paramsFor, reset, step, type Params, type SnakeState, type Targets } from './logic';
import { drawArena, drawFruits, drawRocks, drawSnake } from './pieces';

type Phase = 'countdown' | 'play' | 'crash' | 'over';

export class SnakeDuelScene extends BaseGameScene {
  /** Simulation state (public so tests can poke it). */
  sim!: SnakeState;
  phase: Phase = 'countdown';
  /** The one finger (pointer id) that currently steers each snake. */
  private fingers: [number | null, number | null] = [null, null];
  private targets: Targets = [null, null];
  private arenaG!: Phaser.GameObjects.Graphics;
  private fruitG!: Phaser.GameObjects.Graphics;
  private rockG!: Phaser.GameObjects.Graphics;
  /** Rules of the current round (speed, rocks and special fruit follow the match progress). */
  private params: Params = DEFAULT_PARAMS;
  private snakeG!: Phaser.GameObjects.Graphics;
  private pointerG!: Phaser.GameObjects.Graphics;
  private clock = 0;
  private fade = 1;
  private drawnInset = -1;

  constructor() {
    super(SNAKE.sceneKey, SNAKE.id, SNAKE.targetScore);
  }

  protected drawBackground(): void {
    const g = this.add.graphics();
    g.fillStyle(COLORS.bg, 1).fillRect(0, 0, W, H);
    g.fillStyle(PLAYER[0].main, 0.05).fillRect(0, 0, W / 2, H);
    g.fillStyle(PLAYER[1].main, 0.05).fillRect(W / 2, 0, W / 2, H);
  }

  protected onCreate(): void {
    this.running = true; // phases gate the simulation
    this.phase = 'countdown';
    this.fingers = [null, null];
    this.targets = [null, null];
    this.clock = 0;
    this.fade = 1;
    this.drawnInset = -1;
    this.params = DEFAULT_PARAMS;
    this.sim = createState();
    this.arenaG = this.add.graphics().setDepth(1);
    this.fruitG = this.add.graphics().setDepth(5);
    this.rockG = this.add.graphics().setDepth(6);
    this.snakeG = this.add.graphics().setDepth(10);
    this.pointerG = this.add.graphics().setDepth(20);
    PLAYERS.forEach((p) => {
      const a = endAnchor(p, 90);
      this.badges[p].setPosition(a.x, a.y);
    });
    this.players.on('down', this.onDown, this);
    this.players.on('move', this.onMove, this);
    this.players.on('up', this.onUp, this);
    this.events.on('resume', this.releaseFingers, this);
    this.events.once('shutdown', () => this.events.off('resume', this.releaseFingers, this));
    this.render(); // the base class runs the first 3-2-1; onStart() begins play
  }

  protected onStart(): void {
    if (this.phase === 'countdown') this.phase = 'play';
  }

  private onDown(e: PlayerPointer): void {
    if (this.phase === 'over' || this.fingers[e.player] !== null) return; // one finger per player
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

  private releaseFingers(): void {
    this.fingers = [null, null];
    this.targets = [null, null];
    this.players.tracker.clear();
  }

  private startCountdown(): void {
    this.phase = 'countdown';
    // Every round is set up from the match progress: faster snakes, rocks, special fruit.
    this.params = paramsFor(matchProgress(this.match.scores, this.match.target));
    reset(this.sim, this.params);
    this.drawnInset = -1;
    this.fade = 1;
    this.render();
    runCountdown(this, () => {
      if (this.phase !== 'over') this.phase = 'play';
    });
  }

  protected onTick(_time: number, delta: number): void {
    this.clock += delta / 1000;
    if (this.phase === 'play') {
      const r = step(this.sim, delta, this.targets, this.params);
      if (r.ate.length) {
        Sfx.tone(r.kinds.includes('gold') ? 880 : r.kinds.includes('trim') ? 740 : 660, 0.1, 'sine', 0.2);
        r.ate.forEach((p) => this.pop(p));
      }
      if (r.landed) {
        Sfx.tone(120, 0.18, 'square', 0.18);
        this.cameras.main.shake(90, 0.002);
      }
      if (r.losers) this.onCrash(r.losers);
    } else if (this.phase === 'crash') {
      this.fade = Math.max(0.25, this.fade - delta / 900);
    }
    this.render();
  }

  private pop(p: PlayerId): void {
    const s = this.sim.snakes[p];
    const ring = this.add.circle(s.x, s.y, 30, PLAYER[p].light, 0.5).setDepth(15);
    this.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 350, onComplete: () => ring.destroy() });
  }

  private onCrash(losers: PlayerId[]): void {
    this.phase = 'crash';
    Sfx.tone(180, 0.4, 'sawtooth', 0.15);
    Sfx.vibrate([20, 20, 40]);
    const draw = losers.length === 2;
    if (!draw) this.score(other(losers[0]));
    this.flash(draw ? null : other(losers[0]), draw);
    if (this.match.over) {
      this.phase = 'over';
      return;
    }
    this.time.delayedCall(SNAKE.roundPauseMs, () => this.startCountdown());
  }

  /** Round result, shown to both players facing them. */
  private flash(winner: PlayerId | null, draw: boolean): void {
    const lang = settings.get().lang === 'nl' ? 'nl' : 'en';
    const tint = this.add.rectangle(W / 2, H / 2, W, H, winner === null ? 0xffffff : PLAYER[winner].main, 0.16).setDepth(39);
    this.tweens.add({ targets: tint, alpha: 0, duration: 800, onComplete: () => tint.destroy() });
    for (const p of PLAYERS) {
      const a = endAnchor(p, 380);
      const text = draw ? SNAKE_STRINGS.draw[lang] : SNAKE_STRINGS.crash[lang];
      const color = winner === null ? COLORS.text : PLAYER[other(winner)].onDark;
      const l = new RotatedLabel(this, a.x, a.y, text, p, { size: 200, color, stroke: COLORS.inset, display: true }).setDepth(100);
      this.tweens.add({ targets: l, scale: { from: 0.4, to: 1.1 }, duration: 350, ease: 'Back.Out' });
      this.tweens.add({ targets: l, alpha: 0, delay: 800, duration: 300, onComplete: () => l.destroy() });
    }
    this.cameras.main.shake(160, 0.003);
  }

  private render(): void {
    const s = this.sim;
    const inset = arenaInset(s.time, this.params);
    const full = arenaAt(0);
    if (Math.abs(inset - this.drawnInset) > 0.5) {
      this.drawnInset = inset;
      drawArena(this.arenaG, arenaAt(inset), full, Math.min(1, inset / 60));
    }
    drawFruits(this.fruitG.clear(), s.fruits, this.clock);
    const floor = arenaAt(inset);
    drawRocks(this.rockG, s.rocks, s.time, this.params.rockWarnSec, (rk) => insideArena(floor, rk.x, rk.y, rk.r), this.clock);
    const sg = this.snakeG.clear();
    const pg = this.pointerG.clear();
    s.snakes.forEach((sn, i) => {
      const p = i as PlayerId;
      const crashed = s.losers.includes(p);
      // Blink while harmless at the start of a round (during the countdown the snakes just sit there, solid).
      const blink = this.phase === 'play' && s.time < SNAKE.spawnInvulnSec && Math.floor(this.clock * 8) % 2 === 0;
      const alpha = crashed ? this.fade : blink ? 0.45 : 1;
      drawSnake(sg, sn, p, this.clock, alpha, crashed);
      const t = this.targets[i];
      if (t) {
        const c = PLAYER[p];
        pg.lineStyle(6, c.light, 0.3).lineBetween(sn.x, sn.y, t.x, t.y);
        pg.fillStyle(c.main, 0.3).fillCircle(t.x, t.y, 46);
        pg.lineStyle(7, c.light, 0.9).strokeCircle(t.x, t.y, 46);
      }
    });
  }
}


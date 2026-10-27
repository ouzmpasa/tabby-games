import Phaser from 'phaser';
import { Sfx } from '../../core/audio/Sfx';
import { BaseGameScene } from '../../core/BaseGameScene';
import { endAnchor, H, W } from '../../core/layout';
import { settings } from '../../core/settings';
import { CARD, COLORS, PLAYER } from '../../core/theme';
import { other, PLAYERS, type PlayerId } from '../../core/types';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { TimerRing, TurnClock } from '../connect4/turnTimer';
import { boardLayout, DOTSBOXES, roundRules, type BoardLayout, type RoundRules } from './config';
import { createGame, edgeEnds, isOver, nearestEdge, passTurn, pickGolden, play, pointsOf, roundNotes, wouldComplete, winner, type Game, type Note } from './logic';

type Phase = 'intro' | 'play' | 'over';

/** Everything a player reads (hardcoded, like the other games' labels). */
export const TEXT = {
  en: {
    turn: 'Your turn!',
    round: 'Round',
    size: (d: number) => `Bigger board! ${d} x ${d} dots`,
    golden: 'Golden boxes are worth 3!',
    timer: (s: number) => `Hurry! ${s} seconds a move`,
  },
  nl: {
    turn: 'Jouw beurt!',
    round: 'Ronde',
    size: (d: number) => `Groter bord! ${d} x ${d} stippen`,
    golden: 'Gouden vakjes zijn 3 waard!',
    timer: (s: number) => `Opschieten! ${s} seconden per zet`,
  },
} as const;
const txt = () => TEXT[settings.get().lang === 'nl' ? 'nl' : 'en'];

const RING_R = 56;
const DOT_Y = -52;

export class DotsBoxesScene extends BaseGameScene {
  game_!: Game;
  phase: Phase = 'play';
  /** Who opens the current round (loser of the last one; alternates after a tie). */
  starter: PlayerId = 0;
  /** 0-based round counter; every round (also a tie) escalates the rules. */
  roundNo = 0;
  rules!: RoundRules;
  readonly clock = new TurnClock();
  private L: BoardLayout = boardLayout(4);
  private panels: Phaser.GameObjects.Container[] = [];
  private rings: TimerRing[] = [];
  private counts: RotatedLabel[] = [];
  private lines!: Phaser.GameObjects.Graphics;
  private preview!: Phaser.GameObjects.Graphics;
  private frame!: Phaser.GameObjects.Graphics;
  private boardObjs: Phaser.GameObjects.GameObject[] = [];
  private fills: (Phaser.GameObjects.Graphics | null)[] = [];
  private stars: (Phaser.GameObjects.Star | null)[] = [];
  private banner: Phaser.GameObjects.GameObject[] = [];
  private pulse?: Phaser.Tweens.Tween;
  private aimed = -1;
  private touching = false;

  constructor() {
    super(DOTSBOXES.sceneKey, DOTSBOXES.id, DOTSBOXES.targetScore);
  }

  protected drawBackground(): void {
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg);
    const g = this.add.graphics();
    const m = 40;
    const r = CARD.radius + 10;
    g.fillStyle(0x080e1a, 0.3).fillRoundedRect(m, m + 14, W - 2 * m, H - 2 * m, r);
    g.fillStyle(COLORS.inset, 1).fillRoundedRect(m, m, W - 2 * m, H - 2 * m, r);
    g.fillStyle(PLAYER[0].main, 0.12).fillRoundedRect(m, m, 440, H - 2 * m, { tl: r, bl: r, tr: 0, br: 0 });
    g.fillStyle(PLAYER[1].main, 0.12).fillRoundedRect(W - m - 440, m, 440, H - 2 * m, { tl: 0, bl: 0, tr: r, br: r });
  }

  protected onCreate(): void {
    this.running = false;
    this.roundNo = 0;
    this.starter = Math.random() < 0.5 ? 0 : 1;
    this.boardObjs = [];
    this.banner = [];
    this.aimed = -1;
    this.touching = false;
    this.frame = this.add.graphics().setDepth(2);
    this.lines = this.add.graphics().setDepth(4);
    this.preview = this.add.graphics().setDepth(6);
    this.panels = PLAYERS.map((p) => this.makeTurnPanel(p));
    this.counts = PLAYERS.map((p) => this.makeCounter(p));
    this.input.on('pointerdown', this.onDown, this);
    this.input.on('pointermove', this.onMove, this);
    this.input.on('pointerup', this.onUp, this);
    this.events.once('shutdown', () => {
      this.input.off('pointerdown', this.onDown, this);
      this.input.off('pointermove', this.onMove, this);
      this.input.off('pointerup', this.onUp, this);
    });
    this.setupRound(false);
  }

  protected onStart(): void {
    if (this.phase === 'play') this.startClock();
  }

  // ---------------------------------------------------------------- layout

  private px = (x: number): number => this.L.x + x * this.L.spacing;
  private py = (y: number): number => this.L.y + y * this.L.spacing;

  /** Builds the board for the current round. `announce`: show the "what's new" banner first. */
  private setupRound(announce: boolean): void {
    const prev = this.roundNo > 0 ? roundRules(this.roundNo - 1) : null;
    this.rules = roundRules(this.roundNo);
    this.L = boardLayout(this.rules.boxes);
    const n = this.rules.boxes;
    this.game_ = createGame(n, this.starter, pickGolden(Math.random, n, this.rules.golden));
    this.fills.forEach((f) => f?.destroy());
    this.stars.forEach((st) => {
      if (st) this.tweens.killTweensOf(st);
      st?.destroy();
    });
    this.fills = new Array(n * n).fill(null);
    this.stars = new Array(n * n).fill(null);
    this.lines.clear();
    this.preview.clear();
    this.counts.forEach((c) => c.setText('0'));
    this.boardObjs.forEach((o) => o.destroy());
    this.boardObjs = [];
    this.drawBoard();
    const notes = announce ? roundNotes(prev, this.rules) : [];
    if (notes.length) {
      this.phase = 'intro';
      this.clock.stop();
      this.refreshTurn();
      this.showBanner(notes);
    } else {
      this.phase = 'play';
      this.refreshTurn();
    }
  }

  private drawBoard(): void {
    const { margin: m, span, spacing, lineWidth, dotRadius } = this.L;
    const n = this.rules.boxes;
    const back = this.add.graphics().setDepth(1);
    back.fillStyle(0x080e1a, 0.35).fillRoundedRect(this.L.x - m, this.L.y - m + 14, span + 2 * m, span + 2 * m, 28);
    back.fillStyle(COLORS.surface, 1).fillRoundedRect(this.L.x - m, this.L.y - m, span + 2 * m, span + 2 * m, 28);
    // faint guide lines so the empty edges are visible targets
    back.lineStyle(lineWidth - 6, COLORS.line, 0.45);
    for (let e = 0; e < this.game_.edges.length; e++) {
      const [a, b] = edgeEnds(n, e);
      back.lineBetween(this.px(a.x), this.py(a.y), this.px(b.x), this.py(b.y));
    }
    const dots = this.add.graphics().setDepth(8);
    for (let r = 0; r <= n; r++)
      for (let c = 0; c <= n; c++) {
        dots.fillStyle(COLORS.text, 1).fillCircle(this.px(c), this.py(r), dotRadius);
        dots.fillStyle(COLORS.inset, 1).fillCircle(this.px(c), this.py(r), dotRadius * 0.4);
      }
    this.boardObjs.push(back, dots);
    // golden boxes: a gold plate with a star, pulsing gently until somebody claims it
    this.game_.golden.forEach((isGold, b) => {
      if (!isGold) return;
      const x = this.px(b % n) + spacing / 2;
      const y = this.py(Math.floor(b / n)) + spacing / 2;
      const s = spacing - 36;
      const plate = this.add.graphics({ x, y }).setDepth(2);
      plate.fillStyle(0xffd23f, 0.34).fillRoundedRect(-s / 2, -s / 2, s, s, 16);
      plate.lineStyle(5, 0xffd23f, 0.95).strokeRoundedRect(-s / 2, -s / 2, s, s, 16);
      const star = this.add.star(x, y, 5, spacing * 0.1, spacing * 0.24, 0xffd23f).setDepth(3).setStrokeStyle(4, 0xb8860b);
      this.tweens.add({ targets: star, scale: { from: 0.9, to: 1.12 }, angle: { from: -8, to: 8 }, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.stars[b] = star;
      this.boardObjs.push(plate);
    });
  }

  private makeTurnPanel(p: PlayerId): Phaser.GameObjects.Container {
    const a = endAnchor(p, 270);
    const c = this.add.container(a.x, a.y).setRotation(a.rotation).setDepth(5);
    const g = this.add.graphics();
    g.fillStyle(PLAYER[p].main, 0.3).fillRoundedRect(-200, -124, 400, 236, CARD.radius);
    g.lineStyle(8, PLAYER[p].main, 1).strokeRoundedRect(-200, -124, 400, 236, CARD.radius);
    const dot = this.add.circle(0, DOT_Y, 34, PLAYER[p].main).setStrokeStyle(6, PLAYER[p].light);
    const label = new RotatedLabel(this, 0, 52, txt().turn, null, { size: 58, color: PLAYER[p].onDark, display: true });
    c.add([g, dot, label]);
    this.rings[p] = new TimerRing(this, c, 0, DOT_Y, RING_R, PLAYER[p].light);
    return c;
  }

  /** Always-visible point counter per player (small square + number), clear of the score badge and pause buttons. */
  private makeCounter(p: PlayerId): RotatedLabel {
    const a = endAnchor(p, 100, 300);
    const c = this.add.container(a.x, a.y).setRotation(a.rotation).setDepth(5);
    const g = this.add.graphics();
    g.fillStyle(PLAYER[p].main, 1).fillRoundedRect(-80, -28, 56, 56, 12);
    g.fillStyle(PLAYER[p].light, 0.6).fillRoundedRect(-70, -18, 36, 36, 8);
    const label = new RotatedLabel(this, 30, 0, '0', null, { size: 84, color: PLAYER[p].onDark, display: true });
    c.add([g, label]);
    return label;
  }

  private refreshTurn(): void {
    this.pulse?.remove();
    PLAYERS.forEach((p) => {
      this.panels[p].setVisible(true);
      this.badges[p].setActiveEdge(p === this.turn);
      this.tweens.killTweensOf(this.panels[p]);
      this.panels[p].setAlpha(p === this.turn ? 1 : 0.18).setScale(1);
      this.rings[p].hide();
    });
    this.pulse = this.tweens.add({ targets: this.panels[this.turn], scale: { from: 1, to: 1.08 }, duration: 550, yoyo: true, repeat: -1 });
    const { margin: m, span } = this.L;
    this.frame.clear().lineStyle(10, PLAYER[this.turn].main, 0.9).strokeRoundedRect(this.L.x - m - 5, this.L.y - m - 5, span + 2 * m + 10, span + 2 * m + 10, 32);
    if (this.phase === 'play' && this.running) this.startClock();
  }

  get turn(): PlayerId {
    return this.game_.turn;
  }

  // ---------------------------------------------------------------- timer

  private startClock(): void {
    this.clock.start(this.rules.moveMs);
    this.rings[this.turn].draw(this.clock);
  }

  protected onTick(_time: number, delta: number): void {
    if (this.phase !== 'play' || !this.clock.running) return;
    const ev = this.clock.step(Math.min(delta, 100));
    this.rings[this.turn].draw(this.clock);
    if (ev === 'tick') Sfx.tone(880, 0.05, 'square', 0.1);
    else if (ev === 'timeout') this.onTimeout();
  }

  /** Out of time: the turn passes to the other player (nothing else is lost). */
  private onTimeout(): void {
    this.touching = false;
    this.aimed = -1;
    this.preview.clear();
    Sfx.tone(200, 0.2, 'sawtooth', 0.14);
    this.cameras.main.shake(100, 0.002);
    passTurn(this.game_);
    this.refreshTurn();
  }

  // ---------------------------------------------------------------- banner

  private noteText(n: Note): string {
    const t = txt();
    switch (n) {
      case 'size':
        return t.size(this.rules.boxes + 1);
      case 'golden':
        return t.golden;
      case 'timer':
        return t.timer(Math.round(this.rules.moveMs / 1000));
    }
  }

  /** "Round N" plus what is new, facing each player, shown over the empty board before the round starts. */
  private showBanner(notes: Note[]): void {
    const t = txt();
    const lines = notes.slice(0, 3).map((n) => this.noteText(n));
    const objs: Phaser.GameObjects.GameObject[] = [];
    PLAYERS.forEach((p) => {
      const a = endAnchor(p, 470);
      const c = this.add.container(a.x, a.y).setRotation(a.rotation).setDepth(40);
      const h = 130 + lines.length * 62;
      const bg = this.add.graphics();
      bg.fillStyle(0x080e1a, 0.8).fillRoundedRect(-420, -h / 2, 840, h, CARD.radius);
      bg.lineStyle(8, PLAYER[p].main, 1).strokeRoundedRect(-420, -h / 2, 840, h, CARD.radius);
      c.add(bg);
      c.add(new RotatedLabel(this, 0, -h / 2 + 52, `${t.round} ${this.roundNo + 1}`, null, { size: 70, color: PLAYER[p].onDark, display: true }));
      lines.forEach((l, k) => c.add(new RotatedLabel(this, 0, -h / 2 + 118 + k * 62, l, null, { size: 40, color: COLORS.text })));
      c.setAlpha(0).setScale(0.8);
      this.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 300, ease: 'Back.Out' });
      objs.push(c);
    });
    this.banner = objs;
    Sfx.tone(660, 0.1, 'triangle', 0.15);
    Sfx.tone(990, 0.16, 'triangle', 0.15, 0.1);
    this.time.delayedCall(DOTSBOXES.bannerMs, () => this.endBanner());
  }

  private endBanner(): void {
    if (!this.banner.length) return;
    const gone = this.banner;
    this.banner = [];
    this.tweens.add({ targets: gone, alpha: 0, duration: 250, onComplete: () => gone.forEach((o) => o.destroy()) });
    if (this.phase === 'intro') {
      this.phase = 'play';
      this.refreshTurn();
    }
  }

  // ---------------------------------------------------------------- input

  private aim(x: number, y: number): void {
    this.aimed = nearestEdge(this.game_, x, y, { x: this.L.x, y: this.L.y }, this.L.spacing, this.L.hitRadius);
    this.drawPreview();
  }

  /** Shows the edge about to be drawn (and any box it would complete). */
  private drawPreview(): void {
    const g = this.preview.clear();
    if (this.aimed < 0 || this.phase !== 'play') return;
    const n = this.rules.boxes;
    const col = PLAYER[this.turn];
    const sp = this.L.spacing;
    for (const b of wouldComplete(this.game_, this.aimed)) {
      g.fillStyle(col.main, 0.4).fillRoundedRect(this.px(b % n) + 14, this.py(Math.floor(b / n)) + 14, sp - 28, sp - 28, 18);
    }
    const [a, b] = edgeEnds(n, this.aimed);
    g.lineStyle(this.L.lineWidth + 22, col.light, 0.35).lineBetween(this.px(a.x), this.py(a.y), this.px(b.x), this.py(b.y));
    g.lineStyle(this.L.lineWidth + 4, col.light, 1).lineBetween(this.px(a.x), this.py(a.y), this.px(b.x), this.py(b.y));
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.running || this.phase !== 'play') return;
    this.touching = true;
    this.aim(p.x, p.y);
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (this.touching && this.running && this.phase === 'play') this.aim(p.x, p.y);
  }

  private onUp(p: Phaser.Input.Pointer): void {
    if (!this.touching) return;
    this.touching = false;
    if (!this.running || this.phase !== 'play') return;
    this.aim(p.x, p.y);
    const e = this.aimed;
    this.aimed = -1;
    this.preview.clear();
    if (e >= 0) this.drawEdge(e);
  }

  // ---------------------------------------------------------------- moves

  /** Draws edge `e` for the current player (public for tests). */
  drawEdge(e: number): boolean {
    if (this.phase !== 'play') return false;
    const player = this.turn;
    const res = play(this.game_, e);
    if (!res) return false;
    this.clock.stop();
    this.renderEdge(e, player);
    if (res.completed.length) {
      let gold = false;
      res.completed.forEach((b) => {
        this.fillBox(b, player);
        gold ||= this.game_.golden[b];
      });
      this.counts[player].setText(String(pointsOf(this.game_, player)));
      Sfx.tone(660, 0.1, 'triangle', 0.15);
      this.time.delayedCall(90, () => Sfx.tone(880, 0.14, 'triangle', 0.15));
      if (gold) [1046, 1318, 1568].forEach((f, i) => Sfx.tone(f, 0.16, 'triangle', 0.2, 0.18 + i * 0.09));
      Sfx.vibrate(gold ? [20, 20, 40] : 20);
    } else {
      Sfx.tone(420, 0.06, 'triangle', 0.12);
    }
    if (isOver(this.game_)) this.endRound();
    else this.refreshTurn();
    return true;
  }

  private renderEdge(e: number, p: PlayerId): void {
    const [a, b] = edgeEnds(this.rules.boxes, e);
    this.lines.lineStyle(this.L.lineWidth, PLAYER[p].main, 1).lineBetween(this.px(a.x), this.py(a.y), this.px(b.x), this.py(b.y));
  }

  private fillBox(b: number, p: PlayerId): void {
    const n = this.rules.boxes;
    const sp = this.L.spacing;
    const x = this.px(b % n) + sp / 2;
    const y = this.py(Math.floor(b / n)) + sp / 2;
    const s = sp - 36;
    const g = this.add.graphics({ x, y }).setDepth(3);
    g.fillStyle(PLAYER[p].main, 0.55).fillRoundedRect(-s / 2, -s / 2, s, s, 16);
    g.fillStyle(PLAYER[p].light, 0.5).fillCircle(0, 0, s * 0.2);
    g.setScale(0.2);
    this.tweens.add({ targets: g, scale: 1, duration: 320, ease: 'Back.Out' });
    this.fills[b] = g;
    const star = this.stars[b];
    if (star) {
      // the golden star stays on top of the claimed box, ringed in the owner's colour
      this.tweens.killTweensOf(star);
      star.setDepth(4).setScale(1).setAngle(0).setStrokeStyle(6, PLAYER[p].dark);
      this.tweens.add({ targets: star, scale: { from: 1.8, to: 1.15 }, duration: 420, ease: 'Back.Out' });
    }
  }

  private endRound(): void {
    this.phase = 'over';
    this.pulse?.remove();
    PLAYERS.forEach((p) => this.panels[p].setVisible(false));
    this.frame.clear();
    const w = winner(this.game_);
    if (w === null) {
      Sfx.tone(260, 0.3, 'sine', 0.2);
      this.cameras.main.shake(150, 0.003);
      this.time.delayedCall(DOTSBOXES.roundPauseMs * 0.7, () => this.newRound(other(this.starter)));
      return;
    }
    const tint = this.add.rectangle(W / 2, H / 2, W, H, PLAYER[w].main, 0.15).setDepth(2);
    this.tweens.add({ targets: tint, alpha: 0, duration: 1500, onComplete: () => tint.destroy() });
    this.fills.forEach((f, b) => f && this.game_.boxes[b] === w && this.tweens.add({ targets: f, scale: 1.12, duration: 250, yoyo: true, repeat: 2 }));
    this.score(w);
    if (!this.match.over) this.time.delayedCall(DOTSBOXES.roundPauseMs, () => this.newRound(other(w)));
  }

  private newRound(starter: PlayerId): void {
    this.roundNo++;
    this.starter = starter;
    this.setupRound(true);
  }
}

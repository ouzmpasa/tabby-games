import Phaser from 'phaser';
import { Sfx } from '../../core/audio/Sfx';
import { BaseGameScene } from '../../core/BaseGameScene';
import { endAnchor, H, W } from '../../core/layout';
import { settings } from '../../core/settings';
import { CARD, COLORS, PLAYER } from '../../core/theme';
import { other, PLAYERS, type PlayerId } from '../../core/types';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { TimerRing, TurnClock } from '../connect4/turnTimer';
import { boardRect, roundRules, TICTACTOE, type RoundRules } from './config';
import { BLOCK, createBoard, flipMark, isFree, pickBlocked, place, roundNotes, type Board, type MoveResult, type Note } from './logic';
import { drawMark } from './marks';

type Phase = 'intro' | 'play' | 'over';

/** Everything a player reads (hardcoded, like the other games' labels). */
export const TEXT = {
  en: {
    turn: 'Your turn!',
    round: 'Round',
    flip: 'FLIP',
    size: (n: number, need: number) => `Bigger board! Get ${need} in a row (${n}x${n})`,
    need: (need: number) => `Now get ${need} in a row!`,
    blocked: 'Rocks block some squares!',
    timer: (s: number) => `Hurry! ${s} seconds a move`,
    flipNote: 'FLIP: steal an enemy mark (1x)!',
  },
  nl: {
    turn: 'Jouw beurt!',
    round: 'Ronde',
    flip: 'WISSEL',
    size: (n: number, need: number) => `Groter bord! ${need} op een rij (${n}x${n})`,
    need: (need: number) => `Nu ${need} op een rij!`,
    blocked: 'Stenen blokkeren vakjes!',
    timer: (s: number) => `Opschieten! ${s} seconden per zet`,
    flipNote: 'WISSEL: pak een teken af (1x)!',
  },
} as const;
const txt = () => TEXT[settings.get().lang === 'nl' ? 'nl' : 'en'];

const RING_R = 58;
const MARK_Y = -52;

export class TicTacToeScene extends BaseGameScene {
  board!: Board;
  turn: PlayerId = 0;
  phase: Phase = 'play';
  /** Who opens the current round (loser of the last one; alternates after a draw). */
  starter: PlayerId = 0;
  /** 0-based round counter; every round (also a draw) escalates the rules. */
  roundNo = 0;
  rules!: RoundRules;
  /** FLIP still available per player this round. */
  flipLeft: [boolean, boolean] = [false, false];
  flipArmed = false;
  readonly clock = new TurnClock();
  private L = boardRect(3);
  private marks: (Phaser.GameObjects.Graphics | null)[] = [];
  private boardObjs: Phaser.GameObjects.GameObject[] = [];
  private panels: Phaser.GameObjects.Container[] = [];
  private rings: TimerRing[] = [];
  private flipBtns: Phaser.GameObjects.Container[] = [];
  private frame!: Phaser.GameObjects.Graphics;
  private ghost!: Phaser.GameObjects.Graphics;
  private highlight!: Phaser.GameObjects.Graphics;
  private armGfx!: Phaser.GameObjects.Graphics;
  private banner: Phaser.GameObjects.GameObject[] = [];
  private pulse?: Phaser.Tweens.Tween;
  private armPulse?: Phaser.Tweens.Tween;
  /** Cell currently under the finger, or -1. */
  private touched = -1;

  constructor() {
    super(TICTACTOE.sceneKey, TICTACTOE.id, TICTACTOE.targetScore);
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
    this.flipArmed = false;
    this.touched = -1;
    this.boardObjs = [];
    this.banner = [];
    this.starter = Math.random() < 0.5 ? 0 : 1;
    this.turn = this.starter;
    this.ghost = this.add.graphics().setDepth(4);
    this.highlight = this.add.graphics().setDepth(20);
    this.armGfx = this.add.graphics().setDepth(21);
    this.frame = this.add.graphics().setDepth(2);
    this.panels = PLAYERS.map((p) => this.makeTurnPanel(p));
    this.flipBtns = PLAYERS.map((p) => this.makeFlipButton(p));
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

  private cellX = (col: number): number => this.L.x + (col + 0.5) * this.L.cell;
  private cellY = (row: number): number => this.L.y + (row + 0.5) * this.L.cell;
  private idxX = (i: number): number => this.cellX(i % this.board.size);
  private idxY = (i: number): number => this.cellY(Math.floor(i / this.board.size));
  private markR = (): number => this.L.cell * TICTACTOE.markFill;
  private markW = (): number => this.L.cell * TICTACTOE.markStrokeFrac;

  /** Builds the board for the current round. `announce`: show the "what's new" banner first. */
  private setupRound(announce: boolean): void {
    const prev = this.roundNo > 0 ? roundRules(this.roundNo - 1) : null;
    this.rules = roundRules(this.roundNo);
    this.L = boardRect(this.rules.size);
    this.board = createBoard(this.rules.size, this.rules.need, pickBlocked(Math.random, this.rules.size, this.rules.blocked, this.rules.need));
    this.marks = new Array(this.board.cells.length).fill(null);
    this.flipLeft = [this.rules.flip, this.rules.flip];
    this.setArmed(false);
    this.boardObjs.forEach((o) => o.destroy());
    this.boardObjs = [];
    this.drawBoard();
    this.flipBtns.forEach((b, p) => b.setVisible(this.rules.flip).setAlpha(1).setData('p', p));
    this.updateFlipButtons();
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
    const { cell, x, y, w, h } = this.L;
    const n = this.board.size;
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x080e1a, 0.35).fillRoundedRect(x, y + 14, w, h, 28);
    g.fillStyle(COLORS.surface, 1).fillRoundedRect(x, y, w, h, 28);
    g.lineStyle(n > 3 ? 8 : 10, COLORS.line, 1);
    for (let i = 1; i < n; i++) {
      g.lineBetween(x + i * cell, y + 30, x + i * cell, y + h - 30);
      g.lineBetween(x + 30, y + i * cell, x + w - 30, y + i * cell);
    }
    this.boardObjs.push(g);
    // Rocks: grey boulders that nobody can play on.
    this.board.cells.forEach((c, i) => {
      if (c !== BLOCK) return;
      const rk = this.add.graphics().setDepth(3).setPosition(this.idxX(i), this.idxY(i));
      const r = cell * 0.32;
      rk.fillStyle(0x080e1a, 0.4).fillEllipse(0, r * 0.7, r * 2.2, r * 0.8);
      rk.fillStyle(0x56688a, 1).fillPoints(this.rockPoints(r), true);
      rk.fillStyle(0x8fa0bd, 1).fillPoints(this.rockPoints(r * 0.62, -r * 0.18, -r * 0.2), true);
      rk.lineStyle(5, 0x3b4a66, 1).strokePoints(this.rockPoints(r), true);
      this.boardObjs.push(rk);
    });
    this.frame.clear();
  }

  private rockPoints(r: number, ox = 0, oy = 0): Phaser.Geom.Point[] {
    const k = [1, 0.82, 0.95, 0.78, 1, 0.86, 0.96, 0.8];
    return k.map((m, j) => {
      const a = (j / k.length) * Math.PI * 2 - Math.PI / 8;
      return new Phaser.Geom.Point(ox + Math.cos(a) * r * m, oy + Math.sin(a) * r * m * 0.88);
    });
  }

  private makeTurnPanel(p: PlayerId): Phaser.GameObjects.Container {
    const a = endAnchor(p, 270);
    const c = this.add.container(a.x, a.y).setRotation(a.rotation).setDepth(5);
    const g = this.add.graphics();
    g.fillStyle(PLAYER[p].main, 0.3).fillRoundedRect(-200, -124, 400, 236, CARD.radius);
    g.lineStyle(8, PLAYER[p].main, 1).strokeRoundedRect(-200, -124, 400, 236, CARD.radius);
    const mark = this.add.graphics().setPosition(0, MARK_Y);
    drawMark(mark, p, 0, 0, 26, 12);
    const label = new RotatedLabel(this, 0, 52, txt().turn, null, { size: 58, color: PLAYER[p].onDark, display: true });
    c.add([g, mark, label]);
    this.rings[p] = new TimerRing(this, c, 0, MARK_Y, RING_R, PLAYER[p].light);
    return c;
  }

  private flipPos(p: PlayerId): { x: number; y: number } {
    const a = endAnchor(p, 270, 300);
    return { x: a.x, y: a.y };
  }

  private makeFlipButton(p: PlayerId): Phaser.GameObjects.Container {
    const a = endAnchor(p, 270, 300);
    const c = this.add.container(a.x, a.y).setRotation(a.rotation).setDepth(5).setVisible(false);
    const g = this.add.graphics();
    g.fillStyle(0x080e1a, 0.35).fillCircle(0, 8, 62);
    g.fillStyle(PLAYER[p].main, 0.9).fillCircle(0, 0, 62);
    g.lineStyle(6, PLAYER[p].light, 1).strokeCircle(0, 0, 62);
    // swap icon: two arrows chasing each other
    g.lineStyle(9, 0xffffff, 1);
    for (const s of [0, Math.PI]) {
      g.beginPath().arc(0, 0, 28, s + 0.4, s + 2.5, false).strokePath();
      const ax = Math.cos(s + 2.5) * 28;
      const ay = Math.sin(s + 2.5) * 28;
      const tx = Math.cos(s + 2.5 + Math.PI / 2);
      const ty = Math.sin(s + 2.5 + Math.PI / 2);
      g.fillStyle(0xffffff, 1).fillTriangle(ax + tx * 16, ay + ty * 16, ax - tx * 2 + ty * 14, ay - ty * 2 - tx * 14, ax - tx * 2 - ty * 14, ay - ty * 2 + tx * 14);
    }
    const label = new RotatedLabel(this, 0, 86, txt().flip, null, { size: 34, color: PLAYER[p].onDark, display: true });
    c.add([g, label]);
    return c;
  }

  private updateFlipButtons(): void {
    PLAYERS.forEach((p) => {
      const usable = this.rules.flip && this.flipLeft[p];
      this.flipBtns[p].setAlpha(!this.rules.flip ? 0 : usable ? (p === this.turn ? 1 : 0.5) : 0.18);
    });
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
    const L = this.L;
    this.frame.clear().lineStyle(10, PLAYER[this.turn].main, 0.9).strokeRoundedRect(L.x - 5, L.y - 5, L.w + 10, L.h + 10, 32);
    this.updateFlipButtons();
    if (this.phase === 'play' && this.running) this.startClock();
  }

  private startClock(): void {
    this.clock.start(this.rules.moveMs);
    this.rings[this.turn].draw(this.clock);
  }

  // ---------------------------------------------------------------- timer

  protected onTick(_time: number, delta: number): void {
    if (this.phase !== 'play' || !this.clock.running) return;
    const ev = this.clock.step(Math.min(delta, 100));
    this.rings[this.turn].draw(this.clock);
    if (ev === 'tick') Sfx.tone(880, 0.05, 'square', 0.1);
    else if (ev === 'timeout') this.onTimeout();
  }

  /** Out of time: the turn passes to the other player (nothing else is lost). */
  private onTimeout(): void {
    this.setTouched(-1);
    this.setArmed(false);
    Sfx.tone(200, 0.2, 'sawtooth', 0.14);
    this.cameras.main.shake(100, 0.002);
    this.rings[this.turn].hide();
    this.turn = other(this.turn);
    this.refreshTurn();
  }

  // ---------------------------------------------------------------- banner

  private noteText(n: Note): string {
    const t = txt();
    switch (n) {
      case 'size':
        return t.size(this.rules.size, this.rules.need);
      case 'need':
        return t.need(this.rules.need);
      case 'blocked':
        return t.blocked;
      case 'timer':
        return t.timer(Math.round(this.rules.moveMs / 1000));
      case 'flip':
        return t.flipNote;
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
      bg.fillStyle(0x080e1a, 0.78).fillRoundedRect(-420, -h / 2, 840, h, CARD.radius);
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
    this.time.delayedCall(TICTACTOE.bannerMs, () => this.endBanner());
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

  /** Cell index under a screen point, or -1. */
  private cellAt(x: number, y: number): number {
    const L = this.L;
    const n = this.board.size;
    const col = Math.floor((x - L.x) / L.cell);
    const row = Math.floor((y - L.y) / L.cell);
    return x < L.x || y < L.y || col >= n || row >= n ? -1 : row * n + col;
  }

  private canPlay(): boolean {
    return this.running && this.phase === 'play';
  }

  private setTouched(i: number): void {
    const next = i >= 0 && isFree(this.board, i) ? i : -1;
    if (next === this.touched) return;
    this.touched = next;
    this.ghost.clear();
    if (next >= 0) {
      drawMark(this.ghost, this.turn, this.idxX(next), this.idxY(next), this.markR(), this.markW());
      this.ghost.setAlpha(TICTACTOE.ghostAlpha);
    }
  }

  private onFlipButton(p: Phaser.Input.Pointer): boolean {
    if (!this.rules.flip || !this.flipLeft[this.turn]) return false;
    const b = this.flipPos(this.turn);
    if (Math.hypot(p.x - b.x, p.y - b.y) > 95) return false;
    this.armFlip();
    return true;
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (!this.canPlay()) return;
    if (this.onFlipButton(p)) return;
    this.setTouched(this.cellAt(p.x, p.y));
  }

  private onMove(p: Phaser.Input.Pointer): void {
    if (p.isDown && this.canPlay()) this.setTouched(this.cellAt(p.x, p.y));
  }

  /** Releasing on the previewed cell confirms the move; sliding off cancels it. */
  private onUp(p: Phaser.Input.Pointer): void {
    const i = this.touched;
    this.setTouched(-1);
    if (!this.canPlay()) return;
    const at = this.cellAt(p.x, p.y);
    if (this.flipArmed && at >= 0 && this.board.cells[at] === other(this.turn)) {
      this.flipCell(at);
    } else if (i >= 0 && at === i) {
      this.placeMark(i);
    } else if (at >= 0 && !isFree(this.board, at) && !this.flipArmed) {
      Sfx.tone(180, 0.12, 'square', 0.1); // taken cell or rock: gentle "nope"
    }
  }

  // ---------------------------------------------------------------- flip power

  /** Arms (or disarms) the FLIP power for the player whose turn it is (public for tests). */
  armFlip(): boolean {
    if (this.phase !== 'play' || !this.rules.flip || !this.flipLeft[this.turn]) return false;
    this.setArmed(!this.flipArmed);
    Sfx.tone(this.flipArmed ? 740 : 500, 0.08, 'triangle', 0.15);
    return true;
  }

  private setArmed(on: boolean): void {
    this.flipArmed = on;
    this.armPulse?.remove();
    this.armGfx.clear().setAlpha(1);
    if (!on || !this.board) return;
    const rr = this.L.cell * 0.46;
    this.board.cells.forEach((c, i) => {
      if (c === other(this.turn)) this.armGfx.lineStyle(8, 0xffffff, 1).strokeCircle(this.idxX(i), this.idxY(i), rr);
    });
    this.armPulse = this.tweens.add({ targets: this.armGfx, alpha: { from: 1, to: 0.25 }, duration: 380, yoyo: true, repeat: -1 });
  }

  /** FLIP: turns the enemy mark on cell `i` into the current player's mark and ends the turn (public for tests). */
  flipCell(i: number): boolean {
    if (this.phase !== 'play' || !this.flipLeft[this.turn]) return false;
    const player = this.turn;
    const res = flipMark(this.board, i, player);
    if (!res) return false;
    this.flipLeft[player] = false;
    this.setArmed(false);
    this.setTouched(-1);
    this.marks[i]?.destroy();
    this.spawnMark(i, player);
    Sfx.tone(300, 0.1, 'sawtooth', 0.12);
    Sfx.tone(700, 0.14, 'triangle', 0.18, 0.08);
    this.afterMove(player, res);
    return true;
  }

  // ---------------------------------------------------------------- moves

  private spawnMark(i: number, player: PlayerId): void {
    const g = this.add.graphics().setDepth(5).setPosition(this.idxX(i), this.idxY(i));
    drawMark(g, player, 0, 0, this.markR(), this.markW());
    this.marks[i] = g;
    g.setScale(0);
    this.tweens.add({ targets: g, scale: 1, duration: TICTACTOE.popMs, ease: 'Back.easeOut' });
  }

  /** Places the current player's mark (public for tests). */
  placeMark(i: number): boolean {
    if (this.phase !== 'play') return false;
    const player = this.turn;
    const res = place(this.board, i, player);
    if (!res) return false;
    this.setTouched(-1);
    this.setArmed(false);
    this.spawnMark(i, player);
    Sfx.tone(player === 0 ? 520 : 440, 0.08, 'triangle', 0.15);
    Sfx.vibrate(15);
    this.afterMove(player, res);
    return true;
  }

  private afterMove(player: PlayerId, res: MoveResult): void {
    this.clock.stop();
    this.rings[player].hide();
    if (res.win) {
      this.phase = 'over';
      this.showWin(res.win.line, player);
      this.score(player);
      this.updateFlipButtons();
      if (!this.match.over) this.time.delayedCall(TICTACTOE.roundPauseMs, () => this.nextRound(other(player)));
    } else if (res.draw) {
      this.phase = 'over';
      this.pulse?.remove();
      Sfx.tone(260, 0.3, 'sine', 0.2);
      this.cameras.main.shake(150, 0.003);
      this.time.delayedCall(TICTACTOE.roundPauseMs * 0.7, () => this.nextRound(other(this.starter)));
    } else {
      this.turn = other(player);
      this.refreshTurn();
    }
  }

  private showWin(line: readonly number[], winner: PlayerId): void {
    this.pulse?.remove();
    PLAYERS.forEach((p) => this.panels[p].setVisible(false));
    this.flipBtns.forEach((b) => b.setVisible(false));
    this.frame.clear();
    const a = line[0];
    const b = line[line.length - 1];
    const k = this.L.cell / 270;
    const g = this.highlight.clear();
    g.lineStyle(26 * k, 0xffffff, 1).lineBetween(this.idxX(a), this.idxY(a), this.idxX(b), this.idxY(b));
    g.fillStyle(0xffffff, 1).fillCircle(this.idxX(a), this.idxY(a), 13 * k).fillCircle(this.idxX(b), this.idxY(b), 13 * k);
    this.tweens.add({ targets: g, alpha: { from: 1, to: 0.3 }, duration: 300, yoyo: true, repeat: 3 });
    line.forEach((i) => {
      const m = this.marks[i];
      if (m) this.tweens.add({ targets: m, scale: 1.15, duration: 300, yoyo: true, repeat: 3, delay: TICTACTOE.popMs });
    });
    const tint = this.add.rectangle(W / 2, H / 2, W, H, PLAYER[winner].main, 0.15).setDepth(2);
    this.tweens.add({ targets: tint, alpha: 0, duration: 1500, onComplete: () => tint.destroy() });
  }

  /** After a round: the match goes on, unless the round cap is reached and somebody leads (then the leader wins). */
  private nextRound(starter: PlayerId): void {
    const [a, b] = this.match.scores;
    if (this.roundNo + 1 >= TICTACTOE.maxRounds && a !== b) {
      this.running = false;
      Sfx.win();
      this.time.delayedCall(300, () => this.scene.start('Win', { gameId: TICTACTOE.id, sceneKey: this.scene.key, winner: a > b ? 0 : 1, scores: [a, b] }));
      return;
    }
    this.newRound(starter);
  }

  private newRound(starter: PlayerId): void {
    this.marks.forEach((m) => m?.destroy());
    this.marks.fill(null);
    this.highlight.clear().setAlpha(1);
    this.roundNo++;
    this.starter = starter;
    this.turn = starter;
    this.flipBtns.forEach((b) => b.setVisible(true));
    this.setupRound(true);
  }
}

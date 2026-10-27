import Phaser from 'phaser';
import { Sfx } from '../../core/audio/Sfx';
import { BaseGameScene } from '../../core/BaseGameScene';
import { endAnchor, H, W } from '../../core/layout';
import { settings } from '../../core/settings';
import { CARD, COLORS, PLAYER } from '../../core/theme';
import { other, PLAYERS, type PlayerId } from '../../core/types';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { boardRect, CONNECT4, roundRules, type RoundRules } from './config';
import { bombDrop, createBoard, drop, landingRow, roundNotes, type Board, type BombResult, type Note, type Pos } from './logic';
import { TimerRing, TurnClock } from './turnTimer';

type Phase = 'intro' | 'play' | 'drop' | 'over';
type Power = 'bomb' | 'double';

const BOARD_COLOR = 0x29b6f6;
const BOARD_DARK = 0x0f8fd1;

/** Everything a player reads (hardcoded, like the other games' labels). */
export const TEXT = {
  en: {
    turn: 'Your turn!',
    round: 'Round',
    bomb: 'BOMB',
    double: 'DOUBLE',
    size: (c: number, r: number) => `Bigger board! ${c} x ${r}`,
    timer: (s: number) => `Hurry! ${s} seconds a move`,
    bombNote: 'BOMB: boom! Clears nearby discs (1x)',
    doubleNote: 'DOUBLE: drop two discs in a row (1x)',
  },
  nl: {
    turn: 'Jouw beurt!',
    round: 'Ronde',
    bomb: 'BOM',
    double: 'DUBBEL',
    size: (c: number, r: number) => `Groter bord! ${c} x ${r}`,
    timer: (s: number) => `Opschieten! ${s} seconden per zet`,
    bombNote: 'BOM: boem! Ruimt schijven om je heen op (1x)',
    doubleNote: 'DUBBEL: twee schijven achter elkaar (1x)',
  },
} as const;
const txt = () => TEXT[settings.get().lang === 'nl' ? 'nl' : 'en'];

const RING_R = 56;
const DISC_Y = -52;

export class Connect4Scene extends BaseGameScene {
  board!: Board;
  turn: PlayerId = 0;
  phase: Phase = 'play';
  /** Who opens the current round (loser of the last one; alternates after a draw). */
  starter: PlayerId = 0;
  /** 0-based round counter; every round (also a draw) escalates the rules. */
  roundNo = 0;
  rules!: RoundRules;
  /** Powers still available per player this round. */
  powerLeft: Record<Power, [boolean, boolean]> = { bomb: [false, false], double: [false, false] };
  /** Power armed for the next drop by the player on turn. */
  armed: Power | null = null;
  readonly clock = new TurnClock();
  private extraTurn = false;
  private discs: (Phaser.GameObjects.Container | null)[] = [];
  private boardObjs: Phaser.GameObjects.GameObject[] = [];
  private panels: Phaser.GameObjects.Container[] = [];
  private rings: TimerRing[] = [];
  private buttons: Record<Power, Phaser.GameObjects.Container[]> = { bomb: [], double: [] };
  private frame!: Phaser.GameObjects.Graphics;
  private highlight!: Phaser.GameObjects.Graphics;
  private banner: Phaser.GameObjects.GameObject[] = [];
  private pulse?: Phaser.Tweens.Tween;
  private B = boardRect(7, 6);

  constructor() {
    super(CONNECT4.sceneKey, CONNECT4.id, CONNECT4.targetScore);
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
    this.armed = null;
    this.extraTurn = false;
    this.boardObjs = [];
    this.banner = [];
    this.starter = Math.random() < 0.5 ? 0 : 1;
    this.turn = this.starter;
    this.highlight = this.add.graphics().setDepth(20);
    this.frame = this.add.graphics().setDepth(11);
    this.panels = PLAYERS.map((p) => this.makeTurnPanel(p));
    this.buttons = {
      bomb: PLAYERS.map((p) => this.makePowerButton(p, 'bomb')),
      double: PLAYERS.map((p) => this.makePowerButton(p, 'double')),
    };
    this.input.on('pointerdown', this.onTap, this);
    this.events.once('shutdown', () => this.input.off('pointerdown', this.onTap, this));
    this.setupRound(false);
  }

  protected onStart(): void {
    if (this.phase === 'play') this.startClock();
  }

  // ---------------------------------------------------------------- layout

  private cellX = (col: number): number => this.B.x + (col + 0.5) * CONNECT4.cell;
  private cellY = (row: number): number => this.B.y + (row + 0.5) * CONNECT4.cell;

  /** Builds the board for the current round. `announce`: show the "what's new" banner first. */
  private setupRound(announce: boolean): void {
    const prev = this.roundNo > 0 ? roundRules(this.roundNo - 1) : null;
    this.rules = roundRules(this.roundNo);
    this.B = boardRect(this.rules.cols, this.rules.rows);
    this.board = createBoard(this.rules.cols, this.rules.rows);
    this.discs = new Array(this.rules.cols * this.rules.rows).fill(null);
    this.powerLeft = { bomb: [this.rules.bomb, this.rules.bomb], double: [this.rules.double, this.rules.double] };
    this.armed = null;
    this.extraTurn = false;
    this.boardObjs.forEach((o) => o.destroy());
    this.boardObjs = [];
    this.drawBoardFront();
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

  /** Back plate + front layer with transparent holes (thick rings masked to the board) so discs fall "inside". */
  private drawBoardFront(): void {
    const { cell, discFill } = CONNECT4;
    const { cols, rows } = this.rules;
    const B = this.B;
    const back = this.add.graphics().setDepth(1);
    back.fillStyle(0x080e1a, 0.35).fillRoundedRect(B.x, B.y + 14, B.w, B.h, 28);
    back.fillStyle(COLORS.dots, 1).fillRoundedRect(B.x, B.y, B.w, B.h, 28);

    const front = this.add.graphics().setDepth(10);
    const r = cell * discFill;
    front.fillStyle(BOARD_COLOR, 1).fillRoundedRect(B.x, B.y, B.w, B.h, 28);
    // soft inner rim on each hole
    front.lineStyle(5, BOARD_DARK, 1);
    for (let c = 0; c < cols; c++) for (let row = 0; row < rows; row++) front.strokeCircle(this.cellX(c), this.cellY(row), r);
    // punch the holes with an inverted mask so discs show through
    const holes = this.make.graphics({}, false);
    holes.fillStyle(0xffffff);
    for (let c = 0; c < cols; c++) for (let row = 0; row < rows; row++) holes.fillCircle(this.cellX(c), this.cellY(row), r);
    const mask = holes.createGeometryMask();
    mask.invertAlpha = true;
    front.setMask(mask);
    this.boardObjs.push(back, front, holes);
    this.frame.clear();
  }

  private makeTurnPanel(p: PlayerId): Phaser.GameObjects.Container {
    const a = endAnchor(p, 270);
    const c = this.add.container(a.x, a.y).setRotation(a.rotation).setDepth(5);
    const g = this.add.graphics();
    g.fillStyle(PLAYER[p].main, 0.3).fillRoundedRect(-200, -124, 400, 236, CARD.radius);
    g.lineStyle(8, PLAYER[p].main, 1).strokeRoundedRect(-200, -124, 400, 236, CARD.radius);
    const disc = this.add.circle(0, DISC_Y, 34, PLAYER[p].main).setStrokeStyle(6, PLAYER[p].light);
    const label = new RotatedLabel(this, 0, 52, txt().turn, null, { size: 58, color: PLAYER[p].onDark, display: true });
    c.add([g, disc, label]);
    this.rings[p] = new TimerRing(this, c, 0, DISC_Y, RING_R, PLAYER[p].light);
    return c;
  }

  /** Power buttons sit above and below the turn panel: bomb at the lower side, double at the upper side. */
  private powerPos(p: PlayerId, power: Power): { x: number; y: number } {
    const a = endAnchor(p, 270, power === 'bomb' ? 300 : -300);
    return { x: a.x, y: a.y };
  }

  private makePowerButton(p: PlayerId, power: Power): Phaser.GameObjects.Container {
    const pos = this.powerPos(p, power);
    const rot = endAnchor(p, 0).rotation;
    const c = this.add.container(pos.x, pos.y).setRotation(rot).setDepth(5).setVisible(false);
    const g = this.add.graphics();
    g.fillStyle(0x080e1a, 0.35).fillCircle(0, 8, 56);
    g.fillStyle(PLAYER[p].main, 0.9).fillCircle(0, 0, 56);
    g.lineStyle(6, PLAYER[p].light, 1).strokeCircle(0, 0, 56);
    if (power === 'bomb') {
      g.fillStyle(0x1e2a3d, 1).fillCircle(-3, 5, 26);
      g.fillStyle(0xffffff, 0.35).fillCircle(-12, -4, 7);
      g.lineStyle(6, 0xf5f7fa, 1).beginPath().moveTo(10, -14).lineTo(18, -26).lineTo(28, -24).strokePath();
      g.fillStyle(0xffd23f, 1).fillCircle(30, -26, 8);
      g.fillStyle(0xff7b3d, 1).fillCircle(30, -26, 4);
    } else {
      g.fillStyle(0xffffff, 1).fillCircle(0, -14, 17).fillCircle(0, 16, 17);
      g.lineStyle(5, PLAYER[p].dark, 1).strokeCircle(0, -14, 17).strokeCircle(0, 16, 17);
    }
    const label = new RotatedLabel(this, 0, 84, power === 'bomb' ? txt().bomb : txt().double, null, { size: 32, color: PLAYER[p].onDark, display: true });
    c.add([g, label]);
    return c;
  }

  private updateButtons(): void {
    for (const power of ['bomb', 'double'] as const) {
      const on = power === 'bomb' ? this.rules.bomb : this.rules.double;
      PLAYERS.forEach((p) => {
        const b = this.buttons[power][p];
        b.setVisible(on && this.phase !== 'over');
        const usable = this.powerLeft[power][p];
        const armed = this.armed === power && p === this.turn;
        b.setAlpha(!usable ? 0.18 : p === this.turn ? 1 : 0.5).setScale(armed ? 1.18 : 1);
      });
    }
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
    const B = this.B;
    this.frame.clear().lineStyle(10, PLAYER[this.turn].main, 0.9).strokeRoundedRect(B.x - 5, B.y - 5, B.w + 10, B.h + 10, 32);
    this.updateButtons();
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
    Sfx.tone(200, 0.2, 'sawtooth', 0.14);
    this.cameras.main.shake(100, 0.002);
    this.rings[this.turn].hide();
    this.armed = null;
    this.extraTurn = false;
    this.turn = other(this.turn);
    this.refreshTurn();
  }

  // ---------------------------------------------------------------- banner

  private noteText(n: Note): string {
    const t = txt();
    switch (n) {
      case 'size':
        return t.size(this.rules.cols, this.rules.rows);
      case 'timer':
        return t.timer(Math.round(this.rules.moveMs / 1000));
      case 'bomb':
        return t.bombNote;
      case 'double':
        return t.doubleNote;
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
      bg.fillStyle(0x080e1a, 0.78).fillRoundedRect(-440, -h / 2, 880, h, CARD.radius);
      bg.lineStyle(8, PLAYER[p].main, 1).strokeRoundedRect(-440, -h / 2, 880, h, CARD.radius);
      c.add(bg);
      c.add(new RotatedLabel(this, 0, -h / 2 + 52, `${t.round} ${this.roundNo + 1}`, null, { size: 70, color: PLAYER[p].onDark, display: true }));
      lines.forEach((l, k) => c.add(new RotatedLabel(this, 0, -h / 2 + 118 + k * 62, l, null, { size: 38, color: COLORS.text })));
      c.setAlpha(0).setScale(0.8);
      this.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 300, ease: 'Back.Out' });
      objs.push(c);
    });
    this.banner = objs;
    Sfx.tone(660, 0.1, 'triangle', 0.15);
    Sfx.tone(990, 0.16, 'triangle', 0.15, 0.1);
    this.time.delayedCall(CONNECT4.bannerMs, () => this.endBanner());
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

  /** Arms (or disarms) a power for the player on turn (public for tests). */
  arm(power: Power): boolean {
    if (this.phase !== 'play' || !this.powerLeft[power][this.turn]) return false;
    this.armed = this.armed === power ? null : power;
    Sfx.tone(this.armed ? 740 : 500, 0.08, 'triangle', 0.15);
    this.updateButtons();
    return true;
  }

  private onTap(p: Phaser.Input.Pointer): void {
    if (!this.running || this.phase !== 'play') return;
    for (const power of ['bomb', 'double'] as const) {
      if (!this.powerLeft[power][this.turn]) continue;
      const b = this.powerPos(this.turn, power);
      if (Math.hypot(p.x - b.x, p.y - b.y) <= 90) {
        this.arm(power);
        return;
      }
    }
    const col = Math.floor((p.x - this.B.x) / CONNECT4.cell);
    if (p.x < this.B.x || col < 0 || col >= this.rules.cols) return;
    this.dropDisc(col);
  }

  // ---------------------------------------------------------------- moves

  /** Drops a disc for the current player, using an armed power (public for tests). */
  dropDisc(col: number): boolean {
    if (this.phase !== 'play' || landingRow(this.board, col) < 0) {
      if (this.phase === 'play') Sfx.tone(180, 0.12, 'square', 0.1); // full column: gentle "nope"
      return false;
    }
    const player = this.turn;
    this.clock.stop();
    this.rings[player].hide();
    const power = this.armed;
    this.armed = null;
    if (power) this.powerLeft[power][player] = false;
    this.phase = 'drop';
    this.updateButtons();
    if (power === 'bomb') {
      this.dropBomb(col, player);
      return true;
    }
    if (power === 'double') this.extraTurn = true;
    const res = drop(this.board, col, player, this.rules.connect)!;
    const disc = this.makeDisc(player);
    this.discs[res.row * this.rules.cols + col] = disc;
    disc.setPosition(this.cellX(col), this.B.y - CONNECT4.cell * 0.6);
    Sfx.tone(520, 0.06, 'triangle', 0.12);
    this.tweens.add({
      targets: disc,
      y: this.cellY(res.row),
      duration: CONNECT4.dropBaseMs + CONNECT4.dropPerRowMs * (res.row + 1),
      ease: 'Bounce.easeOut',
      onComplete: () => {
        Sfx.tone(300, 0.1, 'triangle', 0.2);
        Sfx.vibrate(15);
        this.afterDrop(player, res.win, res.draw);
      },
    });
    return true;
  }

  private makeDisc(p: PlayerId): Phaser.GameObjects.Container {
    const r = CONNECT4.cell * CONNECT4.discFill + 2;
    const c = this.add.container(0, 0).setDepth(5);
    c.add([
      this.add.circle(0, 0, r, PLAYER[p].main).setStrokeStyle(6, PLAYER[p].dark),
      this.add.circle(0, 0, r * 0.58, PLAYER[p].light, 0.55),
    ]);
    return c;
  }

  private makeBomb(p: PlayerId): Phaser.GameObjects.Container {
    const r = CONNECT4.cell * CONNECT4.discFill + 2;
    const c = this.add.container(0, 0).setDepth(5);
    const g = this.add.graphics();
    g.fillStyle(0x1e2a3d, 1).fillCircle(0, 0, r).lineStyle(8, PLAYER[p].main, 1).strokeCircle(0, 0, r);
    g.fillStyle(0xffffff, 0.3).fillCircle(-r * 0.35, -r * 0.35, r * 0.2);
    g.lineStyle(7, 0xf5f7fa, 1).beginPath().moveTo(r * 0.3, -r * 0.7).lineTo(r * 0.55, -r * 1.05).lineTo(r * 0.85, -r * 1.0).strokePath();
    g.fillStyle(0xffd23f, 1).fillCircle(r * 0.9, -r * 1.0, 11).fillStyle(0xff7b3d, 1).fillCircle(r * 0.9, -r * 1.0, 6);
    c.add(g);
    this.tweens.add({ targets: c, angle: { from: -10, to: 10 }, duration: 120, yoyo: true, repeat: -1 });
    return c;
  }

  private dropBomb(col: number, player: PlayerId): void {
    const before = this.discs.slice();
    const res = bombDrop(this.board, col, player, this.rules.connect, CONNECT4.bombRadius)!;
    const bomb = this.makeBomb(player);
    bomb.setPosition(this.cellX(col), this.B.y - CONNECT4.cell * 0.6);
    Sfx.tone(300, 0.25, 'sawtooth', 0.1);
    this.tweens.add({
      targets: bomb,
      y: this.cellY(res.row),
      duration: CONNECT4.dropBaseMs + CONNECT4.dropPerRowMs * (res.row + 1),
      ease: 'Bounce.easeOut',
      onComplete: () => {
        bomb.destroy();
        this.explode(col, res, before, player);
      },
    });
  }

  /** The blast: flash and sparks, the hit discs vanish, the rest fall into the gaps. */
  private explode(col: number, res: BombResult, before: (Phaser.GameObjects.Container | null)[], player: PlayerId): void {
    const cols = this.rules.cols;
    const x = this.cellX(col);
    const y = this.cellY(res.row);
    const flash = this.add.circle(x, y, CONNECT4.cell * 0.4, 0xffd23f, 0.9).setDepth(30);
    this.tweens.add({ targets: flash, scale: 3.4, alpha: 0, duration: 420, ease: 'Quad.Out', onComplete: () => flash.destroy() });
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const d = this.add.circle(x, y, 9, k % 2 ? 0xff7b3d : 0xffd23f, 1).setDepth(31);
      this.tweens.add({ targets: d, x: x + Math.cos(a) * 190, y: y + Math.sin(a) * 190, alpha: 0, scale: 0.3, duration: 520, ease: 'Quad.Out', onComplete: () => d.destroy() });
    }
    this.cameras.main.shake(280, 0.008);
    Sfx.tone(90, 0.4, 'sawtooth', 0.3);
    Sfx.tone(60, 0.5, 'square', 0.2, 0.05);
    Sfx.vibrate([60, 30, 60]);
    this.discs = before;
    for (const r of res.removed) {
      const i = r.row * cols + r.col;
      const d = this.discs[i];
      this.discs[i] = null;
      if (d) this.tweens.add({ targets: d, scale: 0, alpha: 0, duration: 260, onComplete: () => d.destroy() });
    }
    let longest = 0;
    for (const f of res.falls) {
      const d = this.discs[f.fromRow * cols + f.col];
      this.discs[f.fromRow * cols + f.col] = null;
      this.discs[f.toRow * cols + f.col] = d;
      const ms = CONNECT4.dropBaseMs + CONNECT4.dropPerRowMs * (f.toRow - f.fromRow);
      longest = Math.max(longest, ms + 280);
      if (d) this.tweens.add({ targets: d, y: this.cellY(f.toRow), duration: ms, delay: 280, ease: 'Bounce.easeOut' });
    }
    this.time.delayedCall(Math.max(500, longest), () => this.afterDrop(player, res.win?.line ?? null, res.draw, res.win?.player ?? player));
  }

  private afterDrop(player: PlayerId, win: Pos[] | null, draw: boolean, winner: PlayerId = player): void {
    if (win) {
      this.phase = 'over';
      this.showWin(win, winner);
      this.updateButtons();
      this.score(winner);
      if (!this.match.over) this.time.delayedCall(CONNECT4.roundPauseMs, () => this.newRound(other(winner)));
    } else if (draw) {
      this.phase = 'over';
      this.updateButtons();
      Sfx.tone(260, 0.3, 'sine', 0.2);
      this.cameras.main.shake(150, 0.003);
      this.time.delayedCall(CONNECT4.roundPauseMs * 0.7, () => this.newRound(other(this.starter)));
    } else {
      if (this.extraTurn) this.extraTurn = false; // DOUBLE: the same player goes again
      else this.turn = other(player);
      this.phase = 'play';
      this.refreshTurn();
    }
  }

  private showWin(line: Pos[], winner: PlayerId): void {
    this.pulse?.remove();
    PLAYERS.forEach((p) => this.panels[p].setVisible(false));
    this.frame.clear();
    const g = this.highlight.clear();
    line.forEach((c) => {
      const x = this.cellX(c.col);
      const y = this.cellY(c.row);
      g.lineStyle(10, 0xffffff, 1).strokeCircle(x, y, CONNECT4.cell * CONNECT4.discFill + 8);
      const d = this.discs[c.row * this.rules.cols + c.col];
      if (d) this.tweens.add({ targets: d, scale: 1.14, duration: 300, yoyo: true, repeat: 3 });
    });
    this.tweens.add({ targets: g, alpha: { from: 1, to: 0.3 }, duration: 300, yoyo: true, repeat: 3 });
    const tint = this.add.rectangle(W / 2, H / 2, W, H, PLAYER[winner].main, 0.15).setDepth(2);
    this.tweens.add({ targets: tint, alpha: 0, duration: 1500, onComplete: () => tint.destroy() });
  }

  private newRound(starter: PlayerId): void {
    this.discs.forEach((d) => d?.destroy());
    this.discs = [];
    this.highlight.clear().setAlpha(1);
    this.roundNo++;
    this.starter = starter;
    this.turn = starter;
    this.setupRound(true);
  }
}

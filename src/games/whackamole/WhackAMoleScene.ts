import { Sfx } from '../../core/audio/Sfx';
import { BaseGameScene } from '../../core/BaseGameScene';
import type { PlayerPointer } from '../../core/input/PlayerInput';
import { H, W } from '../../core/layout';
import { CARD, COLORS, PLAYER } from '../../core/theme';
import { PLAYERS, type PlayerId } from '../../core/types';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { runCountdown } from '../../ui/Countdown';
import { BAR, GRID, WHACKAMOLE, WHACKAMOLE_STRINGS } from './config';
import { createSide, mulberry32, pickHole, step, whack, type SideState } from './logic';
import { HoleView } from './pieces';

/** Screen centres of a player's holes. Index = row * cols + col, row 0 is nearest the player. */
export function holeCentres(p: PlayerId): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let r = 0; r < GRID.rows; r++) {
    for (let c = 0; c < GRID.cols; c++) {
      const x = GRID.nearX + r * GRID.gapX;
      out.push({ x: p === 0 ? x : W - x, y: GRID.centerY + (c - (GRID.cols - 1) / 2) * GRID.gapY });
    }
  }
  return out;
}

export class WhackAMoleScene extends BaseGameScene {
  /** Simulation state per player (public so tests can poke it). */
  sides!: [SideState, SideState];
  centres!: { x: number; y: number }[][];
  private views: HoleView[][] = [];
  /** Play time (ms) of the whole match: the difficulty clock. It keeps running across rounds. */
  clock = 0;
  round = 0;
  /** Points in the current round per player (first to WHACKAMOLE.roundPoints wins the round). */
  roundPts: [number, number] = [0, 0];
  private bar!: Phaser.GameObjects.Graphics;
  private stunFx: Phaser.GameObjects.Rectangle[] = [];
  private friendsSeen: [number, number] = [0, 0];
  private rng: () => number = Math.random;

  constructor() {
    super(WHACKAMOLE.sceneKey, WHACKAMOLE.id, WHACKAMOLE.targetScore);
  }

  protected drawBackground(): void {
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg);
    const g = this.add.graphics();
    const m = 40;
    const r = CARD.radius + 10;
    g.fillStyle(0x080e1a, 0.3).fillRoundedRect(m, m + 14, W - 2 * m, H - 2 * m, r);
    g.fillStyle(COLORS.inset, 1).fillRoundedRect(m, m, W - 2 * m, H - 2 * m, r);
    // Each half is a grassy lawn tinted for its player.
    g.fillStyle(0x2f5a4a, 1).fillRoundedRect(m, m, W / 2 - m, H - 2 * m, { tl: r, bl: r, tr: 0, br: 0 });
    g.fillStyle(0x2f5a4a, 1).fillRoundedRect(W / 2, m, W / 2 - m, H - 2 * m, { tl: 0, bl: 0, tr: r, br: r });
    g.fillStyle(PLAYER[0].main, 0.16).fillRoundedRect(m, m, W / 2 - m, H - 2 * m, { tl: r, bl: r, tr: 0, br: 0 });
    g.fillStyle(PLAYER[1].main, 0.16).fillRoundedRect(W / 2, m, W / 2 - m, H - 2 * m, { tl: 0, bl: 0, tr: r, br: r });
    g.fillStyle(PLAYER[0].main, 0.5).fillRoundedRect(m, m, 16, H - 2 * m, { tl: r, bl: r, tr: 0, br: 0 });
    g.fillStyle(PLAYER[1].main, 0.5).fillRoundedRect(W - m - 16, m, 16, H - 2 * m, { tl: 0, bl: 0, tr: r, br: r });
    g.lineStyle(8, COLORS.line, 1).lineBetween(W / 2, m, W / 2, H - m);
    // Grass tufts, fixed pattern.
    const rnd = mulberry32(7);
    g.lineStyle(5, 0x3f7a62, 0.8);
    for (let i = 0; i < 70; i++) {
      const x = m + 30 + rnd() * (W - 2 * m - 60);
      const y = m + 30 + rnd() * (H - 2 * m - 60);
      if (Math.abs(x - W / 2) < 20) continue;
      g.lineBetween(x, y, x - 6, y - 16).lineBetween(x, y, x + 6, y - 16).lineBetween(x, y, x, y - 20);
    }
  }

  protected onCreate(): void {
    this.rng = Math.random;
    this.clock = 0;
    this.round = 1;
    this.roundPts = [0, 0];
    this.friendsSeen = [0, 0];
    this.centres = [holeCentres(0), holeCentres(1)];
    this.sides = [this.freshSide(), this.freshSide()];
    this.views = PLAYERS.map((p) => this.centres[p].map((c) => new HoleView(this, c.x, c.y, p)));
    this.bar = this.add.graphics().setDepth(6);
    // A grey veil over a player's half while they are stunned (after whacking a friendly bunny).
    this.stunFx = PLAYERS.map((p) => this.add.rectangle(p === 0 ? W / 4 + 20 : (3 * W) / 4 - 20, H / 2, W / 2 - 40, H - 80, 0x080e1a, 0.4).setDepth(35).setVisible(false));
    this.players.on('down', this.onDown, this);
    this.drawBar();
  }

  private freshSide(): SideState {
    return createSide(GRID.cols * GRID.rows, this.clock + WHACKAMOLE.firstSpawnMs, Math.max(WHACKAMOLE.bossAfterMs, this.clock + 8000));
  }

  /** Test hook: use a seeded RNG for repeatable spawns. */
  seed(n: number): void {
    this.rng = mulberry32(n);
  }

  protected onTick(_time: number, delta: number): void {
    this.clock += Math.min(delta, 100);
    for (const p of PLAYERS) {
      const res = step(this.sides[p], this.clock, this.rng);
      res.expired.forEach((i) => this.views[p][i].sink());
      res.spawned.forEach((s) => {
        const mole = this.sides[p].holes[s.hole];
        this.views[p][s.hole].popUp(s.kind, mole?.hp ?? 1);
        if (s.kind === 'golden') Sfx.tone(1175, 0.1, 'triangle', 0.1);
        else if (s.kind === 'boss') Sfx.tone(130, 0.3, 'sawtooth', 0.14);
        else if (s.kind === 'friend' && this.friendsSeen[p]++ < 2) this.friendTip(p, s.hole);
      });
    }
  }

  /** The first couple of bunnies get a "FRIEND!" label so nobody has to learn it by being stunned. */
  private friendTip(p: PlayerId, hole: number): void {
    const c = this.centres[p][hole];
    const dir = p === 0 ? 1 : -1;
    const l = new RotatedLabel(this, c.x + dir * 150, c.y, WHACKAMOLE_STRINGS.friend, p, { size: 70, color: 0x8ad0ff, stroke: COLORS.inset, display: true }).setDepth(40);
    this.tweens.add({ targets: l, alpha: 0, delay: 1300, duration: 400, onComplete: () => l.destroy() });
  }

  private onDown(e: PlayerPointer): void {
    if (!this.running || this.match.over) return;
    const p = e.player;
    const side = this.sides[p];
    const i = pickHole(side, this.centres[p], e.x, e.y, WHACKAMOLE.hitRadius);
    if (i < 0) return; // empty hole or nothing nearby: nothing happens, no penalty
    const res = whack(side, i, this.clock);
    switch (res.kind) {
      case 'none':
        return;
      case 'stunned':
        Sfx.tone(160, 0.08, 'sine', 0.08);
        return;
      case 'bossHit':
        this.views[p][i].bossHit(res.hpLeft);
        Sfx.tone(220 + (WHACKAMOLE.bossHp - res.hpLeft) * 90, 0.12, 'square', 0.16);
        Sfx.vibrate(20);
        this.burst(p, i, 0xb79cf0, 6);
        return;
      case 'friend':
        this.views[p][i].squash();
        this.stun(p, i);
        return;
      case 'score': {
        this.views[p][i].squash();
        const golden = res.mole.kind === 'golden';
        const boss = res.mole.kind === 'boss';
        this.hitEffects(p, i, golden, boss, res.points);
        this.addPoints(p, res.points);
      }
    }
  }

  /** Whacked a friendly bunny: a short, gentle stun. No points are lost. */
  private stun(p: PlayerId, i: number): void {
    const c = this.centres[p][i];
    Sfx.tone(180, 0.25, 'sine', 0.14);
    Sfx.tone(140, 0.25, 'sine', 0.12, 0.12);
    Sfx.vibrate(40);
    const fx = this.stunFx[p].setVisible(true);
    this.time.delayedCall(WHACKAMOLE.stunMs, () => fx.setVisible(false));
    const l = new RotatedLabel(this, c.x, c.y, WHACKAMOLE_STRINGS.oops, p, { size: 110, color: 0x8ad0ff, stroke: COLORS.inset, display: true }).setDepth(40);
    this.tweens.add({ targets: l, alpha: 0, scale: { from: 0.6, to: 1.2 }, duration: 900, ease: 'Quad.Out', onComplete: () => l.destroy() });
  }

  private addPoints(p: PlayerId, pts: number): void {
    this.roundPts[p] += pts;
    this.drawBar();
    if (this.roundPts[p] >= WHACKAMOLE.roundPoints) this.endRound(p);
  }

  /** Progress toward the round win along each player's outer edge. */
  private drawBar(): void {
    const g = this.bar.clear();
    const h = BAR.y1 - BAR.y0;
    for (const p of PLAYERS) {
      const x = p === 0 ? BAR.x : W - BAR.x - BAR.w;
      g.fillStyle(0x080e1a, 0.4).fillRoundedRect(x, BAR.y0, BAR.w, h, 13);
      const k = Math.min(1, this.roundPts[p] / WHACKAMOLE.roundPoints);
      if (k > 0) g.fillStyle(PLAYER[p].main, 1).fillRoundedRect(x + 3, BAR.y1 - 3 - (h - 6) * k, BAR.w - 6, Math.max(14, (h - 6) * k), 10);
      g.lineStyle(4, COLORS.border, 1).strokeRoundedRect(x, BAR.y0, BAR.w, h, 13);
      g.fillStyle(0xffc928, 1).fillCircle(x + BAR.w / 2, BAR.y0 - 24, 14); // the goal
    }
  }

  private endRound(winner: PlayerId): void {
    this.running = false;
    this.sides.forEach((s, p) => {
      s.holes.fill(null);
      this.views[p].forEach((v) => v.sink());
    });
    this.stunFx.forEach((f) => f.setVisible(false));
    for (const p of PLAYERS) {
      const a = { x: p === 0 ? 560 : W - 560, y: H / 2 };
      const l = new RotatedLabel(this, a.x, a.y, WHACKAMOLE_STRINGS.round, p, { size: 200, color: PLAYER[winner].onDark, stroke: COLORS.inset, display: true }).setDepth(100);
      this.tweens.add({ targets: l, scale: { from: 0.4, to: 1.1 }, duration: 350, ease: 'Back.Out' });
      this.tweens.add({ targets: l, alpha: 0, delay: 1200, duration: 400, onComplete: () => l.destroy() });
    }
    const glow = this.add.circle(winner === 0 ? W / 4 : (3 * W) / 4, H / 2, 200, PLAYER[winner].main, 0.5).setDepth(40);
    this.tweens.add({ targets: glow, scale: 4, alpha: 0, duration: 800, onComplete: () => glow.destroy() });
    this.score(winner);
    if (this.match.over) return;
    this.time.delayedCall(WHACKAMOLE.roundPauseMs, () => this.newRound());
  }

  private newRound(): void {
    this.round++;
    this.roundPts = [0, 0];
    this.sides = [this.freshSide(), this.freshSide()];
    this.drawBar();
    runCountdown(this, () => (this.running = true));
  }

  private burst(p: PlayerId, i: number, col: number, n = 8): void {
    const c = this.centres[p][i];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const dot = this.add.circle(c.x, c.y, 11, col, 1).setDepth(30);
      this.tweens.add({ targets: dot, x: c.x + Math.cos(a) * 130, y: c.y + Math.sin(a) * 130, alpha: 0, scale: 0.3, duration: 420, ease: 'Quad.Out', onComplete: () => dot.destroy() });
    }
  }

  private hitEffects(p: PlayerId, i: number, golden: boolean, boss: boolean, pts: number): void {
    const c = this.centres[p][i];
    const col = golden ? 0xffc928 : boss ? 0xb79cf0 : PLAYER[p].light;
    Sfx.tone(golden || boss ? 880 : 300 + Math.random() * 120, 0.12, 'square', 0.15);
    if (golden || boss) Sfx.tone(1320, 0.18, 'triangle', 0.18, 0.08);
    Sfx.vibrate(golden || boss ? [20, 20, 40] : 15);
    this.burst(p, i, col, boss ? 14 : 8);
    // "+1" / "+3" / "+5" floats away from the player, readable by them.
    const dir = p === 0 ? 1 : -1;
    const big = golden || boss;
    const l = new RotatedLabel(this, c.x, c.y, `+${pts}`, p, { size: big ? 130 : 100, color: golden ? 0xffd84d : boss ? 0xd2bcff : COLORS.text, stroke: COLORS.inset, display: true }).setDepth(40);
    this.tweens.add({ targets: l, x: c.x + dir * 120, alpha: 0, scale: { from: 0.6, to: 1.2 }, duration: 700, ease: 'Quad.Out', onComplete: () => l.destroy() });
  }
}

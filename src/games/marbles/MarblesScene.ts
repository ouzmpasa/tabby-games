import Phaser from 'phaser';
import { Sfx } from '../../core/audio/Sfx';
import { BaseGameScene } from '../../core/BaseGameScene';
import type { PlayerPointer } from '../../core/input/PlayerInput';
import { endAnchor, H, W } from '../../core/layout';
import { settings } from '../../core/settings';
import { CARD, COLORS, PLAYER } from '../../core/theme';
import { other, PLAYERS, type PlayerId } from '../../core/types';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { MARBLES, MARBLES_TEXT } from './config';
import {
  aimFromPull,
  cfgForLevel,
  createWorld,
  freeze,
  isSettled,
  levelFor,
  needsRefill,
  pickMarble,
  placePegs,
  shoot,
  stepWorld,
  type Cfg,
  type Marble,
  type Shot,
  type World,
} from './logic';
import { makeMarble } from './pieces';

type Phase = 'countdown' | 'aim' | 'roll' | 'pause' | 'over';

const { centerX: CX, centerY: CY, marbleRadius: MR } = MARBLES;
/** The biggest arena (level 0); the pit around it is drawn once. */
const R_MAX = MARBLES.arenaRadius;

const yourTurn = (): string => (settings.get().lang === 'nl' ? 'Jouw beurt' : 'Your turn');

export class MarblesScene extends BaseGameScene {
  /** Simulation state (public so tests can poke it). */
  world!: World;
  turn: PlayerId = 0;
  phase: Phase = 'countdown';
  /** Difficulty level of the current board (arena size, friction, pegs) and the physics knobs for it. */
  level = 0;
  cfg: Cfg = MARBLES;
  /** The one finger (pointer id) that is aiming right now (only the active player's). */
  private finger: number | null = null;
  private anchor = { x: 0, y: 0 };
  private cursor = { x: 0, y: 0 };
  private selected: number | null = null;
  private rollMs = 0;
  private settleMs = 0;
  private idleMs = 0;
  private views = new Map<number, Phaser.GameObjects.Container>();
  private aim!: Phaser.GameObjects.Graphics;
  private rim!: Phaser.GameObjects.Graphics;
  private panels: Phaser.GameObjects.Container[] = [];
  private pulse?: Phaser.Tweens.Tween;
  private arenaG!: Phaser.GameObjects.Graphics;
  private trailG!: Phaser.GameObjects.Graphics;
  private pegViews: Phaser.GameObjects.Container[] = [];
  /** Where the last shot's marble went, and how long ago it came to rest. */
  private trail: Array<{ x: number; y: number }> = [];
  private trailAge = 0;
  private shownR: number = R_MAX;
  private shotBy: PlayerId | null = null;
  private shotId: number | null = null;
  private hints: RotatedLabel[][] = [[], []];
  private acted: [boolean, boolean] = [false, false];
  private lastClack = 0;

  constructor() {
    super(MARBLES.sceneKey, MARBLES.id, MARBLES.targetScore);
  }

  protected drawBackground(): void {
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg);
    const g = this.add.graphics();
    const m = 40;
    const r = CARD.radius + 10;
    g.fillStyle(0x080e1a, 0.3).fillRoundedRect(m, m + 14, W - 2 * m, H - 2 * m, r);
    g.fillStyle(COLORS.inset, 1).fillRoundedRect(m, m, W - 2 * m, H - 2 * m, r);
    // the pit around the arena (the floor itself is drawn per level by drawArena)
    g.fillStyle(0x080e1a, 0.35).fillCircle(CX, CY + 12, R_MAX + 14);
    g.fillStyle(0x0e1626, 1).fillCircle(CX, CY, R_MAX + 10);
  }

  /** The floor, the start spots and the rim, for a (possibly shrinking) arena radius. */
  private drawArena(radius: number): void {
    const g = this.arenaG.clear();
    g.fillStyle(COLORS.surface, 1).fillCircle(CX, CY, radius);
    g.fillStyle(PLAYER[0].main, 0.14).beginPath().arc(CX, CY, radius, Math.PI / 2, (3 * Math.PI) / 2, false).closePath().fillPath();
    g.fillStyle(PLAYER[1].main, 0.14).beginPath().arc(CX, CY, radius, -Math.PI / 2, Math.PI / 2, false).closePath().fillPath();
    g.lineStyle(4, COLORS.line, 0.8).lineBetween(CX, CY - radius, CX, CY + radius).strokeCircle(CX, CY, 90);
    for (const p of PLAYERS) {
      for (let i = 0; i < MARBLES.perPlayer; i++) {
        const x = CX + (p === 0 ? -1 : 1) * MARBLES.startOffsetX;
        const y = CY + (i - (MARBLES.perPlayer - 1) / 2) * MARBLES.startSpacing;
        g.lineStyle(4, PLAYER[p].main, 0.3).strokeCircle(x, y, MR + 10);
      }
    }
    g.lineStyle(10, COLORS.border, 1).strokeCircle(CX, CY, radius + 5);
    this.shownR = radius;
    this.rim?.clear().lineStyle(14, PLAYER[this.turn].main, 0.95).strokeCircle(CX, CY, radius + 5);
  }

  protected onCreate(): void {
    this.finger = null;
    this.selected = null;
    this.rollMs = this.settleMs = this.idleMs = 0;
    this.phase = 'countdown';
    this.turn = Math.random() < 0.5 ? 0 : 1;
    this.views = new Map();
    this.level = 0;
    this.cfg = cfgForLevel(0);
    this.shownR = R_MAX;
    this.trail = [];
    this.trailAge = 1e9;
    this.shotBy = null;
    this.acted = [false, false];
    this.pegViews = [];
    this.rim = this.add.graphics().setDepth(3);
    this.arenaG = this.add.graphics().setDepth(1);
    this.drawArena(this.cfg.arenaRadius);
    this.trailG = this.add.graphics().setDepth(9);
    this.aim = this.add.graphics().setDepth(15);
    this.panels = PLAYERS.map((p) => this.makeTurnPanel(p));
    PLAYERS.forEach((p) => {
      const a = endAnchor(p, 100, -300);
      this.badges[p].setPosition(a.x, a.y);
    });
    this.spawnWorld();
    this.players.on('down', this.onDown, this);
    this.players.on('move', this.onMove, this);
    this.players.on('up', this.onUp, this);
    this.events.on('resume', this.releaseFinger, this);
    this.events.once('shutdown', () => this.events.off('resume', this.releaseFinger, this));
    this.makeHints();
    this.refreshTurn();
    this.render();
  }

  private makeHints(): void {
    const txt = MARBLES_TEXT[settings.get().lang === 'nl' ? 'nl' : 'en'];
    PLAYERS.forEach((p) => {
      const a = endAnchor(p, 85, 0);
      const d = p === 0 ? 1 : -1; // second line sits further from the player's edge
      this.hints[p] = [
        new RotatedLabel(this, a.x, a.y, txt.hint, p, { size: 42, color: PLAYER[p].onDark, display: true }).setDepth(30).setAlpha(0.95),
        new RotatedLabel(this, a.x + d * 50, a.y, txt.hint2, p, { size: 34, color: PLAYER[p].onDark, display: true }).setDepth(30).setAlpha(0.8),
      ];
    });
  }

  protected onStart(): void {
    this.phase = 'aim';
    this.idleMs = 0;
  }

  // ---- setup ---------------------------------------------------------------------------------

  /** Shots taken since the board was last filled; the very first one is power-capped (see MARBLES.openingPowerCap). */
  private shotsSinceFill = 0;

  private maxPower(): number {
    return this.shotsSinceFill === 0 ? MARBLES.openingPowerCap : 1;
  }

  private spawnWorld(): void {
    this.shotsSinceFill = 0;
    this.views.forEach((v) => v.destroy());
    this.views.clear();
    // the board for the current level: a smaller arena, slippier floor, bumper pegs
    this.level = levelFor(Math.max(this.match?.scores[0] ?? 0, this.match?.scores[1] ?? 0));
    this.cfg = cfgForLevel(this.level);
    const from = this.shownR;
    const to = this.cfg.arenaRadius;
    if (Math.abs(from - to) > 0.5) {
      const o = { r: from };
      this.tweens.add({ targets: o, r: to, duration: 600, onUpdate: () => this.drawArena(o.r), onComplete: () => this.drawArena(to) });
    }
    this.pegViews.forEach((v) => v.destroy());
    const pegs = placePegs(this.level);
    this.pegViews = pegs.map((peg) => this.makePeg(peg.x, peg.y));
    this.world = createWorld(this.cfg, pegs);
    this.trail = [];
    this.trailAge = 1e9;
    for (const m of this.world.marbles) this.views.set(m.id, makeMarble(this, m.owner).setDepth(10));
  }

  /** A bumper peg: a dark post with a bright ring, marbles bounce off it. */
  private makePeg(x: number, y: number): Phaser.GameObjects.Container {
    const r = MARBLES.pegRadius;
    const c = this.add.container(x, y, [
      this.add.circle(4, 10, r, 0x080e1a, 0.4),
      this.add.circle(0, 0, r, 0xf2b53a),
      this.add.circle(0, 0, r * 0.74, 0x10192a),
      this.add.circle(0, 0, r * 0.4, 0xf2b53a),
      this.add.circle(-r * 0.12, -r * 0.12, r * 0.12, 0xffffff, 0.8),
    ]).setDepth(8);
    this.tweens.add({ targets: c, scale: { from: 0.2, to: 1 }, duration: 450, ease: 'Back.Out' });
    return c;
  }

  private makeTurnPanel(p: PlayerId): Phaser.GameObjects.Container {
    const a = endAnchor(p, 290);
    const c = this.add.container(a.x, a.y).setRotation(a.rotation).setDepth(5);
    const g = this.add.graphics();
    g.fillStyle(PLAYER[p].main, 0.3).fillRoundedRect(-180, -110, 360, 220, CARD.radius);
    g.lineStyle(8, PLAYER[p].main, 1).strokeRoundedRect(-180, -110, 360, 220, CARD.radius);
    const icon = makeMarble(this, p).setPosition(0, -42).setScale(0.8);
    const label = new RotatedLabel(this, 0, 52, yourTurn(), null, { size: 56, color: PLAYER[p].onDark, display: true });
    c.add([g, icon, label]);
    return c;
  }

  /** Light up the active player's panel, score edge and the arena rim; dim the other panel. */
  private refreshTurn(): void {
    this.pulse?.remove();
    PLAYERS.forEach((p) => {
      this.badges[p].setActiveEdge(p === this.turn);
      this.tweens.killTweensOf(this.panels[p]);
      this.panels[p].setAlpha(p === this.turn ? 1 : 0.18).setScale(1);
    });
    this.pulse = this.tweens.add({ targets: this.panels[this.turn], scale: { from: 1, to: 1.08 }, duration: 550, yoyo: true, repeat: -1 });
    this.rim.clear().lineStyle(14, PLAYER[this.turn].main, 0.95).strokeCircle(CX, CY, this.shownR + 5);
    this.idleMs = 0;
  }

  // ---- input ---------------------------------------------------------------------------------

  private onDown(e: PlayerPointer): void {
    if (!this.running || this.phase !== 'aim' || this.match.over) return;
    if (e.player !== this.turn) {
      // not your turn: nudge the panel of whoever's turn it is
      this.tweens.add({ targets: this.panels[this.turn], angle: this.panels[this.turn].angle + 4, duration: 70, yoyo: true, repeat: 1 });
      return;
    }
    if (this.finger !== null) return; // one finger per player
    const m = pickMarble(this.world, this.turn, e.x, e.y);
    if (!m) return;
    this.finger = e.id;
    this.selected = m.id;
    this.anchor = { x: e.x, y: e.y };
    this.cursor = { x: e.x, y: e.y };
    this.idleMs = 0;
    Sfx.tone(440, 0.05, 'triangle', 0.1);
  }

  private onMove(e: PlayerPointer): void {
    if (this.finger !== e.id) return;
    this.cursor = { x: e.x, y: e.y };
  }

  private onUp(e: PlayerPointer): void {
    if (this.finger !== e.id) return;
    const id = this.selected;
    const shot = aimFromPull({ x: this.anchor.x - e.x, y: this.anchor.y - e.y }, MARBLES, this.maxPower());
    this.finger = null;
    this.selected = null;
    if (!this.running || this.phase !== 'aim' || id === null || !shot) return;
    this.takeShot(id, shot);
  }

  private releaseFinger(): void {
    this.finger = null;
    this.selected = null;
    this.players.tracker.clear();
  }

  /** Fire the given marble (also used by tests). */
  takeShot(id: number, shot: Shot): void {
    const m = this.world.marbles.find((x) => x.id === id);
    if (!m || !m.alive || this.phase !== 'aim') return;
    shoot(m, shot, this.cfg);
    this.shotsSinceFill++;
    this.shotBy = m.owner;
    this.shotId = m.id;
    this.trail = [{ x: m.x, y: m.y }];
    this.trailAge = 0;
    if (!this.acted[m.owner]) {
      this.acted[m.owner] = true;
      this.tweens.add({ targets: this.hints[m.owner], alpha: 0, duration: 400 });
    }
    this.phase = 'roll';
    this.rollMs = 0;
    this.settleMs = 0;
    Sfx.tone(200 + 300 * shot.power, 0.08, 'triangle', 0.18);
    Sfx.vibrate(10);
  }

  // ---- simulation ----------------------------------------------------------------------------

  protected onTick(_time: number, delta: number): void {
    const dt = Math.min(delta, 50);
    if (this.phase !== 'roll') this.trailAge += dt;
    if (this.phase === 'aim') {
      if (this.finger === null) this.idleMs += dt;
      if (this.idleMs > MARBLES.aimIdleMs) this.passTurn();
    } else if (this.phase === 'roll') {
      this.rollMs += dt;
      const res = stepWorld(this.world, dt / 1000, this.cfg);
      const sm = this.shotMarble();
      if (sm) {
        const last = this.trail[this.trail.length - 1];
        if (!last || Math.hypot(sm.x - last.x, sm.y - last.y) > 6) this.trail.push({ x: sm.x, y: sm.y });
      }
      if (res.impact > 120 && this.time.now - this.lastClack > 60) {
        this.lastClack = this.time.now;
        Sfx.tone(700 + Math.min(res.impact, 1500) * 0.3, 0.04, 'triangle', Math.min(0.25, 0.05 + res.impact / 6000));
        if (res.impact > 700) Sfx.vibrate(8);
      }
      for (const m of res.out) this.onOut(m);
      if (this.match.over) {
        this.phase = 'over';
      } else if (this.rollMs > MARBLES.rollTimeoutMs) {
        freeze(this.world);
      }
      if (this.phase === 'roll' && isSettled(this.world)) {
        this.settleMs += dt;
        if (this.settleMs >= MARBLES.settleDelayMs) this.endTurn();
      } else this.settleMs = 0;
    }
    this.render();
  }

  private shotMarble(): Marble | null {
    return this.shotId === null ? null : (this.world.marbles.find((x) => x.id === this.shotId) ?? null);
  }

  private onOut(m: Marble): void {
    const view = this.views.get(m.id);
    if (view) {
      this.views.delete(m.id);
      (view.getData('shadow') as Phaser.GameObjects.Arc).setAlpha(0);
      this.tweens.add({
        targets: view,
        x: view.x + m.vx * 0.2,
        y: view.y + m.vy * 0.2,
        scale: 0.3,
        alpha: 0,
        duration: 500,
        ease: 'Quad.In',
        onComplete: () => view.destroy(),
      });
    }
    Sfx.tone(330, 0.25, 'sine', 0.18);
    const shooter = this.turn;
    if (m.owner === shooter) return; // own marble lost: no point
    this.score(shooter);
    // "+1" floats in from the rim, facing the scorer
    const ang = Math.atan2(m.y - CY, m.x - CX);
    const lx = CX + Math.cos(ang) * this.cfg.arenaRadius * 0.78;
    const ly = CY + Math.sin(ang) * this.cfg.arenaRadius * 0.78;
    const l = new RotatedLabel(this, lx, ly, '+1', shooter, { size: 130, color: PLAYER[shooter].onDark, stroke: COLORS.inset, display: true }).setDepth(100);
    this.tweens.add({ targets: l, scale: { from: 0.4, to: 1.1 }, duration: 300, ease: 'Back.Out' });
    this.tweens.add({ targets: l, alpha: 0, y: ly - 40, delay: 500, duration: 300, onComplete: () => l.destroy() });
  }

  private endTurn(): void {
    if (this.match.over) return;
    if (needsRefill(this.world)) {
      this.phase = 'pause';
      const flash = this.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 0.25).setDepth(90);
      this.tweens.add({ targets: flash, alpha: 0, duration: MARBLES.refillPauseMs, onComplete: () => flash.destroy() });
      this.time.delayedCall(MARBLES.refillPauseMs * 0.5, () => {
        this.spawnWorld();
        this.views.forEach((v) => this.tweens.add({ targets: v, scale: { from: 0.2, to: 1 }, duration: 350, ease: 'Back.Out' }));
      });
      this.time.delayedCall(MARBLES.refillPauseMs, () => {
        this.turn = other(this.turn);
        this.refreshTurn();
        this.phase = 'aim';
      });
      return;
    }
    this.passTurn();
  }

  private passTurn(): void {
    this.turn = other(this.turn);
    this.phase = 'aim';
    this.finger = null;
    this.selected = null;
    this.refreshTurn();
  }

  // ---- drawing -------------------------------------------------------------------------------

  /**
   * Slingshot guide: the pull handle with its rubber band and a short dotted cue showing only the DIRECTION (same length for
   * every pull). No ghost marble, no target arrows, no power bar or ring: how hard to pull is the skill. The trail of the last
   * shot (drawTrail) is what teaches it.
   */
  private drawAim(): void {
    const g = this.aim.clear();
    const t = this.time.now;
    if (this.phase === 'aim' && this.running) {
      // ring around the active player's marbles (the selected one is bolder)
      for (const m of this.world.marbles) {
        if (!m.alive || m.owner !== this.turn) continue;
        const sel = m.id === this.selected;
        g.lineStyle(sel ? 8 : 5, PLAYER[this.turn].light, sel ? 1 : 0.35 + 0.3 * Math.sin(t / 220)).strokeCircle(m.x, m.y, MR + (sel ? 12 : 10 + 3 * Math.sin(t / 220)));
      }
    }
    const m = this.selected === null ? null : this.world.marbles.find((x) => x.id === this.selected);
    if (this.finger === null || !m || !m.alive) return;
    const col = PLAYER[this.turn].main;
    const pull = { x: this.anchor.x - this.cursor.x, y: this.anchor.y - this.cursor.y };
    const len = Math.hypot(pull.x, pull.y);
    const shot = aimFromPull(pull, this.cfg, this.maxPower());
    // pulled-back handle and rubber band (drawn opposite to the shot)
    const cl = Math.min(len, MARBLES.maxPull);
    const hx = len > 0 ? m.x - (pull.x / len) * cl : m.x;
    const hy = len > 0 ? m.y - (pull.y / len) * cl : m.y;
    g.lineStyle(10, col, 0.5).lineBetween(m.x, m.y, hx, hy);
    g.fillStyle(col, 0.5).fillCircle(hx, hy, 26);
    if (!shot) return;
    for (let i = 0; i < MARBLES.aimDots; i++) {
      const d = MR + 22 + i * MARBLES.aimDotGap;
      g.fillStyle(col, 0.9).fillCircle(m.x + shot.dirX * d, m.y + shot.dirY * d, 7);
    }
  }

  /** Where the last shot's marble travelled, fading after it stops: feedback for learning how hard to pull. */
  private drawTrail(): void {
    const g = this.trailG.clear();
    if (this.trail.length < 2 || this.shotBy === null) return;
    const f = this.phase === 'roll' ? 1 : Math.max(0, 1 - this.trailAge / MARBLES.trailMs);
    if (f <= 0) return;
    const col = PLAYER[this.shotBy].main;
    g.lineStyle(14, col, 0.28 * f);
    g.beginPath().moveTo(this.trail[0].x, this.trail[0].y);
    for (let i = 1; i < this.trail.length; i++) g.lineTo(this.trail[i].x, this.trail[i].y);
    g.strokePath();
    const e = this.trail[this.trail.length - 1];
    if (this.phase !== 'roll') g.lineStyle(6, col, 0.6 * f).strokeCircle(e.x, e.y, MR + 10);
  }

  private render(): void {
    for (const m of this.world.marbles) {
      const v = this.views.get(m.id);
      if (v && m.alive) v.setPosition(m.x, m.y);
    }
    this.drawAim();
    this.drawTrail();
  }
}

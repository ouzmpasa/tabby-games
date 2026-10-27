import Phaser from 'phaser';
import { Sfx } from '../../core/audio/Sfx';
import { BaseGameScene } from '../../core/BaseGameScene';
import type { PlayerPointer } from '../../core/input/PlayerInput';
import { endAnchor, H, W } from '../../core/layout';
import { settings } from '../../core/settings';
import { CARD, COLORS, PLAYER } from '../../core/theme';
import { PLAYERS, type PlayerId } from '../../core/types';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { CURLING } from './config';
import {
  addStone,
  aimFromPull,
  createWorld,
  freeze,
  isSettled,
  launchSpot,
  makeRng,
  nextStarter,
  rollCurl,
  scoreEnd,
  stepWorld,
  stonesPerEnd,
  SweepMeter,
  throwerFor,
  throwStone,
  type EndScore,
  type Shot,
  type Stone,
  type World,
} from './logic';
import { makeStone } from './pieces';

type Phase = 'countdown' | 'aim' | 'slide' | 'scoring' | 'over';

/** Texts a player must read (they are rotated to face the player). */
export const TEXT = {
  en: { yourTurn: 'Your turn', blank: 'No points', sweep: 'SWEEP!', hint: 'Pull back to throw, then sweep fast!' },
  nl: { yourTurn: 'Jouw beurt', blank: 'Geen punten', sweep: 'VEEG!', hint: 'Trek terug om te gooien, veeg dan snel!' },
} as const;
const say = (k: keyof (typeof TEXT)['en']): string => TEXT[settings.get().lang === 'nl' ? 'nl' : 'en'][k];

const { centerX: CX, centerY: CY, stoneRadius: SR, sheet: SH, rings: RINGS } = CURLING;
/** Sweep meter (under the player's panel): length along the screen edge, thickness. */
const METER = { w: 300, h: 34 };
const TRAIL_MS = 2600;
const ICE = 0xe6f1fb;

export class CurlingScene extends BaseGameScene {
  /** Simulation state (public so tests can poke it). */
  world!: World;
  turn: PlayerId = 0;
  starter: PlayerId = 0;
  /** Stones thrown (or forfeited) so far this end. */
  thrown = 0;
  phase: Phase = 'countdown';
  /** The one finger (pointer id) that is aiming right now (only the active player's). */
  private finger: number | null = null;
  private anchor = { x: 0, y: 0 };
  private cursor = { x: 0, y: 0 };
  private slideMs = 0;
  private settleMs = 0;
  private idleMs = 0;
  private views = new Map<number, Phaser.GameObjects.Container>();
  private ready: Phaser.GameObjects.Container[] = [];
  private aim!: Phaser.GameObjects.Graphics;
  private rim!: Phaser.GameObjects.Graphics;
  private fx!: Phaser.GameObjects.Graphics;
  private panels: Phaser.GameObjects.Container[] = [];
  private dots: Phaser.GameObjects.Graphics[] = [];
  private pulse?: Phaser.Tweens.Tween;
  private lastClack = 0;
  /** Seed for the per-throw curl (tests may set it before `create`). */
  curlSeed = (Math.random() * 2 ** 32) >>> 0;
  private rng: () => number = makeRng(1);
  /** The stone being thrown (the only one that can be swept) and who sweeps it. */
  private sliding: Stone | null = null;
  private sweepFinger: number | null = null;
  readonly sweep = new SweepMeter();
  private trail: { x1: number; y1: number; x2: number; y2: number; t: number }[] = [];
  private trailG!: Phaser.GameObjects.Graphics;
  private sweepG!: Phaser.GameObjects.Graphics;
  private meters: Phaser.GameObjects.Container[] = [];
  private meterG: Phaser.GameObjects.Graphics[] = [];
  private sparks: { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number }[] = [];
  private prevPos = new Map<number, { x: number; y: number }>();
  private broomT = 0;
  private lastScrub = 0;
  private hint?: RotatedLabel;
  private hinted = false;

  constructor() {
    super(CURLING.sceneKey, CURLING.id, CURLING.targetScore);
  }

  protected drawBackground(): void {
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg);
    const g = this.add.graphics();
    const m = 40;
    const r = CARD.radius + 10;
    g.fillStyle(0x080e1a, 0.3).fillRoundedRect(m, m + 14, W - 2 * m, H - 2 * m, r);
    g.fillStyle(COLORS.inset, 1).fillRoundedRect(m, m, W - 2 * m, H - 2 * m, r);
    // the ice sheet
    const sw = SH.right - SH.left;
    const sh = SH.bottom - SH.top;
    g.fillStyle(0x080e1a, 0.35).fillRoundedRect(SH.left, SH.top + 12, sw, sh, 40);
    g.fillStyle(ICE, 1).fillRoundedRect(SH.left, SH.top, sw, sh, 40);
    // faint scratches so the ice feels icy
    g.lineStyle(2, 0xffffff, 0.5);
    for (let i = 0; i < 14; i++) {
      const x = SH.left + 80 + ((i * 197) % (sw - 200));
      const y = SH.top + 50 + ((i * 131) % (sh - 100));
      g.lineBetween(x, y, x + 90 + (i % 4) * 25, y + ((i % 3) - 1) * 14);
    }
    // each player's end, tinted
    for (const p of PLAYERS) {
      g.fillStyle(PLAYER[p].main, 0.16);
      g.fillRoundedRect(p === 0 ? SH.left : SH.right - 260, SH.top, 260, sh, { tl: p === 0 ? 40 : 0, bl: p === 0 ? 40 : 0, tr: p === 1 ? 40 : 0, br: p === 1 ? 40 : 0 });
    }
    g.lineStyle(3, 0x9fb4cc, 0.9).lineBetween(CX, SH.top, CX, SH.bottom).lineBetween(SH.left + 260, SH.top, SH.left + 260, SH.bottom).lineBetween(SH.right - 260, SH.top, SH.right - 260, SH.bottom);
    g.lineBetween(SH.left, CY, SH.right, CY);
    // the house: blue, white, orange, white button
    const cols = [PLAYER[1].light, 0xffffff, PLAYER[0].light, 0xffffff];
    RINGS.forEach((rad, i) => {
      g.fillStyle(cols[i], 1).fillCircle(CX, CY, rad);
      g.lineStyle(3, 0x7f93b0, 0.8).strokeCircle(CX, CY, rad);
    });
    g.fillStyle(0x7f93b0, 1).fillCircle(CX, CY, 6);
    // launch spots
    for (const p of PLAYERS) {
      const s = launchSpot(p);
      g.lineStyle(6, PLAYER[p].main, 0.45).strokeCircle(s.x, s.y, SR + 14);
    }
    g.lineStyle(10, COLORS.border, 1).strokeRoundedRect(SH.left - 5, SH.top - 5, sw + 10, sh + 10, 44);
  }

  protected onCreate(): void {
    this.finger = null;
    this.slideMs = this.settleMs = this.idleMs = 0;
    this.thrown = 0;
    this.phase = 'countdown';
    this.starter = Math.random() < 0.5 ? 0 : 1;
    this.turn = this.starter;
    this.views = new Map();
    this.world = createWorld();
    this.rng = makeRng(this.curlSeed);
    this.sliding = null;
    this.sweepFinger = null;
    this.sweep.reset();
    this.trail = [];
    this.prevPos = new Map();
    this.sparks = [];
    this.hinted = false;
    this.hint = undefined;
    this.rim = this.add.graphics().setDepth(3);
    this.trailG = this.add.graphics().setDepth(4);
    this.sweepG = this.add.graphics().setDepth(16);
    this.fx = this.add.graphics().setDepth(20);
    this.aim = this.add.graphics().setDepth(15);
    this.panels = PLAYERS.map((p) => this.makeTurnPanel(p));
    this.meters = PLAYERS.map((p) => this.makeMeter(p));
    this.ready = PLAYERS.map((p) => {
      const s = launchSpot(p);
      return makeStone(this, p).setPosition(s.x, s.y).setDepth(10);
    });
    PLAYERS.forEach((p) => {
      const a = endAnchor(p, 100, -300);
      this.badges[p].setPosition(a.x, a.y);
    });
    this.players.on('down', this.onDown, this);
    this.players.on('move', this.onMove, this);
    this.players.on('up', this.onUp, this);
    this.events.on('resume', this.releaseFinger, this);
    this.events.once('shutdown', () => this.events.off('resume', this.releaseFinger, this));
    this.refreshTurn();
    this.render();
  }

  protected onStart(): void {
    this.phase = 'aim';
    this.idleMs = 0;
    this.refreshTurn();
    this.showHint();
  }

  /** One-off hint for the very first throw, facing the thrower. */
  private showHint(): void {
    if (this.hinted) return;
    this.hinted = true;
    const a = endAnchor(this.turn, 450);
    this.hint = new RotatedLabel(this, a.x, a.y, say('hint'), this.turn, { size: 44, color: COLORS.text, stroke: COLORS.inset, display: true }).setDepth(30);
    this.tweens.add({ targets: this.hint, alpha: { from: 0.6, to: 1 }, duration: 700, yoyo: true, repeat: -1 });
  }
  private hideHint(): void {
    if (!this.hint) return;
    this.tweens.killTweensOf(this.hint);
    this.hint.destroy();
    this.hint = undefined;
  }

  /** The 'sweep!' glow meter beside the player's panel, towards the sheet. Local x runs along the screen edge. */
  private makeMeter(p: PlayerId): Phaser.GameObjects.Container {
    const a = endAnchor(p, 206);
    const c = this.add.container(a.x, a.y).setRotation(a.rotation).setDepth(6).setVisible(false);
    const g = this.add.graphics();
    this.meterG[p] = g;
    const label = new RotatedLabel(this, 0, 0, say('sweep'), null, { size: 30, color: 0xffffff, stroke: COLORS.inset, display: true });
    c.add([g, label]);
    c.setData('label', label);
    return c;
  }

  private drawMeter(): void {
    const sweeping = this.phase === 'slide' && this.sliding !== null;
    for (const p of PLAYERS) {
      const on = sweeping && p === this.turn;
      this.meters[p].setVisible(on);
      if (!on) continue;
      const lv = this.sweep.level;
      const g = this.meterG[p].clear();
      const { w, h } = METER;
      if (lv > 0.05) g.fillStyle(PLAYER[p].light, 0.18 + 0.4 * lv).fillRoundedRect(-w / 2 - 14, -h / 2 - 14, w + 28, h + 28, h / 2 + 14); // glow
      g.fillStyle(0x080e1a, 0.55).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      if (lv > 0.02) g.fillStyle(lv > 0.85 ? PLAYER[p].light : PLAYER[p].main, 1).fillRoundedRect(-w / 2, -h / 2, Math.max(h, w * lv), h, h / 2);
      g.lineStyle(4, PLAYER[p].light, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      (this.meters[p].getData('label') as RotatedLabel).setAlpha(lv > 0.05 ? 1 : 0.7);
    }
  }

  // ---- turn UI -------------------------------------------------------------------------------

  private makeTurnPanel(p: PlayerId): Phaser.GameObjects.Container {
    const a = endAnchor(p, 106);
    const c = this.add.container(a.x, a.y).setRotation(a.rotation).setDepth(5);
    const g = this.add.graphics();
    g.fillStyle(PLAYER[p].main, 0.3).fillRoundedRect(-150, -66, 300, 132, CARD.radius);
    g.lineStyle(8, PLAYER[p].main, 1).strokeRoundedRect(-150, -66, 300, 132, CARD.radius);
    const label = new RotatedLabel(this, 0, -24, say('yourTurn'), null, { size: 50, color: PLAYER[p].onDark, display: true });
    const dots = this.add.graphics();
    this.dots[p] = dots;
    c.add([g, label, dots]);
    return c;
  }

  /** Three dots in the panel: filled = stones still to throw. */
  private drawDots(): void {
    for (const p of PLAYERS) {
      const g = this.dots[p].clear();
      const used = this.thrownBy(p);
      for (let i = 0; i < CURLING.stonesPerEnd; i++) {
        const x = (i - 1) * 60;
        if (i >= used) g.fillStyle(PLAYER[p].main, 1).fillCircle(x, 24, 20).lineStyle(4, PLAYER[p].light, 1).strokeCircle(x, 24, 20);
        else g.lineStyle(4, PLAYER[p].main, 0.5).strokeCircle(x, 24, 20);
      }
    }
  }

  /** Stones the player has thrown (or forfeited) this end, from the fixed alternating order. */
  private thrownBy(p: PlayerId): number {
    let n = 0;
    for (let i = 0; i < this.thrown; i++) if (throwerFor(this.starter, i) === p) n++;
    return n;
  }

  /** Light up the active player's panel, score edge and the sheet rim; dim the other panel. */
  private refreshTurn(): void {
    this.pulse?.remove();
    const active = this.phase === 'aim' || this.phase === 'countdown';
    PLAYERS.forEach((p) => {
      this.badges[p].setActiveEdge(active && p === this.turn);
      this.tweens.killTweensOf(this.panels[p]);
      this.panels[p].setAlpha(active && p === this.turn ? 1 : 0.18).setScale(1).setAngle(p === 0 ? 90 : -90);
      this.tweens.killTweensOf(this.ready[p]);
      this.ready[p].setScale(1).setVisible(active && p === this.turn && this.thrown < stonesPerEnd());
    });
    if (active) {
      this.pulse = this.tweens.add({ targets: this.panels[this.turn], scale: { from: 1, to: 1.08 }, duration: 550, yoyo: true, repeat: -1 });
      this.tweens.add({ targets: this.ready[this.turn], scale: { from: 1, to: 1.1 }, duration: 600, yoyo: true, repeat: -1 });
    }
    const rim = this.rim.clear();
    if (active) rim.lineStyle(14, PLAYER[this.turn].main, 0.95).strokeRoundedRect(SH.left - 5, SH.top - 5, SH.right - SH.left + 10, SH.bottom - SH.top + 10, 44);
    this.drawDots();
    this.idleMs = 0;
  }

  // ---- input ---------------------------------------------------------------------------------

  private onDown(e: PlayerPointer): void {
    if (this.running && this.phase === 'slide' && this.sliding && e.player === this.turn && this.sweepFinger === null) {
      this.sweepFinger = e.id; // only the thrower can sweep
      this.sweep.begin(e.x, e.y);
      return;
    }
    if (!this.running || this.phase !== 'aim' || this.match.over) return;
    if (e.player !== this.turn) {
      // not your turn: nudge the panel of whoever's turn it is
      const p = this.panels[this.turn];
      this.tweens.add({ targets: p, angle: p.angle + 4, duration: 70, yoyo: true, repeat: 1 });
      return;
    }
    if (this.finger !== null) return; // one finger per player
    this.finger = e.id;
    this.hideHint();
    this.anchor = { x: e.x, y: e.y };
    this.cursor = { x: e.x, y: e.y };
    this.idleMs = 0;
    Sfx.tone(440, 0.05, 'triangle', 0.1);
  }

  private onMove(e: PlayerPointer): void {
    if (this.sweepFinger === e.id) {
      this.sweep.move(e.x, e.y);
      return;
    }
    if (this.finger !== e.id) return;
    this.cursor = { x: e.x, y: e.y };
  }

  private onUp(e: PlayerPointer): void {
    if (this.sweepFinger === e.id) {
      this.sweepFinger = null;
      this.sweep.end();
      return;
    }
    if (this.finger !== e.id) return;
    const shot = aimFromPull({ x: this.anchor.x - e.x, y: this.anchor.y - e.y }, this.turn);
    this.finger = null;
    if (!this.running || this.phase !== 'aim' || !shot) return;
    this.takeShot(shot);
  }

  private releaseFinger(): void {
    this.finger = null;
    this.sweepFinger = null;
    this.sweep.end();
    this.players.tracker.clear();
  }

  /** Throw the active player's ready stone (also used by tests). */
  takeShot(shot: Shot, curl?: number): void {
    if (this.phase !== 'aim') return;
    const spot = launchSpot(this.turn);
    const s = addStone(this.world, this.turn, spot.x, spot.y);
    this.views.set(s.id, makeStone(this, s.owner).setDepth(10));
    throwStone(s, shot, undefined, curl ?? rollCurl(this.rng));
    this.sliding = s;
    this.sweep.reset();
    this.sweepFinger = null;
    this.hideHint();
    this.thrown++;
    this.phase = 'slide';
    this.slideMs = 0;
    this.settleMs = 0;
    this.finger = null;
    this.ready.forEach((r) => r.setVisible(false));
    this.drawDots();
    PLAYERS.forEach((p) => this.badges[p].setActiveEdge(false));
    // feedback comes AFTER the throw: a whoosh whose pitch follows the power, and a haptic thump of the same strength
    Sfx.tone(180 + 420 * shot.power, 0.35, 'sawtooth', 0.05 + 0.05 * shot.power);
    Sfx.tone(120 + 260 * shot.power, 0.5, 'sine', 0.12 + 0.1 * shot.power, 0.04);
    Sfx.vibrate(12 + Math.round(shot.power * 48));
    this.render();
  }

  // ---- simulation ----------------------------------------------------------------------------

  protected onTick(_time: number, delta: number): void {
    const dt = Math.min(delta, 50);
    if (this.phase === 'aim') {
      if (this.finger === null) this.idleMs += dt;
      if (this.idleMs > CURLING.aimIdleMs) this.forfeit();
    } else if (this.phase === 'slide') {
      this.slideMs += dt;
      this.sweep.update(dt);
      const moving = this.sliding !== null && this.sliding.alive && (this.sliding.vx !== 0 || this.sliding.vy !== 0);
      for (const st of this.world.stones) st.sweep = st === this.sliding && moving ? this.sweep.level : 0;
      const res = stepWorld(this.world, dt / 1000);
      this.leaveTrail();
      if (res.impact > 120 && this.time.now - this.lastClack > 60) {
        this.lastClack = this.time.now;
        Sfx.tone(600 + Math.min(res.impact, 1500) * 0.25, 0.05, 'triangle', Math.min(0.25, 0.05 + res.impact / 6000));
        if (res.impact > 700) Sfx.vibrate(8);
      }
      for (const s of res.out) this.onOut(s);
      if (moving) this.sweepFx(dt);
      if (this.slideMs > CURLING.slideTimeoutMs) freeze(this.world);
      if (isSettled(this.world)) {
        this.settleMs += dt;
        if (this.settleMs >= CURLING.settleDelayMs) this.afterThrow();
      } else this.settleMs = 0;
    }
    this.fadeTrail(dt);
    this.render(dt);
  }

  /** Faint ice scratch trail behind every moving stone. */
  private leaveTrail(): void {
    for (const s of this.world.stones) {
      if (!s.alive || (s.vx === 0 && s.vy === 0)) {
        this.prevPos.delete(s.id);
        continue;
      }
      const prev = this.prevPos.get(s.id) ?? { x: s.x, y: s.y };
      this.prevPos.set(s.id, { x: s.x, y: s.y });
      if (Math.hypot(s.x - prev.x, s.y - prev.y) < 0.5) continue;
      this.trail.push({ x1: prev.x, y1: prev.y, x2: s.x, y2: s.y, t: 0 });
    }
    if (this.trail.length > 1500) this.trail.splice(0, this.trail.length - 1500);
  }

  private fadeTrail(dt: number): void {
    const g = this.trailG.clear();
    for (const t of this.trail) t.t += dt;
    this.trail = this.trail.filter((t) => t.t < TRAIL_MS);
    for (const t of this.trail) {
      const a = 0.42 * (1 - t.t / TRAIL_MS);
      g.lineStyle(3, 0x8fa8c4, a).lineBetween(t.x1, t.y1 - 9, t.x2, t.y2 - 9).lineBetween(t.x1, t.y1 + 9, t.x2, t.y2 + 9);
      g.lineStyle(2, 0xffffff, a).lineBetween(t.x1, t.y1, t.x2, t.y2);
    }
  }

  /** Sparkles / ice shavings in front of the swept stone, and a soft scrub sound. */
  private sweepFx(dt: number): void {
    const s = this.sliding;
    if (!s) return;
    const lv = this.sweep.level;
    const sp = Math.hypot(s.vx, s.vy) || 1;
    const dx = s.vx / sp;
    const dy = s.vy / sp;
    this.broomT += dt;
    if (lv > 0.08) {
      const want = lv * dt * 0.05; // ~50 sparkles/s at full effort
      let count = Math.floor(want);
      if (Math.random() < want - count) count++;
      for (let i = 0; i < count; i++) {
        const side = (Math.random() - 0.5) * 2 * (SR + 30);
        const ahead = SR + 20 + Math.random() * 30;
        const life = 350 + Math.random() * 350;
        this.sparks.push({ x: s.x + dx * ahead - dy * side, y: s.y + dy * ahead + dx * side, vx: (Math.random() - 0.5) * 140 - dy * side, vy: -40 - Math.random() * 120, life, max: life, size: 3 + Math.random() * 4 });
      }
      if (this.time.now - this.lastScrub > 90) {
        this.lastScrub = this.time.now;
        Sfx.tone(1400 + Math.random() * 500, 0.03, 'square', 0.02 + 0.03 * lv);
      }
    }
  }

  private onOut(s: Stone): void {
    const view = this.views.get(s.id);
    if (view) {
      this.views.delete(s.id);
      (view.getData('shadow') as Phaser.GameObjects.Arc).setAlpha(0);
      this.tweens.add({ targets: view, x: view.x + s.vx * 0.25, y: view.y + s.vy * 0.25, scale: 0.4, alpha: 0, duration: 500, ease: 'Quad.In', onComplete: () => view.destroy() });
    }
    Sfx.tone(330, 0.25, 'sine', 0.18);
  }

  /** Nothing thrown for too long: the stone is lost and the turn passes. */
  private forfeit(): void {
    this.thrown++;
    this.finger = null;
    this.afterThrow();
  }

  private afterThrow(): void {
    if (this.match.over) return;
    if (this.thrown >= stonesPerEnd()) {
      this.endSweep();
      this.scoreTheEnd();
      return;
    }
    this.turn = throwerFor(this.starter, this.thrown);
    this.phase = 'aim';
    this.finger = null;
    this.endSweep();
    this.refreshTurn();
  }

  // ---- scoring -------------------------------------------------------------------------------

  private scoreTheEnd(): void {
    this.phase = 'scoring';
    this.refreshTurn();
    const res = scoreEnd(this.world);
    this.showScoring(res);
    const scorer = res.scorer;
    const step = CURLING.scoreStepMs;
    if (scorer !== null) {
      for (let i = 0; i < res.points; i++) {
        this.time.delayedCall(500 + i * step, () => {
          if (this.match.over) return;
          this.score(scorer);
          const s = this.world.stones.find((x) => x.id === res.scoring[i]);
          if (s) this.plusOne(s, scorer, i + 1);
          if (this.match.over) this.phase = 'over';
        });
      }
    }
    this.time.delayedCall(500 + res.points * step + CURLING.endPauseMs, () => {
      if (this.match.over) return;
      this.nextEnd(res);
    });
  }

  /** Lines from the button to the scoring stones, a ring on each, and the other stones dimmed. */
  private showScoring(res: EndScore): void {
    if (res.scorer === null) {
      for (const p of PLAYERS) {
        const a = endAnchor(p, 420);
        const l = new RotatedLabel(this, a.x, a.y, say('blank'), p, { size: 90, color: COLORS.text, stroke: COLORS.inset, display: true }).setDepth(100);
        this.tweens.add({ targets: l, scale: { from: 0.4, to: 1 }, duration: 300, ease: 'Back.Out' });
        this.tweens.add({ targets: l, alpha: 0, delay: 1200, duration: 300, onComplete: () => l.destroy() });
      }
      return;
    }
    const col = PLAYER[res.scorer].main;
    this.world.stones.forEach((s) => {
      const v = this.views.get(s.id);
      if (v && !res.scoring.includes(s.id)) this.tweens.add({ targets: v, alpha: 0.45, duration: 300 });
    });
    const prog = { k: 0 };
    this.tweens.add({
      targets: prog,
      k: 1,
      duration: 450,
      onUpdate: () => {
        const g = this.fx.clear();
        for (const id of res.scoring) {
          const s = this.world.stones.find((x) => x.id === id);
          if (!s) continue;
          g.lineStyle(12, col, 0.9).lineBetween(CX, CY, CX + (s.x - CX) * prog.k, CY + (s.y - CY) * prog.k);
          g.lineStyle(10, col, prog.k).strokeCircle(s.x, s.y, SR + 12);
        }
        g.fillStyle(col, 1).fillCircle(CX, CY, 14).lineStyle(5, 0xffffff, 1).strokeCircle(CX, CY, 14);
      },
    });
  }

  private plusOne(s: Stone, p: PlayerId, n: number): void {
    const l = new RotatedLabel(this, s.x, s.y, `+1`, p, { size: 130, color: PLAYER[p].onDark, stroke: COLORS.inset, display: true }).setDepth(100);
    this.tweens.add({ targets: l, scale: { from: 0.4, to: 1.1 }, duration: 300, ease: 'Back.Out' });
    this.tweens.add({ targets: l, alpha: 0, y: s.y - 50, delay: 450, duration: 300, onComplete: () => l.destroy() });
    const v = this.views.get(s.id);
    if (v) this.tweens.add({ targets: v, scale: 1.25, duration: 160, yoyo: true });
    Sfx.tone(520 + 120 * n, 0.12, 'triangle', 0.2);
    this.cameras.main.shake(100, 0.002);
  }

  private nextEnd(res: EndScore): void {
    this.fx.clear();
    this.views.forEach((v) => this.tweens.add({ targets: v, alpha: 0, scale: 0.6, duration: 400, onComplete: () => v.destroy() }));
    this.views = new Map();
    this.world = createWorld();
    this.starter = nextStarter(this.starter, res.scorer);
    this.turn = this.starter;
    this.thrown = 0;
    this.phase = 'aim';
    this.finger = null;
    this.endSweep();
    this.refreshTurn();
  }

  private endSweep(): void {
    this.sliding = null;
    this.sweepFinger = null;
    this.sweep.reset();
    this.sparks = [];
  }

  // ---- drawing -------------------------------------------------------------------------------

  /**
   * Slingshot guide: the pull handle with its rubber band, and a short dotted direction cue. The cue has the same length for
   * every pull, so it shows WHERE you throw but never HOW FAR (no ghost, power bar, ring or contact preview).
   */
  private drawAim(): void {
    const g = this.aim.clear();
    if (this.finger === null || this.phase !== 'aim') return;
    const p = this.turn;
    const col = PLAYER[p].main;
    const spot = launchSpot(p);
    const pull = { x: this.anchor.x - this.cursor.x, y: this.anchor.y - this.cursor.y };
    const len = Math.hypot(pull.x, pull.y);
    const shot = aimFromPull(pull, p);
    // pulled-back handle and rubber band (drawn opposite to the throw)
    const cl = Math.min(len, CURLING.maxPull);
    const hx = len > 0 ? spot.x - (pull.x / len) * cl : spot.x;
    const hy = len > 0 ? spot.y - (pull.y / len) * cl : spot.y;
    g.lineStyle(10, col, 0.5).lineBetween(spot.x, spot.y, hx, hy);
    g.fillStyle(col, 0.5).fillCircle(hx, hy, 26);
    if (!shot) return;
    const start = SR + 18;
    for (let i = 0; i < CURLING.aimDots; i++) {
      const d = start + i * CURLING.aimDotGap;
      g.fillStyle(col, 0.95 - i * 0.1).fillCircle(spot.x + shot.dirX * d, spot.y + shot.dirY * d, 7);
    }
  }

  /** Brooms scrubbing in front of the sliding stone, a glow around it and the sparkles. */
  private drawSweep(dt: number): void {
    const g = this.sweepG.clear();
    const s = this.sliding;
    const lv = this.sweep.level;
    for (const k of this.sparks) k.life -= dt;
    this.sparks = this.sparks.filter((k) => k.life > 0);
    for (const k of this.sparks) {
      k.x += (k.vx * dt) / 1000;
      k.y += (k.vy * dt) / 1000;
      const a = k.life / k.max;
      g.fillStyle(a > 0.5 ? 0xffffff : 0xcfe8ff, a).fillCircle(k.x, k.y, k.size * (0.5 + a));
      g.fillStyle(0xffffff, a * 0.8).fillRect(k.x - 1, k.y - k.size * 1.6, 2, k.size * 3.2);
    }
    if (this.phase !== 'slide' || !s || !s.alive || lv < 0.04) return;
    const sp = Math.hypot(s.vx, s.vy);
    if (sp === 0) return;
    const dx = s.vx / sp;
    const dy = s.vy / sp;
    const col = PLAYER[this.turn];
    g.lineStyle(8, col.light, 0.25 + 0.5 * lv).strokeCircle(s.x, s.y, SR + 8 + 6 * lv);
    // two brooms ahead of the stone, scrubbing across the path (sideways), faster and wider the harder you sweep
    const amp = 16 + 26 * lv;
    for (const sd of [-1, 1]) {
      const lat = sd * (SR + 6) + Math.sin(this.broomT * (0.012 + 0.016 * lv) + (sd > 0 ? Math.PI : 0)) * amp;
      const along = SR + 34;
      const cx = s.x + dx * along - dy * lat;
      const cy = s.y + dy * along + dx * lat;
      // broom head across the path (perpendicular to travel), handle trailing back to the side
      const hx = -dy * 30;
      const hy = dx * 30;
      g.lineStyle(7, 0x8a6a45, 0.95).lineBetween(cx - dx * 70 + dy * sd * 40, cy - dy * 70 - dx * sd * 40, cx, cy);
      g.lineStyle(16, col.main, 0.95).lineBetween(cx - hx, cy - hy, cx + hx, cy + hy);
      g.lineStyle(5, 0xffffff, 0.7).lineBetween(cx - hx * 0.8 + dx * 6, cy - hy * 0.8 + dy * 6, cx + hx * 0.8 + dx * 6, cy + hy * 0.8 + dy * 6);
      // scrub marks
      for (let i = 0; i < 3; i++) g.lineStyle(3, 0xffffff, 0.6 * lv).lineBetween(cx + dx * (14 + i * 9) - hx * 0.6, cy + dy * (14 + i * 9) - hy * 0.6, cx + dx * (14 + i * 9) + hx * 0.6, cy + dy * (14 + i * 9) + hy * 0.6);
    }
  }

  private render(dt = 0): void {
    for (const s of this.world.stones) {
      const v = this.views.get(s.id);
      if (v && s.alive) v.setPosition(s.x, s.y);
    }
    this.drawAim();
    this.drawSweep(dt);
    this.drawMeter();
  }
}


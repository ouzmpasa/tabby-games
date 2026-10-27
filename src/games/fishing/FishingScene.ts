import Phaser from 'phaser';
import { Sfx } from '../../core/audio/Sfx';
import { BaseGameScene } from '../../core/BaseGameScene';
import type { PlayerPointer } from '../../core/input/PlayerInput';
import { endAnchor, H, W } from '../../core/layout';
import { settings } from '../../core/settings';
import { COLORS, PLAYER } from '../../core/theme';
import { PLAYERS, type PlayerId } from '../../core/types';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { FISHING, LABELS } from './config';
import {
  computeCast,
  createPond,
  createReel,
  createRng,
  forward,
  hookFish,
  makeNervous,
  noticeRadius,
  pointsFor,
  reelTell,
  retireFish,
  rodTip,
  spookFish,
  stepPond,
  stepReel,
  tensionLevel,
  wiggleLure,
  type Fish,
  type Leap,
  type Lure,
  type Pt,
  type Reel,
  type Rng,
} from './logic';
import { drawBobber, drawFish, drawPond } from './pieces';

export type Phase = 'idle' | 'cast' | 'wait' | 'bite' | 'reel' | 'caught';

export interface Angler {
  phase: Phase;
  lure: Pt;
  land: Pt;
  castMs: number;
  castDur: number;
  waitMs: number;
  activity: number;
  fish: Fish | null;
  reel: Reel | null;
  hookPt: Pt;
  finger: number | null;
  anchor: Pt | null;
  pull: Pt | null;
  last: Pt | null;
  travel: number;
  downAt: number;
  holding: boolean;
  timerMs: number;
  heldKind: number;
  msg: string;
  msgMs: number;
  catches: number;
  casts: number;
  rippleMs: number;
  leapSeen: Leap;
}

interface Ripple {
  x: number;
  y: number;
  r: number;
  max: number;
  age: number;
  life: number;
  color: number;
}

const newAngler = (p: PlayerId): Angler => ({
  phase: 'idle', lure: rodTip(p), land: rodTip(p), castMs: 0, castDur: 1, waitMs: 0, activity: 0, fish: null, reel: null, hookPt: rodTip(p),
  finger: null, anchor: null, pull: null, last: null, travel: 0, downAt: 0, holding: false, timerMs: 0, heldKind: 0, msg: '', msgMs: 0, catches: 0, casts: 0, rippleMs: 0, leapSeen: 'none',
});

export class FishingScene extends BaseGameScene {
  /** Simulation state (public so tests / scripts can poke it). */
  pond: Fish[] = [];
  anglers!: [Angler, Angler];
  clock = 0;
  rng: Rng = Math.random;
  private ripples: Ripple[] = [];
  private fx!: Phaser.GameObjects.Graphics;
  private fishG!: Phaser.GameObjects.Graphics;
  private gear!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Graphics;
  private hints: RotatedLabel[] = [];
  private bangs: RotatedLabel[] = [];
  private bangsTip: RotatedLabel[] = [];
  private qs: RotatedLabel[] = [];
  private qsTip: RotatedLabel[] = [];
  private jumps: RotatedLabel[] = [];
  private caughtLabels: RotatedLabel[] = [];

  constructor() {
    super(FISHING.sceneKey, FISHING.id, FISHING.targetScore);
  }

  protected drawBackground(): void {
    drawPond(this);
  }

  protected onCreate(): void {
    this.clock = 0;
    this.ripples = [];
    this.rng = createRng((Date.now() ^ 0x5bd1e995) >>> 0);
    this.pond = createPond(this.rng);
    this.anglers = [newAngler(0), newAngler(1)];
    this.fx = this.add.graphics().setDepth(5);
    this.fishG = this.add.graphics().setDepth(6);
    this.gear = this.add.graphics().setDepth(10);
    this.hud = this.add.graphics().setDepth(40);
    const lbl = (text: string, p: PlayerId, size: number, color: number, inset: number, depth: number) =>
      new RotatedLabel(this, endAnchor(p, inset, 0).x, endAnchor(p, inset, 0).y, text, p, { size, color, stroke: COLORS.inset, display: true }).setDepth(depth).setVisible(false);
    this.hints = PLAYERS.map((p) => lbl(LABELS.cast, p, 56, PLAYER[p].onDark, 500, 45));
    this.bangs = PLAYERS.map((p) => lbl('!', p, 96, COLORS.btnFg, 0, 55));
    this.bangsTip = PLAYERS.map((p) => lbl('!', p, 110, COLORS.btnFg, 0, 55));
    this.qs = PLAYERS.map((p) => lbl('?', p, 96, 0x16324a, 0, 55));
    this.qsTip = PLAYERS.map((p) => lbl('?', p, 110, 0x16324a, 0, 55));
    this.jumps = PLAYERS.map((p) => lbl(LABELS.jump, p, 150, 0xffffff, 700, 62));
    this.caughtLabels = PLAYERS.map((p) => lbl('', p, 76, PLAYER[p].onDark, 820, 60));
    PLAYERS.forEach((p) => {
      const a = endAnchor(p, 100, -300);
      this.badges[p].setPosition(a.x, a.y);
    });
    this.players.on('down', this.onDown, this);
    this.players.on('move', this.onMove, this);
    this.players.on('up', this.onUp, this);
    this.events.on('resume', this.releaseFingers, this);
    this.events.once('shutdown', () => this.events.off('resume', this.releaseFingers, this));
    this.render();
  }

  // ------------------------------------------------------------------ input

  private onDown(e: PlayerPointer): void {
    const a = this.anglers[e.player];
    if (!this.running || this.match.over || a.finger !== null) return; // one finger per player
    const pt = { x: e.x, y: e.y };
    switch (a.phase) {
      case 'idle':
        a.finger = e.id;
        a.anchor = pt;
        a.pull = null;
        break;
      case 'wait': {
        a.finger = e.id;
        a.last = pt;
        a.travel = 0;
        a.downAt = this.clock;
        const fk = this.fakeFish(e.player);
        if (fk && spookFish(fk)) {
          // tapped a fake bite: the trickster is spooked (and this tap is not a recall)
          a.travel = FISHING.recallTravel + 1;
          a.fish = null;
          a.msg = LABELS.tricked;
          a.msgMs = 2200;
          this.splash(a.lure.x, a.lure.y, 0x8fd3ff, 2);
          Sfx.tone(240, 0.18, 'sawtooth', 0.1);
        }
        break;
      }
      case 'bite':
        this.hook(e.player);
        a.finger = e.id;
        a.holding = true;
        break;
      case 'reel':
        a.finger = e.id;
        a.holding = true;
        break;
      default:
        break;
    }
  }

  private onMove(e: PlayerPointer): void {
    const a = this.anglers[e.player];
    if (a.finger !== e.id) return;
    if (a.phase === 'idle' && a.anchor) {
      a.pull = { x: a.anchor.x - e.x, y: a.anchor.y - e.y };
    } else if (a.phase === 'wait' && a.last) {
      const dx = e.x - a.last.x;
      const dy = e.y - a.last.y;
      a.last = { x: e.x, y: e.y };
      const d = Math.hypot(dx, dy);
      a.travel += d;
      if (d > 0) {
        a.lure = wiggleLure(a.lure, a.land, dx, dy);
        a.activity = Math.min(1, a.activity + d / 160);
      }
    }
  }

  private onUp(e: PlayerPointer): void {
    const p = e.player;
    const a = this.anglers[p];
    if (a.finger !== e.id) return;
    a.finger = null;
    a.holding = false;
    if (a.phase === 'idle') {
      const pull = a.pull;
      a.anchor = null;
      a.pull = null;
      if (pull && this.running) this.cast(p, pull);
    } else if (a.phase === 'wait') {
      // a quick tap (no wiggle) reels the lure back in to cast again
      if (this.clock - a.downAt < FISHING.recallTapMs && a.travel < FISHING.recallTravel) this.recall(p);
    }
  }

  private releaseFingers(): void {
    for (const a of this.anglers) {
      a.finger = null;
      a.holding = false;
      a.anchor = null;
      a.pull = null;
    }
    this.players.tracker.clear();
  }

  // ------------------------------------------------------------------ actions

  /** Start a cast (also used by tests). Returns false if the pull is too weak. */
  cast(p: PlayerId, pull: Pt): boolean {
    const a = this.anglers[p];
    const c = computeCast(p, pull);
    if (!c || a.phase !== 'idle') return false;
    a.phase = 'cast';
    a.land = c.to;
    a.lure = rodTip(p);
    a.castMs = 0;
    a.castDur = c.durationMs;
    a.casts++;
    Sfx.tone(340, 0.12, 'triangle', 0.18);
    return true;
  }

  private recall(p: PlayerId): void {
    const a = this.anglers[p];
    a.phase = 'idle';
    a.fish = null;
    a.lure = rodTip(p);
    a.activity = 0;
    Sfx.tone(300, 0.08, 'triangle', 0.12);
  }

  private hook(p: PlayerId): void {
    const a = this.anglers[p];
    const f = a.fish;
    if (!f || !hookFish(f)) return;
    a.phase = 'reel';
    a.reel = createReel(f.kind, FISHING, this.rng);
    a.leapSeen = 'none';
    makeNervous(this.pond, a.lure, f);
    a.hookPt = { ...a.lure };
    a.holding = true;
    a.msg = '';
    this.splash(a.lure.x, a.lure.y, 0xffffff, 3);
    Sfx.tone(660, 0.1, 'square', 0.15);
    Sfx.tone(990, 0.12, 'square', 0.15, 0.08);
    Sfx.vibrate(30);
  }

  private splash(x: number, y: number, color = 0xffffff, n = 2): void {
    for (let i = 0; i < n; i++) this.ripples.push({ x, y, r: 6, max: 50 + i * 28, age: -i * 120, life: 900, color });
  }

  // ------------------------------------------------------------------ simulation

  protected onTick(_time: number, delta: number): void {
    const dt = Math.min(delta, 50);
    this.clock += dt;
    this.stepAnglers(dt);
    const lures = this.anglers.map((a): Lure | null => (a.phase === 'wait' || a.phase === 'bite' ? { x: a.lure.x, y: a.lure.y, activity: a.activity } : null));
    for (const ev of stepPond(this.pond, lures, dt, this.rng)) {
      const a = this.anglers[ev.player];
      if (ev.type === 'nibble') {
        a.fish = ev.fish;
        this.splash(a.lure.x, a.lure.y, 0xffffff, 1);
        Sfx.tone(700, 0.05, 'sine', 0.12);
      } else if (ev.type === 'fake') {
        this.splash(a.lure.x, a.lure.y, 0x8fd3ff, 2);
        Sfx.tone(300, 0.1, 'triangle', 0.1);
        Sfx.tone(260, 0.12, 'triangle', 0.1, 0.1);
      } else if (ev.type === 'scared') {
        if (a.phase === 'wait') {
          const b = FISHING.kinds[ev.fish.kind].behavior;
          a.msg = b === 'shy' ? LABELS.keepStill : LABELS.tooMuch;
          a.msgMs = 2200;
          a.fish = null;
        }
        this.splash(ev.fish.x, ev.fish.y, 0xffffff, 2);
        Sfx.tone(520, 0.08, 'sine', 0.08);
        Sfx.tone(380, 0.1, 'sine', 0.08, 0.06);
      } else if (ev.type === 'respawn') {
        this.splash(ev.fish.x, ev.fish.y, 0xa9d8f0, 1);
      } else if (ev.type === 'bite' && a.phase === 'wait') {
        a.phase = 'bite';
        a.fish = ev.fish;
        a.finger = null; // a wiggling finger must lift and tap again
        a.holding = false;
        this.splash(a.lure.x, a.lure.y, 0xffd84a, 2);
        Sfx.tone(880, 0.14, 'square', 0.16);
        Sfx.tone(1175, 0.14, 'square', 0.16, 0.12);
        Sfx.vibrate([30, 30, 30]);
      } else if (ev.type === 'missed' && a.phase === 'bite') {
        a.phase = 'wait';
        a.fish = null;
      }
    }
    // ambient ripples
    if (this.rng() < dt / 900) {
      const { l, t, r, b } = FISHING.pond;
      this.ripples.push({ x: l + this.rng() * (r - l), y: t + this.rng() * (b - t), r: 4, max: 36, age: 0, life: 1800, color: 0xa9d8f0 });
    }
    this.render();
  }

  private stepAnglers(dt: number): void {
    for (const p of PLAYERS) {
      const a = this.anglers[p];
      a.activity = Math.max(0, a.activity - (dt / 1000) * 1.2);
      a.msgMs = Math.max(0, a.msgMs - dt);
      if (a.msgMs === 0) a.msg = '';
      switch (a.phase) {
        case 'cast': {
          a.castMs += dt;
          const t = Math.min(1, a.castMs / a.castDur);
          const tip = rodTip(p);
          a.lure = { x: tip.x + (a.land.x - tip.x) * t, y: tip.y + (a.land.y - tip.y) * t };
          if (t >= 1) {
            a.phase = 'wait';
            a.waitMs = 0;
            a.lure = { ...a.land };
            a.fish = null;
            this.splash(a.lure.x, a.lure.y, 0xffffff, 3);
            Sfx.tone(220, 0.16, 'sine', 0.2);
          }
          break;
        }
        case 'wait':
        case 'bite':
          a.waitMs += dt;
          if (a.phase === 'wait') {
            const nib = this.pond.some((f) => f.target === p && (f.state === 'nibble' || (f.state === 'bite' && f.fake)));
            a.rippleMs -= dt;
            if (nib && a.rippleMs <= 0) {
              a.rippleMs = 420;
              this.splash(a.lure.x, a.lure.y, 0xffffff, 1);
              Sfx.tone(520, 0.04, 'sine', 0.08);
            }
            if (a.waitMs > FISHING.waitTimeoutMs) this.recall(p);
          }
          break;
        case 'reel':
          this.stepReelFight(p, dt);
          break;
        case 'caught':
          a.timerMs -= dt;
          if (a.timerMs <= 0) {
            a.phase = 'idle';
            a.lure = rodTip(p);
          }
          break;
        default:
          break;
      }
    }
  }

  private stepReelFight(p: PlayerId, dt: number): void {
    const a = this.anglers[p];
    const f = a.fish;
    const r = a.reel;
    if (!f || !r) return;
    const res = stepReel(r, dt, a.holding, this.rng);
    const tip = rodTip(p);
    const jitter = r.burst ? Math.sin(this.clock / 40) * 8 : 0;
    f.x = tip.x + (a.hookPt.x - tip.x) * r.dist;
    f.y = tip.y + (a.hookPt.y - tip.y) * r.dist + jitter;
    f.heading = Math.atan2(f.y - tip.y, f.x - tip.x) + (r.burst ? Math.sin(this.clock / 90) * 0.5 : Math.sin(this.clock / 300) * 0.15);
    f.wiggle += (dt / 1000) * (r.burst ? 22 : 7);
    a.lure = { x: f.x, y: f.y };
    if (r.leap !== a.leapSeen) {
      a.leapSeen = r.leap;
      if (r.leap === 'warn') {
        Sfx.tone(520, 0.1, 'square', 0.16);
        Sfx.tone(780, 0.14, 'square', 0.16, 0.1);
        Sfx.vibrate(30);
      } else if (r.leap === 'air') {
        this.splash(f.x, f.y, 0xffffff, 3);
        Sfx.tone(900, 0.2, 'sine', 0.14);
      }
    }
    a.rippleMs -= dt;
    if (r.burst && a.rippleMs <= 0) {
      a.rippleMs = 170;
      this.splash(f.x, f.y, 0xffffff, 1);
      Sfx.tone(260 + this.rng() * 80, 0.05, 'sine', 0.08);
    }
    if (res === 'snap') {
      Sfx.tone(180, 0.3, 'sawtooth', 0.14);
      Sfx.vibrate(60);
      this.splash(f.x, f.y, 0xff6b6b, 3);
      const x = Math.min(FISHING.pond.r, Math.max(FISHING.pond.l, f.x));
      f.x = x;
      f.state = 'swim';
      f.target = null;
      f.ignoreMs = FISHING.ignoreAfterSnapMs;
      f.targetHeading = f.heading = Math.atan2(f.y - tip.y, f.x - tip.x);
      a.fish = null;
      a.reel = null;
      a.phase = 'idle';
      a.lure = tip;
      a.msg = LABELS.escaped;
      a.msgMs = FISHING.escapedMsgMs;
    } else if (res === 'caught') {
      this.catchFish(p, f);
    }
  }

  private catchFish(p: PlayerId, f: Fish): void {
    const a = this.anglers[p];
    const pts = pointsFor(f.kind);
    a.leapSeen = 'none';
    a.heldKind = f.kind;
    a.phase = 'caught';
    a.timerMs = FISHING.caughtMs;
    a.catches++;
    a.fish = null;
    a.reel = null;
    a.holding = false;
    this.splash(f.x, f.y, 0xffffff, 3);
    retireFish(f);
    for (let i = 0; i < pts; i++) this.time.delayedCall(i * FISHING.pointStaggerMs, () => !this.match.over && this.score(p));
  }

  // ------------------------------------------------------------------ drawing

  /** The trickster currently doing a fake bite ('?') on this player's lure. */
  private fakeFish(p: PlayerId): Fish | undefined {
    return this.pond.find((f) => f.target === p && f.state === 'bite' && f.fake);
  }

  private bobberDip(p: PlayerId): number {
    const a = this.anglers[p];
    if (a.phase === 'bite') return 0.8 + 0.2 * Math.sin(this.clock / 60);
    if (a.phase === 'wait' && this.fakeFish(p)) return Math.max(0, Math.sin(this.clock / 55)) * 0.75;
    if (a.phase === 'wait' && this.pond.some((f) => f.target === p && f.state === 'nibble')) return Math.max(0, Math.sin(this.clock / 80)) * 0.6;
    return 0;
  }

  private render(): void {
    this.drawFx();
    this.drawFish();
    this.drawGear();
    this.drawHud();
    this.updateLabels();
  }

  private drawFx(): void {
    const g = this.fx.clear();
    const dt = this.game.loop.delta;
    this.ripples = this.ripples.filter((r) => r.age < r.life);
    for (const r of this.ripples) {
      r.age += this.running ? dt : 0;
      if (r.age < 0) continue;
      const t = r.age / r.life;
      g.lineStyle(4, r.color, 0.7 * (1 - t)).strokeCircle(r.x, r.y, r.r + (r.max - r.r) * t);
    }
  }

  private drawFish(): void {
    const g = this.fishG.clear();
    for (const f of this.pond) {
      if (f.state === 'gone') continue;
      const k = FISHING.kinds[f.kind];
      const tired = f.state === 'hooked';
      let scale = 1;
      if (tired) {
        const r = this.anglers.find((a) => a.fish === f)?.reel;
        if (r?.leap === 'air') scale = 1 + 0.5 * Math.sin(Math.PI * (1 - r.leapMs / FISHING.reel.leapAirMs));
        else if (r?.leap === 'warn') scale = 1 + 0.08 * Math.sin(this.clock / 30);
      }
      drawFish(g, f.x, f.y, f.heading, k, f.wiggle, { sway: tired ? 0.1 : 0, scale });
    }
  }

  private line(g: Phaser.GameObjects.Graphics, a: Pt, b: Pt, sag: number, color: number, width: number): void {
    g.lineStyle(width, color, 0.95);
    g.beginPath().moveTo(a.x, a.y);
    const n = 14;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      g.lineTo(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t + Math.sin(Math.PI * t) * sag);
    }
    g.strokePath();
  }

  private drawGear(): void {
    const g = this.gear.clear();
    for (const p of PLAYERS) {
      const a = this.anglers[p];
      const tip = rodTip(p);
      const base = { x: p === 0 ? FISHING.baseInset : W - FISHING.baseInset, y: H / 2 + FISHING.baseDy };
      // rod
      g.lineStyle(14, PLAYER[p].dark, 1).lineBetween(base.x, base.y, (base.x + tip.x) / 2, (base.y + tip.y) / 2);
      g.lineStyle(8, 0x5a3a22, 1).lineBetween((base.x + tip.x) / 2, (base.y + tip.y) / 2, tip.x, tip.y);
      g.fillStyle(0xf5f7fa, 1).fillCircle(base.x + forward(p) * 22, base.y - 16, 12);
      g.fillStyle(PLAYER[p].main, 1).fillCircle(tip.x, tip.y, 9);
      if (a.phase === 'idle' || a.phase === 'caught') continue;
      const lvl = a.reel ? tensionLevel(a.reel.tension) : 'ok';
      const tell = !!a.reel && reelTell(a.reel);
      const col = lvl === 'danger' ? 0xff5a5a : lvl === 'warn' ? 0xffd84a : tell ? 0xffe9a8 : 0xffffff;
      if (a.phase === 'cast') {
        this.line(g, tip, a.lure, 0, 0xffffff, 3);
        const t = Math.min(1, a.castMs / a.castDur);
        const sc = 1 + 0.9 * Math.sin(Math.PI * t);
        g.fillStyle(0x0c2233, 0.25).fillCircle(a.lure.x + 6, a.lure.y + 14, 14);
        drawBobber(g, a.lure.x, a.lure.y - 26 * Math.sin(Math.PI * t), p, sc);
      } else if (a.phase === 'reel') {
        this.line(g, tip, a.lure, a.reel?.burst ? 0 : tell ? 4 + Math.sin(this.clock / 28) * 8 : 14, col, lvl === 'danger' ? 2 : 4);
      } else {
        this.line(g, tip, a.lure, 26, 0xffffff, 3);
        drawBobber(g, a.lure.x, a.lure.y, p, 1, this.bobberDip(p));
        if (a.phase === 'bite') {
          const pulse = (this.clock % 600) / 600;
          g.lineStyle(8, 0xffd84a, 1 - pulse).strokeCircle(a.lure.x, a.lure.y, 40 + 70 * pulse);
          g.lineStyle(8, 0xffd84a, 1 - pulse).strokeCircle(tip.x, tip.y, 24 + 70 * pulse);
        }
      }
    }
  }

  private drawHud(): void {
    const g = this.hud.clear();
    for (const p of PLAYERS) {
      const a = this.anglers[p];
      const bx = endAnchor(p, 70, 0).x;
      const top = H / 2 - 190;
      const hgt = 380;
      const bar = (frac: number, col: number) => {
        g.fillStyle(0x080e1a, 0.55).fillRoundedRect(bx - 22, top, 44, hgt, 22);
        if (frac > 0.01) g.fillStyle(col, 1).fillRoundedRect(bx - 22, top + hgt * (1 - frac), 44, hgt * frac, 22);
        g.lineStyle(3, 0xffffff, 0.35).strokeRoundedRect(bx - 22, top, 44, hgt, 22);
      };
      if (a.phase === 'idle' && a.pull) {
        const c = computeCast(p, a.pull);
        const col = PLAYER[p].main;
        const tip = rodTip(p);
        const pullLen = Math.hypot(a.pull.x, a.pull.y);
        bar(Math.min(1, (pullLen * FISHING.pullScale - FISHING.minCast) / (FISHING.maxCast - FISHING.minCast)), col);
        if (c) {
          const n = Math.max(2, Math.floor(c.distance / 46));
          for (let i = 1; i < n; i++) g.fillStyle(col, 0.9).fillCircle(tip.x + ((c.to.x - tip.x) * i) / n, tip.y + ((c.to.y - tip.y) * i) / n, 7);
          const rad = noticeRadius({ x: 0, y: 0, activity: 0 });
          g.fillStyle(col, 0.14).fillCircle(c.to.x, c.to.y, rad);
          g.lineStyle(5, col, 0.55).strokeCircle(c.to.x, c.to.y, rad);
          g.lineStyle(8, col, 1).strokeCircle(c.to.x, c.to.y, 30);
          g.fillStyle(col, 1).fillCircle(c.to.x, c.to.y, 11);
        }
      } else if (a.phase === 'reel' && a.reel) {
        const lvl = tensionLevel(a.reel.tension);
        const col = lvl === 'danger' ? 0xff5a5a : lvl === 'warn' ? 0xffd84a : 0x5fd39b;
        bar(a.reel.tension, col);
        const wz = hgt * (1 - FISHING.reel.warn);
        const dz = hgt * (1 - FISHING.reel.danger);
        g.lineStyle(4, 0xffffff, 0.6).lineBetween(bx - 28, top + wz, bx + 28, top + wz).lineBetween(bx - 28, top + dz, bx + 28, top + dz);
        // fish stamina: a thin blue bar that drains as the fish tires
        g.fillStyle(0x080e1a, 0.55).fillRoundedRect(bx + 32, top, 14, hgt, 7);
        if (a.reel.stamina > 0.02) g.fillStyle(0x7fd0ff, 1).fillRoundedRect(bx + 32, top + hgt * (1 - a.reel.stamina), 14, hgt * a.reel.stamina, 7);
        if (lvl === 'danger') g.lineStyle(6, 0xff5a5a, 0.5 + 0.5 * Math.sin(this.clock / 50)).strokeRoundedRect(bx - 28, top - 6, 56, hgt + 12, 26);
      }
      // bite flash
      if (a.phase === 'bite') {
        const tip = rodTip(p);
        g.fillStyle(0xffd84a, 0.18 + 0.12 * Math.sin(this.clock / 90)).fillCircle(tip.x - forward(p) * 140, tip.y, 150);
      }
      // held-up fish
      if (a.phase === 'caught') {
        const k = FISHING.kinds[a.heldKind];
        const e = endAnchor(p, 560, 0);
        const bob = Math.sin(this.clock / 150) * 10;
        const sc = 1.5;
        g.fillStyle(0xffffff, 0.12).fillCircle(e.x, e.y, 190);
        drawFish(g, e.x, e.y + bob, p === 0 ? 0 : Math.PI, k, this.clock / 90, { scale: sc, shadow: false });
      }
    }
  }

  private updateLabels(): void {
    for (const p of PLAYERS) {
      const a = this.anglers[p];
      const hint = this.hints[p];
      let text = '';
      if (a.msg) text = a.msg;
      else if (a.phase === 'idle' && !a.pull) text = a.casts === 0 ? LABELS.cast : a.catches === 0 ? LABELS.cast : '';
      else if (a.phase === 'bite') text = LABELS.tap;
      else if (a.phase === 'reel' && a.reel) text = a.reel.leap !== 'none' ? '' : a.reel.burst && a.reel.tension > 0.35 ? LABELS.letGo : a.catches === 0 ? LABELS.reel : '';
      else if (a.phase === 'wait' && a.waitMs > 6000 && !a.fish && a.catches === 0) text = LABELS.recast;
      if (text !== hint.text) hint.setText(text);
      hint.setVisible(text !== '' && this.running);
      hint.setColor(a.phase === 'reel' && a.reel?.burst ? '#ffd84a' : a.phase === 'bite' ? '#ffd84a' : '#' + PLAYER[p].onDark.toString(16));
      // '!' at the lure and at the rod tip
      const show = a.phase === 'bite';
      const fakeNow = a.phase === 'wait' && !!this.fakeFish(p);
      const jump = a.phase === 'reel' && !!a.reel && a.reel.leap !== 'none';
      this.qs[p].setVisible(fakeNow).setPosition(a.lure.x + forward(p) * 95, a.lure.y).setScale(1 + 0.12 * Math.sin(this.clock / 70));
      this.qsTip[p].setVisible(fakeNow).setPosition(rodTip(p).x - forward(p) * 140, rodTip(p).y).setScale(1 + 0.12 * Math.sin(this.clock / 70));
      this.jumps[p].setVisible(jump).setScale(1 + 0.1 * Math.sin(this.clock / 50));
      this.jumps[p].setColor(a.reel?.leap === 'air' ? '#ff5a5a' : '#ffd84a');
      const tip = rodTip(p);
      this.bangs[p].setVisible(show).setPosition(a.lure.x + forward(p) * 95, a.lure.y).setScale(1 + 0.12 * Math.sin(this.clock / 70));
      this.bangsTip[p].setVisible(show).setPosition(tip.x - forward(p) * 140, tip.y).setScale(1 + 0.12 * Math.sin(this.clock / 70));
      const cl = this.caughtLabels[p];
      if (a.phase === 'caught') {
        const k = FISHING.kinds[a.heldKind];
        const txt = `${k.name[settings.get().lang === 'nl' ? 'nl' : 'en']}  +${k.points}`;
        if (cl.text !== txt) cl.setText(txt);
        cl.setVisible(true);
      } else cl.setVisible(false);
    }
    // yellow discs behind the '!' marks
    const g = this.hud;
    for (const p of PLAYERS) {
      if (this.qs[p].visible) {
        g.fillStyle(0x8fd3ff, 1).fillCircle(this.qs[p].x, this.qs[p].y, 50).fillCircle(this.qsTip[p].x, this.qsTip[p].y, 66);
      }
      if (this.jumps[p].visible) {
        const air = this.anglers[p].reel?.leap === 'air';
        const e = endAnchor(p, 700, 0);
        g.fillStyle(air ? 0x5a1414 : 0x3a2a05, 0.75).fillCircle(e.x, e.y, 150);
      }
      if (this.anglers[p].phase !== 'bite') continue;
      const s = 1 + 0.12 * Math.sin(this.clock / 70);
      g.fillStyle(0xffd84a, 1).fillCircle(this.bangs[p].x, this.bangs[p].y, 50 * s);
      g.fillStyle(0xffd84a, 1).fillCircle(this.bangsTip[p].x, this.bangsTip[p].y, 66 * s);
    }
  }
}

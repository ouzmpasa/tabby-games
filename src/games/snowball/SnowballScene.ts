import Phaser from 'phaser';
import { Sfx } from '../../core/audio/Sfx';
import { BaseGameScene } from '../../core/BaseGameScene';
import type { PlayerPointer } from '../../core/input/PlayerInput';
import { endAnchor, H, W } from '../../core/layout';
import { settings } from '../../core/settings';
import { COLORS, PLAYER } from '../../core/theme';
import { other, PLAYERS, type PlayerId } from '../../core/types';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { SNOWBALL as C, SNOWBALL_TEXT } from './config';
import {
  ballGround,
  ballLift,
  canThrow,
  catchUp,
  computeThrow,
  coverStop,
  createKid,
  cueDots,
  DEFAULT_PARAMS,
  isDucking,
  isTap,
  isTelling,
  kidPos,
  levelFor,
  makeBall,
  mercy,
  paramsForLevel,
  placeCover,
  resolveLanding,
  startDuck,
  stepBall,
  stepKid,
  timeLeft,
  type Ball,
  type Kid,
  type Mound,
  type Params,
  type Pt,
  type Throw,
} from './logic';
import { drawMound, makeKid, type KidView } from './pieces';

interface Decal {
  x: number;
  y: number;
  age: number;
}

const DECAL_MS = 4000;

export class SnowballScene extends BaseGameScene {
  /** Simulation state (public so tests can poke it). */
  kids: [Kid, Kid] = [createKid(0), createKid(1)];
  balls: Ball[] = [];
  /** ms of snowy face left per kid. */
  snowy: [number, number] = [0, 0];
  /** Rules in force (follow the leader's score). */
  P: Params = DEFAULT_PARAMS;
  level = 0;
  /** Milliseconds of play so far. */
  playMs = 0;
  /** Cover mounds in front of each kid (a low ball that flies through one is stopped). */
  cover: [Mound[], Mound[]] = [[], []];
  private coverViews: Phaser.GameObjects.Graphics[] = [];
  private coverMs = 0;
  private marks: Array<{ x: number; y: number; age: number; owner: PlayerId }> = [];
  private markG!: Phaser.GameObjects.Graphics;
  private fingers: [number | null, number | null] = [null, null];
  private anchors: [Pt | null, Pt | null] = [null, null];
  private fingerAt: [Pt | null, Pt | null] = [null, null];
  private pulls: [Pt | null, Pt | null] = [null, null];
  private downAt: [number, number] = [0, 0];
  private moved: [number, number] = [0, 0];
  private acted: [boolean, boolean] = [false, false];
  private decals: Decal[] = [];
  private views: KidView[] = [];
  private hints: RotatedLabel[][] = [[], []];
  private aimG!: Phaser.GameObjects.Graphics;
  private ballG!: Phaser.GameObjects.Graphics;
  private hudG!: Phaser.GameObjects.Graphics;
  private decalG!: Phaser.GameObjects.Graphics;

  constructor() {
    super(C.sceneKey, C.id, C.targetScore);
  }

  protected drawBackground(): void {
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.inset);
    const g = this.add.graphics();
    // snowy field
    g.fillStyle(0xcddff1, 1).fillRoundedRect(30, 30, W - 60, H - 60, 56);
    g.fillStyle(0xdbe9f7, 1).fillRoundedRect(60, 60, W - 120, H - 120, 40);
    // each player's end tinted in their colour
    for (const p of PLAYERS) {
      const x = p === 0 ? 60 : W - 60 - 440;
      g.fillStyle(PLAYER[p].main, 0.22).fillRect(x, 60, 440, H - 120);
      g.lineStyle(6, PLAYER[p].main, 0.35).lineBetween(p === 0 ? 500 : W - 500, 80, p === 0 ? 500 : W - 500, H - 80);
    }
    // trampled lanes
    for (const p of PLAYERS) {
      const x = p === 0 ? C.laneInset : W - C.laneInset;
      g.fillStyle(0xb9cfe6, 0.8).fillRoundedRect(x - 70, C.laneMinY - 70, 140, C.laneMaxY - C.laneMinY + 140, 70);
      g.fillStyle(0xcfe0f2, 0.9).fillRoundedRect(x - 56, C.laneMinY - 56, 112, C.laneMaxY - C.laneMinY + 112, 56);
    }
    // sparkles
    const rnd = new Phaser.Math.RandomDataGenerator(['snowball']);
    for (let i = 0; i < 90; i++) g.fillStyle(0xffffff, rnd.realInRange(0.5, 0.9)).fillCircle(rnd.between(90, W - 90), rnd.between(90, H - 90), rnd.between(2, 5));
    // decorative mounds
    for (const m of C.mounds) {
      const mg = this.add.graphics().setPosition(m.x, m.y);
      drawMound(mg, m.r);
    }
    // little pines along the top and bottom edges (clear of the corner buttons)
    for (let i = 0; i < 9; i++) {
      for (const top of [true, false]) {
        const x = 330 + i * 160 + (top ? 0 : 70);
        const y = top ? 92 : H - 92;
        const d = top ? 1 : -1;
        g.fillStyle(0x2c4a52, 1).fillTriangle(x - 36, y, x + 36, y, x, y - d * 52);
        g.fillStyle(0xf5f7fa, 0.9).fillTriangle(x - 22, y - d * 20, x + 22, y - d * 20, x, y - d * 52);
      }
    }
  }

  protected onCreate(): void {
    this.P = paramsForLevel(0);
    this.level = 0;
    this.playMs = 0;
    this.cover = [[], []];
    this.coverViews = [];
    this.coverMs = 0;
    this.marks = [];
    this.kids = [createKid(0, this.P), createKid(1, this.P)];
    this.balls = [];
    this.snowy = [0, 0];
    this.decals = [];
    this.fingers = [null, null];
    this.anchors = [null, null];
    this.fingerAt = [null, null];
    this.pulls = [null, null];
    this.acted = [false, false];
    this.decalG = this.add.graphics().setDepth(3);
    this.markG = this.add.graphics().setDepth(4);
    this.hudG = this.add.graphics().setDepth(12);
    this.aimG = this.add.graphics().setDepth(15);
    this.ballG = this.add.graphics().setDepth(20);
    this.views = PLAYERS.map((p) => makeKid(this, p));
    PLAYERS.forEach((p) => {
      const a = endAnchor(p, 100, -300);
      this.badges[p].setPosition(a.x, a.y);
    });
    this.makeHints();
    this.players.on('down', this.onDown, this);
    this.players.on('move', this.onMove, this);
    this.players.on('up', this.onUp, this);
    this.events.on('resume', this.releaseFingers, this);
    this.events.once('shutdown', () => this.events.off('resume', this.releaseFingers, this));
    this.render();
  }

  private makeHints(): void {
    const txt = SNOWBALL_TEXT[settings.get().lang === 'nl' ? 'nl' : 'en'];
    PLAYERS.forEach((p) => {
      const x = p === 0 ? 640 : W - 640;
      const dx = p === 0 ? -34 : 34; // second line sits further from the player
      this.hints[p] = [
        new RotatedLabel(this, x - dx, H / 2, txt.throwHint, p, { size: 46, color: PLAYER[p].dark, display: true }).setDepth(30).setAlpha(0.9),
        new RotatedLabel(this, x + dx, H / 2, txt.duckHint, p, { size: 46, color: PLAYER[p].dark, display: true }).setDepth(30).setAlpha(0.9),
      ];
    });
  }

  private markActed(p: PlayerId): void {
    if (this.acted[p]) return;
    this.acted[p] = true;
    this.tweens.add({ targets: this.hints[p], alpha: 0, duration: 400 });
  }

  private onDown(e: PlayerPointer): void {
    if (this.match.over || this.fingers[e.player] !== null) return; // one finger per player
    this.fingers[e.player] = e.id;
    this.anchors[e.player] = { x: e.x, y: e.y };
    this.fingerAt[e.player] = { x: e.x, y: e.y };
    this.pulls[e.player] = null;
    this.downAt[e.player] = this.time.now;
    this.moved[e.player] = 0;
  }

  private onMove(e: PlayerPointer): void {
    const a = this.anchors[e.player];
    if (this.fingers[e.player] !== e.id || !a) return;
    this.fingerAt[e.player] = { x: e.x, y: e.y };
    this.pulls[e.player] = { x: a.x - e.x, y: a.y - e.y };
    this.moved[e.player] = Math.max(this.moved[e.player], Math.hypot(e.x - a.x, e.y - a.y));
  }

  private onUp(e: PlayerPointer): void {
    const p = e.player;
    if (this.fingers[p] !== e.id) return;
    const pull = this.pulls[p];
    const tap = isTap(this.time.now - this.downAt[p], this.moved[p]);
    this.clearFinger(p);
    if (tap) this.duck(p);
    else if (pull) this.throwAt(p, pull);
  }

  private clearFinger(p: PlayerId): void {
    this.fingers[p] = null;
    this.anchors[p] = null;
    this.fingerAt[p] = null;
    this.pulls[p] = null;
  }

  private releaseFingers(): void {
    PLAYERS.forEach((p) => this.clearFinger(p));
    this.players.tracker.clear();
  }

  /** Duck behind the mound (also used by tests). */
  duck(p: PlayerId): boolean {
    if (!this.running || this.match.over) return false;
    if (!startDuck(this.kids[p], this.P)) return false;
    this.markActed(p);
    Sfx.tone(260, 0.12, 'sine', 0.15);
    return true;
  }

  /** Throw a snowball with a slingshot pull vector (also used by tests). */
  throwAt(p: PlayerId, pull: Pt): boolean {
    const th = computeThrow(kidPos(p, this.kids[p]), pull);
    return th ? this.throwBall(p, th) : false;
  }

  throwBall(p: PlayerId, th: Throw): boolean {
    const k = this.kids[p];
    if (!this.running || this.match.over || !canThrow(k)) return false;
    const from = kidPos(p, k);
    const stop = coverStop(from, th.target, th.range, [...this.cover[0], ...this.cover[1]], this.P);
    this.balls.push(makeBall(p, from, th, stop ?? 1));
    k.reload = this.P.reloadMs;
    this.markActed(p);
    // the pitch of the throw tells how far it goes (feedback for learning the pull)
    Sfx.tone(240 + 0.28 * th.range, 0.1, 'triangle', 0.18);
    Sfx.vibrate(10);
    const b = this.views[p].body;
    this.tweens.add({ targets: b, x: { from: -10, to: 0 }, duration: 180, ease: 'Quad.Out' });
    return true;
  }

  protected onTick(_time: number, delta: number): void {
    const dt = Math.min(delta, 50);
    this.playMs += dt;
    const lvl = levelFor(Math.max(this.match.scores[0], this.match.scores[1]));
    if (lvl !== this.level) this.levelUp(lvl);
    this.coverMs += dt;
    if (this.coverMs > C.coverShuffleMs) this.shuffleCover();
    for (const p of PLAYERS) {
      stepKid(this.kids[p], dt, this.P);
      this.snowy[p] = Math.max(0, this.snowy[p] - dt);
    }
    this.balls = this.balls.filter((b) => {
      if (this.match.over || !stepBall(b, dt)) return true;
      this.land(b);
      return false;
    });
    for (const d of this.decals) d.age += dt;
    this.decals = this.decals.filter((d) => d.age < DECAL_MS);
    for (const k of this.marks) k.age += dt;
    this.marks = this.marks.filter((k) => k.age < C.landMarkMs);
    this.render();
  }

  private levelUp(lvl: number): void {
    const up = lvl > this.level;
    this.level = lvl;
    this.P = paramsForLevel(lvl);
    this.shuffleCover();
    if (!up) return;
    Sfx.tone(392, 0.12, 'square', 0.12);
    Sfx.tone(587, 0.16, 'square', 0.12, 0.12);
    PLAYERS.forEach((p) => {
      const a = endAnchor(p, 560, 0);
      const l = new RotatedLabel(this, a.x, a.y, `LEVEL ${lvl + 1}`, p, { size: 84, color: PLAYER[p].dark, stroke: 0xffffff, display: true }).setDepth(100);
      this.tweens.add({ targets: l, scale: { from: 0.5, to: 1 }, duration: 300, ease: 'Back.Out' });
      this.tweens.add({ targets: l, alpha: 0, delay: 1300, duration: 400, onComplete: () => l.destroy() });
    });
  }

  /** New cover mounds in front of each kid (they pop up in other places every so often). */
  private shuffleCover(): void {
    this.coverMs = 0;
    this.coverViews.forEach((v) => v.destroy());
    this.coverViews = [];
    this.cover = [placeCover(0, this.P.coverPerSide), placeCover(1, this.P.coverPerSide)];
    for (const p of PLAYERS) for (const m of this.cover[p]) {
      const mg = this.add.graphics().setPosition(m.x, m.y).setDepth(5);
      drawMound(mg, m.r);
      mg.lineStyle(6, PLAYER[p].main, 0.85).strokeEllipse(0, 0, m.r * 2.1, m.r * 1.8); // the owner's colour: their cover
      this.tweens.add({ targets: mg, scale: { from: 0.2, to: 1 }, duration: 350, ease: 'Back.Out' });
      this.coverViews.push(mg);
    }
  }

  private land(b: Ball): void {
    if (b.stopU < 1) {
      // stopped by cover: a puff where it hit the mound
      const gp = ballGround(b);
      this.marks.push({ x: gp.x, y: gp.y, age: 0, owner: b.owner });
      this.burst(gp.x, gp.y, 0xffffff, 10, 0.7);
      this.decals.push({ x: gp.x, y: gp.y, age: 0 });
      Sfx.tone(200, 0.1, 'sine', 0.12);
      return;
    }
    const victim = other(b.owner);
    const vk = this.kids[victim];
    const behind = Math.max(0, this.match.scores[victim] - this.match.scores[b.owner]);
    const res = resolveLanding(b.to, kidPos(victim, vk), isDucking(vk), C.mounds, this.P, catchUp(behind) * mercy(this.playMs));
    this.marks.push({ x: b.to.x, y: b.to.y, age: 0, owner: b.owner });
    if (this.marks.length > 8) this.marks.shift();
    if (res === 'hit') {
      this.snowy[victim] = C.snowyFaceMs;
      this.splat(b.to.x, b.to.y, 1.4);
      const v = kidPos(victim, vk);
      this.burst(v.x, v.y, 0xffffff, 14, 1.1);
      this.burst(v.x, v.y, PLAYER[victim].light, 6, 0.8);
      this.cameras.main.shake(200, 0.004);
      Sfx.tone(300, 0.25, 'sawtooth', 0.2);
      Sfx.vibrate([30, 20, 40]);
      this.plusOne(b.owner);
      this.score(b.owner);
    } else if (res === 'blocked') {
      this.burst(b.to.x, b.to.y, 0xffffff, 10, 0.7);
      this.decals.push({ x: b.to.x, y: b.to.y, age: 0 });
      Sfx.tone(180, 0.15, 'sine', 0.2);
    } else if (res === 'mound') {
      this.burst(b.to.x, b.to.y, 0xffffff, 9, 0.6);
      Sfx.tone(200, 0.1, 'sine', 0.12);
    } else {
      this.splat(b.to.x, b.to.y, 1);
      Sfx.tone(240, 0.1, 'sine', 0.12);
    }
  }

  private splat(x: number, y: number, power: number): void {
    this.decals.push({ x, y, age: 0 });
    if (this.decals.length > 14) this.decals.shift();
    this.burst(x, y, 0xffffff, Math.round(9 * power), 0.7 * power);
  }

  private plusOne(scorer: PlayerId): void {
    const a = endAnchor(scorer, 560, 0);
    const l = new RotatedLabel(this, a.x, a.y, '+1', scorer, { size: 170, color: PLAYER[scorer].onDark, stroke: COLORS.inset, display: true }).setDepth(100);
    this.tweens.add({ targets: l, scale: { from: 0.4, to: 1.1 }, duration: 300, ease: 'Back.Out' });
    this.tweens.add({ targets: l, alpha: 0, delay: 700, duration: 300, onComplete: () => l.destroy() });
  }

  private burst(x: number, y: number, color: number, n: number, power: number): void {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const d = (50 + Math.random() * 130) * power;
      const dot = this.add.circle(x, y, 6 + Math.random() * 9, color, 0.95).setDepth(41);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(ang) * d,
        y: y + Math.sin(ang) * d,
        alpha: 0,
        scale: 0.3,
        duration: 350 + Math.random() * 300,
        ease: 'Quad.Out',
        onComplete: () => dot.destroy(),
      });
    }
  }

  /**
   * Slingshot guide per player: the rubber band and handle and a short dotted cue showing only the DIRECTION (always the same
   * length). No landing ring, no power bar: the ring left where your last snowball came down teaches the pull.
   */
  private drawAim(): void {
    const g = this.aimG.clear();
    for (const p of PLAYERS) {
      const col = PLAYER[p].main;
      const k = this.kids[p];
      const a = this.anchors[p];
      const f = this.fingerAt[p];
      const pull = this.pulls[p];
      if (a && f) {
        g.lineStyle(6, col, 0.5).lineBetween(a.x, a.y, f.x, f.y);
        g.lineStyle(6, col, 0.7).strokeCircle(a.x, a.y, 26);
        g.fillStyle(col, 0.9).fillCircle(f.x, f.y, 18);
      }
      const th = pull ? computeThrow(kidPos(p, k), pull) : null;
      if (!th) continue;
      const alpha = canThrow(k) ? 1 : 0.4;
      for (const d of cueDots(kidPos(p, k), th.target, C.aimDots, C.aimDotGap)) g.fillStyle(col, 0.9 * alpha).fillCircle(d.x, d.y, 8);
    }
  }

  /**
   * Reload ring and duck-stamina ring around each kid, plus a short warning ring on a snowball that is about to land on a kid
   * (only in the last warnMs, and only on balls that threaten the victim: your own landing spot is never shown in advance).
   */
  private drawHud(): void {
    const g = this.hudG.clear();
    for (const p of PLAYERS) {
      const c = kidPos(p, this.kids[p]);
      const k = this.kids[p];
      g.lineStyle(9, 0x2c3b55, 0.3).strokeCircle(c.x, c.y, 78);
      g.lineStyle(9, PLAYER[p].main, k.reload > 0 ? 0.9 : 0.5 + 0.3 * Math.sin(this.time.now / 200));
      if (k.reload > 0) g.beginPath().arc(c.x, c.y, 78, -Math.PI / 2, -Math.PI / 2 + (1 - k.reload / this.P.reloadMs) * Math.PI * 2, false).strokePath();
      else g.strokeCircle(c.x, c.y, 78);
      // stamina: a ring that empties when you duck; bright when there is enough for a duck
      g.lineStyle(9, 0x2c3b55, 0.3).strokeCircle(c.x, c.y, 94);
      if (k.stamina > 0.01) {
        const enough = k.stamina >= C.duckCost - 1e-9;
        g.lineStyle(9, 0x7fb4e8, enough ? 0.95 : 0.5);
        g.beginPath().arc(c.x, c.y, 94, -Math.PI / 2, -Math.PI / 2 + k.stamina * Math.PI * 2, false).strokePath();
      }
      const na = -Math.PI / 2 + C.duckCost * Math.PI * 2; // notch where a duck's worth ends
      g.lineStyle(4, 0xffffff, 0.8).lineBetween(c.x + Math.cos(na) * 86, c.y + Math.sin(na) * 86, c.x + Math.cos(na) * 102, c.y + Math.sin(na) * 102);
    }
    for (const b of this.balls) {
      const left = timeLeft(b);
      if (b.stopU < 1 || left > this.P.warnMs) continue;
      const victim = other(b.owner);
      const vp = kidPos(victim, this.kids[victim]);
      const reach = this.P.splatRadius * 1.6 + (this.P.kidSpeed * left) / 1000;
      if (Math.abs(b.to.x - vp.x) > this.P.splatRadius * 1.6 || Math.abs(b.to.y - vp.y) > reach) continue;
      const u = 1 - left / this.P.warnMs;
      const col = PLAYER[b.owner].main;
      g.fillStyle(col, 0.08 + 0.1 * u).fillCircle(b.to.x, b.to.y, this.P.splatRadius);
      g.lineStyle(6, col, 0.3 + 0.35 * u).strokeCircle(b.to.x, b.to.y, this.P.splatRadius);
      g.lineStyle(5, col, 0.45).strokeCircle(b.to.x, b.to.y, Math.max(8, this.P.splatRadius * (1 - u)));
    }
  }

  /** A ring (in the thrower's colour) where each recent snowball came down. */
  private drawMarks(): void {
    const g = this.markG.clear();
    for (const k of this.marks) {
      const f = 1 - k.age / C.landMarkMs;
      const col = PLAYER[k.owner].main;
      g.lineStyle(8, col, 0.9 * f).strokeCircle(k.x, k.y, 30 + 12 * (1 - f));
      g.fillStyle(col, 0.5 * f).fillCircle(k.x, k.y, 9);
    }
  }

  private render(): void {
    this.drawAim();
    this.drawHud();
    this.drawMarks();
    const dg = this.decalG.clear();
    for (const d of this.decals) {
      const k = 1 - d.age / DECAL_MS;
      dg.fillStyle(0xffffff, 0.9 * k).fillCircle(d.x, d.y, 44).fillCircle(d.x + 30, d.y - 18, 20).fillCircle(d.x - 28, d.y + 22, 24);
      dg.lineStyle(4, 0xb4c9e0, 0.6 * k).strokeCircle(d.x, d.y, 44);
    }
    for (const p of PLAYERS) {
      const v = this.views[p];
      const k = this.kids[p];
      const pos = kidPos(p, k);
      const down = isDucking(k);
      v.root.setPosition(pos.x, pos.y);
      v.body.setScale(down ? 0.62 : 1);
      // a kid that is about to turn round or stop wobbles first, so careful players can see it coming
      v.body.setAngle(isTelling(k, this.P) ? 14 * Math.sin(this.time.now / 45) : 0);
      v.mound.setVisible(down);
      v.held.setVisible(k.reload <= 0 && !down);
      v.snow.setVisible(this.snowy[p] > 0);
    }
    const g = this.ballG.clear();
    for (const b of this.balls) {
      const gp = ballGround(b);
      const lift = ballLift(b);
      g.fillStyle(0x4a6486, 0.3).fillEllipse(gp.x, gp.y + 6, 36, 22);
      const r = 20 * (1 + 0.8 * lift);
      const y = gp.y - lift * 70;
      g.fillStyle(0xffffff, 1).fillCircle(gp.x, y, r);
      g.lineStyle(4, 0xb4c9e0, 1).strokeCircle(gp.x, y, r);
      g.fillStyle(PLAYER[b.owner].light, 0.55).fillCircle(gp.x - r * 0.25, y - r * 0.25, r * 0.35);
    }
  }
}

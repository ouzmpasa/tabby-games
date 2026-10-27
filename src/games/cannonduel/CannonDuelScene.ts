import Phaser from 'phaser';
import { Sfx } from '../../core/audio/Sfx';
import { BaseGameScene } from '../../core/BaseGameScene';
import type { PlayerPointer } from '../../core/input/PlayerInput';
import { endAnchor, H, W } from '../../core/layout';
import { COLORS, PLAYER } from '../../core/theme';
import { other, PLAYERS, type PlayerId } from '../../core/types';
import { runCountdown } from '../../ui/Countdown';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { settings } from '../../core/settings';
import { CANNONDUEL as C, CANNONDUEL_TEXT } from './config';
import {
  angleFromElevation,
  cannonPos,
  computeAim,
  cueDotsFor,
  DEFAULT_PARAMS,
  dotsAlong,
  generateHill,
  hillHeightAt,
  levelOfRound,
  muzzlePos,
  roundParams,
  simulate,
  stepShell,
  swayOffset,
  windSteps,
  type Aim,
  type Hill,
  type Params,
  type Pt,
  type Shell,
} from './logic';
import { makeCannon, type CannonView } from './pieces';

type Phase = 'countdown' | 'play' | 'hit' | 'over';

interface LiveShell extends Shell {
  trail: Pt[];
}

export class CannonDuelScene extends BaseGameScene {
  /** Simulation state (public so tests can poke it). */
  phase: Phase = 'countdown';
  hill!: Hill;
  shells: LiveShell[] = [];
  /** Milliseconds of reload left per player (0 = loaded). */
  reload: [number, number] = [0, 0];
  private fingers: [number | null, number | null] = [null, null];
  private anchors: [Pt | null, Pt | null] = [null, null];
  private fingerAt: [Pt | null, Pt | null] = [null, null];
  private pulls: [Pt | null, Pt | null] = [null, null];
  /** Rounds played so far (drives the difficulty level). */
  round = 0;
  /** Rules of the current round: blast radius, wind, reload time, cannon distance, sway. */
  RP: Params = DEFAULT_PARAMS;
  /** Milliseconds into the current round (the clock of the swaying cannons). */
  roundMs = 0;
  private off: [number, number] = [0, 0];
  private marks: Array<{ x: number; y: number; owner: PlayerId; age: number }> = [];
  private markG!: Phaser.GameObjects.Graphics;
  private windG!: Phaser.GameObjects.Graphics;
  private hints: RotatedLabel[][] = [[], []];
  private craters: Pt[] = [];
  private hillG!: Phaser.GameObjects.Graphics;
  private craterG!: Phaser.GameObjects.Graphics;
  private aimG!: Phaser.GameObjects.Graphics;
  private shellG!: Phaser.GameObjects.Graphics;
  private hudG!: Phaser.GameObjects.Graphics;
  private cannons: CannonView[] = [];
  private fired: [boolean, boolean] = [false, false];

  constructor() {
    super(C.sceneKey, C.id, C.targetScore);
  }

  protected drawBackground(): void {
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg);
    const g = this.add.graphics();
    // dusk sky in soft bands, lighter toward the horizon
    const bands = 12;
    for (let i = 0; i < bands; i++) {
      const k = i / (bands - 1);
      const col = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.IntegerToColor(COLORS.inset),
        Phaser.Display.Color.IntegerToColor(COLORS.tile),
        1,
        k,
      );
      g.fillStyle(Phaser.Display.Color.GetColor(col.r, col.g, col.b), 1).fillRect(0, (C.groundY / bands) * i, W, C.groundY / bands + 2);
    }
    // stars and a moon
    const rnd = new Phaser.Math.RandomDataGenerator(['cannon']);
    for (let i = 0; i < 40; i++) g.fillStyle(COLORS.text, rnd.realInRange(0.1, 0.4)).fillCircle(rnd.between(30, W - 30), rnd.between(30, 520), rnd.between(2, 4));
    g.fillStyle(COLORS.text2, 0.18).fillCircle(W / 2 + 40, 160, 54);
    // ground
    g.fillStyle(COLORS.surface, 1).fillRect(0, C.groundY, W, H - C.groundY);
    g.fillStyle(COLORS.border, 1).fillRect(0, C.groundY, W, 6);
    g.fillStyle(PLAYER[0].main, 0.2).fillRect(0, C.groundY + 6, 480, H - C.groundY);
    g.fillStyle(PLAYER[1].main, 0.2).fillRect(W - 480, C.groundY + 6, 480, H - C.groundY);
    g.fillStyle(COLORS.dots, 1);
    for (let y = C.groundY + 40; y < H - 10; y += 36) for (let x = 20 + ((y / 36) % 2) * 18; x < W; x += 36) g.fillCircle(x, y, 2.5);
  }

  protected onCreate(): void {
    this.running = true; // phases (not `running`) gate firing, so aiming works during countdowns
    this.phase = 'countdown';
    this.fingers = [null, null];
    this.anchors = [null, null];
    this.fingerAt = [null, null];
    this.pulls = [null, null];
    this.shells = [];
    this.craters = [];
    this.reload = [0, 0];
    this.fired = [false, false];
    this.round = 0;
    this.roundMs = 0;
    this.off = [0, 0];
    this.marks = [];
    this.RP = roundParams(0);
    this.hill = generateHill(Math.random, this.RP);
    this.hillG = this.add.graphics().setDepth(4);
    this.craterG = this.add.graphics().setDepth(5);
    this.markG = this.add.graphics().setDepth(6);
    this.windG = this.add.graphics().setDepth(2);
    this.aimG = this.add.graphics().setDepth(15);
    this.shellG = this.add.graphics().setDepth(20);
    this.hudG = this.add.graphics().setDepth(12);
    this.cannons = PLAYERS.map((p) => makeCannon(this, p));
    PLAYERS.forEach((p) => {
      const a = endAnchor(p, 100, -300);
      this.badges[p].setPosition(a.x, a.y);
    });
    this.cannons.forEach((cv, p) => cv.root.setPosition(cannonPos(p as PlayerId, this.RP).x, cannonPos(p as PlayerId, this.RP).y));
    this.makeHints();
    this.drawHill();
    this.players.on('down', this.onDown, this);
    this.players.on('move', this.onMove, this);
    this.players.on('up', this.onUp, this);
    this.events.on('resume', this.releaseFingers, this);
    this.events.once('shutdown', () => this.events.off('resume', this.releaseFingers, this));
    this.render();
  }

  private makeHints(): void {
    const txt = CANNONDUEL_TEXT[settings.get().lang === 'nl' ? 'nl' : 'en'];
    PLAYERS.forEach((p) => {
      const a = endAnchor(p, 135, 20);
      const d = p === 0 ? 1 : -1; // second line sits further from the player's edge
      this.hints[p] = [
        new RotatedLabel(this, a.x, a.y, txt.hint, p, { size: 40, color: PLAYER[p].onDark, display: true }).setDepth(30).setAlpha(0.95),
        new RotatedLabel(this, a.x + d * 50, a.y, txt.hint2, p, { size: 34, color: PLAYER[p].onDark, display: true }).setDepth(30).setAlpha(0.8),
      ];
    });
  }

  protected onStart(): void {
    if (this.phase === 'countdown') this.phase = 'play';
  }

  private onDown(e: PlayerPointer): void {
    if (this.phase === 'over' || this.fingers[e.player] !== null) return; // one finger per player
    this.fingers[e.player] = e.id;
    this.anchors[e.player] = { x: e.x, y: e.y };
    this.fingerAt[e.player] = { x: e.x, y: e.y };
    this.pulls[e.player] = null;
  }

  private onMove(e: PlayerPointer): void {
    const a = this.anchors[e.player];
    if (this.fingers[e.player] !== e.id || !a) return;
    this.fingerAt[e.player] = { x: e.x, y: e.y };
    this.pulls[e.player] = { x: a.x - e.x, y: a.y - e.y };
  }

  private onUp(e: PlayerPointer): void {
    const p = e.player;
    if (this.fingers[p] !== e.id) return;
    const pull = this.pulls[p];
    this.clearFinger(p);
    if (!pull) return;
    const aim = computeAim(p, pull);
    if (aim) this.fire(p, aim);
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

  /** Fire a shell (also used by tests). Does nothing while reloading or outside a live round. */
  fire(p: PlayerId, aim: Aim): boolean {
    if (this.phase !== 'play' || this.reload[p] > 0 || this.match.over) return false;
    const m = muzzlePos(p, aim.angle, this.RP);
    m.x += this.off[p];
    this.shells.push({ x: m.x, y: m.y, vx: aim.vx, vy: aim.vy, owner: p, trail: [] });
    this.reload[p] = this.RP.reloadMs;
    if (!this.fired[p]) this.tweens.add({ targets: this.hints[p], alpha: 0, duration: 400 });
    this.fired[p] = true;
    // the pitch of the bang tells how hard it was fired (feedback for learning the pull)
    Sfx.tone(110 + 170 * aim.power, 0.18, 'square', 0.2);
    Sfx.vibrate(15);
    const b = this.cannons[p].barrel;
    this.tweens.add({ targets: b, x: { from: -Math.cos(aim.angle) * 18, to: 0 }, y: { from: -Math.sin(aim.angle) * 18, to: 0 }, duration: 220, ease: 'Quad.Out' });
    const puff = this.add.circle(m.x, m.y, 22, COLORS.text, 0.7).setDepth(21);
    this.tweens.add({ targets: puff, scale: 2.6, alpha: 0, duration: 350, onComplete: () => puff.destroy() });
    return true;
  }

  protected onTick(_time: number, delta: number): void {
    if (this.phase === 'over') return;
    const dt = Math.min(delta, 50);
    for (const p of PLAYERS) this.reload[p] = Math.max(0, this.reload[p] - dt);
    if (this.phase === 'play' || this.phase === 'countdown') this.roundMs += dt;
    this.off = [swayOffset(0, this.roundMs, this.RP), swayOffset(1, this.roundMs, this.RP)];
    if (this.phase === 'play') this.stepShells(dt);
    for (const k of this.marks) k.age += dt;
    this.marks = this.marks.filter((k) => k.age < C.markMs);
    this.render();
  }

  private stepShells(dt: number): void {
    const hits: { scorer: PlayerId; victim: PlayerId }[] = [];
    this.shells = this.shells.filter((s) => {
      s.trail.push({ x: s.x, y: s.y });
      if (s.trail.length > 9) s.trail.shift();
      const r = stepShell(s, dt, this.hill, this.RP, this.off);
      if (r.impact === 'cannon') hits.push({ scorer: s.owner, victim: r.victim ?? other(s.owner) });
      else if (r.impact === 'ground' || r.impact === 'hill') this.crater(s);
      return r.impact === null;
    });
    if (hits.length > 0) this.onHit(hits);
  }

  private crater(s: Shell): void {
    this.craters.push({ x: s.x, y: s.y });
    this.marks.push({ x: s.x, y: s.y, owner: s.owner, age: 0 });
    if (this.marks.length > 6) this.marks.shift();
    if (this.craters.length > 14) this.craters.shift();
    Sfx.tone(110, 0.2, 'sawtooth', 0.15);
    this.burst(s.x, s.y, COLORS.border, 8, 0.6);
    this.drawCraters();
  }

  private onHit(hits: { scorer: PlayerId; victim: PlayerId }[]): void {
    this.phase = 'hit';
    this.shells = [];
    this.releaseFingers();
    for (const h of hits) {
      if (this.match.over) break;
      this.score(h.scorer);
      this.explode(h.scorer, h.victim);
    }
    this.cameras.main.shake(300, 0.008);
    Sfx.tone(70, 0.5, 'sawtooth', 0.3);
    Sfx.vibrate([40, 30, 80]);
    if (this.match.over) {
      this.phase = 'over';
      return;
    }
    this.time.delayedCall(C.hitPauseMs, () => this.nextRound());
  }

  /** Big explosion on the victim, "+1" for the scorer. */
  private explode(scorer: PlayerId, victim: PlayerId): void {
    const cp = cannonPos(victim, this.RP);
    const c = { x: cp.x + this.off[victim], y: cp.y };
    this.cannons[victim].root.setVisible(false);
    const flash = this.add.circle(c.x, c.y, 90, 0xffffff, 0.9).setDepth(40);
    this.tweens.add({ targets: flash, scale: 3.4, alpha: 0, duration: 450, onComplete: () => flash.destroy() });
    const fire = this.add.circle(c.x, c.y, 80, PLAYER[victim].light, 0.8).setDepth(39);
    this.tweens.add({ targets: fire, scale: 2.6, alpha: 0, duration: 700, onComplete: () => fire.destroy() });
    this.burst(c.x, c.y, PLAYER[victim].main, 22, 1.4);
    this.burst(c.x, c.y, COLORS.text, 10, 1);
    const a = endAnchor(scorer, 560, 0);
    const l = new RotatedLabel(this, a.x, a.y, '+1', scorer, { size: 170, color: PLAYER[scorer].onDark, stroke: COLORS.inset, display: true }).setDepth(100);
    this.tweens.add({ targets: l, scale: { from: 0.4, to: 1.1 }, duration: 300, ease: 'Back.Out' });
    this.tweens.add({ targets: l, alpha: 0, delay: 900, duration: 300, onComplete: () => l.destroy() });
  }

  private burst(x: number, y: number, color: number, n: number, power: number): void {
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const d = (60 + Math.random() * 160) * power;
      const dot = this.add.circle(x, y, 7 + Math.random() * 9, color, 0.9).setDepth(41);
      this.tweens.add({
        targets: dot,
        x: x + Math.cos(ang) * d,
        y: y + Math.sin(ang) * d - 40,
        alpha: 0,
        scale: 0.2,
        duration: 450 + Math.random() * 350,
        ease: 'Quad.Out',
        onComplete: () => dot.destroy(),
      });
    }
  }

  private nextRound(): void {
    if (this.match.over) return;
    this.round++;
    this.RP = roundParams(levelOfRound(this.round));
    this.roundMs = 0;
    this.hill = generateHill(Math.random, this.RP);
    this.craters = [];
    this.marks = [];
    this.shells = [];
    this.reload = [0, 0];
    this.cannons.forEach((c, p) => c.root.setPosition(cannonPos(p as PlayerId, this.RP).x, cannonPos(p as PlayerId, this.RP).y));
    this.cannons.forEach((c) => c.root.setVisible(true).setScale(0.6));
    this.tweens.add({ targets: this.cannons.map((c) => c.root), scale: 1, duration: 300, ease: 'Back.Out' });
    this.drawHill();
    this.drawCraters();
    this.phase = 'countdown';
    runCountdown(this, () => {
      if (this.phase === 'countdown') this.phase = 'play';
    });
  }

  private drawHill(): void {
    const g = this.hillG.clear();
    const h = this.hill;
    const pts: Phaser.Math.Vector2[] = [];
    for (let x = h.x - h.halfWidth; x <= h.x + h.halfWidth; x += 8) pts.push(new Phaser.Math.Vector2(x, C.groundY - hillHeightAt(h, x)));
    pts.push(new Phaser.Math.Vector2(h.x + h.halfWidth, C.groundY - 0));
    const poly = [...pts, new Phaser.Math.Vector2(h.x + h.halfWidth, C.groundY + 4), new Phaser.Math.Vector2(h.x - h.halfWidth, C.groundY + 4)];
    g.fillStyle(COLORS.line, 1).fillPoints(poly, true);
    g.lineStyle(8, COLORS.muted, 0.9).strokePoints(pts, false);
    g.fillStyle(COLORS.border, 0.7);
    for (let i = 0; i < 9; i++) {
      const x = h.x - h.halfWidth * 0.7 + (i * h.halfWidth * 1.4) / 8;
      const top = C.groundY - hillHeightAt(h, x);
      g.fillCircle(x, top + 40 + ((i * 37) % 60), 6 + (i % 3) * 3);
    }
  }

  private drawCraters(): void {
    const g = this.craterG.clear();
    for (const c of this.craters) {
      g.fillStyle(0x080e1a, 0.4).fillEllipse(c.x, c.y + 4, C.craterRadius * 2, C.craterRadius * 0.7);
      g.fillStyle(0x080e1a, 0.3).fillEllipse(c.x, c.y + 4, C.craterRadius * 1.1, C.craterRadius * 0.4);
    }
  }

  /**
   * Slingshot guide per player: the rubber band and handle, the barrel angle and two dots on the barrel line. There is NO
   * trajectory, landing ring or power bar: how hard to pull is the skill (the ring left by the last shell teaches it).
   */
  private drawAim(): void {
    const g = this.aimG.clear();
    for (const p of PLAYERS) {
      const col = PLAYER[p].main;
      const pull = this.pulls[p];
      const aim = pull ? computeAim(p, pull) : null;
      const loaded = this.reload[p] <= 0 && this.phase === 'play';
      const alpha = loaded ? 1 : 0.4;
      const cb = this.cannons[p].barrel;
      const a = this.anchors[p];
      const f = this.fingerAt[p];
      if (a && f) {
        g.lineStyle(6, col, 0.5).lineBetween(a.x, a.y, f.x, f.y);
        g.lineStyle(6, col, 0.7).strokeCircle(a.x, a.y, 26);
        g.fillStyle(col, 0.9).fillCircle(f.x, f.y, 18);
      }
      if (aim) {
        cb.setRotation(aim.angle);
        for (const d of cueDotsFor(p, aim.angle, this.RP)) g.fillStyle(col, 0.9 * alpha).fillCircle(d.x + this.off[p], d.y, 9);
      } else {
        cb.setRotation(angleFromElevation(p, C.idleElevationDeg));
        // before the first shot, a faint hint arc invites the player to try
        if (!this.fired[p] && !a && this.phase !== 'over') {
          const pulse = 0.35 + 0.2 * Math.sin(this.time.now / 300);
          const path = simulate(p, angleFromElevation(p, C.idleElevationDeg), 1100, this.hill, this.RP);
          for (const d of dotsAlong(path.points, C.previewDotGap * 1.4).slice(0, 5)) g.fillStyle(col, pulse).fillCircle(d.x + this.off[p], d.y, 7);
        }
      }
    }
  }

  /** A ring where each recent shell came down, in its owner's colour, fading away: this is how players learn the power. */
  private drawMarks(): void {
    const g = this.markG.clear();
    for (const k of this.marks) {
      const f = 1 - k.age / C.markMs;
      const col = PLAYER[k.owner].main;
      g.lineStyle(8, col, 0.9 * f).strokeCircle(k.x, k.y, 30 + 12 * (1 - f));
      g.fillStyle(col, 0.35 * f).fillCircle(k.x, k.y, 10);
    }
  }

  /** Sky streaks that blow in the wind's direction (more and faster = stronger), plus a pennant on a pole. */
  private drawWind(): void {
    const g = this.windG.clear();
    const steps = windSteps(this.RP.wind);
    const dir = Math.sign(this.RP.wind);
    const t = this.time.now / 1000;
    for (let i = 0; i < steps * 4; i++) {
      const y = 230 + ((i * 97) % 420);
      const speed = 160 + 90 * steps;
      const len = 60 + 25 * steps + (i % 3) * 20;
      const x = ((((i * 331) % W) + dir * speed * t) % (W + 200) + (W + 200)) % (W + 200) - 100;
      g.lineStyle(5, COLORS.text, 0.16).lineBetween(x, y, x - dir * len, y);
    }
    // pole and pennant in the middle of the sky
    const px = W / 2 - 120;
    const py = 360;
    g.lineStyle(8, COLORS.muted, 0.9).lineBetween(px, py, px, py - 120);
    g.fillStyle(COLORS.text, 1).fillCircle(px, py - 124, 8);
    if (steps === 0) {
      g.lineStyle(8, 0xffb878, 0.9).lineBetween(px, py - 112, px, py - 52);
      return;
    }
    const L = 40 + 36 * steps;
    let ax = px;
    let ay = py - 112;
    for (let i = 1; i <= 7; i++) {
      const u = i / 7;
      const nx = px + dir * L * u;
      const ny = py - 112 + Math.sin(t * (3 + steps) - u * 4) * 8 * u + 14 * u;
      g.lineStyle(20 * (1 - u * 0.75), 0xffb878, 0.95).lineBetween(ax, ay, nx, ny);
      ax = nx;
      ay = ny;
    }
  }

  /** Reload ring around each turret (or a ready glow when loaded). */
  private drawHud(): void {
    const g = this.hudG.clear();
    for (const p of PLAYERS) {
      if (this.phase === 'hit' || this.phase === 'over') continue;
      const cp = cannonPos(p, this.RP);
      const c = { x: cp.x + this.off[p], y: cp.y };
      const col = PLAYER[p].light;
      const left = this.reload[p] / this.RP.reloadMs;
      g.lineStyle(10, 0x080e1a, 0.45).strokeCircle(c.x, c.y, 76);
      if (left > 0) {
        g.lineStyle(10, col, 0.9);
        g.beginPath().arc(c.x, c.y, 76, -Math.PI / 2, -Math.PI / 2 + (1 - left) * Math.PI * 2, false).strokePath();
      } else {
        g.lineStyle(10, col, 0.5 + 0.3 * Math.sin(this.time.now / 200)).strokeCircle(c.x, c.y, 76);
      }
    }
  }

  private render(): void {
    this.cannons.forEach((cv, p) => {
      const cp = cannonPos(p as PlayerId, this.RP);
      cv.root.setPosition(cp.x + this.off[p], cp.y);
    });
    this.drawAim();
    this.drawHud();
    this.drawMarks();
    this.drawWind();
    const g = this.shellG.clear();
    for (const s of this.shells) {
      const col = PLAYER[s.owner];
      s.trail.forEach((t, i) => g.fillStyle(col.light, 0.06 + (0.3 * i) / s.trail.length).fillCircle(t.x, t.y, C.shellRadius * (0.4 + (0.5 * i) / s.trail.length)));
      g.fillStyle(0x080e1a, 0.4).fillCircle(s.x + 3, s.y + 5, C.shellRadius);
      g.fillStyle(col.main, 1).fillCircle(s.x, s.y, C.shellRadius);
      g.fillStyle(col.light, 1).fillCircle(s.x - 5, s.y - 5, C.shellRadius * 0.4);
    }
  }
}

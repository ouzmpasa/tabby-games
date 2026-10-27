import Phaser from 'phaser';
import { BaseGameScene } from '../../core/BaseGameScene';
import { Sfx } from '../../core/audio/Sfx';
import type { PlayerPointer } from '../../core/input/PlayerInput';
import { endAnchor, H, W } from '../../core/layout';
import { COLORS, PLAYER } from '../../core/theme';
import { PLAYERS, type PlayerId } from '../../core/types';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { settings } from '../../core/settings';
import { HINT_KICKS, PENALTY, PENALTY_COLORS, PENALTY_HINT, PENALTY_TEXT } from './config';
import {
  blockerPassK,
  blockerX,
  blockerY,
  computeShot,
  cueDots,
  DEFAULT_PARAMS,
  goalX,
  isBlocked,
  keeperOf,
  keeperRange,
  levelOfKick,
  paramsForLevel,
  resolveShot,
  shooterOf,
  shotAt,
  spotPos,
  stepKeeper,
  type Outcome,
  type Params,
  type Pt,
  type Shot,
} from './logic';

type Phase = 'aim' | 'flight' | 'result';

export class PenaltyScene extends BaseGameScene {
  /** Kick counter: even = player 0 shoots, odd = player 1 shoots. */
  kick = 0;
  phase: Phase = 'result';
  keeperY = H / 2;
  keeperTarget = H / 2;
  shot: Shot | null = null;
  /** Rules in force for the current kick (the level ramps up with the kick number). */
  P: Params = DEFAULT_PARAMS;
  private elapsed = 0;
  /** Clock of the patrolling defender cone (ms). */
  private blockClock = 0;
  private blockChecked = false;
  /** Power ring left after a kick: shown as feedback. */
  private lastKick: { power: number; over: boolean; spot: Pt; player: PlayerId; age: number } | null = null;
  private boardG!: Phaser.GameObjects.Graphics;
  private coneG!: Phaser.GameObjects.Graphics;
  private hintLabel!: RotatedLabel;
  private finger: number | null = null;
  private anchor: Pt | null = null;
  private pull: Pt | null = null;
  private aim!: Phaser.GameObjects.Graphics;
  private keeperView!: Phaser.GameObjects.Container;
  private keeperBody!: Phaser.GameObjects.Graphics;
  private ballView!: Phaser.GameObjects.Container;
  private ballShadow!: Phaser.GameObjects.Arc;
  private roleLabels: RotatedLabel[] = [];
  private netFlash!: Phaser.GameObjects.Graphics;

  constructor() {
    super(PENALTY.sceneKey, PENALTY.id, PENALTY.targetScore);
  }

  get shooter(): PlayerId {
    return shooterOf(this.kick);
  }
  get keeper(): PlayerId {
    return keeperOf(this.kick);
  }

  protected drawBackground(): void {
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg);
    const g = this.add.graphics();
    const m = 40;
    const r = 40;
    g.fillStyle(0x080e1a, 0.3).fillRoundedRect(m, m + 14, W - 2 * m, H - 2 * m, r);
    g.fillStyle(PENALTY_COLORS.grass, 1).fillRoundedRect(m, m, W - 2 * m, H - 2 * m, r);
    // mowing stripes
    const sw = (W - 2 * m) / 12;
    for (let i = 1; i < 12; i += 2) g.fillStyle(PENALTY_COLORS.grassStripe, 1).fillRect(m + i * sw, m, sw, H - 2 * m);
    g.lineStyle(4, COLORS.line, 0.9);
    g.lineBetween(W / 2, m, W / 2, H - m).strokeCircle(W / 2, H / 2, 110);
    // the two goals: net + posts, tinted with the colour of the player who defends them
    const spots: Array<[PlayerId, number]> = [[0, PENALTY.goalInset], [1, W - PENALTY.goalInset]];
    for (const [defender, gx] of spots) {
      const dir = defender === 0 ? -1 : 1; // net lies behind the line, toward the screen edge
      const back = gx + dir * PENALTY.netDepth;
      const top = H / 2 - PENALTY.goalHalfH;
      const h = 2 * PENALTY.goalHalfH;
      const x0 = Math.min(gx, back);
      // penalty box + spot (in front of the goal)
      const boxW = 330;
      const bx = defender === 0 ? gx : gx - boxW;
      g.lineStyle(4, COLORS.line, 0.8).strokeRect(bx, H / 2 - PENALTY.goalHalfH - 150, boxW, h + 300);
      g.fillStyle(COLORS.dots, 0.7).fillRect(x0, top, PENALTY.netDepth, h);
      g.fillStyle(PLAYER[defender].main, 0.22).fillRect(x0, top, PENALTY.netDepth, h);
      g.lineStyle(2, COLORS.text2, 0.35);
      for (let y = top; y <= top + h; y += 30) g.lineBetween(x0, y, x0 + PENALTY.netDepth, y);
      for (let x = x0; x <= x0 + PENALTY.netDepth + 1; x += 25) g.lineBetween(x, top, x, top + h);
      g.lineStyle(12, PENALTY_COLORS.post, 1).beginPath().moveTo(gx, top).lineTo(back, top).lineTo(back, top + h).lineTo(gx, top + h).strokePath();
      g.fillStyle(PENALTY_COLORS.post, 1).fillCircle(gx, top, 14).fillCircle(gx, top + h, 14);
      g.lineStyle(5, PLAYER[defender].main, 0.9).lineBetween(gx, top, gx, top + h);
    }
    for (const p of PLAYERS) {
      const s = spotPos(p);
      g.fillStyle(COLORS.text, 0.55).fillCircle(s.x, s.y, 9);
      g.lineStyle(5, PLAYER[p].main, 0.45).strokeCircle(s.x, s.y, PENALTY.ballRadius * 1.7);
    }
  }

  protected onCreate(): void {
    this.kick = 0;
    this.phase = 'result';
    this.keeperY = this.keeperTarget = H / 2;
    this.shot = null;
    this.releaseFinger();
    this.aim = this.add.graphics().setDepth(15);
    this.boardG = this.add.graphics().setDepth(13);
    this.coneG = this.add.graphics().setDepth(14);
    this.P = paramsForLevel(0);
    this.blockClock = 0;
    this.lastKick = null;
    this.netFlash = this.add.graphics().setDepth(11);
    this.makeKeeper();
    this.makeBall();
    this.roleLabels = PLAYERS.map((p) => {
      const a = endAnchor(p, 330);
      return new RotatedLabel(this, a.x, a.y, '', p, { size: 110, color: PLAYER[p].onDark, stroke: COLORS.inset, display: true }).setDepth(30);
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
    this.hintLabel = new RotatedLabel(this, 0, 0, '', 0, { size: 36, color: 0xffffff, display: true }).setDepth(30).setVisible(false);
    this.setRoles(false);
    this.roleLabels.forEach((l) => l.setVisible(false)); // the 3-2-1 sits where they go
    this.render();
  }

  protected onStart(): void {
    this.beginAim();
  }

  // ---------- views ----------

  private makeKeeper(): void {
    const g = (this.keeperBody = this.add.graphics());
    this.keeperView = this.add.container(0, 0, [g]).setDepth(12);
    this.paintKeeper(this.keeper);
  }

  /** Top-down keeper in the defender's colour, arms spread along the goal line, gloves at the ends. */
  private paintKeeper(p: PlayerId): void {
    const c = PLAYER[p];
    const h = this.P.keeperHalf;
    const g = this.keeperBody.clear();
    g.fillStyle(0x080e1a, 0.35).fillRoundedRect(-30 + 8, -h + 14, 60, 2 * h, 30);
    g.fillStyle(c.dark, 1).fillRoundedRect(-28, -h, 56, 2 * h, 28); // arms span
    g.fillStyle(c.main, 1).fillEllipse(0, 0, 84, 150); // torso
    g.fillStyle(c.light, 1).fillCircle(0, 0, 30); // head
    g.fillStyle(COLORS.text, 1).fillCircle(0, -h + 22, 26).fillCircle(0, h - 22, 26); // gloves
    g.lineStyle(4, c.dark, 1).strokeCircle(0, -h + 22, 26).strokeCircle(0, h - 22, 26);
  }

  private makeBall(): void {
    const R = PENALTY.ballRadius;
    const g = this.add.graphics();
    g.fillStyle(COLORS.puck, 1).fillCircle(0, 0, R);
    g.lineStyle(4, 0x1e2a3d, 1).strokeCircle(0, 0, R);
    g.fillStyle(0x1e2a3d, 1);
    const pent = (r: number, rot: number, cx: number, cy: number) => {
      const pts = Array.from({ length: 5 }, (_, i) => new Phaser.Geom.Point(cx + r * Math.cos(rot + (i * 2 * Math.PI) / 5), cy + r * Math.sin(rot + (i * 2 * Math.PI) / 5)));
      g.fillPoints(pts, true);
    };
    pent(R * 0.42, -Math.PI / 2, 0, 0);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5 + Math.PI / 5;
      pent(R * 0.2, a, Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9);
    }
    this.ballShadow = this.add.circle(0, 0, R, 0x080e1a, 0.4);
    this.ballView = this.add.container(0, 0, [this.ballShadow, g]).setDepth(20);
  }

  // ---------- flow ----------

  /** Tell each player their job and light up the shooter's score badge. */
  private setRoles(animate: boolean): void {
    PLAYERS.forEach((p) => {
      const isShooter = p === this.shooter;
      const l = this.roleLabels[p];
      l.setText(isShooter ? PENALTY_TEXT.shoot : PENALTY_TEXT.save).setColor(isShooter ? '#ffffff' : '#' + PLAYER[p].onDark.toString(16));
      if (animate) this.tweens.add({ targets: l, scale: { from: 1.5, to: 1 }, duration: 350, ease: 'Back.Out' });
      this.badges[p].setActiveEdge(isShooter);
    });
    const a = endAnchor(this.shooter, 330);
    this.roleLabels[this.shooter].setPosition(a.x, a.y);
    const k = endAnchor(this.keeper, 85);
    this.roleLabels[this.keeper].setPosition(k.x, k.y);
    this.paintKeeper(this.keeper);
  }

  /** Side boards that narrow the goal mouth as the levels go up. */
  private drawBoards(): void {
    const g = this.boardG.clear();
    const cut = PENALTY.goalHalfH - this.P.goalHalfH;
    if (cut <= 0) return;
    for (const defender of PLAYERS) {
      const gx = defender === 0 ? PENALTY.goalInset : W - PENALTY.goalInset;
      const x = gx - 14;
      for (const side of [-1, 1]) {
        const y0 = side < 0 ? H / 2 - PENALTY.goalHalfH : H / 2 + this.P.goalHalfH;
        g.fillStyle(PLAYER[defender].dark, 1).fillRoundedRect(x, y0, 28, cut, 8);
        g.fillStyle(PENALTY_COLORS.post, 1).fillRect(x + 8, y0, 6, cut);
      }
    }
  }

  /** The first kicks of each player show a short how-to under the shooter's label. */
  private updateHint(): void {
    const show = this.kick < HINT_KICKS;
    this.hintLabel.setVisible(show);
    if (!show) return;
    const a = endAnchor(this.shooter, 610, this.shooter === 0 ? 285 : -285); // clear of the goal and the kicking line
    this.hintLabel.setText(PENALTY_HINT[settings.get().lang === 'nl' ? 'nl' : 'en']).setPosition(a.x, a.y).setRotation(a.rotation).setColor('#' + PLAYER[this.shooter].onDark.toString(16));
  }

  private beginAim(): void {
    this.P = paramsForLevel(levelOfKick(this.kick));
    this.drawBoards();
    this.setRoles(true);
    this.updateHint();
    this.blockChecked = false;
    this.roleLabels.forEach((l) => l.setVisible(true));
    this.keeperY = this.keeperTarget = H / 2;
    this.shot = null;
    this.elapsed = 0;
    this.releaseFinger();
    this.phase = 'aim';
    this.render();
  }

  private releaseFinger(): void {
    this.finger = null;
    this.anchor = null;
    this.pull = null;
  }

  // ---------- input ----------

  private onDown(e: PlayerPointer): void {
    if (!this.running || this.match.over) return;
    if (e.player === this.keeper) {
      this.keeperTarget = e.y;
      return;
    }
    if (this.phase !== 'aim' || this.finger !== null) return; // one finger for the shooter
    this.finger = e.id;
    this.anchor = { x: e.x, y: e.y };
    this.pull = null;
  }

  private onMove(e: PlayerPointer): void {
    if (e.player === this.keeper) {
      this.keeperTarget = e.y;
      return;
    }
    if (this.finger !== e.id || !this.anchor) return;
    this.pull = { x: this.anchor.x - e.x, y: this.anchor.y - e.y };
  }

  private onUp(e: PlayerPointer): void {
    if (e.player === this.shooter && this.finger === e.id) {
      const pull = this.pull;
      this.releaseFinger();
      if (!this.running || this.phase !== 'aim' || !pull) return;
      const shot = computeShot(this.shooter, pull);
      if (shot) this.kickBall(shot);
    }
  }

  /** Start a kick (also used by tests). */
  kickBall(shot: Shot): void {
    if (this.phase !== 'aim') return;
    this.shot = shot;
    this.elapsed = 0;
    this.blockChecked = false;
    this.phase = 'flight';
    this.lastKick = { power: shot.power, over: shot.over, spot: { ...shot.from }, player: this.shooter, age: 0 };
    this.hintLabel.setVisible(false);
    // the pitch of the kick tells how hard it was (feedback for learning the power)
    Sfx.tone(200 + 420 * shot.power, 0.1, 'triangle', 0.2);
    Sfx.vibrate(10);
  }

  // ---------- simulation ----------

  protected onTick(_time: number, delta: number): void {
    const dt = Math.min(delta, 50);
    if (this.phase !== 'result') {
      this.keeperY = stepKeeper(this.keeperY, this.keeperTarget, dt, this.P);
      this.blockClock += dt;
    }
    if (this.lastKick) this.lastKick.age += dt;
    if (this.phase === 'flight' && this.shot) {
      this.elapsed += dt;
      // the defender cone (later levels) stops a ball that passes through it
      if (!this.blockChecked && this.elapsed >= this.shot.flightMs * blockerPassK(this.P)) {
        this.blockChecked = true;
        if (isBlocked(this.shot, this.blockClock, this.P)) {
          this.finishShot('blocked');
          this.render();
          return;
        }
      }
      if (this.elapsed >= this.shot.flightMs) this.finishShot(resolveShot(this.shot, this.keeperY, this.P));
    }
    this.render();
  }

  private finishShot(outcome: Outcome): void {
    const shot = this.shot!;
    this.phase = 'result';
    const shooter = this.shooter;
    const dir = shooter === 0 ? 1 : -1;
    let text: string;
    let color: number = PLAYER[shooter].onDark;
    if (outcome === 'goal') {
      text = PENALTY_TEXT.goal;
      this.tweens.add({ targets: this.ballView, x: shot.to.x + dir * 55, y: shot.to.y + (shot.to.y > this.keeperY ? 20 : -20), duration: 220, ease: 'Quad.Out' });
      this.flashNet(shooter);
    } else if (outcome === 'save') {
      text = PENALTY_TEXT.saved;
      color = PLAYER[this.keeper].onDark;
      const away = shot.to.y >= this.keeperY ? 1 : -1;
      this.tweens.add({ targets: this.ballView, x: shot.to.x - dir * 260, y: shot.to.y + away * 220, duration: 520, ease: 'Quad.Out' });
      this.tweens.add({ targets: this.keeperView, scale: { from: 1.2, to: 1 }, duration: 300, ease: 'Back.Out' });
      Sfx.tick();
    } else if (outcome === 'blocked') {
      text = PENALTY_TEXT.blocked;
      color = COLORS.muted;
      const bx = blockerX(shooter, this.P);
      this.ballView.setPosition(bx - dir * 40, blockerY(this.blockClock, this.P));
      this.tweens.add({ targets: this.ballView, x: bx - dir * 300, y: this.ballView.y + (this.ballView.y > H / 2 ? 120 : -120), duration: 500, ease: 'Quad.Out' });
      Sfx.tick();
    } else if (outcome === 'over') {
      text = PENALTY_TEXT.over;
      color = COLORS.muted;
      this.tweens.add({ targets: this.ballView, x: shot.to.x + dir * 400, scale: 2.4, alpha: 0, duration: 700, ease: 'Quad.Out' });
    } else {
      text = PENALTY_TEXT.wide;
      color = COLORS.muted;
      this.tweens.add({ targets: this.ballView, x: shot.to.x + dir * 220, y: shot.to.y + Math.sign(shot.to.y - H / 2) * 90, alpha: 0.2, duration: 600, ease: 'Quad.Out' });
    }
    this.showResult(text, color);
    if (outcome === 'goal') {
      this.score(shooter);
      if (this.match.over) return;
    }
    this.time.delayedCall(PENALTY.resultPauseMs, () => {
      if (this.match.over) return;
      this.kick++;
      this.ballView.setAlpha(1).setScale(1);
      this.beginAim();
    });
  }

  private showResult(text: string, color: number): void {
    PLAYERS.forEach((p) => {
      const a = endAnchor(p, 700);
      const l = new RotatedLabel(this, a.x, a.y, text, p, { size: 170, color, stroke: COLORS.inset, display: true }).setDepth(100);
      this.tweens.add({ targets: l, scale: { from: 0.4, to: 1.05 }, duration: 300, ease: 'Back.Out' });
      this.tweens.add({ targets: l, alpha: 0, delay: PENALTY.resultPauseMs - 450, duration: 350, onComplete: () => l.destroy() });
    });
  }

  private flashNet(shooter: PlayerId): void {
    const gx = goalX(shooter);
    const dir = shooter === 0 ? 1 : -1;
    const x0 = dir > 0 ? gx : gx - PENALTY.netDepth;
    const g = this.netFlash.clear().setAlpha(1);
    g.fillStyle(PLAYER[shooter].main, 0.55).fillRect(x0, H / 2 - PENALTY.goalHalfH, PENALTY.netDepth, 2 * PENALTY.goalHalfH);
    this.tweens.add({ targets: g, alpha: 0, duration: 900 });
  }

  // ---------- drawing ----------

  /**
   * Slingshot guide: the band and handle, and a short dotted cue showing only the DIRECTION (same length for every pull, no
   * landing marker, no power bar). After the kick a power ring stays at the spot as feedback.
   */
  private drawAim(): void {
    const g = this.aim.clear();
    this.drawKickFeedback(g);
    this.drawCone();
    if (this.phase !== 'aim') return;
    const p = this.shooter;
    const col = PLAYER[p].main;
    const spot = spotPos(p);
    if (!this.pull || !this.anchor) {
      // invitation: a faint pulsing line from the ball toward the goal
      const a = 0.18 + 0.12 * Math.sin(this.time.now / 250);
      const gx = goalX(p);
      const n = 14;
      for (let i = 1; i < n; i++) g.fillStyle(col, a).fillCircle(spot.x + ((gx - spot.x) * i) / n, spot.y, 6);
      return;
    }
    const pull = this.pull;
    // band from the touch-down point to the finger
    const fx = this.anchor.x - pull.x;
    const fy = this.anchor.y - pull.y;
    g.lineStyle(10, col, 0.5).lineBetween(this.anchor.x, this.anchor.y, fx, fy);
    g.fillStyle(col, 0.35).fillCircle(this.anchor.x, this.anchor.y, 30);
    g.fillStyle(col, 1).fillCircle(fx, fy, 22);
    const shot = computeShot(p, pull, this.P);
    if (!shot) return;
    for (const d of cueDots(shot, this.P.aimDots, this.P.aimDotGap)) g.fillStyle(col, 0.9).fillCircle(d.x, d.y, 8);
  }

  /** After a kick: a ring around the spot filled to the power used (white = fine, red = so hard it went over the bar). */
  private drawKickFeedback(g: Phaser.GameObjects.Graphics): void {
    const k = this.lastKick;
    if (!k || k.age > PENALTY.resultPauseMs + 800) return;
    const f = Math.min(1, Math.max(0, 1 - (k.age - 1200) / 1300));
    const r = 74;
    g.lineStyle(14, 0x080e1a, 0.4 * f).strokeCircle(k.spot.x, k.spot.y, r);
    g.lineStyle(14, k.over ? PENALTY_COLORS.miss : 0xffffff, 0.95 * f);
    g.beginPath().arc(k.spot.x, k.spot.y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.03, k.power), false).strokePath();
    // a tick where "too hard" starts
    const a = -Math.PI / 2 + Math.PI * 2 * this.P.overAt;
    g.lineStyle(6, PENALTY_COLORS.miss, 0.9 * f).lineBetween(k.spot.x + Math.cos(a) * (r - 14), k.spot.y + Math.sin(a) * (r - 14), k.spot.x + Math.cos(a) * (r + 14), k.spot.y + Math.sin(a) * (r + 14));
  }

  /** The defender cone that patrols mid-pitch on the later levels. */
  private drawCone(): void {
    const g = this.coneG.clear();
    if (this.P.blockerSpeed <= 0) return;
    const x = blockerX(this.shooter, this.P);
    const y = blockerY(this.blockClock, this.P);
    const h = this.P.blockerHalf;
    g.fillStyle(0x080e1a, 0.35).fillRoundedRect(x - 20 + 6, y - h + 10, 40, 2 * h, 20);
    g.fillStyle(0xffb347, 1).fillRoundedRect(x - 20, y - h, 40, 2 * h, 20);
    g.fillStyle(0xffffff, 0.9).fillRect(x - 20, y - h * 0.45, 40, h * 0.25).fillRect(x - 20, y + h * 0.2, 40, h * 0.25);
    g.lineStyle(4, 0xe08a1c, 1).strokeRoundedRect(x - 20, y - h, 40, 2 * h, 20);
  }

  private render(): void {
    this.drawAim();
    const gx = goalX(this.shooter);
    const { min, max } = keeperRange(this.P);
    const ky = Math.min(max, Math.max(min, this.keeperY));
    this.keeperView.setPosition(gx + (this.shooter === 0 ? -34 : 34), ky);
    if (this.phase === 'flight' && this.shot) {
      const s = shotAt(this.shot, this.elapsed / this.shot.flightMs);
      this.ballView.setPosition(s.x, s.y).setScale(s.scale).setDepth(25);
      this.ballShadow.setPosition(0, 10 + 40 * (s.scale - 1));
    } else if (this.phase === 'aim') {
      const s = spotPos(this.shooter);
      this.ballView.setPosition(s.x, s.y).setAlpha(1).setDepth(20);
      this.ballShadow.setPosition(0, 6);
      this.ballView.setScale(1 + (this.running ? 0.04 * Math.sin(this.time.now / 250) : 0));
    }
  }
}

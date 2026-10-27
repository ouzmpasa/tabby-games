import type Phaser from 'phaser';
import { Sfx } from '../../core/audio/Sfx';
import { BaseGameScene } from '../../core/BaseGameScene';
import type { PlayerPointer } from '../../core/input/PlayerInput';
import { H, W } from '../../core/layout';
import { settings } from '../../core/settings';
import { CARD, COLORS, PLAYER } from '../../core/theme';
import { PLAYERS, type PlayerId } from '../../core/types';
import { runCountdown } from '../../ui/Countdown';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { LAYOUT, roundRules, SAFECRACKER as C } from './config';
import {
  angDiff, createSafe, heat, heatColor, isOpen, lockTimeLeft, makePlans, mulberry32, paramsForRound, rerollLock, roundNotes, stepDial,
  tickIntervalMs, tickSafe, turnDial, wrongWay, type Params, type RoundNote, type SafeState,
} from './logic';
import { safeCentre, SafeView } from './pieces';

const R2D = 180 / Math.PI;

/** Everything a player reads (hardcoded, like the other games' labels). */
export const TEXT = {
  en: {
    round: 'Round',
    locks: (n: number) => `${n} locks!`,
    narrow: 'Smaller sweet spots',
    hint: 'The glow shows only very close',
    decoy: 'Fake clicks! Only GREEN is real',
    heavy: 'Heavy dial: it follows slowly',
    timer: (s: number) => `Each lock jams after ${s} s!`,
    dirs: 'Surprise turning directions',
  },
  nl: {
    round: 'Ronde',
    locks: (n: number) => `${n} sloten!`,
    narrow: 'Kleinere gevoelige plekjes',
    hint: 'De gloed zie je pas dichtbij',
    decoy: 'Nep-kliks! Alleen GROEN is echt',
    heavy: 'Zware knop: hij volgt langzaam',
    timer: (s: number) => `Elk slot klemt na ${s} s!`,
    dirs: 'Verrassende draairichtingen',
  },
} as const;
const txt = () => TEXT[settings.get().lang === 'nl' ? 'nl' : 'en'];

export class SafeCrackerScene extends BaseGameScene {
  /** Simulation state per player (public so tests can poke it). */
  safes!: [SafeState, SafeState];
  private views!: SafeView[];
  private rng: () => number = Math.random;
  /** 0-based round counter: every round gets trickier (see ROUNDS in config.ts). */
  roundNo = 0;
  params: Params = paramsForRound(0);
  private banner: Phaser.GameObjects.GameObject[] = [];
  /** True while a round is being played (false during door animation / between rounds). */
  private live = false;
  private finger: Array<{ id: number; last: number } | null> = [null, null];
  private tickClock: number[] = [0, 0];
  private buzzClock: number[] = [0, 0];

  constructor() {
    super(C.sceneKey, C.id, C.targetRounds);
  }

  protected drawBackground(): void {
    this.add.rectangle(W / 2, H / 2, W, H, COLORS.bg);
    // Static: baked once into a texture (Graphics objects are re-drawn every frame).
    const key = 'sc-bg';
    if (!this.textures.exists(key)) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      this.paintBackground(g);
      g.generateTexture(key, W, H);
      g.destroy();
    }
    this.add.image(W / 2, H / 2, key);
  }

  private paintBackground(g: Phaser.GameObjects.Graphics): void {
    const m = 40;
    const r = CARD.radius + 10;
    g.fillStyle(0x080e1a, 0.3).fillRoundedRect(m, m + 14, W - 2 * m, H - 2 * m, r);
    g.fillStyle(COLORS.inset, 1).fillRoundedRect(m, m, W - 2 * m, H - 2 * m, r);
    // A vault wall for each player: tinted halves with rivet-like dots.
    g.fillStyle(PLAYER[0].main, 0.14).fillRoundedRect(m, m, W / 2 - m, H - 2 * m, { tl: r, bl: r, tr: 0, br: 0 });
    g.fillStyle(PLAYER[1].main, 0.14).fillRoundedRect(W / 2, m, W / 2 - m, H - 2 * m, { tl: 0, bl: 0, tr: r, br: r });
    g.fillStyle(PLAYER[0].main, 0.5).fillRoundedRect(m, m, 16, H - 2 * m, { tl: r, bl: r, tr: 0, br: 0 });
    g.fillStyle(PLAYER[1].main, 0.5).fillRoundedRect(W - m - 16, m, 16, H - 2 * m, { tl: 0, bl: 0, tr: r, br: r });
    g.lineStyle(8, COLORS.line, 1).lineBetween(W / 2, m, W / 2, H - m);
    g.fillStyle(COLORS.dots, 1);
    for (let x = 100; x < W; x += 80) for (const y of [90, H - 90]) if (Math.abs(x - W / 2) > 30) g.fillCircle(x, y, 6);
  }

  protected onCreate(): void {
    this.rng = Math.random;
    this.roundNo = 0;
    this.banner = [];
    this.live = false;
    this.finger = [null, null];
    this.tickClock = [0, 0];
    this.buzzClock = [0, 0];
    this.views = PLAYERS.map((p) => new SafeView(this, p));
    this.badges[0].setPosition(LAYOUT.badgeP0.x, LAYOUT.badgeP0.y);
    this.badges[1].setPosition(LAYOUT.badgeP1.x, LAYOUT.badgeP1.y);
    this.newRound(false);
    this.players.on('down', this.onDown, this);
    this.players.on('move', this.onMove, this);
    this.players.on('up', this.onUp, this);
  }

  protected onStart(): void {
    this.live = true;
  }

  /** Test hook: repeatable secrets (restarts the current round's safes). */
  seed(n: number): void {
    this.rng = mulberry32(n);
    this.newRound(false);
  }

  /** Test hook: jump to a round (0-based) and restart it. */
  setRound(n: number): void {
    this.roundNo = n;
    this.newRound(false);
  }

  private newRound(announce: boolean): RoundNote[] {
    this.params = paramsForRound(this.roundNo);
    const plans = makePlans(this.rng, this.params);
    this.safes = [createSafe(plans[0]), createSafe(plans[1])];
    this.finger = [null, null];
    PLAYERS.forEach((p) => {
      this.views[p].reset(plans[p].dirs[0], this.params.locks);
      this.views[p].setAngleDeg(this.safes[p].angle);
    });
    const notes = announce ? roundNotes(this.roundNo > 0 ? roundRules(this.roundNo - 1) : null, roundRules(this.roundNo)) : [];
    return notes;
  }

  private noteText(n: RoundNote): string {
    const t = txt();
    const r = roundRules(this.roundNo);
    switch (n) {
      case 'locks':
        return t.locks(r.locks);
      case 'narrow':
        return t.narrow;
      case 'hint':
        return t.hint;
      case 'decoy':
        return t.decoy;
      case 'heavy':
        return t.heavy;
      case 'timer':
        return t.timer(Math.round(r.lockTimeMs / 1000));
      case 'dirs':
        return t.dirs;
    }
  }

  /** "Round N" and what is new, on each safe, facing its player. Calls `done` when it is gone. */
  private showBanner(notes: RoundNote[], done: () => void): void {
    const t = txt();
    const lines = notes.slice(0, 3).map((n) => this.noteText(n));
    PLAYERS.forEach((p) => {
      const c = safeCentre(p);
      const h = 130 + lines.length * 62;
      const box = this.add.container(c.x, c.y).setDepth(60).setRotation(p === 0 ? Math.PI / 2 : -Math.PI / 2);
      const bg = this.add.graphics();
      bg.fillStyle(0x080e1a, 0.85).fillRoundedRect(-300, -h / 2, 600, h, CARD.radius);
      bg.lineStyle(8, PLAYER[p].main, 1).strokeRoundedRect(-300, -h / 2, 600, h, CARD.radius);
      box.add(bg);
      box.add(new RotatedLabel(this, 0, -h / 2 + 52, `${t.round} ${this.roundNo + 1}`, null, { size: 70, color: PLAYER[p].onDark, display: true }));
      lines.forEach((l, k) => box.add(new RotatedLabel(this, 0, -h / 2 + 118 + k * 62, l, null, { size: 34, color: COLORS.text })));
      box.setAlpha(0).setScale(0.8);
      this.tweens.add({ targets: box, alpha: 1, scale: 1, duration: 300, ease: 'Back.Out' });
      this.banner.push(box);
    });
    Sfx.tone(660, 0.1, 'triangle', 0.15);
    Sfx.tone(990, 0.16, 'triangle', 0.15, 0.1);
    this.time.delayedCall(C.bannerMs, () => {
      const gone = this.banner;
      this.banner = [];
      this.tweens.add({ targets: gone, alpha: 0, duration: 250, onComplete: () => gone.forEach((o) => o.destroy()) });
      done();
    });
  }

  private centreOf(p: PlayerId): { x: number; y: number } {
    return safeCentre(p);
  }

  private fingerAngle(p: PlayerId, x: number, y: number): number | null {
    const c = this.centreOf(p);
    const dx = x - c.x, dy = y - c.y;
    if (Math.hypot(dx, dy) < C.minTouchRadius) return null;
    return Math.atan2(dy, dx) * R2D;
  }

  private canPlay(): boolean {
    return this.running && this.live && !this.match.over;
  }

  private onDown(e: PlayerPointer): void {
    if (!this.canPlay() || this.finger[e.player]) return; // one finger per player
    const a = this.fingerAngle(e.player, e.x, e.y);
    // Touching right at the centre: remember the finger, steer once it moves out.
    this.finger[e.player] = { id: e.id, last: a ?? NaN };
  }

  private onMove(e: PlayerPointer): void {
    const f = this.finger[e.player];
    if (!f || f.id !== e.id || !this.canPlay()) return;
    const a = this.fingerAngle(e.player, e.x, e.y);
    if (a === null) return;
    if (!Number.isNaN(f.last)) {
      const s = this.safes[e.player];
      if (!isOpen(s)) {
        turnDial(s, angDiff(a, f.last), this.params);
        this.views[e.player].setAngleDeg(s.angle);
      }
    }
    f.last = a; // dial follows the finger's change in angle only, so touch-down never makes it jump
  }

  private onUp(e: PlayerPointer): void {
    const f = this.finger[e.player];
    if (f && f.id === e.id) this.finger[e.player] = null;
  }

  protected onTick(_time: number, delta: number): void {
    if (!this.live) return;
    const dt = Math.min(delta, 100);
    for (const p of PLAYERS) {
      const s = this.safes[p];
      if (isOpen(s)) continue;
      stepDial(s, dt, this.params);
      this.views[p].setAngleDeg(s.angle);
      const h = heat(s, this.params);
      const wrong = wrongWay(s);
      this.views[p].setHeat(h, wrong, heatColor(h));
      this.feedback(p, h, dt);
      const res = tickSafe(s, dt, this.params);
      this.views[p].setTimer(lockTimeLeft(s, this.params));
      if (res === 'fake') {
        this.views[p].fakeClick();
        Sfx.tone(140, 0.25, 'sawtooth', 0.22);
        Sfx.tone(110, 0.3, 'square', 0.18, 0.12);
        Sfx.vibrate([50, 40, 50]);
      } else if (res === 'reset') {
        rerollLock(s, this.rng, this.params);
        this.views[p].rehide();
        Sfx.tone(200, 0.2, 'sawtooth', 0.2);
        Sfx.tone(130, 0.3, 'square', 0.18, 0.15);
        Sfx.vibrate([60, 30, 60]);
      } else if (res === 'click') {
        const v = this.views[p];
        v.lockClick(s.index);
        v.setArrow(s.plan.dirs[s.index]);
        Sfx.tone(180, 0.09, 'square', 0.3);
        Sfx.tone(1250, 0.14, 'triangle', 0.25, 0.06);
        Sfx.vibrate([30, 30, 50]);
      } else if (res === 'open') {
        this.winRound(p);
        return;
      }
    }
  }

  /** Ticks that speed up as the dial warms, plus a gentle buzz when very close. */
  private feedback(p: PlayerId, h: number, dt: number): void {
    this.tickClock[p] += dt;
    const gap = tickIntervalMs(h, C.tick.minHeat, C.tick.slowMs, C.tick.fastMs);
    if (gap !== null && this.tickClock[p] >= gap) {
      this.tickClock[p] = 0;
      Sfx.tone(C.tick.baseHz + (C.tick.topHz - C.tick.baseHz) * h, 0.04, 'square', 0.07);
    }
    this.buzzClock[p] += dt;
    if (h >= C.vibrateHeat && this.buzzClock[p] >= C.vibrateEveryMs) {
      this.buzzClock[p] = 0;
      Sfx.vibrate(8);
    }
  }

  private winRound(p: PlayerId): void {
    this.live = false;
    this.finger = [null, null];
    this.views[p].setTimer(null);
    this.views[p].lockClick(this.params.locks);
    this.views[p].openDoor();
    Sfx.tone(180, 0.09, 'square', 0.3);
    [784, 988, 1175, 1568].forEach((f, i) => Sfx.tone(f, 0.18, 'triangle', 0.22, 0.12 + i * 0.1));
    Sfx.vibrate([40, 30, 80]);
    this.time.delayedCall(C.doorOpenMs, () => {
      this.score(p); // badge + sound; hands over to Win when a player has 2 rounds
      if (this.match.over) return;
      this.time.delayedCall(C.betweenRoundsMs, () => {
        this.roundNo++;
        const notes = this.newRound(true);
        const go = () => runCountdown(this, () => (this.live = true), 2);
        if (notes.length) this.showBanner(notes, go);
        else go();
      });
    });
  }
}

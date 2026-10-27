import { Sfx } from '../../core/audio/Sfx';
import { BaseGameScene } from '../../core/BaseGameScene';
import type { PlayerPointer } from '../../core/input/PlayerInput';
import { endAnchor, H, W } from '../../core/layout';
import { COLORS, PLAYER } from '../../core/theme';
import { other, PLAYERS, type PlayerId } from '../../core/types';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { BALLOONPOP } from './config';
import {
  advance, chainVictims, createSpawner, freezeEnd, giftEvents, isFrozen, isGone, makeBalloon, mulberry32, pickBalloon, pointsFor, spawnUntil,
  type Balloon, type BalloonKind, type SpawnEvent, type Spawner,
} from './logic';
import { BALLOON_COLOURS, colourOf, makeBalloonView, makeFrost } from './pieces';

/** Strings a player reads (kept in one place; no i18n needed for these). */
export const BALLOON_TEXT = {
  freeze: 'Brr!',
  plus: (n: number): string => `+${n}`,
  boom: 'Boom!',
} as const;

export class BalloonPopScene extends BaseGameScene {
  /** Balloons in play per player (public so tests can poke it). */
  balloons: [Balloon[], Balloon[]] = [[], []];
  /** Scene clock (ms since GO) and per-player freeze deadlines on it. */
  clock = 0;
  frozenUntil: [number, number] = [0, 0];
  private views = new Map<Balloon, Phaser.GameObjects.Container>();
  private prevX = new Map<Balloon, number>();
  private spawner: Spawner = createSpawner(1);
  private seedValue = (Math.random() * 1e9) | 0;
  private frost: Phaser.GameObjects.Container[] = [];
  private wasFrozen: [boolean, boolean] = [false, false];
  private giftRng: () => number = mulberry32(7);
  private giftId = 100000;

  constructor() {
    super(BALLOONPOP.sceneKey, BALLOONPOP.id, BALLOONPOP.targetScore);
  }

  /** Test hook: use a seeded schedule (call before GO). */
  seed(n: number): void {
    this.seedValue = n;
    this.spawner = createSpawner(n);
  }

  protected drawBackground(): void {
    const g = this.add.graphics();
    // Sky at dusk: deep blue at the top, warm rose near the bottom.
    const top = [0x2c3b55, 0x455873];
    const bottom = 0xb0708a;
    const steps = 36;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const base = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(top[0]), Phaser.Display.Color.ValueToColor(top[1]), 100, Math.min(100, t * 220),
      );
      const c0 = Phaser.Display.Color.GetColor(base.r, base.g, base.b);
      const mix = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(c0), Phaser.Display.Color.ValueToColor(bottom), 100, Math.max(0, (t - 0.45) / 0.55) * 100,
      );
      g.fillStyle(Phaser.Display.Color.GetColor(mix.r, mix.g, mix.b), 1).fillRect(0, (i * H) / steps, W, H / steps + 1);
    }
    // Faint stars in the upper sky.
    const rnd = mulberry32(11);
    g.fillStyle(0xffffff, 0.5);
    for (let i = 0; i < 40; i++) g.fillCircle(rnd() * W, rnd() * H * 0.45, 1.5 + rnd() * 2);
    // Soft clouds.
    const cloud = (x: number, y: number, s: number, a: number): void => {
      g.fillStyle(0xffffff, a);
      g.fillEllipse(x, y, 260 * s, 70 * s).fillEllipse(x - 70 * s, y - 24 * s, 130 * s, 80 * s).fillEllipse(x + 50 * s, y - 34 * s, 150 * s, 90 * s);
    };
    [[300, 330, 1, 0.16], [620, 820, 1.3, 0.2], [180, 700, 0.8, 0.14], [1300, 300, 1.1, 0.16], [1700, 760, 1.2, 0.2], [1500, 950, 0.9, 0.16], [800, 140, 0.9, 0.12]]
      .forEach(([x, y, s, a]) => cloud(x, y, s, a));
    // Player tint at each end, and a dashed centre line.
    g.fillStyle(PLAYER[0].main, 0.1).fillRect(0, 0, W / 2, H);
    g.fillStyle(PLAYER[1].main, 0.1).fillRect(W / 2, 0, W / 2, H);
    g.fillStyle(PLAYER[0].main, 0.55).fillRect(0, 0, 16, H);
    g.fillStyle(PLAYER[1].main, 0.55).fillRect(W - 16, 0, 16, H);
    g.fillStyle(COLORS.line, 0.8);
    for (let y = 20; y < H; y += 48) g.fillRoundedRect(W / 2 - 4, y, 8, 28, 4);
  }

  protected onCreate(): void {
    this.balloons = [[], []];
    this.views.clear();
    this.prevX.clear();
    this.clock = 0;
    this.frozenUntil = [0, 0];
    this.wasFrozen = [false, false];
    this.spawner = createSpawner(this.seedValue);
    this.giftRng = mulberry32(this.seedValue ^ 0x9e3779b9);
    this.giftId = 100000;
    PLAYERS.forEach((p) => {
      const a = endAnchor(p, 100, -300);
      this.badges[p].setPosition(a.x, a.y);
    });
    this.frost = PLAYERS.map((p) => makeFrost(this, p, p === 0 ? 0 : W / 2, W / 2, H));
    this.players.on('down', this.onDown, this);
  }

  protected onTick(_time: number, delta: number): void {
    const dt = Math.min(delta, 100);
    this.clock += dt;
    // One shared schedule; every spawn appears on both halves, mirrored.
    for (const e of spawnUntil(this.spawner, this.clock)) {
      // The cap is checked for both sides together, so a spawn is either on both halves or on neither.
      if (this.balloons.some((l) => l.length >= BALLOONPOP.maxOnScreen)) continue;
      for (const p of PLAYERS) {
        // Catch up on the time between the scheduled spawn and now so frame hiccups do not desync the sides.
        this.addBalloon(p, e, this.clock - e.at);
      }
    }
    for (const p of PLAYERS) {
      const list = this.balloons[p];
      for (let i = list.length - 1; i >= 0; i--) {
        const b = list[i];
        advance(b, dt, p);
        if (isGone(b)) {
          this.forget(b);
          list.splice(i, 1);
          continue;
        }
        const v = this.views.get(b)!;
        const vx = ((b.x - (this.prevX.get(b) ?? b.x)) / Math.max(dt, 1)) * 1000;
        this.prevX.set(b, b.x);
        v.setPosition(b.x, b.y).setRotation(Phaser.Math.Clamp(vx / 900, -0.16, 0.16));
      }
      const frozen = isFrozen(this.frozenUntil[p], this.clock);
      if (frozen !== this.wasFrozen[p]) {
        this.wasFrozen[p] = frozen;
        this.frost[p].setVisible(frozen);
        if (frozen) this.frost[p].setAlpha(1);
      }
    }
  }

  private addBalloon(p: PlayerId, e: SpawnEvent, catchUpMs = 0, extraY = 0): Balloon {
    const b = makeBalloon(e, p, W);
    b.y += extraY;
    advance(b, catchUpMs, p);
    this.balloons[p].push(b);
    this.views.set(b, makeBalloonView(this, b).setDepth(10 + (b.kind === 'grumpy' || b.kind === 'bomb' ? 0 : 1)));
    this.prevX.set(b, b.x);
    return b;
  }

  private forget(b: Balloon): void {
    this.views.get(b)?.destroy();
    this.views.delete(b);
    this.prevX.delete(b);
  }

  private onDown(e: PlayerPointer): void {
    if (!this.running || this.match.over) return;
    const p = e.player;
    if (isFrozen(this.frozenUntil[p], this.clock)) return;
    const list = this.balloons[p];
    const i = pickBalloon(list, e.x, e.y);
    if (i < 0) return; // missed: nothing happens, no penalty
    const b = list[i];
    if (b.kind === 'grumpy') {
      this.popEffects(b, p);
      this.removeAt(p, i);
      this.freeze(p, b);
      return;
    }
    if (b.kind === 'bomb') {
      this.popEffects(b, p);
      this.removeAt(p, i);
      this.bomb(p, b);
      return;
    }
    let points = pointsFor(b.kind);
    if (b.kind === 'chain') {
      const victims = chainVictims(list, i);
      // Remove from the highest index down so indices stay valid.
      victims.sort((a, c) => c - a).forEach((vi) => {
        const v = list[vi];
        points += v.kind === 'grumpy' ? 0 : pointsFor(v.kind);
        this.popEffects(v, p, true);
        this.removeAt(p, vi);
      });
      this.chainRing(b, p);
    }
    const idx = list.indexOf(b);
    this.popEffects(b, p);
    this.removeAt(p, idx);
    this.award(p, points, b);
  }

  private removeAt(p: PlayerId, i: number): void {
    const [b] = this.balloons[p].splice(i, 1);
    if (b) this.forget(b);
  }

  /** Add `points` to the player's score (the match counts displayed points directly) with a "+N" popup. */
  private award(p: PlayerId, points: number, b: Balloon): void {
    if (points <= 0) return;
    let winner: PlayerId | null = null;
    for (let k = 0; k < points; k++) winner = this.match.addPoint(p) ?? winner;
    const total = this.match.scores[p];
    this.badges[p].setScore(total);
    // The shared badge is sized for one or two digits: shrink its label for 3-digit scores so it stays inside the card.
    (this.badges[p] as unknown as { label: { setScale(s: number): void } }).label.setScale(total >= 100 ? 0.58 : total >= 10 ? 0.86 : 1);
    Sfx.score();
    if (winner !== null) {
      this.running = false;
      Sfx.win();
      this.time.delayedCall(500, () =>
        this.scene.start('Win', { gameId: BALLOONPOP.id, sceneKey: this.scene.key, winner, scores: [...this.match.scores] }),
      );
    }
    const dir = p === 0 ? 1 : -1;
    const big = b.kind === 'star' || points >= 25;
    const l = new RotatedLabel(this, b.x, b.y, BALLOON_TEXT.plus(points), p, { size: big ? 140 : 100, color: b.kind === 'star' ? 0xffd84d : COLORS.text, stroke: COLORS.inset, display: true }).setDepth(40);
    this.tweens.add({ targets: l, x: b.x + dir * 130, alpha: 0, scale: { from: 0.6, to: 1.2 }, duration: 750, ease: 'Quad.Out', onComplete: () => l.destroy() });
  }

  /** A popped bomb-cloud: no points, and a few extra balloons rise on the OPPONENT's half. */
  private bomb(p: PlayerId, b: Balloon): void {
    Sfx.tone(120, 0.3, 'sawtooth', 0.2);
    Sfx.vibrate([30, 20, 60]);
    const dir = p === 0 ? 1 : -1;
    const l = new RotatedLabel(this, b.x, b.y, BALLOON_TEXT.boom, p, { size: 120, color: 0xffd84d, stroke: COLORS.inset, display: true }).setDepth(40);
    this.tweens.add({ targets: l, x: b.x + dir * 100, alpha: 0, scale: { from: 0.6, to: 1.2 }, duration: 800, ease: 'Quad.Out', onComplete: () => l.destroy() });
    const q = other(p);
    giftEvents(this.giftRng, this.clock, this.giftId).forEach((e, i) => {
      this.giftId++;
      this.addBalloon(q, e, 0, i * BALLOONPOP.bombGiftSpacing);
    });
  }

  private freeze(p: PlayerId, b: Balloon): void {
    this.frozenUntil[p] = freezeEnd(this.clock);
    Sfx.tone(160, 0.35, 'sawtooth', 0.2);
    Sfx.tone(110, 0.4, 'sawtooth', 0.18, 0.12);
    Sfx.vibrate([40, 30, 80]);
    const x = p === 0 ? W / 4 : (W * 3) / 4;
    const l = new RotatedLabel(this, x, H / 2, BALLOON_TEXT.freeze, p, { size: 160, color: 0xffffff, stroke: 0x2c6c9a, display: true }).setDepth(46);
    this.tweens.add({ targets: l, alpha: 0, scale: { from: 0.7, to: 1.15 }, duration: BALLOONPOP.freezeMs, ease: 'Quad.In', onComplete: () => l.destroy() });
    this.tweens.add({ targets: this.frost[p], alpha: { from: 1, to: 0.45 }, duration: BALLOONPOP.freezeMs });
    void b;
  }

  private popEffects(b: Balloon, p: PlayerId, quiet = false): void {
    const col = colourOf(b);
    const view = this.views.get(b);
    if (view) {
      // A copy-free pop: swell and fade the view itself (it is destroyed by forget(), so animate a ghost).
      const ring = this.add.circle(b.x, b.y, b.r * 0.9, 0xffffff, 0).setStrokeStyle(8, 0xffffff, 0.9).setDepth(30);
      this.tweens.add({ targets: ring, scale: 1.7, alpha: 0, duration: 260, ease: 'Quad.Out', onComplete: () => ring.destroy() });
    }
    const cols = b.kind === 'bomb' ? [0x6b4a9e, 0x14161f, 0xffd23f, 0xff5a3d] : b.kind === 'chain' ? [0xff4d4d, 0xffe14d, 0x4ddc7a, 0x4db8ff, 0xa06bff] : b.kind === 'grumpy' ? [0x3a3d52, 0x6a7fa0] : b.kind === 'star' ? [0xffc928, 0xffffff, 0xffe14d] : [col, BALLOON_COLOURS[(b.colour + 2) % 6], 0xffffff];
    const n = quiet ? 7 : 14;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + Math.random() * 0.4;
      const d = b.r * (1.1 + Math.random() * 1.3);
      const bit = this.add.rectangle(b.x, b.y, 14 + Math.random() * 10, 8 + Math.random() * 8, cols[k % cols.length], 1).setDepth(30).setRotation(Math.random() * 3);
      this.tweens.add({
        targets: bit, x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d + 70, rotation: bit.rotation + (Math.random() - 0.5) * 8, alpha: 0,
        duration: 500 + Math.random() * 250, ease: 'Quad.Out', onComplete: () => bit.destroy(),
      });
    }
    if (quiet) return;
    switch (b.kind) {
      case 'star': Sfx.tone(988, 0.12, 'triangle', 0.2); Sfx.tone(1318, 0.2, 'triangle', 0.2, 0.09); Sfx.vibrate([20, 20, 40]); break;
      case 'chain': [523, 659, 784, 1046, 1318].forEach((f, i) => Sfx.tone(f, 0.14, 'triangle', 0.18, i * 0.05)); Sfx.vibrate([30, 20, 30]); break;
      case 'grumpy': Sfx.tone(220, 0.12, 'square', 0.15); break;
      default: Sfx.tone(b.kind === 'small' ? 900 : 380 + Math.random() * 120, 0.08, 'square', 0.14); Sfx.tone(b.kind === 'small' ? 1300 : 700, 0.05, 'sine', 0.1, 0.02); Sfx.vibrate(12);
    }
    void p;
  }

  private chainRing(b: Balloon, p: PlayerId): void {
    const ring = this.add.circle(b.x, b.y, 40, 0xffffff, 0.12).setStrokeStyle(10, PLAYER[p].light, 0.9).setDepth(29);
    this.tweens.add({ targets: ring, scale: BALLOONPOP.chainRadiusPx / 40, alpha: 0, duration: 380, ease: 'Quad.Out', onComplete: () => ring.destroy() });
  }

  /** Test hook: put a balloon of `kind` in play for `p` at (x, y). */
  addTestBalloon(p: PlayerId, kind: BalloonKind, x: number, y: number): Balloon {
    const b = makeBalloon({ id: 9000 + this.balloons[p].length, at: 0, kind, lane: 0, r: kind === 'small' ? 44 : 70, vy: 0, move: 'sine', amp: 0, freq: 1, phase: 0, accel: 0, colour: 0 }, p, W);
    b.cx = x; b.x = x; b.y = y;
    this.balloons[p].push(b);
    this.views.set(b, makeBalloonView(this, b).setDepth(10));
    this.prevX.set(b, x);
    return b;
  }
}

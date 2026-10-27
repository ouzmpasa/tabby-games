import Phaser from 'phaser';
import { Sfx } from '../../core/audio/Sfx';
import { BaseGameScene } from '../../core/BaseGameScene';
import type { PlayerPointer } from '../../core/input/PlayerInput';
import { endAnchor, H, W } from '../../core/layout';
import { settings } from '../../core/settings';
import { COLORS, PLAYER } from '../../core/theme';
import { PLAYERS, type PlayerId } from '../../core/types';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { LANE, YARNCATCH as C } from './config';
import {
  assignTap, cueAlpha, inFeint, judgeTap, landings, matchWinner, missDeadline, mulberry32, planSwing, pointsFor, timeAtU, yarnHop, yarnPath,
  yarnProgress, type BallPlan, type SwingPlan, type Verdict,
} from './logic';
import { Cat, Yarn, catchSparks, dizzyStars } from './pieces';

/** Everything a player reads (hardcoded, like the other games' labels). */
export const TEXT = {
  en: {
    ready: 'Ready…',
    hint: 'Catch the yarn! Tap when it reaches your paws!',
    perfect: 'PERFECT!',
    good: 'Good!',
    oops: 'Oops!',
    tangled: 'Tangled!',
    foul: 'Too eager!',
    early: 'Too early',
    late: 'Too late',
    none: 'You forgot to catch it!',
    wait: 'Wait for the yarn!',
    extra: 'Extra throw!',
    faster: 'Faster! The yarn hops and slides in',
    fakeouts: 'Fake-outs! Wait until the yarn rolls on...',
    twoYarns: 'Sometimes TWO yarns! Catch both!',
    hiddenRing: 'The ring fades away: listen to the boing-boing!',
    blinkRing: 'The ring blinks! DOUBLE points!',
  },
  nl: {
    ready: 'Klaar…',
    hint: 'Vang de garenbal! Tik als hij je pootjes raakt!',
    perfect: 'PERFECT!',
    good: 'Goed!',
    oops: 'Oeps!',
    tangled: 'Verward!',
    foul: 'Te vroeg!',
    early: 'Te vroeg',
    late: 'Te laat',
    none: 'Je vergat te vangen!',
    wait: 'Wacht op de garenbal!',
    extra: 'Extra worp!',
    faster: 'Sneller! De garenbal hupt en glijdt binnen',
    fakeouts: 'Nepbewegingen! Wacht tot de bal verder rolt...',
    twoYarns: 'Soms TWEE garenbollen! Vang ze allebei!',
    hiddenRing: 'De ring verdwijnt: luister naar het boing-boing!',
    blinkRing: 'De ring knippert! DUBBELE punten!',
  },
} as const;
const txt = () => TEXT[settings.get().lang === 'nl' ? 'nl' : 'en'];

type Phase = 'intro' | 'swing' | 'celebrate' | 'over';

/** One yarn ball as the lane shows it. */
interface BallView {
  yarn: Yarn;
  started: boolean;
  frozen: boolean;
  fxDone: boolean;
}

/** One player's end: rug, catch zone, cat, yarns and labels, all in lane-local coordinates (see config LANE). */
class Lane {
  readonly root: Phaser.GameObjects.Container;
  readonly cat: Cat;
  readonly balls: BallView[];
  private zone: Phaser.GameObjects.Graphics;
  private ready: RotatedLabel;
  private hint: RotatedLabel;
  private result: RotatedLabel;
  private sub: RotatedLabel;
  private counter: RotatedLabel;
  private flash = 0;
  /** The shrinking ring: progress 0..1 of the ball it follows and how visible it is (null = no ring). */
  private ring: { u: number; alpha: number } | null = null;

  constructor(private scene: Phaser.Scene, readonly p: PlayerId) {
    const a = endAnchor(p, 0);
    this.root = scene.add.container(a.x, a.y).setRotation(a.rotation);
    this.zone = scene.add.graphics();
    this.cat = new Cat(scene, p);
    this.balls = [0, 1].map(() => ({ yarn: new Yarn(scene, p), started: false, frozen: false, fxDone: false }));
    const lab = (size: number, y: number, color: number) => {
      const l = new RotatedLabel(scene, 0, y, '', null, { size, color, stroke: COLORS.inset, display: true });
      return l;
    };
    this.ready = lab(96, -590, PLAYER[p].onDark);
    this.hint = lab(38, -505, COLORS.text);
    this.result = lab(120, -625, COLORS.text);
    this.sub = lab(46, -545, COLORS.text2);
    const side = p === 0 ? 1 : -1; // opposite the score badge
    this.counter = lab(40, -215, COLORS.muted);
    this.counter.x = side * 300;
    const [y0, y1] = this.balls.map((b) => b.yarn);
    this.root.add([this.zone, this.cat.back, y0.thread, y1.thread, y0, y1, this.cat.front, this.cat.wrapG, this.ready, this.hint, this.result, this.sub, this.counter]);
    this.root.setDepth(10);
  }

  /** Back to the start of a swing; `balls` = how many yarns this swing has, `hint` = text to show until the first yarn starts. */
  reset(counter: string, balls: number, hint: string | null): void {
    const t = txt();
    this.cat.reset();
    this.balls.forEach((b, i) => {
      b.started = false;
      b.frozen = false;
      b.fxDone = i >= balls; // an unused yarn counts as finished
      this.root.moveBelow<Phaser.GameObjects.GameObject>(b.yarn, this.cat.front);
      b.yarn.resetTo(LANE.startY);
      b.yarn.setVisible(i === 0);
      b.yarn.thread.setVisible(i === 0);
    });
    this.result.setAlpha(0);
    this.sub.setAlpha(0);
    this.counter.setText(counter);
    this.ready.setText(t.ready).setAlpha(1).setScale(0.6);
    this.scene.tweens.add({ targets: this.ready, scale: 1, duration: 350, ease: 'Back.Out' });
    this.hint.setText(hint ?? '').setAlpha(hint ? 1 : 0);
    this.ring = null;
    this.drawZone();
  }

  /** Where the shrinking ring is (null hides it) and redraws the catch zone. */
  setRing(ring: { u: number; alpha: number } | null): void {
    this.ring = ring;
    this.drawZone();
  }

  /** Draws the catch zone and the shrinking approach ring. */
  drawZone(): void {
    const g = this.zone.clear();
    const col = PLAYER[this.p].light;
    g.fillStyle(0x080e1a, 0.25).fillCircle(0, LANE.handsY + 8, LANE.zoneRadius + 6);
    g.fillStyle(0xffffff, 0.12 + this.flash * 0.5).fillCircle(0, LANE.handsY, LANE.zoneRadius);
    g.lineStyle(10, 0xffffff, 0.75).strokeCircle(0, LANE.handsY, LANE.zoneRadius);
    if (this.ring && this.ring.alpha > 0.02) {
      const k = Math.min(1, this.ring.u);
      const r = LANE.zoneRadius + (LANE.approachRadius - LANE.zoneRadius) * (1 - k);
      g.lineStyle(14, col, (0.35 + 0.65 * k) * this.ring.alpha).strokeCircle(0, LANE.handsY, r);
    }
  }

  /**
   * Cute rising "boing-boing(-boing)": a launch, a bounce or two and the landing in the paws, each higher than the last. The
   * landing is exactly the ideal tap moment, so the sound is the rhythm to follow when the ring is hidden. `startAbs` is the
   * ball's start on the performance.now() clock.
   */
  onYarnStart(i: number, plan: BallPlan, startAbs: number): void {
    const b = this.balls[i];
    b.started = true;
    b.yarn.setVisible(true);
    b.yarn.thread.setVisible(true);
    if (i === 0) this.scene.tweens.add({ targets: [this.ready, this.hint], alpha: 0, duration: 150 });
    const now = performance.now();
    const ups = landings(plan.bounces);
    ups.forEach((u, k) => {
      const f = 330 + (k * 380) / plan.bounces;
      const at = Math.max(0, (startAbs + timeAtU(plan, u) - now) / 1000);
      Sfx.tone(f, 0.16, 'sine', 0.2, at);
      Sfx.tone(f * 1.5, 0.12, 'triangle', 0.1, at + 0.045);
      Sfx.tone(f * 2, 0.08, 'sine', 0.06, at + 0.09);
    });
    if (plan.pauseMs > 0) {
      // the fake-out: a questioning "hmm?" while the yarn hangs in the air
      const at = Math.max(0, (startAbs + timeAtU(plan, plan.pauseAtU) - now) / 1000);
      Sfx.tone(620, 0.12, 'triangle', 0.12, at);
      Sfx.tone(520, 0.16, 'triangle', 0.12, at + 0.12);
    }
  }

  showResult(main: string, sub: string, color: number): void {
    this.result.setText(main).setColor('#' + color.toString(16).padStart(6, '0')).setAlpha(1).setScale(0.5);
    this.sub.setText(sub).setAlpha(1);
    this.scene.tweens.add({ targets: this.result, scale: 1, duration: 380, ease: 'Back.Out' });
  }

  catch(i: number, v: 'perfect' | 'good', mult = 1): void {
    const t = txt();
    const perfect = v === 'perfect';
    const ball = this.balls[i];
    ball.frozen = true;
    ball.fxDone = true;
    this.flash = 1;
    // an earlier caught yarn is tucked away when the next one arrives
    this.balls.forEach((o, k) => k < i && o.frozen && this.scene.tweens.add({ targets: o.yarn, alpha: 0, duration: 160 }));
    this.root.moveAbove<Phaser.GameObjects.GameObject>(ball.yarn, this.cat.front); // snuggled in the paws, on top
    const y0 = ball.yarn.y;
    const x0 = ball.yarn.x;
    const o = { y: y0, x: x0 };
    this.scene.tweens.add({ targets: o, y: LANE.handsY, x: 0, duration: 90, ease: 'Quad.Out', onUpdate: () => ball.yarn.place(o.x, o.y, 0, 0, true) });
    this.scene.tweens.add({ targets: this, flash: 0, duration: 500, onUpdate: () => this.drawZone() });
    this.scene.tweens.add({ targets: ball.yarn.thread, alpha: 0, delay: 1100, duration: 600 });
    this.cat.tweenClap(1, 90);
    this.cat.setFace('happy');
    this.cat.hop();
    this.scene.time.delayedCall(110, () => this.cat.wrap(perfect ? 8 : 3, false));
    if (!perfect) this.cat.wobble();
    catchSparks(this.scene, this.root, 0, LANE.handsY, perfect);
    this.showResult(perfect ? t.perfect : t.good, mult > 1 ? 'x2' : '', perfect ? 0xffd23f : 0x8be28b);
    Sfx.tone(perfect ? 1046 : 784, 0.12, 'square', 0.14);
    if (perfect) {
      Sfx.tone(1568, 0.25, 'triangle', 0.2, 0.08);
      // Purr: a quick low rumble
      for (let k = 0; k < 14; k++) Sfx.tone(70 + (k % 2) * 14, 0.05, 'sawtooth', 0.07, 0.2 + k * 0.055);
    }
    Sfx.vibrate(perfect ? [20, 30, 40] : 25);
  }

  foul(): void {
    const t = txt();
    this.scene.tweens.add({ targets: [this.ready, this.hint], alpha: 0, duration: 120 });
    this.showResult(t.foul, t.wait, 0xff9a62);
    Sfx.tone(180, 0.25, 'sawtooth', 0.12);
  }

  /** The yarn reached the head: it bounces off and rolls away, and the cat gets tangled. `v` foul: a foul message is already showing. */
  miss(i: number, v: Verdict): void {
    const t = txt();
    const ball = this.balls[i];
    ball.fxDone = true;
    const side = this.p === 0 ? 1 : -1;
    const o = { k: 0 };
    const y0 = ball.yarn.y;
    const x0 = ball.yarn.x;
    this.scene.tweens.add({
      targets: o,
      k: 1,
      duration: 900,
      ease: 'Quad.Out',
      onUpdate: () => ball.yarn.place(x0 + side * o.k * 430, y0 - Math.sin(o.k * Math.PI) * 90 - o.k * 60, Math.sin(o.k * Math.PI), o.k * 1400, true),
      onComplete: () => this.scene.tweens.add({ targets: [ball.yarn, ball.yarn.thread], alpha: 0, duration: 400 }),
    });
    this.cat.bounced();
    this.cat.wrap(6, true);
    dizzyStars(this.scene, this.root, 0, LANE.headY);
    if (v !== 'foul') this.showResult(t.oops, `${t.tangled} ${v === 'early' ? t.early : v === 'late' ? t.late : t.none}`, 0xff7b7b);
    Sfx.tone(260, 0.12, 'sine', 0.18);
    Sfx.tone(180, 0.18, 'sine', 0.2, 0.1);
    Sfx.tone(120, 0.3, 'triangle', 0.22, 0.22);
    Sfx.vibrate([30, 30, 60]);
  }
}

export class YarnCatchScene extends BaseGameScene {
  private lanes: Lane[] = [];
  private rng: () => number = Math.random;
  private phase: Phase = 'intro';
  private swingIndex = 0;
  private played = 0;
  private totals: [number, number] = [0, 0];
  private plan!: SwingPlan;
  /** Absolute start (performance.now() clock) of every ball of every player. */
  private startAt: [number[], number[]] = [[], []];
  private verdicts: [(Verdict | null)[], (Verdict | null)[]] = [[], []];
  private lastTap: [number, number] = [-1e9, -1e9];

  constructor() {
    super(C.sceneKey, C.id, 99); // the match is ended here after the swings (ties go to extra swings), never by the target
  }

  protected drawBackground(): void {
    const g = this.add.graphics();
    // Cosy living room at dusk: dark wooden floorboards.
    g.fillStyle(0x4b4660, 1).fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 90) {
      g.fillStyle(y % 180 === 0 ? 0x544e6a : 0x4e4964, 1).fillRect(0, y, W, 90);
      g.lineStyle(3, 0x3b3750, 1).lineBetween(0, y, W, y);
    }
    const rnd = mulberry32(11);
    g.lineStyle(2, 0x3f3b55, 0.7);
    for (let i = 0; i < 60; i++) {
      const x = rnd() * W;
      const y = Math.floor(rnd() * 12) * 90 + 20 + rnd() * 50;
      g.lineBetween(x, y, x + 60 + rnd() * 80, y + 3);
    }
    // Warm dusk light falling through the window onto the floor.
    g.fillStyle(0xffb878, 0.1).fillPoints(
      [new Phaser.Geom.Point(780, 0), new Phaser.Geom.Point(1140, 0), new Phaser.Geom.Point(1280, 300), new Phaser.Geom.Point(640, 300)],
      true,
    );
    // Each player's round-cornered rug (tinted) with a border and a fringe, and the centre line.
    for (const p of PLAYERS) {
      const x = p === 0 ? 40 : W / 2 + 10;
      const w = W / 2 - 50;
      const y = H / 2 - 240;
      g.fillStyle(0x080e1a, 0.25).fillRoundedRect(x + 6, y + 10, w, 480, 40);
      g.fillStyle(0xe9dcc6, 1).fillRoundedRect(x, y, w, 480, 40);
      g.fillStyle(PLAYER[p].main, 0.28).fillRoundedRect(x, y, w, 480, 40);
      g.lineStyle(10, PLAYER[p].dark, 0.85).strokeRoundedRect(x + 18, y + 18, w - 36, 444, 30);
      g.lineStyle(4, 0xffffff, 0.45).strokeRoundedRect(x + 34, y + 34, w - 68, 412, 22);
      g.fillStyle(0xffffff, 0.5);
      for (let k = 0; k < 8; k++) g.fillCircle(x + 70 + k * ((w - 140) / 7), y + 56, 7).fillCircle(x + 70 + k * ((w - 140) / 7), y + 424, 7);
    }
    g.fillStyle(0x080e1a, 0.3).fillRect(W / 2 - 5, H / 2 - 240, 10, 480);
    // Window on the top wall (clear of the pause corners): dusk sky, moon, curtains.
    const wx = 760;
    g.fillStyle(0x2c3b55, 1).fillRoundedRect(wx - 12, -20, 412, 150, 18);
    g.fillStyle(0x7a5fa0, 1).fillRect(wx, 0, 388, 118);
    g.fillStyle(0xf09a7a, 1).fillRect(wx, 70, 388, 48);
    g.fillStyle(0xf5c27a, 1).fillRect(wx, 100, 388, 18);
    g.fillStyle(0xfff1de, 1).fillCircle(wx + 290, 40, 22);
    g.fillStyle(0x7a5fa0, 1).fillCircle(wx + 300, 34, 20);
    g.fillStyle(0xffffff, 0.8).fillCircle(wx + 60, 24, 3).fillCircle(wx + 130, 50, 2).fillCircle(wx + 200, 18, 3);
    g.fillStyle(0x2c3b55, 1).fillRect(wx + 190, 0, 10, 118).fillRect(wx, 56, 388, 8);
    g.fillStyle(0xd4607a, 1).fillRoundedRect(wx - 36, -10, 52, 150, 14).fillRoundedRect(wx + 372, -10, 52, 150, 14);
    g.lineStyle(4, 0xa8405c, 1).lineBetween(wx - 20, 0, wx - 20, 130).lineBetween(wx + 396, 0, wx + 396, 130);
    // Cushions along the bottom edge and a basket of yarn
    const cushion = (x: number, y: number, c: number): void => {
      g.fillStyle(0x080e1a, 0.25).fillRoundedRect(x + 4, y + 8, 150, 110, 30);
      g.fillStyle(c, 1).fillRoundedRect(x, y, 150, 110, 30);
      g.lineStyle(4, 0xffffff, 0.35).strokeRoundedRect(x + 10, y + 10, 130, 90, 22);
      g.fillStyle(0xffffff, 0.5).fillCircle(x + 75, y + 55, 7);
    };
    cushion(300, H - 100, PLAYER[0].light);
    cushion(1470, H - 100, PLAYER[1].light);
    cushion(100, 20, 0xd4607a);
    cushion(1670, H - 150, 0x8be28b);
    g.fillStyle(0x080e1a, 0.25).fillEllipse(960, H - 38, 200, 54);
    g.fillStyle(0xb98a5a, 1).fillEllipse(960, H - 44, 180, 50);
    g.fillStyle(0xd9a566, 1).fillEllipse(960, H - 52, 150, 34);
    g.fillStyle(PLAYER[0].light, 1).fillCircle(925, H - 62, 18);
    g.fillStyle(PLAYER[1].light, 1).fillCircle(965, H - 66, 18);
    g.fillStyle(0xffd23f, 1).fillCircle(1000, H - 60, 16);
  }

  protected onCreate(): void {
    this.rng = Math.random;
    this.phase = 'intro';
    this.swingIndex = 0;
    this.played = 0;
    this.totals = [0, 0];
    this.verdicts = [[], []];
    this.lanes = PLAYERS.map((p) => new Lane(this, p));
    this.badges.forEach((b) => b.setDepth(60));
    this.players.on('down', this.onDown, this);
    this.events.on('resume', this.onResume, this);
    this.events.once('shutdown', () => this.events.off('resume', this.onResume, this));
    this.lanes.forEach((l) => l.reset('', 1, null));
  }

  /** Test hook: seed the swing timings. */
  seed(n: number): void {
    this.rng = mulberry32(n);
  }

  /** Test hook: jump to a swing index (0-based) and restart it, e.g. to look at a later tier. */
  jumpTo(swing: number): void {
    this.swingIndex = swing;
    this.beginSwing();
  }

  /** Test hook: everything a script needs to tap at the right moment (times are performance.now() values). */
  swingState() {
    return {
      phase: this.phase,
      index: this.swingIndex,
      played: this.played,
      balls: this.plan?.balls[0].length ?? 1,
      startAt: this.startAt.map((a) => [...a]),
      idealAt: this.startAt.map((a, p) => a.map((s, i) => s + (this.plan?.balls[p][i].pauseMs ?? 0) + (this.plan?.balls[p][i].descentMs ?? 0))),
      verdicts: this.verdicts.map((a) => [...a]),
      totals: [...this.totals],
      tier: this.plan?.tier ?? 0,
      now: performance.now(),
    };
  }

  protected onStart(): void {
    this.beginSwing();
  }

  private onResume(): void {
    // The swing clock kept running while paused: throw the interrupted swing away and redo it.
    if (this.phase === 'swing') this.beginSwing();
  }

  private beginSwing(): void {
    this.plan = planSwing(this.rng, this.swingIndex);
    const t0 = performance.now();
    this.startAt = [this.plan.balls[0].map((b) => t0 + b.startMs), this.plan.balls[1].map((b) => t0 + b.startMs)];
    this.verdicts = [this.plan.balls[0].map(() => null), this.plan.balls[1].map(() => null)];
    this.lastTap = [-1e9, -1e9];
    const extra = this.swingIndex >= C.swings;
    const label = extra ? '+' : `${this.swingIndex + 1} / ${C.swings}`;
    const t = txt();
    const hint = this.swingIndex === 0 ? t.hint : this.plan.announce ? t[this.plan.announce] : null;
    this.lanes.forEach((l) => l.reset(label, this.plan.balls[0].length, hint));
    if (extra) this.time.delayedCall(0, () => this.lanes.forEach((l) => l.showResult(txt().extra, '', 0xffd23f)));
    this.phase = 'swing';
  }

  protected onTick(): void {
    if (this.phase !== 'swing') return;
    const now = performance.now();
    for (const p of PLAYERS) {
      const lane = this.lanes[p];
      let ring: { u: number; alpha: number } | null = null;
      this.plan.balls[p].forEach((b, i) => {
        const ball = lane.balls[i];
        const u = yarnProgress(now, this.startAt[p][i], b.descentMs, b.pauseAtU, b.pauseMs);
        if (u > 0 && !ball.started) lane.onYarnStart(i, b, this.startAt[p][i]);
        if (!ball.frozen && !ball.fxDone) {
          if (u <= 0) {
            // the first yarn waits at the top, rocking; a second one only appears when it starts
            if (i === 0) ball.yarn.place(b.sideX, LANE.startY + Math.sin(now / 160 + p) * 5, 0, Math.sin(now / 230 + p) * 6, false);
          } else {
            const path = yarnPath(u);
            const y = LANE.startY + (LANE.handsY - LANE.startY) * path;
            const x = b.sideX * Math.max(0, 1 - path);
            if (y >= LANE.missY) {
              lane.miss(i, this.verdicts[p][i] ?? 'none');
            } else if (inFeint(now, b)) {
              // fake-out: hanging in the air, rocking to and fro
              ball.yarn.place(x, y - 18 - Math.abs(Math.sin(now / 110)) * 14, 0.12, path * 1200 + Math.sin(now / 70) * 90, true);
            } else {
              ball.yarn.place(x, y, yarnHop(u, b.bounces), path * 1200, true);
            }
          }
        }
        if (!ball.frozen && !ball.fxDone && u > 0 && u < 1 && this.verdicts[p][i] === null && ring === null) {
          ring = { u, alpha: cueAlpha(this.plan.cue, u, now) };
        }
        // Nothing tapped and the yarn is past the paws: a miss.
        if (this.verdicts[p][i] === null && now > missDeadline(this.startAt[p][i], b.descentMs, this.plan.params, b.pauseMs)) this.verdicts[p][i] = 'none';
      });
      lane.setRing(ring);
    }
    const done = PLAYERS.every((p) => this.plan.balls[p].every((_, i) => this.verdicts[p][i] !== null && this.lanes[p].balls[i].fxDone));
    if (done) this.settle();
  }

  /** Timestamp of the touch itself (DOM event time), so frame rate does not blur the timing. */
  private tapTime(id: number): number {
    const now = performance.now();
    const ptr = this.input.manager.pointers.find((q) => q.id === id);
    const ts = (ptr?.event as Event | undefined)?.timeStamp;
    return ts !== undefined && ts <= now + 1 && now - ts < 250 ? ts : now;
  }

  private onDown(e: PlayerPointer): void {
    if (!this.running || this.phase !== 'swing') return;
    const p = e.player;
    const tap = this.tapTime(e.id);
    if (tap - this.lastTap[p] < C.ignoreTapMs) return; // a double tap never costs a second yarn
    this.lastTap[p] = tap;
    const balls = this.plan.balls[p];
    // taps are compared on the swing's own clock: ball starts are relative to the swing start (startAt - startMs)
    const origin = this.startAt[p][0] - balls[0].startMs;
    const { ball: i, foul } = assignTap(balls, this.verdicts[p].map((v) => v !== null), tap - origin);
    if (i < 0) return;
    const b = balls[i];
    const v = foul ? 'foul' : judgeTap(tap, this.startAt[p][i], b.descentMs, this.plan.params, b.pauseMs);
    this.verdicts[p][i] = v;
    if (v === 'perfect' || v === 'good') this.lanes[p].catch(i, v, this.plan.multiplier);
    else if (v === 'foul') this.lanes[p].foul();
    // early / late: the yarn keeps rolling and bounces off the head when it arrives.
  }

  /** Both swings are over: award the points one by one, then next swing or the Win flow. */
  private settle(): void {
    this.phase = 'celebrate';
    this.played++;
    const pts = PLAYERS.map((p) => this.verdicts[p].reduce<number>((sum, v) => sum + pointsFor(v ?? 'none', this.plan.multiplier), 0));
    const gap = Math.max(...pts) > 4 ? 220 : C.pointGapMs;
    PLAYERS.forEach((p) => {
      this.totals[p] += pts[p];
      for (let k = 0; k < pts[p]; k++) this.time.delayedCall(C.firstPointDelayMs + k * gap, () => this.score(p));
    });
    const hold = Math.max(C.resultHoldMs, C.firstPointDelayMs + Math.max(...pts) * gap + 900);
    const winner = matchWinner(this.totals, this.played);
    if (winner !== null) {
      this.time.delayedCall(hold, () => {
        this.phase = 'over';
        this.running = false;
        Sfx.win();
        this.time.delayedCall(500, () =>
          this.scene.start('Win', { gameId: C.id, sceneKey: this.scene.key, winner, scores: [...this.match.scores] }),
        );
      });
    } else {
      this.time.delayedCall(hold, () => {
        this.swingIndex++;
        this.beginSwing();
      });
    }
  }
}

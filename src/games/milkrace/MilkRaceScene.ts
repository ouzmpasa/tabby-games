import Phaser from 'phaser';
import { Sfx } from '../../core/audio/Sfx';
import { BaseGameScene } from '../../core/BaseGameScene';
import type { PlayerPointer } from '../../core/input/PlayerInput';
import { facingRotation, H, W } from '../../core/layout';
import { CARD, COLORS, FONT_DISPLAY, PLAYER, hex } from '../../core/theme';
import { PLAYERS, type PlayerId } from '../../core/types';
import { runCountdown } from '../../ui/Countdown';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { LAYOUT, MILKRACE, MILKRACE_STRINGS, STAGES } from './config';
import {
  advance,
  beatPhase,
  bell,
  combo,
  createState,
  friskyAt,
  localToScreen,
  makeFriskyPlan,
  mulberry32,
  reset,
  roundDifficulty,
  screenToLocal,
  stageBellSchedule,
  tap,
  type BellEvent,
  type FriskyPlan,
  type MilkState,
  type Pad,
  type RoundDifficulty,
  type Stage,
} from './logic';
import { drawBell, drawBucket, drawCow, drawMeter, drawPad, sectionMidY } from './pieces';

type Phase = 'countdown' | 'play' | 'point' | 'over';

interface Side {
  root: Phaser.GameObjects.Container;
  cow: Phaser.GameObjects.Container;
  pads: Phaser.GameObjects.Graphics;
  bucket: Phaser.GameObjects.Graphics;
  meter: Phaser.GameObjects.Graphics;
  bell: Phaser.GameObjects.Container;
  /** "1" "2" "3" in the tank sections, and the name of the stage under the tank. */
  secLabels: Phaser.GameObjects.Text[];
  stageName: Phaser.GameObjects.Text;
  bellOn: boolean;
  bellSpot: number;
  bellIdx: number;
  press: [number, number];
  /** Current pad centres in the player's frame (they move in the Frisky stage). */
  padPos: [{ x: number; y: number }, { x: number; y: number }];
  beatTicked: number;
  shown: number;
  cx: number;
  cy: number;
}

const COW_TEX = { w: 600, h: 820, ox: 300, oy: 510 };

export class MilkRaceScene extends BaseGameScene {
  /** Simulation state per player (public so tests can poke it). */
  sims!: [MilkState, MilkState];
  phase: Phase = 'countdown';
  round = 0;
  /** Bell schedule per stage (shared by both players, relative to the start of their own stage). */
  schedules: BellEvent[][] = [];
  diff: RoundDifficulty = roundDifficulty(1);
  plan!: FriskyPlan;
  private sides: Side[] = [];
  private seed = 1;
  private hints: RotatedLabel[] = [];

  constructor() {
    super(MILKRACE.sceneKey, MILKRACE.id, MILKRACE.targetScore);
  }

  protected drawBackground(): void {
    if (this.textures.exists('milkrace-bg')) {
      this.add.image(0, 0, 'milkrace-bg').setOrigin(0);
      return;
    }
    const g = this.make.graphics({}, false);
    g.fillStyle(COLORS.bg, 1).fillRect(0, 0, W, H);
    const m = 40;
    const r = CARD.radius + 10;
    g.fillStyle(0x080e1a, 0.3).fillRoundedRect(m, m + 14, W - 2 * m, H - 2 * m, r);
    g.fillStyle(COLORS.inset, 1).fillRoundedRect(m, m, W - 2 * m, H - 2 * m, r);
    // Barn-yard at dusk: straw-green paddock per half, tinted for the player.
    g.fillStyle(0x3a5a47, 1).fillRoundedRect(m, m, W / 2 - m, H - 2 * m, { tl: r, bl: r, tr: 0, br: 0 });
    g.fillStyle(0x3a5a47, 1).fillRoundedRect(W / 2, m, W / 2 - m, H - 2 * m, { tl: 0, bl: 0, tr: r, br: r });
    g.fillStyle(PLAYER[0].main, 0.14).fillRoundedRect(m, m, W / 2 - m, H - 2 * m, { tl: r, bl: r, tr: 0, br: 0 });
    g.fillStyle(PLAYER[1].main, 0.14).fillRoundedRect(W / 2, m, W / 2 - m, H - 2 * m, { tl: 0, bl: 0, tr: r, br: r });
    g.fillStyle(PLAYER[0].main, 0.5).fillRoundedRect(m, m, 16, H - 2 * m, { tl: r, bl: r, tr: 0, br: 0 });
    g.fillStyle(PLAYER[1].main, 0.5).fillRoundedRect(W - m - 16, m, 16, H - 2 * m, { tl: 0, bl: 0, tr: r, br: r });
    // Straw circle under each cow.
    g.fillStyle(0x6b6a45, 0.55).fillCircle(W / 4, H / 2, 430).fillCircle((3 * W) / 4, H / 2, 430);
    // Wooden fence down the middle with a little moon-glow on top.
    g.fillStyle(0x080e1a, 0.3).fillRect(W / 2 - 10, m + 6, 24, H - 2 * m);
    g.fillStyle(0x8a6a4a, 1).fillRect(W / 2 - 8, m, 16, H - 2 * m);
    for (let y = m + 40; y < H - m - 20; y += 120) {
      g.fillStyle(0xa98258, 1).fillRoundedRect(W / 2 - 18, y, 36, 70, 10);
    }
    // Hay tufts and stars, fixed pattern.
    const rnd = mulberry32(11);
    g.lineStyle(5, 0x5b8a69, 0.8);
    for (let i = 0; i < 50; i++) {
      const x = m + 30 + rnd() * (W - 2 * m - 60);
      const y = m + 30 + rnd() * (H - 2 * m - 60);
      if (Math.abs(x - W / 2) < 40) continue;
      g.lineBetween(x, y, x - 6, y - 16).lineBetween(x, y, x + 6, y - 16).lineBetween(x, y, x, y - 20);
    }
    g.generateTexture('milkrace-bg', W, H);
    g.destroy();
    this.add.image(0, 0, 'milkrace-bg').setOrigin(0);
  }

  protected onCreate(): void {
    this.phase = 'countdown';
    this.round = 0;
    this.seed = Math.floor(Math.random() * 1e6);
    this.sims = [createState(), createState()];
    this.sides = PLAYERS.map((p) => this.makeSide(p));
    this.hints = PLAYERS.map((p) => {
      const a = this.toScreen(p, 0, 130);
      return new RotatedLabel(this, a.x, a.y, MILKRACE_STRINGS.hint, p, { size: 120, color: 0xffffff, stroke: COLORS.inset, display: true }).setDepth(20).setAlpha(0);
    });
    this.players.on('down', this.onDown, this);
    this.newRound();
    this.drawAll();
  }

  /** Test hook: seed the bell and shuffle schedules. */
  setSeed(n: number): void {
    this.seed = n;
    this.planRound();
  }

  /** Both players get the same events: schedules are seeded by the match seed, the round and the stage only. */
  private planRound(): void {
    this.diff = roundDifficulty(this.round);
    this.schedules = ([0, 1, 2] as Stage[]).map((st) => stageBellSchedule(this.seed, this.round, st, LAYOUT.bellSpots.length));
    this.plan = makeFriskyPlan(this.seed + this.round * 131 + 5, this.diff.shuffleMs, LAYOUT.padSlots.length);
  }

  private toScreen(p: PlayerId, lx: number, ly: number): { x: number; y: number } {
    return localToScreen(p, p === 0 ? W / 4 : (3 * W) / 4, H / 2, lx, ly);
  }

  private makeSide(p: PlayerId): Side {
    const cx = p === 0 ? W / 4 : (3 * W) / 4;
    const cy = H / 2;
    const root = this.add.container(cx, cy).setRotation(facingRotation(p)).setDepth(5);
    // The cow never changes, so bake it into a texture once (cheaper than re-drawing ~60 shapes every frame on a tablet).
    const key = `milkrace-cow-${p}`;
    if (!this.textures.exists(key)) {
      const cowG = this.make.graphics({}, false);
      cowG.translateCanvas(COW_TEX.ox, COW_TEX.oy);
      drawCow(cowG, p);
      cowG.generateTexture(key, COW_TEX.w, COW_TEX.h);
      cowG.destroy();
    }
    const cow = this.add.container(0, 0, [this.add.image(0, 0, key).setOrigin(COW_TEX.ox / COW_TEX.w, COW_TEX.oy / COW_TEX.h)]);
    const pads = this.add.graphics();
    const bucket = this.add.graphics();
    const meter = this.add.graphics();
    const bellG = this.add.graphics();
    drawBell(bellG);
    const bellC = this.add.container(0, 0, [bellG]).setVisible(false).setDepth(2);
    // Section numbers inside the tank (drawn in the player's frame, so they face the player) and the stage name under it.
    const secLabels = [0, 1, 2].map((k) =>
      this.add.text(LAYOUT.bucketX, sectionMidY(k), String(k + 1), { fontFamily: FONT_DISPLAY, fontStyle: '700', fontSize: '72px', color: hex(0x7f8fab) }).setOrigin(0.5).setAlpha(0.7),
    );
    const stageName = this.add
      .text(LAYOUT.bucketX, LAYOUT.bucketBottom + 44, STAGES[0].name, { fontFamily: FONT_DISPLAY, fontStyle: '700', fontSize: '44px', color: hex(PLAYER[p].onDark), stroke: hex(COLORS.inset), strokeThickness: 6 })
      .setOrigin(0.5);
    root.add([cow, meter, bucket, ...secLabels, stageName, pads, bellC]);
    const b = this.badges[p];
    const a = this.toScreen(p, LAYOUT.badgeX, LAYOUT.badgeY);
    b.setPosition(a.x, a.y);
    return {
      root, cow, pads, bucket, meter, bell: bellC, secLabels, stageName,
      bellOn: false, bellSpot: 0, bellIdx: 0, press: [0, 0],
      padPos: [{ ...LAYOUT.padSlots[0][0] }, { ...LAYOUT.padSlots[0][1] }],
      beatTicked: -1, shown: 0, cx, cy,
    };
  }

  private newRound(): void {
    this.round++;
    this.planRound();
    this.sims.forEach(reset);
    for (const p of PLAYERS) {
      const s = this.sides[p];
      s.shown = 0;
      s.bellOn = false;
      s.bellIdx = 0;
      s.beatTicked = -1;
      s.bell.setVisible(false);
      this.tweens.killTweensOf(s.cow);
      s.cow.setAngle(0).setScale(1).setPosition(0, 0);
      this.refreshStageLabels(p);
    }
    this.phase = 'countdown';
    this.drawAll();
  }

  private refreshStageLabels(p: PlayerId): void {
    const s = this.sides[p];
    const st = this.sims[p].stage;
    s.stageName.setText(STAGES[st].name);
    s.secLabels.forEach((t, k) => t.setAlpha(k === st ? 0.95 : 0.5).setColor(hex(k === st ? 0xb9c5d8 : 0x7f8fab)));
  }

  protected onStart(): void {
    this.begin();
  }

  private begin(): void {
    this.phase = 'play';
    this.sims.forEach((s) => (s.stageT = 0));
    if (this.round <= 2) {
      this.hints.forEach((h) => {
        h.setAlpha(0.9);
        this.tweens.add({ targets: h, alpha: 0, delay: 1600, duration: 400 });
      });
    }
  }

  protected onTick(_time: number, delta: number): void {
    const dt = Math.min(delta, 100);
    if (this.phase === 'play') {
      for (const p of PLAYERS) {
        if (this.sims[p].level >= 1) continue;
        advance(this.sims[p], dt, this.diff);
        this.updateBell(p);
        this.beatTick(p);
      }
    }
    for (const p of PLAYERS) {
      const s = this.sides[p];
      s.press[0] = Math.max(0, s.press[0] - delta / 160);
      s.press[1] = Math.max(0, s.press[1] - delta / 160);
      const target = this.sims[p].level;
      s.shown += (target - s.shown) * Math.min(1, delta / 90);
      if (Math.abs(target - s.shown) < 0.001) s.shown = target;
    }
    this.drawAll();
  }

  /** A soft tick on every beat of the Rhythm stage, so the beat can be heard as well as seen. */
  private beatTick(p: PlayerId): void {
    const sim = this.sims[p];
    if (sim.stage !== 1 || sim.stageT < MILKRACE.beatLeadMs) return;
    const k = Math.floor((sim.stageT - MILKRACE.beatLeadMs) / this.diff.beatPeriodMs);
    const s = this.sides[p];
    if (k > s.beatTicked) {
      s.beatTicked = k;
      Sfx.tone(330, 0.05, 'sine', 0.06);
    }
  }

  private updateBell(p: PlayerId): void {
    const s = this.sides[p];
    const sim = this.sims[p];
    const ev = this.schedules[sim.stage]?.[s.bellIdx];
    if (!ev) return;
    const t = sim.stageT;
    if (!s.bellOn && t >= ev.at && t < ev.at + ev.life) {
      s.bellOn = true;
      s.bellSpot = ev.spot;
      const spot = LAYOUT.bellSpots[ev.spot];
      s.bell.setPosition(spot.x, spot.y).setVisible(true).setScale(0.2).setAngle(0);
      this.tweens.add({ targets: s.bell, scale: 1, duration: 300, ease: 'Back.Out' });
      this.tweens.add({ targets: s.bell, angle: { from: -10, to: 10 }, duration: 160, yoyo: true, repeat: -1 });
      Sfx.tone(1175, 0.1, 'triangle', 0.1);
    } else if (t >= ev.at + ev.life) {
      this.hideBell(p);
      s.bellIdx++;
    }
  }

  private hideBell(p: PlayerId): void {
    const s = this.sides[p];
    s.bellOn = false;
    this.tweens.killTweensOf(s.bell);
    s.bell.setVisible(false);
  }

  /** Pad centres right now: fixed, except in the Frisky stage where the cow shuffles them between the layout slots. */
  private padPositions(p: PlayerId): { pos: [{ x: number; y: number }, { x: number; y: number }]; warn: number } {
    const sim = this.sims[p];
    if (sim.stage !== 2 || this.phase !== 'play') return { pos: [{ ...LAYOUT.padSlots[0][0] }, { ...LAYOUT.padSlots[0][1] }], warn: 0 };
    const v = friskyAt(this.plan, sim.stageT);
    const e = v.move * v.move * (3 - 2 * v.move);
    const at = (i: 0 | 1) => {
      const a = LAYOUT.padSlots[v.from][i];
      const b = LAYOUT.padSlots[v.to][i];
      return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
    };
    return { pos: [at(0), at(1)], warn: v.warn };
  }

  private drawAll(): void {
    const t = this.time.now;
    for (const p of PLAYERS) {
      const s = this.sides[p];
      const sim = this.sims[p];
      s.pads.clear();
      const playing = this.phase === 'play';
      const expectPad = sim.last === null ? 0 : sim.last === 0 ? 1 : 0;
      const { pos, warn } = this.padPositions(p);
      s.padPos = pos;
      const ringPhase = playing && sim.stage === 1 && sim.level < 1 ? beatPhase(sim, this.diff) : 0;
      for (const pad of [0, 1] as Pad[]) {
        const next = sim.last === null ? 1 : pad === expectPad ? 1 : 0;
        drawPad(s.pads, p, {
          pad, x: pos[pad].x, y: pos[pad].y, press: s.press[pad], glow: playing ? next : 0, t,
          arrow: sim.stage !== 2,
          ring: ringPhase > 0.02 && (sim.last === null || pad === expectPad) ? ringPhase : -1,
          wobble: warn,
        });
      }
      s.bucket.clear();
      drawBucket(s.bucket, s.shown, t, sim.stage);
      s.meter.clear();
      drawMeter(s.meter, p, playing ? combo(sim, this.time.now) : 0);
    }
  }

  private onDown(e: PlayerPointer): void {
    if (this.phase !== 'play') return;
    const s = this.sides[e.player];
    const sim = this.sims[e.player];
    const l = screenToLocal(e.player, s.cx, s.cy, e.x, e.y);
    // The golden bell wins over the pads underneath it.
    if (s.bellOn) {
      const b = LAYOUT.bellSpots[s.bellSpot];
      if (Math.hypot(l.x - b.x, l.y - b.y) <= MILKRACE.bellRadius) {
        this.onBell(e.player);
        return;
      }
    }
    if (sim.stage === 2) {
      // The pads move around: the nearest pad within a generous reach.
      let best = -1;
      let bd = (LAYOUT.padR * 1.4) ** 2;
      s.padPos.forEach((c, i) => {
        const d = (c.x - l.x) ** 2 + (c.y - l.y) ** 2;
        if (d <= bd) {
          bd = d;
          best = i;
        }
      });
      if (best >= 0) this.onPad(e.player, best as Pad);
      return;
    }
    if (l.y < LAYOUT.padTouchTop) return;
    this.onPad(e.player, l.x < 0 ? 0 : 1);
  }

  /** Public so tests can drive a pad without a pointer. */
  onPad(p: PlayerId, pad: Pad): void {
    if (this.phase !== 'play') return;
    const sim = this.sims[p];
    const res = tap(sim, pad, this.time.now, undefined, this.diff);
    if (res.kind === 'ignored') return;
    const s = this.sides[p];
    s.press[pad] = 1;
    const c = s.padPos[pad];
    if (res.kind === 'splat') {
      Sfx.tone(180, 0.18, 'sawtooth', 0.12);
      Sfx.vibrate(15);
      this.splatEffect(p, c.x, c.y);
      return;
    }
    if (res.beat === 'perfect' || res.beat === 'good') {
      Sfx.tone(res.beat === 'perfect' ? 880 : 660, 0.09, 'triangle', 0.16);
      this.beatLabel(p, c.x, c.y - 175, res.beat);
    } else {
      Sfx.tone(520 + sim.rate * 60, 0.07, 'sine', res.beat === 'off' ? 0.06 : 0.14);
    }
    this.squirtEffect(p, c.x, c.y + 120, res.amount);
    if (res.won) this.onRound(p);
    else if (res.stageDone) this.onStageDone(p);
  }

  private beatLabel(p: PlayerId, lx: number, ly: number, q: 'perfect' | 'good'): void {
    const a = this.toScreen(p, lx, ly);
    const l = new RotatedLabel(this, a.x, a.y, q === 'perfect' ? 'PERFECT!' : 'GOOD!', p, { size: q === 'perfect' ? 74 : 60, color: q === 'perfect' ? 0xffd84d : COLORS.text, stroke: COLORS.inset, display: true }).setDepth(40);
    this.tweens.add({ targets: l, alpha: 0, scale: { from: 0.7, to: 1.2 }, duration: 520, ease: 'Quad.Out', onComplete: () => l.destroy() });
  }

  private onBell(p: PlayerId): void {
    const s = this.sides[p];
    const b = LAYOUT.bellSpots[s.bellSpot];
    this.hideBell(p);
    s.bellIdx++;
    Sfx.tone(1175, 0.12, 'triangle', 0.2);
    Sfx.tone(1568, 0.2, 'triangle', 0.2, 0.09);
    Sfx.vibrate([20, 20, 40]);
    const r = bell(this.sims[p]);
    for (let k = 0; k < 8; k++) this.fly(p, b.x, b.y, 0xffe38a, 18, k * 40);
    const a = this.toScreen(p, b.x, b.y);
    const l = new RotatedLabel(this, a.x, a.y, MILKRACE_STRINGS.bell, p, { size: 110, color: 0xffd84d, stroke: COLORS.inset, display: true }).setDepth(40);
    this.tweens.add({ targets: l, alpha: 0, scale: { from: 0.6, to: 1.3 }, duration: 800, ease: 'Quad.Out', onComplete: () => l.destroy() });
    if (r.won) this.onRound(p);
    else if (r.stageDone) this.onStageDone(p);
  }

  /** A tank section is full: mini celebration, then the banner for the next stage (taps keep working). */
  private onStageDone(p: PlayerId): void {
    const s = this.sides[p];
    const st = this.sims[p].stage;
    this.hideBell(p);
    s.bellIdx = 0;
    s.beatTicked = -1;
    this.refreshStageLabels(p);
    [523, 659, 784, 1046].forEach((f, i) => Sfx.tone(f, 0.14, 'triangle', 0.2, i * 0.08));
    Sfx.vibrate([20, 30, 40]);
    // Stars burst out of the section that just filled up.
    const y0 = sectionMidY(st - 1);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      const from = this.toScreen(p, LAYOUT.bucketX, y0);
      const to = this.toScreen(p, LAYOUT.bucketX + Math.cos(a) * 190, y0 + Math.sin(a) * 190);
      const dot = this.add.star(from.x, from.y, 5, 7, 16, k % 2 ? 0xffd84d : 0xfdfcf6).setDepth(45);
      this.tweens.add({ targets: dot, x: to.x, y: to.y, alpha: 0, angle: 180, scale: 0.4, duration: 650, ease: 'Quad.Out', onComplete: () => dot.destroy() });
    }
    const g = this.toScreen(p, LAYOUT.bucketX, y0);
    const glow = this.add.circle(g.x, g.y, 90, 0xffd84d, 0.5).setDepth(44);
    this.tweens.add({ targets: glow, scale: 3.2, alpha: 0, duration: 600, onComplete: () => glow.destroy() });
    // The cow hops with joy.
    const cow = s.cow;
    this.tweens.killTweensOf(cow);
    cow.setAngle(0);
    this.tweens.add({ targets: cow, angle: { from: -5, to: 5 }, duration: 110, yoyo: true, repeat: 3, onComplete: () => cow.setAngle(0) });
    // Banner facing the player: "NICE!", then the next stage and what to do.
    const a = this.toScreen(p, 0, 30);
    const b2 = this.toScreen(p, 0, 140);
    const title = new RotatedLabel(this, a.x, a.y, STAGES[st].name, p, { size: 130, color: 0xffd84d, stroke: COLORS.inset, display: true }).setDepth(60);
    const tip = new RotatedLabel(this, b2.x, b2.y, STAGES[st].tip, p, { size: 64, color: 0xffffff, stroke: COLORS.inset, display: true }).setDepth(60);
    this.tweens.add({ targets: [title, tip], scale: { from: 0.4, to: 1 }, duration: 330, ease: 'Back.Out' });
    this.tweens.add({ targets: [title, tip], alpha: 0, delay: MILKRACE.stageBannerMs, duration: 350, onComplete: () => { title.destroy(); tip.destroy(); } });
  }

  /** Arcing drops from a local point to the tank opening. */
  private fly(p: PlayerId, lx: number, ly: number, color: number, r: number, delay = 0): void {
    const bx = LAYOUT.bucketX + Phaser.Math.Between(-40, 40);
    const by = LAYOUT.bucketTop - 10;
    const dot = this.add.circle(0, 0, r, color, 1).setDepth(30).setVisible(false);
    const prog = { v: 0 };
    this.tweens.add({
      targets: prog,
      v: 1,
      delay,
      duration: 420,
      ease: 'Quad.In',
      onStart: () => dot.setVisible(true),
      onUpdate: () => {
        const x = lx + (bx - lx) * prog.v;
        const y = ly + (by - ly) * prog.v - Math.sin(prog.v * Math.PI) * 220;
        const a = this.toScreen(p, x, y);
        dot.setPosition(a.x, a.y);
      },
      onComplete: () => dot.destroy(),
    });
  }

  private squirtEffect(p: PlayerId, lx: number, ly: number, amount: number): void {
    const size = Phaser.Math.Clamp((amount - MILKRACE.minSquirt) / (MILKRACE.maxSquirt - MILKRACE.minSquirt), 0, 1);
    const n = 2 + Math.round(size * 3);
    for (let k = 0; k < n; k++) this.fly(p, lx + Phaser.Math.Between(-14, 14), ly, 0xfdfcf6, 11 + size * 9, k * 25);
  }

  private splatEffect(p: PlayerId, lx: number, ly: number): void {
    for (let k = 0; k < 5; k++) {
      const a = this.toScreen(p, lx + Phaser.Math.Between(-60, 60), ly + 110);
      const d = this.add.circle(a.x, a.y, 10, 0xb9c5d8, 0.9).setDepth(30);
      const dir = this.toScreen(p, 0, 1);
      const o = this.toScreen(p, 0, 0);
      const vx = (dir.x - o.x) * Phaser.Math.Between(60, 180) + Phaser.Math.Between(-40, 40);
      const vy = (dir.y - o.y) * Phaser.Math.Between(60, 180) + Phaser.Math.Between(-40, 40);
      this.tweens.add({ targets: d, x: a.x + vx, y: a.y + vy, alpha: 0, duration: 450, ease: 'Quad.Out', onComplete: () => d.destroy() });
    }
    const m = this.toScreen(p, lx, ly - 20);
    const l = new RotatedLabel(this, m.x, m.y, MILKRACE_STRINGS.splat, p, { size: 70, color: COLORS.muted, stroke: COLORS.inset, display: true }).setDepth(40);
    this.tweens.add({ targets: l, alpha: 0, duration: 600, onComplete: () => l.destroy() });
    // a cute little shake of the cow
    const cow = this.sides[p].cow;
    this.tweens.killTweensOf(cow);
    cow.setAngle(0);
    this.tweens.add({ targets: cow, angle: { from: -2.5, to: 2.5 }, duration: 60, yoyo: true, repeat: 2, onComplete: () => cow.setAngle(0) });
  }

  private onRound(winner: PlayerId): void {
    this.phase = 'point';
    this.score(winner);
    for (const p of PLAYERS) this.hideBell(p);
    this.hints.forEach((h) => {
      this.tweens.killTweensOf(h);
      h.setAlpha(0);
    });
    const w = this.sides[winner];
    // Happy dance: wiggle and bounce.
    this.tweens.killTweensOf(w.cow);
    this.tweens.add({ targets: w.cow, angle: { from: -7, to: 7 }, duration: 170, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: w.cow, scale: { from: 1, to: 1.06 }, duration: 260, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    for (const p of PLAYERS) {
      const a = this.toScreen(p, 0, 130);
      const l = new RotatedLabel(this, a.x, a.y, MILKRACE_STRINGS.moo, p, { size: 220, color: PLAYER[winner].onDark, stroke: COLORS.inset, display: true }).setDepth(100);
      this.tweens.add({ targets: l, scale: { from: 0.4, to: 1.1 }, duration: 350, ease: 'Back.Out' });
      this.tweens.add({ targets: l, alpha: 0, delay: 1200, duration: 400, onComplete: () => l.destroy() });
    }
    const glow = this.add.circle(w.cx, w.cy, 200, PLAYER[winner].main, 0.5).setDepth(40);
    this.tweens.add({ targets: glow, scale: 4, alpha: 0, duration: 800, onComplete: () => glow.destroy() });
    Sfx.tone(196, 0.5, 'sawtooth', 0.14);
    Sfx.tone(165, 0.5, 'sawtooth', 0.14, 0.2);
    Sfx.vibrate([30, 30, 60]);
    if (this.match.over) {
      this.phase = 'over';
      return;
    }
    this.time.delayedCall(MILKRACE.roundPauseMs, () => {
      if (this.phase !== 'point') return;
      this.newRound();
      runCountdown(this, () => this.begin());
    });
  }
}

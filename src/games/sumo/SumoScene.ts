import Phaser from 'phaser';
import { Sfx } from '../../core/audio/Sfx';
import { BaseGameScene } from '../../core/BaseGameScene';
import type { PlayerPointer } from '../../core/input/PlayerInput';
import { settings } from '../../core/settings';
import { endAnchor, H, W } from '../../core/layout';
import { COLORS, PLAYER } from '../../core/theme';
import { other, PLAYERS, type PlayerId } from '../../core/types';
import { runCountdown } from '../../ui/Countdown';
import { RotatedLabel } from '../../ui/RotatedLabel';
import { CENTER, SUMO, SUMO_STRINGS } from './config';
import { bumperPositions, createState, DEFAULT_PARAMS, hasBumpers, hasIce, matchProgress, paramsFor, pickHazard, reset, step, type Params, type SumoState, type Targets } from './logic';
import { makeBlob, type BlobView } from './pieces';

type Phase = 'countdown' | 'play' | 'fall' | 'over';

export class SumoScene extends BaseGameScene {
  /** Simulation state (public so tests can poke it). */
  sim!: SumoState;
  phase: Phase = 'countdown';
  /** The one finger (pointer id) that currently steers each blob. */
  private fingers: [number | null, number | null] = [null, null];
  private targets: Targets = [null, null];
  private views: BlobView[] = [];
  private platform!: Phaser.GameObjects.Graphics;
  private pointers!: Phaser.GameObjects.Graphics;
  private squash = [0, 0];
  /** Rules of the current round (platform size and crumbling follow the match progress). */
  private params: Params = DEFAULT_PARAMS;
  private clock = 0;

  constructor() {
    super(SUMO.sceneKey, SUMO.id, SUMO.targetScore);
  }

  protected drawBackground(): void {
    const g = this.add.graphics();
    g.fillStyle(COLORS.bg, 1).fillRect(0, 0, W, H);
    // Each half is softly tinted for its player.
    g.fillStyle(PLAYER[0].main, 0.07).fillRect(0, 0, W / 2, H);
    g.fillStyle(PLAYER[1].main, 0.07).fillRect(W / 2, 0, W / 2, H);
    g.fillStyle(COLORS.dots, 1);
    for (let y = 40; y < H; y += 54) for (let x = 40; x < W; x += 54) g.fillCircle(x, y, 3);
  }

  protected onCreate(): void {
    this.running = true; // phases gate the simulation
    this.phase = 'countdown';
    this.fingers = [null, null];
    this.targets = [null, null];
    this.squash = [0, 0];
    this.params = DEFAULT_PARAMS;
    this.clock = 0;
    this.sim = createState();
    this.platform = this.add.graphics().setDepth(2);
    this.pointers = this.add.graphics().setDepth(20);
    this.views = PLAYERS.map((p) => makeBlob(this, p));
    PLAYERS.forEach((p) => {
      const a = endAnchor(p, 90);
      this.badges[p].setPosition(a.x, a.y);
    });
    this.players.on('down', this.onDown, this);
    this.players.on('move', this.onMove, this);
    this.players.on('up', this.onUp, this);
    this.events.on('resume', this.releaseFingers, this);
    this.events.once('shutdown', () => this.events.off('resume', this.releaseFingers, this));
    this.render(); // the base class runs the first 3-2-1; onStart() begins play
  }

  protected onStart(): void {
    if (this.phase === 'countdown') this.phase = 'play';
  }

  private onDown(e: PlayerPointer): void {
    if (this.phase === 'over' || this.fingers[e.player] !== null) return; // one finger per player
    this.fingers[e.player] = e.id;
    this.targets[e.player] = { x: e.x, y: e.y };
  }

  private onMove(e: PlayerPointer): void {
    if (this.fingers[e.player] === e.id) this.targets[e.player] = { x: e.x, y: e.y };
  }

  private onUp(e: PlayerPointer): void {
    if (this.fingers[e.player] !== e.id) return;
    this.fingers[e.player] = null;
    this.targets[e.player] = null;
  }

  private releaseFingers(): void {
    this.fingers = [null, null];
    this.targets = [null, null];
    this.players.tracker.clear();
  }

  private startCountdown(): void {
    this.phase = 'countdown';
    // Every round is set up from the match progress: a smaller, faster crumbling platform and maybe ice or bumpers.
    const progress = matchProgress(this.match.scores, this.match.target);
    this.params = paramsFor(progress);
    reset(this.sim, this.params, pickHazard(progress));
    this.views.forEach((v) => {
      v.root.setDepth(10).setAlpha(1);
      v.body.setScale(1).setRotation(0);
      v.oh.setVisible(false);
      v.smile.setVisible(true);
    });
    this.render();
    runCountdown(this, () => {
      if (this.phase !== 'over') this.phase = 'play';
    });
  }

  protected onTick(_time: number, delta: number): void {
    this.clock += delta / 1000;
    if (this.phase === 'play' || this.phase === 'fall') {
      const r = step(this.sim, delta, this.targets, this.params);
      if (r.bumped && r.bumpSpeed > 120) this.onBump(r.bumpSpeed);
      if (r.post) Sfx.tone(420, 0.07, 'square', 0.12);
      r.dashed.forEach((p) => this.onDash(p));
      if (r.fell !== null) this.onFell(r.fell);
    }
    this.render();
  }

  private onBump(speed: number): void {
    Sfx.tone(180 + Math.min(300, speed * 0.2), 0.08, 'triangle', 0.2);
    const k = Math.min(1, speed / SUMO.blobMaxSpeed);
    this.squash = [k, k];
    if (speed > 500) Sfx.vibrate(15);
  }

  private onDash(p: PlayerId): void {
    Sfx.tone(300, 0.12, 'sawtooth', 0.12);
    Sfx.vibrate(12);
    const b = this.sim.blobs[p];
    const ring = this.add.circle(b.x, b.y, SUMO.blobRadius, PLAYER[p].light, 0.5).setDepth(15);
    this.tweens.add({ targets: ring, scale: 2.2, alpha: 0, duration: 350, onComplete: () => ring.destroy() });
  }

  private onFell(loser: PlayerId): void {
    this.phase = 'fall';
    const winner = other(loser);
    Sfx.tone(520, 0.45, 'sine', 0.2);
    Sfx.vibrate([20, 20, 40]);
    this.views[loser].smile.setVisible(false);
    this.views[loser].oh.setVisible(true);
    this.time.delayedCall(SUMO.fallMs * 0.6, () => {
      this.score(winner);
      this.flash(winner);
      if (this.match.over) {
        this.phase = 'over';
        return;
      }
      this.time.delayedCall(SUMO.roundPauseMs, () => this.startCountdown());
    });
  }

  /** Round result, shown to both players facing them. */
  private flash(winner: PlayerId): void {
    const lang = settings.get().lang === 'nl' ? 'nl' : 'en';
    const tint = this.add.rectangle(W / 2, H / 2, W, H, PLAYER[winner].main, 0.16).setDepth(39);
    this.tweens.add({ targets: tint, alpha: 0, duration: 800, onComplete: () => tint.destroy() });
    for (const p of PLAYERS) {
      const a = endAnchor(p, 380);
      const l = new RotatedLabel(this, a.x, a.y, SUMO_STRINGS.out[lang], p, { size: 200, color: PLAYER[other(winner)].onDark, stroke: COLORS.inset, display: true }).setDepth(100);
      this.tweens.add({ targets: l, scale: { from: 0.4, to: 1.1 }, duration: 350, ease: 'Back.Out' });
      this.tweens.add({ targets: l, alpha: 0, delay: 700, duration: 300, onComplete: () => l.destroy() });
    }
    this.cameras.main.shake(160, 0.003);
  }

  /** Ice patch: a pale blue disc with a few shine strokes. */
  private drawIce(g: Phaser.GameObjects.Graphics): void {
    const r = this.params.iceRadius;
    g.fillStyle(0x9fd8f5, 0.28).fillCircle(CENTER.x, CENTER.y, r);
    g.lineStyle(5, 0xd8f1ff, 0.6).strokeCircle(CENTER.x, CENTER.y, r);
    g.lineStyle(7, 0xffffff, 0.35);
    g.lineBetween(CENTER.x - r * 0.55, CENTER.y - r * 0.25, CENTER.x - r * 0.25, CENTER.y - r * 0.55);
    g.lineBetween(CENTER.x + r * 0.2, CENTER.y + r * 0.6, CENTER.x + r * 0.5, CENTER.y + r * 0.3);
    g.lineBetween(CENTER.x + r * 0.35, CENTER.y - r * 0.5, CENTER.x + r * 0.5, CENTER.y - r * 0.65);
  }

  /** Two round pinball posts above and below the middle. */
  private drawPosts(g: Phaser.GameObjects.Graphics): void {
    const R = this.params.bumperRadius;
    for (const post of bumperPositions(this.params)) {
      const pulse = 1 + 0.05 * Math.sin(this.clock * 6);
      g.fillStyle(0x080e1a, 0.4).fillCircle(post.x, post.y + 8, R);
      g.fillStyle(COLORS.border, 1).fillCircle(post.x, post.y, R * pulse);
      g.fillStyle(COLORS.icon, 1).fillCircle(post.x, post.y, R * 0.76);
      g.fillStyle(COLORS.text, 0.9).fillCircle(post.x, post.y, R * 0.36);
    }
  }

  private render(): void {
    const s = this.sim;
    // Platform: the original size stays as a faint ring so kids see how much has crumbled away.
    const g = this.platform.clear();
    const start = this.params.platformStart;
    const shrunk = start - s.platform;
    g.lineStyle(6, COLORS.line, 0.35).strokeCircle(CENTER.x, CENTER.y, start);
    g.fillStyle(0x080e1a, 0.35).fillCircle(CENTER.x, CENTER.y + 16, s.platform + 10);
    g.fillStyle(COLORS.tile, 1).fillCircle(CENTER.x, CENTER.y, s.platform + 10);
    g.fillStyle(COLORS.surface, 1).fillCircle(CENTER.x, CENTER.y, s.platform);
    g.fillStyle(PLAYER[0].main, 0.1).slice(CENTER.x, CENTER.y, s.platform, Math.PI / 2, (3 * Math.PI) / 2, false).fillPath();
    g.fillStyle(PLAYER[1].main, 0.1).slice(CENTER.x, CENTER.y, s.platform, -Math.PI / 2, Math.PI / 2, false).fillPath();
    g.lineStyle(4, COLORS.line, 1).lineBetween(CENTER.x, CENTER.y - s.platform, CENTER.x, CENTER.y + s.platform);
    if (hasIce(s.hazard)) this.drawIce(g);
    if (hasBumpers(s.hazard)) this.drawPosts(g);
    g.lineStyle(10, shrunk > 4 ? 0xe5484d : COLORS.border, shrunk > 4 ? Math.min(0.9, 0.35 + shrunk / 120) : 1).strokeCircle(CENTER.x, CENTER.y, s.platform - 5);

    const pg = this.pointers.clear();
    s.blobs.forEach((b, i) => {
      const v = this.views[i];
      const o = s.blobs[1 - i];
      const k = this.squash[i];
      this.squash[i] *= 0.85;
      let scale = 1;
      if (b.falling) {
        const f = Math.min(1, (b.fallT * 1000) / SUMO.fallMs);
        scale = Math.max(0.02, 1 - f);
        v.body.setRotation(f * Math.PI * 4);
        v.root.setDepth(1);
        v.root.setAlpha(1 - f * f);
      }
      v.hurt.setAlpha(0.5 * b.damage);
      v.root.setPosition(b.x, b.y);
      v.body.setScale(scale * (1 + 0.18 * k), scale * (1 - 0.15 * k));
      v.root.list[0] && (v.root.list[0] as Phaser.GameObjects.Arc).setScale(scale);
      // Eyes look at the other blob.
      const a = Math.atan2(o.y - b.y, o.x - b.x);
      v.pupils.forEach((pu, j) => pu.setPosition((j === 0 ? -1 : 1) * SUMO.blobRadius * 0.34 + Math.cos(a) * 7, -SUMO.blobRadius * 0.12 + Math.sin(a) * 7));
      // Dash charge: a ring that grows around the blob; full = ready to dash (swipe away).
      if (!b.falling && (b.charge > 0.02 || b.dashT > 0)) {
        const c = PLAYER[i as PlayerId];
        const ready = b.charge >= 1;
        const pulse = ready ? 1 + 0.06 * Math.sin(this.clock * 18) : 1;
        pg.lineStyle(ready ? 10 : 6, ready ? 0xffffff : c.light, ready ? 0.95 : 0.3 + 0.5 * b.charge).strokeCircle(b.x, b.y, SUMO.blobRadius * (1.08 + 0.2 * b.charge) * pulse);
        if (b.dashT > 0) pg.lineStyle(14, c.light, 0.8).strokeCircle(b.x, b.y, SUMO.blobRadius * 1.35);
      }
      // Finger marker: shows where the blob is heading, before it gets there.
      const t = this.targets[i];
      if (t && !b.falling) {
        const c = PLAYER[i as PlayerId];
        pg.lineStyle(6, c.light, 0.35).lineBetween(b.x, b.y, t.x, t.y);
        pg.fillStyle(c.main, 0.35).fillCircle(t.x, t.y, 46);
        pg.lineStyle(7, c.light, 0.9).strokeCircle(t.x, t.y, 46);
      }
    });
  }
}

import type Phaser from 'phaser';

/** The ring turns red and ticks every second during the last stretch of a move (ms). */
export const URGENT_MS = 3000;

export type ClockEvent = 'tick' | 'timeout' | null;

/**
 * Pure per-move countdown (no Phaser). `total` 0 means "no timer this round".
 * Shared by the turn-based board games (Connect 4, Tic-Tac-Toe, Dots & Boxes).
 */
export class TurnClock {
  total = 0;
  left = 0;
  private active = false;

  /** Starts a fresh countdown; `totalMs` <= 0 disables the clock. */
  start(totalMs: number): void {
    this.total = Math.max(0, totalMs);
    this.left = this.total;
    this.active = this.total > 0;
  }

  stop(): void {
    this.active = false;
  }

  get running(): boolean {
    return this.active;
  }

  /** Fraction of the move left, 1 -> 0 (1 when there is no timer). */
  get fraction(): number {
    return this.total <= 0 ? 1 : Math.max(0, Math.min(1, this.left / this.total));
  }

  /** True during the last URGENT_MS (or the last 40% of a very short timer). */
  get urgent(): boolean {
    return this.active && this.left <= Math.min(URGENT_MS, this.total * 0.4);
  }

  /** Advances by `dtMs`; returns 'timeout' when it hits zero, 'tick' when an urgent whole second boundary is crossed. */
  step(dtMs: number): ClockEvent {
    if (!this.active) return null;
    const before = this.left;
    this.left = Math.max(0, this.left - dtMs);
    if (this.left <= 0) {
      this.active = false;
      return 'timeout';
    }
    if (this.urgent && Math.floor(before / 1000) !== Math.floor(this.left / 1000)) return 'tick';
    return null;
  }
}

/** A circular countdown ring, drawn into a container (usually the active player's turn panel). */
export class TimerRing {
  private g: Phaser.GameObjects.Graphics;
  private lastKey = '';

  constructor(
    scene: Phaser.Scene,
    parent: Phaser.GameObjects.Container,
    private x: number,
    private y: number,
    private radius: number,
    private color: number,
  ) {
    this.g = scene.add.graphics();
    parent.add(this.g);
    this.g.setVisible(false);
  }

  /** Draws the remaining fraction; red when urgent. Cheap: only redraws when the picture changes. */
  draw(clock: TurnClock): void {
    if (clock.total <= 0) {
      this.hide();
      return;
    }
    const f = clock.fraction;
    const urgent = clock.urgent;
    const key = `${Math.round(f * 160)}${urgent ? 'u' : ''}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    const g = this.g.setVisible(true).clear();
    g.lineStyle(12, 0x080e1a, 0.45).strokeCircle(this.x, this.y, this.radius);
    if (f <= 0) return;
    g.lineStyle(12, urgent ? 0xff5a5a : this.color, 1).beginPath();
    g.arc(this.x, this.y, this.radius, -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2, false);
    g.strokePath();
  }

  hide(): void {
    this.lastKey = '';
    this.g.clear().setVisible(false);
  }
}

import { halfZone } from '../layout';
import type { PlayerInput } from './PlayerInput';

export const isDev = (): boolean =>
  import.meta.env.DEV || new URLSearchParams(location.search).has('dev');

const SPEED = 12;
export const DEV_POINTER_ID = 100;

/**
 * Desktop stand-in for player 1: arrow keys/WASD move a virtual finger inside the right half,
 * Space/Enter presses it. Mouse already acts as a (left-half) finger through Phaser.
 */
export class DevInput {
  private keys = new Set<string>();
  private x: number;
  private y: number;
  private down = false;
  private onKeyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'Enter') {
      this.down = true;
      this.input.handleDown(DEV_POINTER_ID, this.x, this.y);
    } else this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space' || e.code === 'Enter') {
      this.down = false;
      this.input.handleUp(DEV_POINTER_ID, this.x, this.y);
    } else this.keys.delete(e.code);
  };

  constructor(private input: PlayerInput) {
    const z = halfZone(1);
    this.x = z.x + z.w / 2;
    this.y = z.y + z.h / 2;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  update(): void {
    const k = this.keys;
    const dx = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    const dy = (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0) - (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0);
    if (!dx && !dy) return;
    this.x += dx * SPEED;
    this.y += dy * SPEED;
    if (this.down) this.input.handleMove(DEV_POINTER_ID, this.x, this.y);
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}

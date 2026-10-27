import Phaser from 'phaser';
import { defaultZones } from '../layout';
import type { PlayerId, Zone } from '../types';
import { PointerTracker } from './assign';

export interface PlayerPointer {
  player: PlayerId;
  id: number;
  x: number;
  y: number;
}

/** Events: 'down' | 'move' | 'up', each with a PlayerPointer. */
export class PlayerInput extends Phaser.Events.EventEmitter {
  readonly tracker: PointerTracker;
  private detach: () => void;

  constructor(scene: Phaser.Scene, zones: Zone[] = defaultZones()) {
    super();
    this.tracker = new PointerTracker(zones);
    const input = scene.input;
    // Taps that land on a UI button (pause etc.) are not game input.
    const onDown = (p: Phaser.Input.Pointer) => {
      if (input.hitTestPointer(p).length === 0) this.handleDown(p.id, p.x, p.y);
    };
    const onMove = (p: Phaser.Input.Pointer) => this.handleMove(p.id, p.x, p.y);
    const onUp = (p: Phaser.Input.Pointer) => this.handleUp(p.id, p.x, p.y);
    input.on('pointerdown', onDown);
    input.on('pointermove', onMove);
    input.on('pointerup', onUp);
    input.on('pointerupoutside', onUp);
    this.detach = () => {
      input.off('pointerdown', onDown);
      input.off('pointermove', onMove);
      input.off('pointerup', onUp);
      input.off('pointerupoutside', onUp);
    };
    scene.events.once('shutdown', () => this.destroy());
  }

  setZones(zones: Zone[]): void {
    this.tracker.setZones(zones);
  }

  /** Also used by DevInput to inject synthetic pointers (ids >= 100). */
  handleDown(id: number, x: number, y: number): void {
    const player = this.tracker.down(id, x, y);
    if (player !== null) this.emit('down', { player, id, x, y } satisfies PlayerPointer);
  }

  handleMove(id: number, x: number, y: number): void {
    const player = this.tracker.owner(id);
    if (player !== null) this.emit('move', { player, id, x, y } satisfies PlayerPointer);
  }

  handleUp(id: number, x: number, y: number): void {
    const player = this.tracker.up(id);
    if (player !== null) this.emit('up', { player, id, x, y } satisfies PlayerPointer);
  }

  destroy(): void {
    this.detach();
    this.tracker.clear();
    this.removeAllListeners();
  }
}

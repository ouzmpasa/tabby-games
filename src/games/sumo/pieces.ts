import Phaser from 'phaser';
import { PLAYER } from '../../core/theme';
import type { PlayerId } from '../../core/types';
import { SUMO } from './config';

export interface BlobView {
  root: Phaser.GameObjects.Container;
  /** Squash-and-stretch layer (everything but the shadow). */
  body: Phaser.GameObjects.Container;
  pupils: Phaser.GameObjects.Arc[];
  smile: Phaser.GameObjects.Graphics;
  oh: Phaser.GameObjects.Arc;
  /** Red flush that grows with the blob's wobble (damage). */
  hurt: Phaser.GameObjects.Arc;
}

/** Big round blob in the player's colour with a cute face. */
export function makeBlob(scene: Phaser.Scene, p: PlayerId): BlobView {
  const R = SUMO.blobRadius;
  const c = PLAYER[p];
  const shadow = scene.add.circle(0, 14, R, 0x080e1a, 0.4);
  const eyes = [-1, 1].flatMap((s) => [
    scene.add.circle(s * R * 0.34, -R * 0.12, R * 0.22, 0xffffff),
    scene.add.circle(s * R * 0.34, -R * 0.12, R * 0.11, 0x1e2a3d),
  ]);
  const smile = scene.add.graphics();
  smile.lineStyle(7, 0x1e2a3d, 1).beginPath().arc(0, R * 0.12, R * 0.26, 0.25, Math.PI - 0.25, false).strokePath();
  const oh = scene.add.circle(0, R * 0.3, R * 0.14, 0x1e2a3d).setVisible(false);
  const hurt = scene.add.circle(0, 0, R, 0xe5484d, 0);
  const body = scene.add.container(0, 0, [
    scene.add.circle(0, 0, R * 1.14, c.main, 0.16),
    scene.add.circle(0, 5, R, c.dark),
    scene.add.circle(0, 0, R, c.main),
    scene.add.circle(-R * 0.35, -R * 0.55, R * 0.2, c.light, 0.8),
    hurt,
    ...eyes,
    smile,
    oh,
  ]);
  const root = scene.add.container(0, 0, [shadow, body]).setDepth(10);
  return { root, body, pupils: [eyes[1] as Phaser.GameObjects.Arc, eyes[3] as Phaser.GameObjects.Arc], smile, oh, hurt };
}

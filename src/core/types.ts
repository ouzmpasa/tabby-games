export type PlayerId = 0 | 1;
export const PLAYERS: readonly PlayerId[] = [0, 1];

export const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Zone extends Rect {
  player: PlayerId;
}

/** Registered by each game in src/games/<id>/index.ts. */
export interface GameModule {
  id: string;
  /** i18n key for the title shown on Home (used when `title` is not given). */
  titleKey: string;
  /** Self-contained title, so a game needs no entry in i18n.ts. */
  title?: { en: string; nl: string };
  /**
   * Draws the Home tile icon. The graphics object's origin is the tile's top-left corner; the tile is 268x300
   * and the icon area is roughly x 28..240, y 40..150. Use COLORS / PLAYER from core/theme.
   */
  drawIcon?: (g: Phaser.GameObjects.Graphics) => void;
  /** Accent colour of the Home card. */
  color: number;
  /** Phaser scene key that starts the game. */
  sceneKey: string;
  /** Scene classes to add to the Phaser game. */
  scenes: Array<new () => Phaser.Scene>;
}

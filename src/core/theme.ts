import type { PlayerId } from './types';

/**
 * Theme "dusk" (matches the Claude Design canvas). Single source of truth for colours and fonts.
 * Colours are 0xRRGGBB numbers for Phaser; use hex() for CSS strings.
 */
export const COLORS = {
  bg: 0x455873,
  surface: 0x2c3b55, // cards, panels
  tile: 0x3a4c6b,
  inset: 0x243148, // rink / recessed areas, also the modal dimmer
  border: 0x6a7fa0,
  line: 0x5f7396,
  dots: 0x33445f, // rink dots / holes
  text: 0xf5f7fa,
  text2: 0xe1e8f2,
  muted: 0xb9c5d8,
  icon: 0x93a4c0,
  btnBg: 0xf5f7fa, // primary button background (white, NOT yellow)
  btnFg: 0x1e2a3d, // primary button foreground
  puck: 0xf5f7fa,
  puckRing: 0xb9c4d6,
} as const;

export interface PlayerPalette {
  main: number;
  dark: number;
  light: number;
  /** Text colour on dark surfaces. */
  onDark: number;
}

export const PLAYER: Record<PlayerId, PlayerPalette> = {
  0: { main: 0xff8a3d, dark: 0xe06e22, light: 0xffa766, onDark: 0xffb878 }, // orange, LEFT end
  1: { main: 0x3a6ff7, dark: 0x2954d6, light: 0x6b93ff, onDark: 0xb8cfff }, // blue, RIGHT end
};

export const PLAYER_COLOR: Record<PlayerId, number> = { 0: PLAYER[0].main, 1: PLAYER[1].main };

/** Card look: 28-32 px radius, soft shadow `0 14px 34px rgba(8,14,26,0.3)`. */
export const CARD = {
  radius: 30,
  shadow: { color: 0x080e1a, alpha: 0.3, offsetY: 14, spread: 34 },
} as const;

/** Round pause button diameter. */
export const PAUSE_SIZE = 64;

export const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

/** Body text (weights 500/600/700). */
export const FONT_BODY = "'Barlow', system-ui, sans-serif";
/** Big numbers, titles and scores (weights 600/700). */
export const FONT_DISPLAY = "'Barlow Condensed', 'Barlow', system-ui, sans-serif";

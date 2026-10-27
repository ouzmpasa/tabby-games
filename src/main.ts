import Phaser from 'phaser';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';
import { H, W } from './core/layout';
import { COLORS, hex } from './core/theme';
import { gameScenes } from './games';
import { BootScene } from './scenes/BootScene';
import { DevSpikeScene } from './scenes/DevSpikeScene';
import { HomeScene } from './scenes/HomeScene';
import { PauseScene } from './scenes/PauseScene';
import { PreloadScene } from './scenes/PreloadScene';
import { SplashScene } from './scenes/SplashScene';
import { WinScene } from './scenes/WinScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: W,
  height: H,
  backgroundColor: hex(COLORS.bg),
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  input: { activePointers: 5, touch: { capture: true } },
  scene: [BootScene, PreloadScene, SplashScene, HomeScene, PauseScene, WinScene, DevSpikeScene, ...gameScenes()],
});

// Debug hook used by Playwright tests and on-device debugging.
declare global {
  interface Window {
    __tabby: { game: Phaser.Game; scenes: () => string[] };
  }
}
window.__tabby = {
  game,
  scenes: () => game.scene.getScenes(true).map((s) => s.scene.key),
};

if (Capacitor.isNativePlatform()) {
  StatusBar.hide().catch(() => {});
}

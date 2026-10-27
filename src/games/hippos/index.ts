import type Phaser from 'phaser';
import { PLAYER } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { HIPPOS } from './config';
import { HipposScene } from './HipposScene';

/** Home tile icon: a little pond with marbles, an orange hippo with an open mouth on the left and a blue one on the right. */
function drawIcon(g: Phaser.GameObjects.Graphics): void {
  g.fillStyle(0x080e1a, 0.35).fillEllipse(134, 104, 140, 82);
  g.fillStyle(0xc9b184, 1).fillEllipse(134, 98, 140, 82);
  g.fillStyle(0x2f7ea6, 1).fillEllipse(134, 98, 124, 68);
  g.fillStyle(0x4aaed0, 0.7).fillEllipse(134, 98, 80, 40);
  const ball = (x: number, y: number, c: number): void => {
    g.fillStyle(c, 1).fillCircle(x, y, 11);
    g.fillStyle(0xffffff, 0.8).fillCircle(x - 4, y - 4, 3.5);
  };
  ball(120, 92, 0xff4d6d);
  ball(146, 104, 0x4ade80);
  ball(138, 86, 0xffc928);
  ball(112, 110, 0xb86bff);
  const hippo = (cx: number, dir: 1 | -1, main: number, light: number, dark: number): void => {
    g.fillStyle(main, 1).fillEllipse(cx - dir * 4, 98, 56, 72); // body
    g.fillStyle(light, 1).fillEllipse(cx + dir * 4, 98, 30, 50);
    const hx = cx + dir * 38;
    g.fillStyle(main, 1).fillEllipse(hx, 98, 54, 52); // head
    g.fillStyle(0x5a1f2e, 1).fillEllipse(hx + dir * 20, 98, 20, 34); // open mouth
    g.fillStyle(0xffffff, 1).fillCircle(hx - dir * 6, 80, 7).fillCircle(hx - dir * 6, 116, 7);
    g.fillStyle(0x1e2a3d, 1).fillCircle(hx - dir * 4, 80, 3.5).fillCircle(hx - dir * 4, 116, 3.5);
    g.fillStyle(dark, 1).fillCircle(hx - dir * 22, 70, 6).fillCircle(hx - dir * 22, 126, 6);
  };
  hippo(52, 1, PLAYER[0].main, PLAYER[0].light, PLAYER[0].dark);
  hippo(216, -1, PLAYER[1].main, PLAYER[1].light, PLAYER[1].dark);
}

export const hipposGame: GameModule = {
  id: HIPPOS.id,
  titleKey: 'hipposTitle',
  title: { en: 'Hungry Hippos', nl: 'Hongerige Nijlpaarden' },
  drawIcon,
  color: PLAYER[1].main,
  sceneKey: HIPPOS.sceneKey,
  scenes: [HipposScene],
};

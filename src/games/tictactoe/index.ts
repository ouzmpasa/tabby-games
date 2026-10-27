import type Phaser from 'phaser';
import { PLAYER } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { TICTACTOE } from './config';
import { TicTacToeScene } from './TicTacToeScene';
import { drawCross, drawNought } from './marks';

/** Home tile icon: a 3x3 grid with a few orange circles and blue crosses. */
function drawIcon(g: Phaser.GameObjects.Graphics): void {
  const x0 = 74;
  const y0 = 34;
  const c = 40;
  g.lineStyle(4, 0x93a4c0, 1);
  for (let i = 1; i < 3; i++) {
    g.lineBetween(x0 + i * c, y0 + 4, x0 + i * c, y0 + 3 * c - 4);
    g.lineBetween(x0 + 4, y0 + i * c, x0 + 3 * c - 4, y0 + i * c);
  }
  const at = (col: number, row: number) => [x0 + (col + 0.5) * c, y0 + (row + 0.5) * c] as const;
  for (const [col, row] of [[0, 0], [1, 1], [2, 2]] as const) {
    const [x, y] = at(col, row);
    drawNought(g, x, y, 10, 6, PLAYER[0].main);
  }
  for (const [col, row] of [[2, 0], [0, 2]] as const) {
    const [x, y] = at(col, row);
    drawCross(g, x, y, 9, 6, PLAYER[1].main);
  }
}

export const tictactoeGame: GameModule = {
  id: TICTACTOE.id,
  titleKey: 'tictactoeTitle',
  title: { en: 'Tic-Tac-Toe', nl: 'Boter, Kaas en Eieren' },
  color: PLAYER[0].main,
  sceneKey: TICTACTOE.sceneKey,
  scenes: [TicTacToeScene],
  drawIcon,
};

import { PLAYER } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { CONNECT4 } from './config';
import { Connect4Scene } from './Connect4Scene';

export const connect4Game: GameModule = {
  id: CONNECT4.id,
  titleKey: 'connect4Title',
  color: PLAYER[1].main,
  sceneKey: CONNECT4.sceneKey,
  scenes: [Connect4Scene],
};

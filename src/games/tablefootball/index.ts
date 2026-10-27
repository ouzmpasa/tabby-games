import { PLAYER } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { TABLEFOOTBALL } from './config';
import { TableFootballScene } from './TableFootballScene';

export const tableFootballGame: GameModule = {
  id: TABLEFOOTBALL.id,
  titleKey: 'tablefootballTitle',
  color: PLAYER[1].main,
  sceneKey: TABLEFOOTBALL.sceneKey,
  scenes: [TableFootballScene],
};

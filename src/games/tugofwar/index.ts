import { PLAYER } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { TUGOFWAR } from './config';
import { TugOfWarScene } from './TugOfWarScene';

export const tugOfWarGame: GameModule = {
  id: TUGOFWAR.id,
  titleKey: 'tugofwarTitle',
  color: PLAYER[1].main,
  sceneKey: TUGOFWAR.sceneKey,
  scenes: [TugOfWarScene],
};

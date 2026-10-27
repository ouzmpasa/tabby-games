import { PLAYER } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { BinBasketballScene } from './BinBasketballScene';
import { BINBASKETBALL } from './config';

export const binBasketballGame: GameModule = {
  id: BINBASKETBALL.id,
  titleKey: 'binbasketballTitle',
  color: PLAYER[1].main,
  sceneKey: BINBASKETBALL.sceneKey,
  scenes: [BinBasketballScene],
};

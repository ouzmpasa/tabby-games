import { PLAYER } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { AIRHOCKEY } from './config';
import { AirHockeyScene } from './AirHockeyScene';

export const airHockeyGame: GameModule = {
  id: AIRHOCKEY.id,
  titleKey: 'airhockeyTitle',
  color: PLAYER[0].main,
  sceneKey: AIRHOCKEY.sceneKey,
  scenes: [AirHockeyScene],
};

import { PLAYER } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { FISHING } from './config';
import { FishingScene } from './FishingScene';
import { drawFishingIcon } from './pieces';

export const fishingGame: GameModule = {
  id: FISHING.id,
  titleKey: 'fishingTitle',
  title: { en: 'Fishing Pond', nl: 'Vissen' },
  color: PLAYER[1].main,
  sceneKey: FISHING.sceneKey,
  scenes: [FishingScene],
  drawIcon: drawFishingIcon,
};

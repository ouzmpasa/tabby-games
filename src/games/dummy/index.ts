import { COLORS } from '../../core/theme';
import type { GameModule } from '../../core/types';
import { DUMMY } from './config';
import { DummyScene } from './Scene';

export const dummyGame: GameModule = {
  id: DUMMY.id,
  titleKey: 'dummyTitle',
  color: COLORS.btnBg,
  sceneKey: DUMMY.sceneKey,
  scenes: [DummyScene],
};

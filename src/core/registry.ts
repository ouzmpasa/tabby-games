import { settings } from './settings';
import { t, type StringKey } from './i18n';
import type { GameModule } from './types';

const games: GameModule[] = [];

export function registerGame(mod: GameModule): void {
  if (games.some((g) => g.id === mod.id)) throw new Error(`game already registered: ${mod.id}`);
  games.push(mod);
}

export const getGames = (): readonly GameModule[] => games;
export const getGame = (id: string): GameModule | undefined => games.find((g) => g.id === id);

/** Localised title of a game. */
export const gameTitle = (g: GameModule): string => (g.title ? g.title[settings.get().lang === 'nl' ? 'nl' : 'en'] : t(g.titleKey as StringKey));

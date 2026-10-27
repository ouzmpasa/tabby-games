import { registerGame, getGames } from '../core/registry';
import type { GameModule } from '../core/types';

/**
 * Every src/games/<id>/index.ts that exports a GameModule is registered automatically (no list to edit).
 * Home order: ORDER first, then the rest alphabetically; the dev-only dummy game stays last.
 */
const ORDER = ['airhockey', 'tugofwar', 'tablefootball', 'connect4', 'binbasketball'];
const modules = import.meta.glob<Record<string, unknown>>('./*/index.ts', { eager: true });

const isGame = (v: unknown): v is GameModule => !!v && typeof v === 'object' && 'sceneKey' in v && 'scenes' in v && 'id' in v;
const found: GameModule[] = Object.values(modules).flatMap((m) => Object.values(m).filter(isGame));
const rank = (g: GameModule): number => (g.id === 'dummy' ? 1e6 : ORDER.includes(g.id) ? ORDER.indexOf(g.id) : 1000);
found.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id));
found.forEach(registerGame);

export const gameScenes = () => getGames().flatMap((g) => g.scenes);

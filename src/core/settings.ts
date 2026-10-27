import { storage } from './storage';

export type Lang = 'en' | 'nl';
export interface Settings {
  sound: boolean;
  haptics: boolean;
  lang: Lang;
}

const DEFAULTS: Settings = { sound: true, haptics: true, lang: 'en' };

let current: Settings = { ...DEFAULTS, ...storage.get<Partial<Settings>>('settings', {}) };

export const settings = {
  get: (): Readonly<Settings> => current,
  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    current = { ...current, [key]: value };
    storage.set('settings', current);
  },
};

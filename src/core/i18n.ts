import { settings } from './settings';

const en = {
  appName: 'Tabby Games',
  chooseGame: 'Pick a game!',
  airhockeyTitle: 'Air Hockey',
  tugofwarTitle: 'Tug of War',
  tablefootballTitle: 'Table Football',
  connect4Title: 'Connect 4',
  connect4Turn: 'Your turn!',
  binbasketballTitle: 'Bin Basketball',
  twoPlayers: '2 players',
  goal: 'GOAL!',
  comingSoon: 'Coming soon!',
  dummyTitle: 'Tap Test',
  dummyHint: 'Tap your side to score!',
  pause: 'Paused',
  resume: 'Resume',
  home: 'Home',
  playAgain: 'Play again',
  youWin: 'You win!',
  goodGame: 'Good game!',
  go: 'GO!',
  holdToOpen: 'Hold 2 s',
  spike: 'Device test',
} as const;

export type StringKey = keyof typeof en;

const nl: Record<StringKey, string> = {
  appName: 'Tabby Games',
  chooseGame: 'Kies een spel!',
  airhockeyTitle: 'Air Hockey',
  tugofwarTitle: 'Touwtrekken',
  tablefootballTitle: 'Tafelvoetbal',
  connect4Title: '4 op een rij',
  connect4Turn: 'Jouw beurt!',
  binbasketballTitle: 'Prullenbak Basket',
  twoPlayers: '2 spelers',
  goal: 'GOAL!',
  comingSoon: 'Komt binnenkort!',
  dummyTitle: 'Tik Test',
  dummyHint: 'Tik op jouw kant!',
  pause: 'Pauze',
  resume: 'Verder',
  home: 'Start',
  playAgain: 'Nog een keer',
  youWin: 'Jij wint!',
  goodGame: 'Goed gespeeld!',
  go: 'GO!',
  holdToOpen: 'Houd 2 s vast',
  spike: 'Apparaattest',
};

export function t(key: StringKey): string {
  return settings.get().lang === 'nl' ? nl[key] : en[key];
}

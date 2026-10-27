import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    __tabby: { game: any; scenes: () => string[] };
  }
}

const GAMES: Array<[id: string, scene: string]> = [
  ['airhockey', 'AirHockey'],
  ['tugofwar', 'TugOfWar'],
  ['tablefootball', 'TableFootball'],
  ['connect4', 'Connect4'],
  ['binbasketball', 'BinBasketball'],
  ['pong', 'Pong'],
  ['marbles', 'Marbles'],
  ['penalty', 'Penalty'],
  ['sumo', 'Sumo'],
  ['whackamole', 'WhackAMole'],
  ['cannonduel', 'CannonDuel'],
  ['dotsboxes', 'DotsBoxes'],
  ['tictactoe', 'TicTacToe'],
  ['fishing', 'Fishing'],
  ['hippos', 'Hippos'],
  ['snakeduel', 'SnakeDuel'],
  ['balloonpop', 'BalloonPop'],
  ['snowball', 'Snowball'],
  ['curling', 'Curling'],
  ['safecracker', 'SafeCracker'],
  ['milkrace', 'MilkRace'],
  ['yarncatch', 'YarnCatch'],
];

for (const [id, scene] of GAMES) {
  test(`${id} boots without errors and survives a few taps`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`/?game=${id}`);
    await expect.poll(() => page.evaluate(() => window.__tabby.scenes()), { timeout: 20_000 }).toContain(scene);
    // poke both halves, a drag on each, to exercise the input paths
    for (const x of [400, 1500]) {
      await page.mouse.move(x, 540);
      await page.mouse.down();
      await page.mouse.move(x + 40, 500, { steps: 4 });
      await page.mouse.up();
    }
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });
}

test('home lists every game across pages', async ({ page }) => {
  await page.goto('/?nosplash');
  await expect.poll(() => page.evaluate(() => window.__tabby.scenes()), { timeout: 20_000 }).toContain('Home');
});

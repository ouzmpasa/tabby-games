import { expect, test, type CDPSession, type Page } from '@playwright/test';

declare global {
  interface Window {
    __tabby: { game: any; scenes: () => string[] };
  }
}

const touch = (cdp: CDPSession, type: string, pts: { x: number; y: number; id: number }[]) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
const scenes = (page: Page) => page.evaluate(() => window.__tabby.scenes());
const sim = (page: Page) =>
  page.evaluate(() => {
    const s = window.__tabby.game.scene.getScene('TableFootball');
    return { phase: s.phase, rods: s.sim.rods.map((r: any) => r.y), ball: { ...s.sim.ball }, scores: [...s.match.scores] };
  });

async function openGame(page: Page) {
  await page.goto('/?game=tablefootball');
  await expect.poll(() => scenes(page)).toContain('TableFootball');
  await expect.poll(async () => (await sim(page)).phase, { timeout: 10_000 }).toBe('play');
}

test('two simultaneous fingers each slide one rod of their own player', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => Object.assign(window.__tabby.game.scene.getScene('TableFootball').sim.ball, { x: 960, y: 200, vx: 0, vy: 0 }));
  const cdp = await page.context().newCDPSession(page);
  const before = await sim(page);
  // player 0 grabs the forward rod (x = 325 + 560), player 1 grabs the keeper (x = 1595 - 80)
  await touch(cdp, 'touchStart', [{ x: 885, y: 540, id: 1 }, { x: 1515, y: 540, id: 2 }]);
  await touch(cdp, 'touchMove', [{ x: 885, y: 450, id: 1 }, { x: 1515, y: 650, id: 2 }]);
  await page.waitForTimeout(400);
  const after = await sim(page);
  expect(after.rods[2]).toBeLessThan(before.rods[2] - 40);
  expect(after.rods[3]).toBeGreaterThan(before.rods[3] + 40);
  await touch(cdp, 'touchEnd', []);
});

test('a scripted shot into the right goal scores for player 0', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    const s = window.__tabby.game.scene.getScene('TableFootball');
    s.sim.rods.forEach((r: any) => (r.x = -5000));
    Object.assign(s.sim.ball, { x: 1700, y: 540, vx: 1200, vy: 0 });
  });
  await expect.poll(async () => (await sim(page)).scores, { timeout: 5000 }).toEqual([1, 0]);
  await expect.poll(async () => (await sim(page)).phase, { timeout: 10_000 }).toBe('play');
});

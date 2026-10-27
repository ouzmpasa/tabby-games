import { expect, test, type CDPSession, type Page } from '@playwright/test';

declare global {
  interface Window {
    __tabby: { game: any; scenes: () => string[] };
  }
}

const touch = (cdp: CDPSession, type: string, pts: { x: number; y: number; id: number }[]) =>
  cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });

const scenes = (page: Page) => page.evaluate(() => window.__tabby.scenes());
const scores = (page: Page) =>
  page.evaluate(() => (window.__tabby.game.scene.getScene('DummyGame') as any).match.scores as number[]);

async function openGame(page: Page) {
  await page.goto('/?game=dummy');
  await expect.poll(() => scenes(page)).toContain('DummyGame');
  // wait for 3-2-1-GO to finish
  await expect.poll(() => page.evaluate(() => (window.__tabby.game.scene.getScene('DummyGame') as any).running), { timeout: 10_000 }).toBe(true);
}

test('4 simultaneous touches are assigned 2 + 2 to the right players', async ({ page }) => {
  await openGame(page);
  const cdp = await page.context().newCDPSession(page);
  // 2 fingers on the left half, 2 on the right half, all down together.
  const pts = [
    { x: 300, y: 200, id: 1 },
    { x: 500, y: 800, id: 2 },
    { x: 1400, y: 300, id: 3 },
    { x: 1700, y: 700, id: 4 },
  ];
  await touch(cdp, 'touchStart', pts);
  await expect.poll(() => scores(page)).toEqual([2, 2]);
  const owners = await page.evaluate(() => (window.__tabby.game.scene.getScene('DummyGame') as any).players.tracker.activeOwners());
  expect(owners).toEqual([0, 0, 1, 1]);
  await touch(cdp, 'touchEnd', []);
});

test('a finger stays with the player it went down for when it slides across', async ({ page }) => {
  await openGame(page);
  const cdp = await page.context().newCDPSession(page);
  await touch(cdp, 'touchStart', [{ x: 300, y: 500, id: 1 }]);
  await touch(cdp, 'touchMove', [{ x: 1500, y: 500, id: 1 }]);
  const owners = await page.evaluate(() => (window.__tabby.game.scene.getScene('DummyGame') as any).players.tracker.activeOwners());
  expect(owners).toEqual([0]);
  await touch(cdp, 'touchEnd', []);
});

test('loop: Boot > Preload > Home > Game > Win (dummy game via ?game=dummy)', async ({ page }) => {
  await page.goto('/?game=dummy');
  await expect.poll(() => scenes(page)).toContain('DummyGame');
  await expect.poll(() => page.evaluate(() => (window.__tabby.game.scene.getScene('DummyGame') as any).running), { timeout: 10_000 }).toBe(true);
  for (let i = 0; i < 5; i++) await page.mouse.click(400, 300); // player 0 taps their half
  await expect.poll(() => scenes(page), { timeout: 10_000 }).toContain('Win');
  expect(await scores(page)).toEqual([5, 0]);
});

import { expect, test, type Page } from '@playwright/test';
import { BINBASKETBALL as C } from '../../src/games/binbasketball/config';

declare global {
  interface Window {
    __tabby: { game: any; scenes: () => string[] };
  }
}

const scenes = (page: Page) => page.evaluate(() => window.__tabby.scenes());
const state = (page: Page) =>
  page.evaluate(() => {
    const s = window.__tabby.game.scene.getScene('BinBasketball');
    return { scores: [...s.match.scores], phases: s.balls.map((b: any) => b.phase), running: s.running };
  });

test('a scripted throw into the bin scores for player 0', async ({ page }) => {
  await page.goto('/?game=binbasketball');
  await expect.poll(() => scenes(page)).toContain('BinBasketball');
  await expect.poll(async () => (await state(page)).running, { timeout: 10_000 }).toBe(true);
  // aim at where the bin will be when the ball lands (bin: triangle wave along its track, speed from the game config)
  await page.evaluate((c) => {
    const s = window.__tabby.game.scene.getScene('BinBasketball');
    const dur = 700;
    const span = c.binMaxY - c.binMinY;
    const d = ((s.binTime + dur) / 1000) * c.binSpeed;
    const m = d % (2 * span);
    const y = c.binMinY + (m <= span ? m : 2 * span - m);
    s.throwBall(0, { to: { x: c.binX, y }, distance: 700, durationMs: dur });
  }, { binSpeed: C.binSpeed, binMinY: C.binMinY, binMaxY: C.binMaxY, binX: C.binX });
  await expect.poll(async () => (await state(page)).scores[0], { timeout: 5000 }).toBe(1);
});

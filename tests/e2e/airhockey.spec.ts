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
    const s = window.__tabby.game.scene.getScene('AirHockey');
    return { phase: s.phase, m0: { ...s.sim.mallets[0] }, m1: { ...s.sim.mallets[1] }, puck: { ...s.sim.puck }, scores: [...s.match.scores] };
  });

async function openGame(page: Page) {
  await page.goto('/?game=airhockey');
  await expect.poll(() => scenes(page)).toContain('AirHockey');
  await expect.poll(async () => (await sim(page)).phase, { timeout: 10_000 }).toBe('play');
}

test('home shows Air Hockey first and starts it', async ({ page }) => {
  await page.goto('/?nosplash');
  await expect.poll(() => scenes(page)).toContain('Home');
  await page.mouse.click(380, 350); // first tile on page 1 = Air Hockey
  await expect.poll(() => scenes(page)).toContain('AirHockey');
});

test('two simultaneous touches (one per half) move both mallets', async ({ page }) => {
  await openGame(page);
  const cdp = await page.context().newCDPSession(page);
  await touch(cdp, 'touchStart', [{ x: 500, y: 300, id: 1 }, { x: 1400, y: 800, id: 2 }]);
  await expect.poll(async () => (await sim(page)).m0.y).toBeCloseTo(300, -1);
  let s = await sim(page);
  expect(s.m0.x).toBeCloseTo(500, -1);
  expect(s.m1.x).toBeCloseTo(1400, -1);
  expect(s.m1.y).toBeCloseTo(800, -1);
  // drag each finger across the centre line: mallets stay in their own half
  await touch(cdp, 'touchMove', [{ x: 1500, y: 300, id: 1 }, { x: 400, y: 800, id: 2 }]);
  await page.waitForTimeout(400);
  s = await sim(page);
  expect(s.m0.x).toBeLessThan(960);
  expect(s.m1.x).toBeGreaterThan(960);
  // a third finger on a half that already has a mallet finger does not hijack the mallet
  await touch(cdp, 'touchStart', [{ x: 1500, y: 300, id: 1 }, { x: 400, y: 800, id: 2 }, { x: 200, y: 900, id: 3 }]);
  await page.waitForTimeout(300);
  expect((await sim(page)).m0.y).toBeLessThan(500);
  await touch(cdp, 'touchEnd', []);
});

test('a scripted shot into the right goal scores for player 0 and updates the badge', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    const s = window.__tabby.game.scene.getScene('AirHockey');
    s.sim.mallets[0].y = 250;
    s.sim.mallets[1].y = 250;
    Object.assign(s.sim.puck, { x: 1000, y: 540, vx: 1200, vy: 0 });
  });
  await expect.poll(async () => (await sim(page)).scores, { timeout: 5000 }).toEqual([1, 0]);
  expect(await page.evaluate(() => window.__tabby.game.scene.getScene('AirHockey').badges[0].list[1].text)).toBe('1');
  // next serve goes toward the player who conceded (player 1, right side)
  await expect.poll(async () => (await sim(page)).phase, { timeout: 10_000 }).toBe('play');
  expect((await sim(page)).puck.vx).toBeGreaterThan(0);
});

test('scoring up to the win target ends the match on the Win screen', async ({ page }) => {
  test.setTimeout(240_000);
  await openGame(page);
  const target: number = await page.evaluate(() => window.__tabby.game.scene.getScene('AirHockey').match.target);
  for (let i = 0; i < target; i++) {
    await expect.poll(async () => (await sim(page)).phase, { timeout: 10_000 }).toBe('play');
    await page.evaluate(() => {
      const s = window.__tabby.game.scene.getScene('AirHockey');
      s.sim.bumpers = []; // later points can have a post in the middle; keep the scripted shot clear
      s.sim.mallets[0].y = 250;
      s.sim.mallets[1].y = 250;
      Object.assign(s.sim.puck, { x: 1000, y: 540, vx: 1200, vy: 0 });
    });
    await expect.poll(async () => (await sim(page)).scores[0], { timeout: 5000 }).toBe(i + 1);
  }
  await expect.poll(() => scenes(page), { timeout: 10_000 }).toContain('Win');
});

test('pause freezes the puck and resume continues', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => Object.assign(window.__tabby.game.scene.getScene('AirHockey').sim.puck, { x: 700, y: 300, vx: 100, vy: 0 }));
  await page.mouse.click(40, 1040); // player 0 pause button (bottom-left corner; the touch target is bigger than the drawn button)
  await expect.poll(() => scenes(page)).toContain('Pause');
  const a = (await sim(page)).puck;
  await page.waitForTimeout(500);
  const b = (await sim(page)).puck;
  expect(b.x).toBe(a.x);
  await page.mouse.click(400, 380); // Resume (player 0 orientation)
  await expect.poll(() => scenes(page)).not.toContain('Pause');
  await expect.poll(async () => (await sim(page)).puck.x).not.toBe(a.x);
});

test('dev keyboard path still drives player 1', async ({ page }) => {
  await page.goto('/?game=airhockey&dev=1');
  await expect.poll(() => scenes(page)).toContain('AirHockey');
  await expect.poll(async () => (await sim(page)).phase, { timeout: 10_000 }).toBe('play');
  const before = (await sim(page)).m1;
  await page.keyboard.down('Space');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('Space');
  const after = (await sim(page)).m1;
  expect(after.y).toBeLessThan(before.y - 50);
});

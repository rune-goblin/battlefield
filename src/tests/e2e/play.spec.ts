import type { Page } from '@playwright/test';

import { activation, notation, type BattleState } from '../../engine/index';
import { beginBattle, endBattle, openFromSceneControl, windowOf } from './fixtures/battle-window';
import { test, expect, MODULE_ID, collectErrors } from './fixtures/foundry-clients';

interface Point { x: number; y: number }

const battleOn = (page: Page): Promise<BattleState> => page.evaluate(
  (id) => JSON.parse((window as any).game.settings.get(id, 'session')).battle,
  MODULE_ID,
);

const screenOf = (page: Page, cell: string): Promise<Point> => page.evaluate(
  ([id, c]) => (window as any).game.modules.get(id).api.screenOf(c),
  [MODULE_ID, cell],
);

const cellOf = (b: BattleState, unit: string): string => notation(b.units.find((u) => u.id === unit)!.square);

test.describe('An activation on two clients', () => {
  test('the GM drags a unit one hex, then spends Guard off the ring', async ({ gmPage, playerPage }) => {
    test.setTimeout(240_000);
    const gmErrors = collectErrors(gmPage);
    const playerErrors = collectErrors(playerPage);
    const gm = await openFromSceneControl(gmPage);
    const rail = gm.locator('nav.wizard');

    // A run that died mid-battle leaves one open in the world clone.
    if (!(await rail.isVisible())) await endBattle(gm);
    await beginBattle(gm);
    const player = windowOf(playerPage);
    await expect(player.locator('.battlefield-root')).toBeVisible();

    await gm.locator('.army-reel .unit-card').first().click();
    await expect(gm.locator('.army-reel .unit-card.on')).toBeVisible();
    const selected = await battleOn(gmPage);
    const unit = selected.active!;
    const from = cellOf(selected, unit);
    const [to] = [...activation(selected, unit)!.moves].sort(([, x], [, y]) => x.feet - y.feet)[0];
    const events = gm.locator('.battle-log .event');
    const before = await events.count();

    // The reel centres the board on its pick, and the cell moves under the pointer until it lands.
    await expect.poll(async () => {
      const first = await screenOf(gmPage, from);
      await gmPage.waitForTimeout(150);
      const second = await screenOf(gmPage, from);
      return Math.hypot(first.x - second.x, first.y - second.y);
    }).toBeLessThan(0.5);

    const start = await screenOf(gmPage, from);
    const end = await screenOf(gmPage, to);
    await gmPage.mouse.move(start.x, start.y);
    await gmPage.mouse.down();
    await gmPage.mouse.move(end.x, end.y, { steps: 12 });
    await gmPage.mouse.up();
    await gm.locator('.popup-foot .primary').click();
    await expect.poll(async () => cellOf(await battleOn(gmPage), unit)).toBe(to);

    const here = await screenOf(gmPage, to);
    await gmPage.mouse.click(here.x, here.y);
    const slices = gm.locator('.radial .slice');
    await expect(slices).toHaveCount(6);
    await slices.nth(5).click();
    await gm.locator('.popup-foot .primary').click();
    await expect.poll(async () => (await battleOn(gmPage)).units.find((u) => u.id === unit)!.guard).toBeTruthy();

    await expect(events).toHaveCount(before + 2);
    await expect(player.locator('.army-reel .unit-card.on .square')).toContainText(to);
    expect(cellOf(await battleOn(playerPage), unit)).toBe(to);

    await endBattle(gm);
    await expect(rail).toBeVisible();
    await gmPage.evaluate((id) => (window as any).game.modules.get(id).api.close(), MODULE_ID);
    expect(gmErrors).toEqual([]);
    expect(playerErrors).toEqual([]);
  });
});

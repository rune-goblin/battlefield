import { activation } from '../../engine/index';
import { beginBattle, endBattle, openFromSceneControl, shot, windowOf } from './fixtures/battle-window';
import { battleOn, cellOf, drag, screenOf, settle } from './fixtures/board';
import { test, expect, MODULE_ID, collectErrors } from './fixtures/foundry-clients';

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

    await settle(gmPage, from);
    await shot(gmPage, 'W9-ring-active');

    await drag(gmPage, await screenOf(gmPage, from), await screenOf(gmPage, to));
    await gm.locator('.popup-foot .primary').click();
    await expect.poll(async () => cellOf(await battleOn(gmPage), unit)).toBe(to);
    await shot(gmPage, 'W9-token-move');

    const here = await screenOf(gmPage, to);
    await gmPage.mouse.click(here.x, here.y);
    const slices = gm.locator('.radial .slice');
    await expect(slices).toHaveCount(6);
    await shot(gmPage, 'W9-ring-radial');
    await slices.nth(5).click();
    await gm.locator('.popup-foot .primary').click();
    await expect.poll(async () => (await battleOn(gmPage)).units.find((u) => u.id === unit)!.guard).toBeTruthy();

    await expect(events).toHaveCount(before + 2);
    await expect(player.locator('.army-reel .unit-card.on .square')).toContainText(to);
    expect(cellOf(await battleOn(playerPage), unit)).toBe(to);
    await shot(playerPage, 'W9-token-move-player');

    await endBattle(gm);
    await expect(rail).toBeVisible();
    await gmPage.evaluate((id) => (window as any).game.modules.get(id).api.close(), MODULE_ID);
    expect(gmErrors).toEqual([]);
    expect(playerErrors).toEqual([]);
  });
});

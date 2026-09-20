import type { Locator, Page } from '@playwright/test';
import { endBattle, openFromSceneControl, windowOf } from './fixtures/battle-window';
import { test, expect, MODULE_ID, collectErrors } from './fixtures/foundry-clients';

const STEPS = [
  'Battlefield', 'Paint the map', 'Siege engines', 'Sides', 'Attacking army', 'Defending army', 'Review and begin',
];

const chipOf = (page: Page): Locator => page.locator('#ui-right-column-1 .battlefield-chip');

test.describe('A battle on two clients', () => {
  test('the GM walks the wizard, starts the battle and ends it', async ({ gmPage, playerPage }) => {
    // Three software-GL canvases share the machine, and the walk alone is seven stage loads.
    test.setTimeout(240_000);
    const gmErrors = collectErrors(gmPage);
    const playerErrors = collectErrors(playerPage);
    const gm = await openFromSceneControl(gmPage);
    const rail = gm.locator('nav.wizard');

    // A run that died mid-battle leaves one open in the world clone.
    if (!(await rail.isVisible())) await endBattle(gm);
    await expect(rail).toBeVisible();

    // Foundry builds a window's header menu once, so the call lives in the app's own top bar.
    const dismiss = gm.getByRole('button', { name: 'Dismiss players' });
    // A run that died after the call leaves the table called in the world clone.
    if (await dismiss.isVisible()) await dismiss.click();
    await gm.getByRole('button', { name: 'Call players' }).click();
    await expect(windowOf(playerPage).locator('.battlefield-root')).toBeVisible();
    await dismiss.click();
    await expect(windowOf(playerPage)).toBeHidden();
    await expect(gm.getByRole('button', { name: 'Call players' })).toBeVisible();

    for (const label of STEPS) {
      const step = rail.locator('li', { has: gmPage.locator('.label', { hasText: label }) });
      await step.locator('button').click();
      await expect(step).toHaveClass(/\bon\b/);

      // Foundry's `button` rule sets a fixed height and a row flex; leaked in, it crushed the
      // hint onto the label.
      const box = await step.evaluate((li) => {
        const rect = (sel: string) => li.querySelector(sel)!.getBoundingClientRect();
        const button = li.querySelector('button')!;
        return { label: rect('.label'), hint: rect('.hint'), button: button.getBoundingClientRect() };
      });
      expect(box.hint.top).toBeGreaterThanOrEqual(box.label.bottom - 1);
      expect(box.button.bottom).toBeGreaterThanOrEqual(box.hint.bottom);
    }

    const begin = rail.getByRole('button', { name: 'Begin', exact: true });
    await expect(begin, 'the world clone holds no deployed setup; deploy both armies once by hand').toBeEnabled();
    await begin.click();

    await expect(rail).toBeHidden();
    const player = windowOf(playerPage);
    await expect(player.locator('.battlefield-root')).toBeVisible();
    // The chip is the way back to a shut window, and an open one hides it.
    await expect(chipOf(playerPage)).toBeHidden();

    const art = gm.locator('.army-reel img').first();
    await expect(art).toBeVisible();
    expect(await art.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);

    await player.locator('[data-action="close"]').click();
    await expect(player).toBeHidden();
    await expect(chipOf(playerPage)).toBeVisible();
    // The window opened once: a later record must leave it shut.
    await gmPage.waitForTimeout(1_000);
    await expect(player).toBeHidden();
    await chipOf(playerPage).click();
    await expect(player.locator('.battlefield-root')).toBeVisible();
    await expect(chipOf(playerPage)).toBeHidden();

    await endBattle(gm);
    await expect(rail).toBeVisible();
    await expect(chipOf(playerPage)).toBeHidden();
    await expect(player).toBeHidden();

    await gmPage.evaluate((id) => (window as any).game.modules.get(id).api.close(), MODULE_ID);
    expect(gmErrors).toEqual([]);
    expect(playerErrors).toEqual([]);
  });
});

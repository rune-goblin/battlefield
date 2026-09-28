import { test, expect, MODULE_ID, collectErrors } from './fixtures/foundry-clients';

test.describe('Module launches', () => {
  // With ReignMaker on, the GM's scene control picks a hex (table.spec.ts checks the control), so
  // the window opens through the module API.
  test('the module API opens the window on the GM client', async ({ gmPage }) => {
    const errors = collectErrors(gmPage);
    await gmPage.evaluate((id) => (window as any).game.modules.get(id).api.open(), MODULE_ID);
    const win = gmPage.locator(`#${MODULE_ID}`);
    await expect(win).toBeVisible();
    await expect(win.locator('.battlefield-root')).toBeVisible();

    await gmPage.evaluate((id) => (window as any).game.modules.get(id).api.close(), MODULE_ID);
    await expect(win).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('a player client joins with the module active', async ({ playerPage }) => {
    const active = await playerPage.evaluate(
      (id) => (window as any).game.modules.get(id)?.active === true, MODULE_ID,
    );
    expect(active).toBe(true);
  });
});

import { test, expect, MODULE_ID, collectErrors } from './fixtures/foundry-clients';

test.describe('Module launches', () => {
  test('the scene control opens the window on the GM client', async ({ gmPage }) => {
    const errors = collectErrors(gmPage);
    await gmPage.locator(`#scene-controls-tools button[data-tool="${MODULE_ID}"]`).click();
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

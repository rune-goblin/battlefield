import { test, expect, MODULE_ID, collectErrors, waitForGameReady, waitForModuleActive } from './fixtures/foundry-clients';

test.describe('Board effects on Foundry\'s PIXI', () => {
  // The board draws through `globalThis.PIXI` by way of the shim, and a name the shim lacks is
  // `undefined` until an effect first reads it.
  test('the spell gallery plays every burst without a console error', async ({ gmContext, gmPage: _loggedIn }) => {
    // A third Foundry canvas on software GL loads slowly beside the two clients.
    test.setTimeout(180_000);
    // `gmPage` has logged the context in, so this page goes straight to the game.
    const page = await gmContext.newPage();
    await page.goto('/game?vfx');
    await waitForGameReady(page);
    await waitForModuleActive(page);
    await page.addStyleTag({ content: '#notifications { display: none !important; }' });
    const errors = collectErrors(page);

    await page.evaluate((id) => (window as any).game.modules.get(id).api.open(), MODULE_ID);
    const win = page.locator(`#${MODULE_ID}`);
    const playAll = win.getByRole('button', { name: /^Play all/ });
    await expect(playAll).toBeVisible();
    await expect(win.locator('canvas').first()).toBeVisible();
    await playAll.click();
    await page.waitForTimeout(4_000);

    expect(errors).toEqual([]);
    await page.close();
  });
});

import { expect, type Locator, type Page } from '@playwright/test';

import { MODULE_ID } from './foundry-clients';

export const windowOf = (page: Page): Locator => page.locator(`#${MODULE_ID}`);

// Players have no scene control, and the GM's runs the ReignMaker hex pick when that module is on.
export async function openBattleWindow(page: Page): Promise<Locator> {
  const win = windowOf(page);
  if (!(await win.isVisible())) {
    await page.evaluate((id) => (window as any).game.modules.get(id).api.open(), MODULE_ID);
  }
  await expect(win.locator('.battlefield-root')).toBeVisible();
  return win;
}

export const closeWindow = (page: Page): Promise<void> =>
  page.evaluate((id) => (window as any).game.modules.get(id).api.close(), MODULE_ID);

export const railOf = (win: Locator): Locator => win.locator('nav.wizard');

export const stepOf = (win: Locator, label: string): Locator =>
  railOf(win).locator('li', { has: win.page().locator('.label', { hasText: label }) });

export async function goToStep(win: Locator, label: string): Promise<void> {
  const step = stepOf(win, label);
  await step.locator('button').click();
  await expect(step).toHaveClass(/\bon\b/);
}

/** The stage panel's forward button: Next, the GM's Start, or a player's word that the army is ready. */
export const forwardOf = (win: Locator): Locator => win.locator('.steps .primary');

export async function beginBattle(gm: Locator): Promise<void> {
  await goToStep(gm, 'Review and begin');
  const begin = forwardOf(gm);
  await expect(begin).toHaveText('Start');
  await expect(begin, 'open the seed battle first: openSeedBattle').toBeEnabled();
  await begin.click();
  await expect(railOf(gm)).toBeHidden();
}

const api = <T>(page: Page, verb: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(([id, name, rest]) => (window as any).game.modules.get(id).api[name](...rest), [MODULE_ID, verb, args] as const);

/** The hex `seed.spec.ts` leaves a deployed battle at, for every spec that needs one. */
export const SEED_SITE = 'e2e-seed';

/** Take off the map every test hex a spec left, except the seed. */
export const clearTestSites = (page: Page): Promise<void> => page.evaluate(async ([id, seed]) => {
  const bf = (window as any).game.modules.get(id).api;
  for (const entry of await bf.battles()) {
    if (entry.site.startsWith('e2e-') && entry.site !== seed) await bf.removeBattle(entry.site);
  }
}, [MODULE_ID, SEED_SITE] as const);

/** Place every piece the wizard lists, on a board generated if the draft has none. */
export async function deployAll(gm: Locator): Promise<void> {
  const review = stepOf(gm, 'Review and begin').locator('button');
  await goToStep(gm, 'Battlefield');
  if (await review.isDisabled()) {
    await gm.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(review).toBeEnabled();
  }
  for (const label of ['Siege engines', 'Defending army', 'Attacking army']) {
    await goToStep(gm, label);
    const place = gm.locator('.unitlist button.deploy:not(.set):not(:disabled)');
    for (let n = await place.count(); n > 0; n = await place.count()) {
      await place.first().click();
      await expect(place).toHaveCount(n - 1);
    }
  }
  await goToStep(gm, 'Review and begin');
  await expect(forwardOf(gm), 'every piece must be on the board').toBeEnabled();
}

/** Leave whatever battle the table holds without saving, and open the seed battle at its stored
 * copy on the wizard, with no players called. */
export async function openSeedBattle(page: Page): Promise<Locator> {
  if (await api(page, 'activeSite') !== null) await api(page, 'closeBattle');
  const opened = await api<{ ok: boolean; message?: string }>(page, 'openBattleAt', SEED_SITE, {
    board: { base: 'plains', size: 9, feature: 'none', seed: 1 },
  });
  expect(opened, 'seed.spec.ts leaves a battle at the seed hex').toMatchObject({ ok: true });
  const win = await openBattleWindow(page);
  await win.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(railOf(win)).toBeVisible();
  await api(page, 'dismissTable');
  // Start opened every player's window and the dismissal shuts it; a spec that opens one before
  // it has gone would catch it closing.
  const others = page.context().browser()?.contexts().flatMap((c) => c.pages()).filter((p) => p !== page) ?? [];
  for (const other of others) await expect(windowOf(other)).toBeHidden();
  return win;
}

/** Close the battle without saving, so the seed stays as `seed.spec.ts` stored it. */
export async function leaveBattle(page: Page): Promise<void> {
  expect(await api(page, 'closeBattle')).toMatchObject({ ok: true });
  await expect(windowOf(page)).toBeHidden();
}

export async function endBattle(gm: Locator): Promise<void> {
  await gm.getByRole('button', { name: 'End battle', exact: true }).first().click();
  const dialog = gm.getByRole('alertdialog');
  await dialog.getByRole('button', { name: /^(End battle|End without saving)$/ }).click();
  await expect(dialog).toBeHidden();
}

/** Playwright empties `test-results/` at the start of a run, so the last full run's set stands. */
export const shot = async (page: Page, name: string): Promise<void> => {
  await page.screenshot({ path: `test-results/live-check/${name}.png` });
};

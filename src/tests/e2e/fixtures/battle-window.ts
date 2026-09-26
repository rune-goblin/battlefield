import { expect, type Locator, type Page } from '@playwright/test';

import { MODULE_ID } from './foundry-clients';

export const windowOf = (page: Page): Locator => page.locator(`#${MODULE_ID}`);

export async function openFromSceneControl(page: Page): Promise<Locator> {
  const win = windowOf(page);
  if (!(await win.isVisible())) {
    await page.locator(`#scene-controls-tools button[data-tool="${MODULE_ID}"]`).click();
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

/** The stage panel's forward button: Next, the GM's Begin, or a player's word that the army is ready. */
export const forwardOf = (win: Locator): Locator => win.locator('.steps .primary');

export async function beginBattle(gm: Locator): Promise<void> {
  await goToStep(gm, 'Review and begin');
  const begin = forwardOf(gm);
  await expect(begin).toHaveText('Begin');
  await expect(begin, 'the world clone holds no deployed setup; deploy both armies once by hand').toBeEnabled();
  await begin.click();
  await expect(railOf(gm)).toBeHidden();
}

/** A run that died mid-battle leaves one open in the world clone. */
export async function endAnyBattle(gm: Locator): Promise<void> {
  if (!(await railOf(gm).isVisible())) await endBattle(gm);
  await expect(railOf(gm)).toBeVisible();
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

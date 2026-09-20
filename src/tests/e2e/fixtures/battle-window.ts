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

export async function endBattle(gm: Locator): Promise<void> {
  await gm.getByRole('button', { name: 'End battle', exact: true }).first().click();
  const dialog = gm.getByRole('alertdialog');
  await dialog.getByRole('button', { name: /^(End battle|End without saving)$/ }).click();
  await expect(dialog).toBeHidden();
}

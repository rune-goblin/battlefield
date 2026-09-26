import type { Locator, Page } from '@playwright/test';

import { activation, notation, ROUTED_AT } from '../../engine/index';
import { beginBattle, closeWindow, endAnyBattle, goToStep, openFromSceneControl, railOf, shot } from './fixtures/battle-window';
import { battleOn, cellOf, drag, screenOf, settle, shotAround } from './fixtures/board';
import { test, expect, MODULE_ID, collectErrors } from './fixtures/foundry-clients';

const SAVE_NAME = 'e2e routed';

// `Token.chipBounds`: the chip sits up and to the left, CHIP_OFFSET along the footprint radius.
const CHIP_REACH = 0.72 * 0.82 / 2;

const saveLoad = (win: Locator): Locator => win.locator('.popover', { has: win.page().getByRole('button', { name: 'Save / Load', exact: true }) });

const readArchive = (page: Page): Promise<string> =>
  page.evaluate((id) => (window as any).game.settings.get(id, 'archive') as string, MODULE_ID);

const writeArchive = (page: Page, raw: string): Promise<void> =>
  page.evaluate(async ([id, value]) => { await (window as any).game.settings.set(id, 'archive', value); }, [MODULE_ID, raw]);

test.describe('The board in a Foundry battle', () => {
  test('an engine chip, a routed unit and the teardown draw with no console error', async ({ gmPage }) => {
    test.setTimeout(300_000);
    const errors = collectErrors(gmPage);
    const archive = await readArchive(gmPage);
    try {
      const gm = await openFromSceneControl(gmPage);
      await endAnyBattle(gm);
      await beginBattle(gm);

      await gm.locator('.army-reel .unit-card', { hasText: 'Line Infantry' }).click();
      await expect(gm.locator('.army-reel .unit-card.on')).toContainText('Line Infantry');
      await expect.poll(async () => (await battleOn(gmPage)).active).toBeTruthy();
      const picked = await battleOn(gmPage);
      const unit = picked.active!;
      const from = cellOf(picked, unit);
      const catapult = notation(picked.engines.find((e) => e.name === 'Catapult')!.square);
      expect(activation(picked, unit)!.moves.has(catapult), `Line Infantry cannot reach the Catapult on ${catapult}`).toBe(true);
      await settle(gmPage, from);

      await drag(gmPage, await screenOf(gmPage, from), await screenOf(gmPage, catapult));
      await gm.locator('.popup-foot .primary').click();
      await expect.poll(async () => cellOf(await battleOn(gmPage), unit)).toBe(catapult);
      // The reel card overlays the board's corner; picking the unit again centres the board on it.
      await gm.locator('.army-reel .unit-card.on').click();
      await settle(gmPage, catapult);

      const centre = await screenOf(gmPage, catapult);
      const [file, rank] = [catapult.charCodeAt(0), catapult.slice(1)];
      const west = await screenOf(gmPage, `${String.fromCharCode(file - 1)}${rank}`);
      const pitch = Math.hypot(centre.x - west.x, centre.y - west.y);
      await shotAround(gmPage, catapult, pitch, 'W9-engine-chip');

      await gmPage.mouse.click(centre.x - CHIP_REACH * pitch, centre.y - CHIP_REACH * pitch);
      await expect(gm.locator('.siege-heading strong')).toHaveText('Catapult');
      await shot(gmPage, 'W9-engine-chip-hit');
      await gmPage.keyboard.press('Escape');
      await expect(gm.locator('.siege-heading')).toBeHidden();

      // The piece's own body, clear of the chip, is the unit's ring.
      await gmPage.mouse.click(centre.x + 0.15 * pitch, centre.y + 0.15 * pitch);
      await expect(gm.locator('.radial .slice').first()).toBeVisible();
      await gmPage.keyboard.press('Escape');
      await expect(gm.locator('.radial')).toBeHidden();

      // The API offers no way to spend Morale, so a save of this battle is edited and loaded back.
      const panel = saveLoad(gm);
      const toggle = panel.getByRole('button', { name: 'Save / Load', exact: true });
      await toggle.click();
      await panel.getByPlaceholder('Name this save').fill(SAVE_NAME);
      await panel.getByRole('button', { name: 'Save', exact: true }).click();
      const row = panel.locator('li', { hasText: SAVE_NAME });
      await expect(row).toBeVisible();
      await toggle.click();

      const entries = JSON.parse(await readArchive(gmPage)) as { name: string; data: { battle: { units: { name: string; disorder: number }[] } } }[];
      const routed = entries.find((e) => e.name === SAVE_NAME)!.data.battle.units.find((u) => u.name === 'Kobold Warriors')!;
      routed.disorder = ROUTED_AT;
      await writeArchive(gmPage, JSON.stringify(entries));

      await toggle.click();
      await row.getByRole('button', { name: 'Load', exact: true }).click();
      await expect.poll(async () => (await battleOn(gmPage)).units.find((u) => u.name === 'Kobold Warriors')!.disorder).toBe(ROUTED_AT);
      await row.getByRole('button', { name: 'Remove', exact: true }).click();
      await expect(row).toBeHidden();
      await toggle.click();

      const kobolds = cellOf(await battleOn(gmPage), (await battleOn(gmPage)).units.find((u) => u.name === 'Kobold Warriors')!.id);
      const at = await screenOf(gmPage, kobolds);
      await gmPage.mouse.move(at.x, at.y);
      await expect(gm.locator('canvas[aria-label="Battle board"]')).toHaveAttribute('title', /Morale 0\/3 — routed/);
      await shotAround(gmPage, kobolds, pitch, 'W9-routed');
      await shot(gmPage, 'W9-board');

      await gm.getByRole('button', { name: 'End battle', exact: true }).first().click();
      const dialog = gm.getByRole('alertdialog');
      await expect(dialog).toContainText('End the battle');
      await shot(gmPage, 'W8-end-battle');
      await dialog.getByRole('button', { name: /^(End battle|End without saving)$/ }).click();
      await expect(dialog).toBeHidden();
      await expect(railOf(gm)).toBeVisible();

      for (const label of ['Battlefield', 'Paint the map', 'Siege engines', 'Review and begin']) await goToStep(gm, label);
      await expect(gm.locator('canvas[aria-label="Battle board"]')).toHaveCount(1);
      await shot(gmPage, 'W9-stage-switch');
      await closeWindow(gmPage);
      await expect(gm).toBeHidden();
      expect(errors).toEqual([]);
    } finally {
      await writeArchive(gmPage, archive);
    }
  });
});

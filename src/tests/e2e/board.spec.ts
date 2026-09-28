import type { Locator, Page } from '@playwright/test';

import { activation, notation, ROUTED_AT } from '../../engine/index';
import { beginBattle, closeWindow, goToStep, leaveBattle, openSeedBattle, railOf, shot } from './fixtures/battle-window';
import { battleOn, cellOf, screenOf, settle, shotAround } from './fixtures/board';
import { test, expect, MODULE_ID, collectErrors } from './fixtures/foundry-clients';

const SAVE_NAME = 'e2e routed';

// `Token.chipBounds`: the chip sits up and to the left, CHIP_OFFSET along the footprint radius.
const CHIP_REACH = 0.72 * 0.82 / 2;


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
      const gm = await openSeedBattle(gmPage);
      await beginBattle(gm);

      // The attacker a single stride brings onto the Catapult, wherever the seed placed them.
      const deployed = await battleOn(gmPage);
      const catapult = notation(deployed.engines.find((e) => e.name === 'Catapult')!.square);
      const [runner] = deployed.units
        .filter((u) => u.side === 'attacker' && activation(deployed, u.id)?.moves.has(catapult))
        .sort((a, b) => activation(deployed, a.id)!.moves.get(catapult)!.feet - activation(deployed, b.id)!.moves.get(catapult)!.feet);
      expect(runner, `no attacker can reach the Catapult on ${catapult}`).toBeTruthy();
      await gm.locator('.army-reel .unit-card', { hasText: runner.name }).click();
      await expect(gm.locator('.army-reel .unit-card.on')).toContainText(runner.name);
      await expect.poll(async () => (await battleOn(gmPage)).active).toBeTruthy();
      const picked = await battleOn(gmPage);
      const unit = picked.active!;
      const from = cellOf(picked, unit);
      await settle(gmPage, from);

      const start = await screenOf(gmPage, from);
      const end = await screenOf(gmPage, catapult);
      await gmPage.mouse.move(start.x, start.y);
      await gmPage.mouse.down();
      await gmPage.mouse.move(end.x, end.y, { steps: 12 });
      await expect(gm.locator('.drag-hud')).toBeVisible();
      await shot(gmPage, 'W8-drag-hud');
      await gmPage.mouse.up();
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

      await gm.locator('.popup-row', { hasText: 'Choose an attack behavior and target' }).click();
      await expect(gm.locator('.picker-emblem img')).toBeVisible();
      const activity = gm.locator('.activity-row:not(.on)').first();
      await activity.hover();
      await expect(activity.locator('.activity-tooltip')).toBeVisible();
      await shot(gmPage, 'W8-activity-choices');
      // One Escape, one step back: the picker returns to the siege panel, and that closes next.
      for (const open of [gm.locator('.activity-options'), gm.locator('.siege-heading')]) {
        await gmPage.keyboard.press('Escape');
        await expect(open).toBeHidden();
      }

      // The piece's own body, clear of the chip, is the unit's ring.
      await gmPage.mouse.click(centre.x + 0.15 * pitch, centre.y + 0.15 * pitch);
      await expect(gm.locator('.radial .slice').first()).toBeVisible();
      await gmPage.keyboard.press('Escape');
      await expect(gm.locator('.radial')).toBeHidden();

      // The API offers no way to spend Morale, so a save of this battle is edited and loaded back.
      const toggle = gm.getByRole('button', { name: 'Save / Load', exact: true });
      const panel = gm.getByRole('dialog', { name: 'Save / Load' });
      const done = panel.getByRole('button', { name: 'Done', exact: true });
      await toggle.click();
      await panel.getByPlaceholder('Name this save').fill(SAVE_NAME);
      await panel.getByRole('button', { name: 'Save', exact: true }).click();
      const row = panel.locator('li', { hasText: SAVE_NAME });
      await expect(row).toBeVisible();
      await done.click();

      const entries = JSON.parse(await readArchive(gmPage)) as { name: string; data: { battle: { units: { name: string; disorder: number }[] } } }[];
      const routed = entries.find((e) => e.name === SAVE_NAME)!.data.battle.units.find((u) => u.name === 'Kobold Warriors')!;
      routed.disorder = ROUTED_AT;
      await writeArchive(gmPage, JSON.stringify(entries));

      await toggle.click();
      await row.getByRole('button', { name: 'Load', exact: true }).click();
      await expect.poll(async () => (await battleOn(gmPage)).units.find((u) => u.name === 'Kobold Warriors')!.disorder).toBe(ROUTED_AT);
      await row.getByRole('button', { name: 'Remove', exact: true }).click();
      await expect(row).toBeHidden();
      await done.click();

      const kobolds = cellOf(await battleOn(gmPage), (await battleOn(gmPage)).units.find((u) => u.name === 'Kobold Warriors')!.id);
      // The enemy's home row can sit off the window or under the army reel: the board scrolls
      // to it, and the reel lets the pointer through for this one hover.
      await gmPage.evaluate(([id, cell]) => (window as any).game.modules.get(id).api.centerOn(cell), [MODULE_ID, kobolds]);
      await settle(gmPage, kobolds);
      const through = await gmPage.addStyleTag({ content: '.army-reel, .army-reel * { pointer-events: none !important; }' });
      const at = await screenOf(gmPage, kobolds);
      await gmPage.mouse.move(at.x, at.y);
      await expect(gm.locator('canvas[aria-label="Battle board"]')).toHaveAttribute('title', /Morale 0\/3 — routed/);
      await through.evaluate((el) => (el as HTMLStyleElement).remove());
      await shotAround(gmPage, kobolds, pitch, 'W9-routed');
      const cavalry = await battleOn(gmPage).then((b) => cellOf(b, b.units.find((u) => u.name === 'Heavy Cavalry')!.id));
      await shotAround(gmPage, cavalry, pitch, 'W9-flag-status-bars');
      await shot(gmPage, 'W9-board');

      // A ruling would take the seed off the map, so the prompt is shown and cancelled, and the
      // battle closes without saving back to the seed's stored copy.
      await gm.getByRole('button', { name: 'Battle', exact: true }).click();
      await gm.getByRole('button', { name: 'End battle', exact: true }).click();
      const dialog = gm.getByRole('alertdialog');
      await expect(dialog).toContainText('End the battle');
      await shot(gmPage, 'W8-end-battle');
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await expect(dialog).toBeHidden();
      await leaveBattle(gmPage);
      await openSeedBattle(gmPage);
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

import type { Locator, Page } from '@playwright/test';
import {
  beginBattle, closeWindow, endAnyBattle, endBattle, forwardOf, goToStep, openFromSceneControl, shot,
} from './fixtures/battle-window';
import { test, expect, collectErrors } from './fixtures/foundry-clients';

const armyCard = (win: Locator, title: string): Locator => win.locator('.army-card', { has: win.page().locator('h3', { hasText: title }) });

const popover = (win: Locator, label: string): Locator => win.locator('.popover', { has: win.page().getByRole('button', { name: label, exact: true }) });

const chatInput = (page: Page): Locator => page.locator('#chat-message .ProseMirror');

test.describe('The setup wizard on two clients', () => {
  test('a seated player declares the army ready, and both clients show it', async ({ gmPage, playerPage }) => {
    test.setTimeout(240_000);
    const gmErrors = collectErrors(gmPage);
    const playerErrors = collectErrors(playerPage);
    const gm = await openFromSceneControl(gmPage);
    await endAnyBattle(gm);
    await goToStep(gm, 'Review and begin');
    await expect(forwardOf(gm)).toHaveText('Begin');

    const player = await openFromSceneControl(playerPage);
    await goToStep(player, 'Review and begin');
    const ready = forwardOf(player);
    await expect(ready).toHaveText('My army is ready');
    await expect(ready).toBeEnabled();
    await ready.click();

    await expect(ready).toHaveText('Ready — waiting for the GM');
    await expect(ready).toBeDisabled();
    await expect(armyCard(player, 'Attacking army').locator('.ready')).toHaveText('ready');
    await expect(armyCard(gm, 'Attacking army').locator('.ready')).toHaveText('ready');
    await expect(armyCard(gm, 'Defending army').locator('.ready')).toHaveCount(0);
    await expect(forwardOf(gm)).toHaveText('Begin');
    await shot(playerPage, 'W7-player-ready');
    await shot(gmPage, 'W7-player-ready-gm');

    // Beginning clears the word, so the world clone keeps no readiness between runs.
    await beginBattle(gm);
    await endBattle(gm);
    await closeWindow(playerPage);
    await closeWindow(gmPage);
    expect(gmErrors).toEqual([]);
    expect(playerErrors).toEqual([]);
  });

  test('the GM sees the setup chrome, and Escape closes a popover only inside the window', async ({ gmPage }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(gmPage);
    const gm = await openFromSceneControl(gmPage);
    await endAnyBattle(gm);

    await goToStep(gm, 'Sides');
    await expect(armyCard(gm, 'Attacking army')).toBeVisible();
    await expect(armyCard(gm, 'Defending army')).toBeVisible();
    await shot(gmPage, 'W8-sides');

    await goToStep(gm, 'Review and begin');
    await expect(armyCard(gm, 'Attacking army')).toBeVisible();
    await shot(gmPage, 'W8-summary');

    for (const [label, name] of [['Seating', 'W8-seating'], ['Save / Load', 'W8-save-load']] as const) {
      const pop = popover(gm, label);
      const toggle = pop.getByRole('button', { name: label, exact: true });
      await toggle.click();
      await expect(pop.locator('.panel')).toBeVisible();
      await shot(gmPage, name);

      await chatInput(gmPage).focus();
      await gmPage.keyboard.press('Escape');
      await expect(pop.locator('.panel'), 'Escape typed into Foundry\'s chat closed the popover').toBeVisible();

      await toggle.focus();
      await gmPage.keyboard.press('Escape');
      await expect(pop.locator('.panel')).toBeHidden();
      // Foundry's own Escape closes a window with an animation, after the popover has gone.
      await gmPage.waitForTimeout(1_000);
      await expect(gm, 'Escape inside the window closed the window').toBeVisible();
    }

    await gm.getByRole('button', { name: 'Quit', exact: true }).click();
    const quit = gm.getByRole('alertdialog');
    await expect(quit).toContainText('Save before quitting?');
    await shot(gmPage, 'W8-quit');
    await gmPage.keyboard.press('Escape');
    await expect(quit).toBeHidden();
    await gmPage.waitForTimeout(1_000);
    await expect(gm, 'Escape in the Quit dialog closed the window').toBeVisible();

    await goToStep(gm, 'Defending army');
    const units = gm.locator('.unitlist .piece:not(.engine)');
    const before = await units.count();
    await gm.getByRole('button', { name: 'Choose troops…' }).click();
    const picker = gm.getByRole('dialog', { name: 'Choose troops' });
    await picker.getByRole('button', { name: 'Add', exact: true }).first().click();
    await expect(units).toHaveCount(before + 1);
    await picker.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(units.nth(before)).toHaveAttribute('data-selected', 'true');
    await expect(gm.locator('.unitlist .piece[data-selected="true"]')).toHaveCount(1);
    await shot(gmPage, 'W8-place-unit');
    await units.nth(before).locator('button.kill').click();
    await expect(units).toHaveCount(before);

    await goToStep(gm, 'Siege engines');
    const engines = gm.locator('.unitlist .piece.engine');
    const held = await engines.count();
    await gm.getByRole('button', { name: 'Add engine', exact: true }).click();
    await expect(engines).toHaveCount(held + 1);
    await expect(engines.nth(held)).toHaveAttribute('data-selected', 'true');
    await expect(gm.locator('.unitlist .piece[data-selected="true"]')).toHaveCount(1);
    await shot(gmPage, 'W8-place-engine');
    await engines.nth(held).locator('button.kill').click();
    await expect(engines).toHaveCount(held);

    await goToStep(gm, 'Review and begin');
    await expect(forwardOf(gm), 'the setup the spec touched must stay deployed').toBeEnabled();
    await closeWindow(gmPage);
    expect(errors).toEqual([]);
  });
});

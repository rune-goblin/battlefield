import { test, expect, type Locator, type Page } from '@playwright/test';

import { SESSION_KEY } from '../../adapters/browser/localRepository';
import { defaultSetup, sessionWith } from '../../runtime/session';
import { forwardOf, goToStep, railOf, shot, stepOf } from './fixtures/battle-window';
import { collectErrors } from './fixtures/foundry-clients';

// The `webServer` entry for the browser app in playwright.config.ts.
test.use({ baseURL: 'http://127.0.0.1:5199' });

const appOf = (page: Page): Locator => page.locator('.battlefield-root');

async function placeEvery(root: Locator): Promise<void> {
  const waiting = root.locator('.unitlist .piece button.deploy:not(.set)');
  for (let left = await waiting.count(); left > 0; left--) {
    await waiting.first().click();
    await expect(waiting).toHaveCount(left - 1);
  }
}

async function expectTicked(root: Locator, labels: string[]): Promise<void> {
  for (const label of labels) await expect(stepOf(root, label), `${label} is not ticked`).toHaveClass(/\bdone\b/);
}

test.describe('The browser app', () => {
  test('a fresh load opens on Battlefield, and a reload resumes where setup or the battle stands', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await page.goto('/play.html');
    const root = appOf(page);
    await expect(stepOf(root, 'Battlefield')).toHaveClass(/\bon\b/);
    await expect(root.getByText('No board yet. Generate one.')).toBeVisible();
    await shot(page, 'W7-browser-fresh');

    await root.getByRole('button', { name: 'Generate', exact: true }).click();
    await expect(root.getByText('No board yet. Generate one.')).toBeHidden();
    for (const label of ['Paint the map', 'Siege engines', 'Sides', 'Defending army']) {
      await forwardOf(root).click();
      await expect(stepOf(root, label)).toHaveClass(/\bon\b/);
    }
    await placeEvery(root);

    await page.reload();
    await expect(stepOf(root, 'Attacking army')).toHaveClass(/\bon\b/);
    await expectTicked(root, ['Battlefield', 'Paint the map', 'Siege engines', 'Sides', 'Defending army']);
    await shot(page, 'W7-browser-resume-setup');

    await placeEvery(root);
    await goToStep(root, 'Review and begin');
    await expect(forwardOf(root)).toHaveText('Begin');
    await forwardOf(root).click();
    await expect(railOf(root)).toBeHidden();
    await expect(root.locator('.army-reel')).toBeVisible();

    // The rail hides for the battle, so its ticks do not show here.
    await page.reload();
    await expect(root.locator('.army-reel')).toBeVisible();
    await expect(railOf(root)).toBeHidden();
    await expect(root.getByRole('button', { name: 'End battle', exact: true })).toBeVisible();
    await shot(page, 'W7-browser-resume-battle');
    expect(errors).toEqual([]);
  });

  // W2's sweep found swamp, lakeside, size 9, hex, seed 47 with a tier-4 fort sealed by water.
  test('a map water seals shows the ground-route warning, with one Generate button', async ({ page }) => {
    const errors = collectErrors(page);
    const setup = defaultSetup();
    setup.spec = { base: 'plains', grid: 'hex', size: 9, feature: 'lakeside', construction: { kind: 'fort', tier: 4 }, seed: 47 };
    const session = JSON.stringify(sessionWith(setup));
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [SESSION_KEY, session] as const);
    await page.goto('/play.html');
    const root = appOf(page);

    // An edit regenerates on the seed it holds.
    await root.locator('.fields label', { hasText: /^Hex/ }).locator('select').selectOption('swamp');
    await expect(root.locator('.connection-warning')).toBeVisible();
    await expect(root.locator('.fields input')).toHaveCount(0);
    await expect(root.getByRole('button', { name: /Generate/ })).toHaveCount(1);
    await shot(page, 'W11.5-sealed-map');
    expect(errors).toEqual([]);
  });
});

import type { Locator, Page } from '@playwright/test';
import { clearTestSites, forwardOf, goToStep, openBattleWindow, railOf, shot, windowOf } from './fixtures/battle-window';
import { test, expect, MODULE_ID, collectErrors, waitForGameReady } from './fixtures/foundry-clients';

const chipOf = (page: Page): Locator => page.locator('#ui-right-column-1 .battlefield-chip');
const controlsOf = (page: Page): Locator => page.locator(`#scene-controls-tools button[data-tool^="${MODULE_ID}"]`);
const api = (page: Page, verb: 'callTable' | 'dismissTable'): Promise<void> =>
  page.evaluate(([id, name]) => (window as any).game.modules.get(id).api[name](), [MODULE_ID, verb] as const);
const openAt = (page: Page, site: string): Promise<{ ok: boolean; message?: string }> =>
  page.evaluate(([id, at]) => (window as any).game.modules.get(id).api.openBattleAt(at, {
    board: { base: 'forest', size: 9, feature: 'none', seed: 3 },
  }), [MODULE_ID, site] as const);
const call = <T>(page: Page, verb: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(([id, name, rest]) => (window as any).game.modules.get(id).api[name](...rest), [MODULE_ID, verb, args] as const);
const infantry = { name: 'Line Infantry', level: 6, role: 'infantry', tactics: [] };
const openArmiesAt = (page: Page, site: string): Promise<{ ok: boolean; message?: string }> => call(page, 'openBattleAt', site, {
  request: {
    board: { base: 'plains', size: 9, feature: 'none', seed: 5 },
    units: [{ card: infantry, side: 'attacker' }, { card: { ...infantry, name: 'Kobold Warriors', level: 3 }, side: 'defender' }],
  },
});
const standingSites = async (page: Page): Promise<string[]> =>
  (await call<{ site: string }[]>(page, 'battles')).map((e) => e.site);

test.describe('The table call', () => {
  test('the GM alone has the control, and a called player keeps the chip across a reload', async ({ gmPage, playerPage }) => {
    // A reload boots a whole Foundry client over software GL.
    test.setTimeout(180_000);
    const playerErrors = collectErrors(playerPage);
    await expect(controlsOf(gmPage)).toHaveCount(1);
    await expect(controlsOf(gmPage)).toHaveClass(/fa-swords/);
    await expect(controlsOf(playerPage)).toHaveCount(0);

    await api(gmPage, 'dismissTable');
    await api(gmPage, 'callTable');
    const player = windowOf(playerPage);
    await expect(player.locator('.battlefield-root')).toBeVisible();

    await player.locator('[data-action="close"]').click();
    await expect(chipOf(playerPage)).toBeVisible();
    await expect(chipOf(playerPage).locator('.fa-swords')).toHaveCount(1);

    await playerPage.reload();
    await waitForGameReady(playerPage);
    await expect(chipOf(playerPage)).toBeVisible();
    await expect(player).toBeHidden();
    await chipOf(playerPage).click();
    await expect(player.locator('.battlefield-root')).toBeVisible();
    await expect(chipOf(playerPage)).toBeHidden();

    await api(gmPage, 'dismissTable');
    await expect(player).toBeHidden();
    await expect(chipOf(playerPage)).toBeHidden();
    // The reload also loads every other module in the world, and their failures are not ours.
    expect(playerErrors.filter((e) => /battlefield/i.test(e))).toEqual([]);
  });

  test('a standing battle opens on the GM briefing, and Start calls the table', async ({ gmPage, playerPage }) => {
    test.setTimeout(120_000);
    const gmErrors = collectErrors(gmPage);
    const gm = await openBattleWindow(gmPage);
    await api(gmPage, 'dismissTable');
    await clearTestSites(gmPage);
    const run = Date.now();
    const [first, second] = [`e2e-${run}-a`, `e2e-${run}-b`];
    const briefing = gm.getByRole('heading', { name: `Hex ${first}` });

    expect(await openAt(gmPage, first)).toMatchObject({ ok: true });
    await expect(gm.locator('nav.wizard')).toBeVisible();
    await expect(briefing).toHaveCount(0);
    await call(gmPage, 'saveBattle');
    expect(await openAt(gmPage, second)).toMatchObject({ ok: true });
    expect(await openAt(gmPage, first)).toMatchObject({ ok: true });

    await expect(briefing).toBeVisible();
    await expect(gm.locator('nav.wizard')).toBeHidden();
    await expect(windowOf(playerPage)).toBeHidden();
    await expect(chipOf(playerPage)).toBeHidden();
    await shot(gmPage, 'briefing');

    await gm.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(windowOf(playerPage).locator('.battlefield-root')).toBeVisible();
    await expect(briefing).toHaveCount(0);
    await expect(gm.locator('nav.wizard')).toBeVisible();

    await api(gmPage, 'dismissTable');
    await clearTestSites(gmPage);
    expect(gmErrors.filter((e) => /battlefield/i.test(e))).toEqual([]);
  });

  test('Save, Close with the unsaved prompt, and End battle with a GM ruling', async ({ gmPage, playerPage }) => {
    test.setTimeout(180_000);
    const gmErrors = collectErrors(gmPage);
    let gm = await openBattleWindow(gmPage);
    await api(gmPage, 'dismissTable');
    await clearTestSites(gmPage);
    const site = `e2e-${Date.now()}-c`;
    const menu = (): Locator => gm.getByRole('button', { name: 'Battle', exact: true });
    const pick = async (item: string): Promise<void> => {
      await menu().click();
      await gm.getByRole('button', { name: item, exact: true }).click();
    };

    expect(await openArmiesAt(gmPage, site)).toMatchObject({ ok: true });
    await api(gmPage, 'callTable');
    await expect(windowOf(playerPage).locator('.battlefield-root')).toBeVisible();
    await expect(windowOf(playerPage).getByRole('button', { name: 'Battle', exact: true })).toHaveCount(0);

    // Save writes the stored copy; a change makes the battle unsaved again.
    expect(await call(gmPage, 'battleUnsaved')).toBe(true);
    await pick('Save');
    await expect.poll(() => call(gmPage, 'battleUnsaved')).toBe(false);
    await goToStep(gm, 'Defending army');
    await gm.locator('button.deploy', { hasText: 'Place' }).first().click();
    await expect.poll(() => call(gmPage, 'battleUnsaved')).toBe(true);

    // Close asks first; Cancel leaves the battle as it was.
    await pick('Close');
    const prompt = gm.getByRole('alertdialog', { name: `Close the battle at hex ${site}?` });
    await expect(prompt).toBeVisible();
    await shot(gmPage, 'close-prompt');
    await prompt.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(prompt).toBeHidden();
    expect(await call(gmPage, 'activeSite')).toBe(site);

    // Close without saving ends the session for everyone and keeps the saved copy on the map.
    await pick('Close');
    await prompt.getByRole('button', { name: 'Close without saving', exact: true }).click();
    await expect(gm).toBeHidden();
    await expect(windowOf(playerPage)).toBeHidden();
    await expect(chipOf(playerPage)).toBeHidden();
    await expect(chipOf(gmPage)).toBeHidden();
    expect(await call(gmPage, 'activeSite')).toBeNull();
    expect(await standingSites(gmPage)).toContain(site);

    // The site reopens on the briefing at the saved copy, with no defender placed.
    expect(await openArmiesAt(gmPage, site)).toMatchObject({ ok: true });
    gm = await openBattleWindow(gmPage);
    await expect(gm.getByRole('heading', { name: `Hex ${site}` })).toBeVisible();
    expect(await call(gmPage, 'battleUnsaved')).toBe(false);
    await gm.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(windowOf(playerPage).locator('.battlefield-root')).toBeVisible();

    // Deploy both armies and begin, then rule the battle the rules have not ended.
    await goToStep(gm, 'Defending army');
    await gm.locator('button.deploy', { hasText: 'Place' }).first().click();
    await goToStep(gm, 'Attacking army');
    await gm.locator('button.deploy', { hasText: 'Place' }).first().click();
    await goToStep(gm, 'Review and begin');
    await forwardOf(gm).click();
    await expect(railOf(gm)).toBeHidden();

    await pick('End battle');
    const ending = gm.getByRole('alertdialog', { name: 'End the battle' });
    await expect(ending.getByRole('button', { name: 'Draw', exact: true })).toBeVisible();
    await shot(gmPage, 'ruling-prompt');
    await ending.getByRole('button', { name: 'Defender', exact: true }).click();
    await expect(ending).toBeHidden();
    await expect.poll(() => standingSites(gmPage)).not.toContain(site);
    expect(await call(gmPage, 'activeSite')).toBeNull();
    const ended = await gmPage.evaluate((id) => {
      const raw = (window as any).game.settings.get(id, 'session');
      return typeof raw === 'string' ? raw : JSON.stringify(raw);
    }, MODULE_ID);
    expect(ended).toContain('"endedBy":"ruling"');

    expect(await call(gmPage, 'closeBattle')).toMatchObject({ ok: true });
    await expect(windowOf(playerPage)).toBeHidden();
    await clearTestSites(gmPage);
    expect(gmErrors.filter((e) => /battlefield/i.test(e))).toEqual([]);
  });
  test('a battle closed at dusk reopens on the briefing and resumes at recovery', async ({ gmPage, playerPage }) => {
    test.setTimeout(180_000);
    const gmErrors = collectErrors(gmPage);
    let gm = await openBattleWindow(gmPage);
    await api(gmPage, 'dismissTable');
    await clearTestSites(gmPage);
    const site = `e2e-${Date.now()}-d`;

    expect(await openArmiesAt(gmPage, site)).toMatchObject({ ok: true });
    await goToStep(gm, 'Defending army');
    await gm.locator('button.deploy', { hasText: 'Place' }).first().click();
    await goToStep(gm, 'Attacking army');
    await gm.locator('button.deploy', { hasText: 'Place' }).first().click();
    await goToStep(gm, 'Review and begin');
    await forwardOf(gm).click();
    await expect(railOf(gm)).toBeHidden();
    await call(gmPage, 'saveBattle');
    expect(await call(gmPage, 'closeBattle')).toMatchObject({ ok: true });

    // proto: playing six rounds to dusk is slow, so the stored copy is set to the dusk its last round would reach.
    await gmPage.evaluate(async ([id, at]) => {
      const settings = (window as any).game.settings;
      const raw = settings.get(id, 'sites');
      const sites = typeof raw === 'string' ? JSON.parse(raw) : raw;
      Object.assign(sites[at].data.battle, { phase: 'ended', endedBy: 'dusk', winner: 'draw' });
      await settings.set(id, 'sites', typeof raw === 'string' ? JSON.stringify(sites) : sites);
    }, [MODULE_ID, site] as const);

    expect(await openArmiesAt(gmPage, site)).toMatchObject({ ok: true });
    gm = await openBattleWindow(gmPage);
    await expect(gm.getByText('Day 1 ended at dusk. Recovery comes next.')).toBeVisible();
    await gm.getByRole('button', { name: 'Start', exact: true }).click();
    const report = gm.getByRole('region', { name: 'Battle report' });
    await expect(report.getByRole('heading', { name: 'Tend to your armies' })).toBeVisible();
    await expect(windowOf(playerPage).getByRole('heading', { name: 'Tend to your armies' })).toBeVisible();
    await expect(report.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    await expect(windowOf(playerPage).getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
    await shot(gmPage, 'dusk-report');

    await report.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(report.getByRole('button', { name: 'Continue to recovery', exact: true })).toBeVisible();
    await report.getByRole('button', { name: 'End battle', exact: true }).click();
    const ending = gm.getByRole('alertdialog', { name: 'End the battle' });
    await expect(ending.getByRole('button', { name: 'Draw', exact: true })).toBeVisible();
    await ending.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(ending).toBeHidden();

    await report.getByRole('button', { name: 'Save', exact: true }).click();
    await expect.poll(() => call(gmPage, 'battleUnsaved')).toBe(false);
    await report.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(gm).toBeHidden();
    await expect(windowOf(playerPage)).toBeHidden();
    expect(await standingSites(gmPage)).toContain(site);

    await clearTestSites(gmPage);
    expect(gmErrors.filter((e) => /battlefield/i.test(e))).toEqual([]);
  });
});

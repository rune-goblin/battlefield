import type { Locator, Page } from '@playwright/test';
import { deployAll, leaveBattle, openBattleWindow, railOf, shot, windowOf } from './fixtures/battle-window';
import { battleOn } from './fixtures/board';
import { test, expect, MODULE_ID, collectErrors } from './fixtures/foundry-clients';

const api = <T>(page: Page, verb: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(([id, name, rest]) => (window as any).game.modules.get(id).api[name](...rest), [MODULE_ID, verb, args] as const);
const chipOf = (page: Page): Locator => page.locator('#ui-right-column-1 .battlefield-chip');
const standing = async (page: Page): Promise<string[]> => (await api<{ site: string }[]>(page, 'battles')).map((e) => e.site);
const revision = (page: Page): Promise<number> =>
  page.evaluate((id) => JSON.parse((window as any).game.settings.get(id, 'session')).revision, MODULE_ID);

const infantry = { name: 'Line Infantry', level: 6, role: 'infantry', tactics: [] };
const SITE = 'e2e-lifecycle';

/** Whoever holds the turn selects a unit and ends it. The button settles a moment after the
 * last turn's record lands, so each client is tried until one can act. */
async function endOneTurn(pages: Page[]): Promise<void> {
  const before = await revision(pages[0]);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    for (const page of pages) {
      const win = windowOf(page);
      if (!(await win.isVisible())) continue;
      const endTurn = win.locator('button.end-turn');
      if (!(await endTurn.isVisible())) {
        const card = win.locator('.army-reel .unit-card:not(:disabled)').first();
        if (await card.count()) await card.click();
      }
      if (await endTurn.isVisible() && await endTurn.isEnabled()) {
        await endTurn.click();
        await expect.poll(() => revision(pages[0])).toBeGreaterThan(before);
        return;
      }
    }
    // The last turn of the day ends it: dusk lands a commit later, and then no one holds a turn.
    if ((await battleOn(pages[0])).phase === 'ended') return;
    await pages[0].waitForTimeout(500);
  }
  throw new Error('no client could end the turn');
}

test('one battle from creation through Save, Close, dusk and a GM ruling', async ({ gmPage, playerPage }) => {
  test.setTimeout(420_000);
  const gmErrors = collectErrors(gmPage);
  const menu = (win: Locator): Locator => win.getByRole('button', { name: 'Battle', exact: true });
  const pick = async (win: Locator, item: string): Promise<void> => {
    await menu(win).click();
    await win.getByRole('button', { name: item, exact: true }).click();
  };

  // A new hex opens the create wizard; Start calls the table.
  expect(await api(gmPage, 'openBattleAt', SITE, {
    request: {
      board: { base: 'plains', size: 9, feature: 'none', seed: 5 },
      // A short day reaches a real dusk; six rounds in headless Foundry take six minutes.
      roundsPerDay: 2,
      units: [{ card: infantry, side: 'attacker' }, { card: { ...infantry, name: 'Kobold Warriors', level: 3 }, side: 'defender' }],
    },
  })).toMatchObject({ ok: true });
  let gm = await openBattleWindow(gmPage);
  await deployAll(gm);
  await gm.locator('.steps .primary').click();
  await expect(railOf(gm)).toBeHidden();
  const player = windowOf(playerPage);
  await expect(player.locator('.battlefield-root')).toBeVisible();

  // A turn, then Save and Close: the marker stays, every window shuts.
  await endOneTurn([gmPage, playerPage]);
  await pick(gm, 'Save');
  await expect.poll(() => api(gmPage, 'battleUnsaved')).toBe(false);
  await pick(gm, 'Close');
  await expect(gm).toBeHidden();
  await expect(player).toBeHidden();
  await expect(chipOf(playerPage)).toBeHidden();
  expect(await standing(gmPage)).toContain(SITE);

  // Reopening lands on the briefing, which players do not see; Start brings them back.
  expect(await api(gmPage, 'openBattleAt', SITE, { board: { base: 'plains', size: 9, feature: 'none', seed: 5 } }))
    .toMatchObject({ ok: true });
  gm = await openBattleWindow(gmPage);
  await expect(gm.getByRole('heading', { name: `Hex ${SITE}` })).toBeVisible();
  await expect(player).toBeHidden();
  await gm.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(player.locator('.battlefield-root')).toBeVisible();

  // Play to dusk, then Save and Close from the report.
  for (let turns = 0; (await battleOn(gmPage)).phase !== 'ended'; turns += 1) {
    expect(turns, 'dusk comes at the end of round two').toBeLessThan(12);
    await endOneTurn([gmPage, playerPage]);
  }
  expect((await battleOn(gmPage)).endedBy).toBe('dusk');
  const report = gm.getByRole('region', { name: 'Battle report' });
  await expect(report).toBeVisible();
  await shot(gmPage, 'lifecycle-dusk');
  await report.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => api(gmPage, 'battleUnsaved')).toBe(false);
  await report.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(gm).toBeHidden();
  await expect(player).toBeHidden();

  // The next session resumes at recovery; the GM rules the battle and it leaves the map.
  expect(await api(gmPage, 'openBattleAt', SITE, { board: { base: 'plains', size: 9, feature: 'none', seed: 5 } }))
    .toMatchObject({ ok: true });
  gm = await openBattleWindow(gmPage);
  await expect(gm.getByText('Day 1 ended at dusk. Recovery comes next.')).toBeVisible();
  await gm.getByRole('button', { name: 'Start', exact: true }).click();
  const resumed = gm.getByRole('region', { name: 'Battle report' });
  await expect(resumed.getByRole('heading', { name: 'Tend to your armies' })).toBeVisible();
  await resumed.getByRole('button', { name: 'Back', exact: true }).click();
  await resumed.getByRole('button', { name: 'End battle', exact: true }).click();
  const ruling = gm.getByRole('alertdialog', { name: 'End the battle' });
  await ruling.getByRole('button', { name: 'Draw', exact: true }).click();
  await expect(ruling).toBeHidden();
  await expect.poll(() => standing(gmPage)).not.toContain(SITE);
  expect(await api(gmPage, 'activeSite')).toBeNull();

  await leaveBattle(gmPage);
  await expect(player).toBeHidden();
  expect(gmErrors.filter((e) => /battlefield/i.test(e))).toEqual([]);
});

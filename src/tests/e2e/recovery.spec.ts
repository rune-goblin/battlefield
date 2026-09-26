import { readFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';

import { STORED_NAMES, type StoredRecord } from '../../runtime/ports';
import { closeWindow, openFromSceneControl, shot } from './fixtures/battle-window';
import { test, expect, MODULE_ID, collectErrors, reloadClient } from './fixtures/foundry-clients';

// `worldSettings.ts`: SESSION_SETTING, ARCHIVE_SETTING and SITES_SETTING carry the record's own name.
const RECORDS: StoredRecord[] = ['session', 'archive', 'sites'];
const BROKEN = '{broken';

type Raw = Record<StoredRecord, string>;

const readRaw = (page: Page): Promise<Raw> => page.evaluate(
  ([id, keys]) => Object.fromEntries(keys.map((k) => [k, (window as any).game.settings.get(id, k)])) as Raw,
  [MODULE_ID, RECORDS] as const,
);

const setRaw = (page: Page, key: StoredRecord, value: string): Promise<void> => page.evaluate(
  async ([id, k, v]) => { await (window as any).game.settings.set(id, k, v); },
  [MODULE_ID, key, value] as const,
);

/** The app's own notice for a record, inside the Battlefield window. */
const notice = (win: Locator, text: string): Locator => win.locator('.notifications .notification', { hasText: text });

/** Foundry's toast, which the fixtures hide from view but leave in the DOM. */
const toast = (page: Page, record: StoredRecord): Locator =>
  page.locator('#notifications .notification', { hasText: `cannot read the stored ${STORED_NAMES[record]}` });

async function shotWithToasts(page: Page, name: string): Promise<void> {
  const style = await page.addStyleTag({ content: '#notifications { display: flex !important; }' });
  await shot(page, name);
  await style.evaluate((el) => el.parentNode?.removeChild(el));
}

/** Foundry logs each error toast to the console, and those are the ones this spec raises. */
const unexpected = (errors: string[]): string[] => errors.filter((e) => !/^Battlefield cannot read the stored /.test(e));

test.describe('An unreadable world setting', () => {
  test('each record shows the GM a way out, the player a warning, and a toast only while the window is shut', async ({ gmPage, playerPage }) => {
    test.setTimeout(600_000);
    const gmErrors = collectErrors(gmPage);
    const playerErrors = collectErrors(playerPage);
    await closeWindow(gmPage);
    await closeWindow(playerPage);
    const before = await readRaw(gmPage);

    try {
      for (const record of RECORDS) {
        const name = STORED_NAMES[record];
        const title = `The stored ${name} cannot be read`;
        await setRaw(gmPage, record, BROKEN);

        await reloadClient(gmPage);
        await expect(toast(gmPage, record)).toHaveCount(1);
        await shotWithToasts(gmPage, `W10-${record}-toast`);

        const gm = await openFromSceneControl(gmPage);
        const gmNotice = notice(gm, title);
        await expect(gmNotice).toBeVisible();
        await expect(gmNotice.getByRole('button')).toHaveText(['Export the broken save', 'Start fresh']);
        await shot(gmPage, `W10-${record}-gm`);

        const [download] = await Promise.all([
          gmPage.waitForEvent('download'),
          gmNotice.getByRole('button', { name: 'Export the broken save' }).click(),
        ]);
        expect(download.suggestedFilename()).toBe(`battlefield-${record}-unreadable.json`);
        expect(await readFile(await download.path(), 'utf8')).toBe(BROKEN);

        await gmNotice.getByRole('button', { name: 'Start fresh' }).click();
        const confirm = notice(gm, `Clear the stored ${name}?`);
        await expect(confirm.getByRole('button')).toHaveText(['Clear and start fresh', 'Cancel']);
        await shot(gmPage, `W10-${record}-confirm`);
        await confirm.getByRole('button', { name: 'Cancel' }).click();
        await expect(gmNotice.getByRole('button', { name: 'Export the broken save' })).toBeVisible();

        await reloadClient(playerPage);
        await expect(toast(playerPage, record), 'the Foundry toast is the GM\'s alone').toHaveCount(0);
        const player = await openFromSceneControl(playerPage);
        const warning = notice(player, title);
        await expect(warning).toContainText('The GM must export or clear it');
        await expect(warning.locator('.actions')).toHaveCount(0);
        await shot(playerPage, `W10-${record}-player`);

        await gmNotice.getByRole('button', { name: 'Start fresh' }).click();
        await confirm.getByRole('button', { name: 'Clear and start fresh' }).click();
        await expect(notice(gm, name)).toHaveCount(0);
        await expect(warning).toBeHidden();
        expect((await readRaw(gmPage))[record]).toBe('');
        await shot(gmPage, `W10-${record}-cleared`);

        await closeWindow(playerPage);
        await closeWindow(gmPage);
        await setRaw(gmPage, record, before[record]);
      }

      // A record found unreadable with the window open shows the notice and no toast.
      await reloadClient(gmPage);
      const gm = await openFromSceneControl(gmPage);
      await setRaw(gmPage, 'archive', BROKEN);
      const panel = gm.locator('.popover', { has: gmPage.getByRole('button', { name: 'Save / Load', exact: true }) });
      await panel.getByRole('button', { name: 'Save / Load', exact: true }).click();
      const gmNotice = notice(gm, `The stored ${STORED_NAMES.archive} cannot be read`);
      await expect(gmNotice).toBeVisible();
      await expect(toast(gmPage, 'archive')).toHaveCount(0);
      await shotWithToasts(gmPage, 'W10-archive-window-open');
      await panel.getByRole('button', { name: 'Save / Load', exact: true }).click();
      await closeWindow(gmPage);
    } finally {
      const now = await readRaw(gmPage);
      for (const record of RECORDS) if (now[record] !== before[record]) await setRaw(gmPage, record, before[record]);
      // The primary GM's executor still holds the session it loaded, and would save it over the restored one.
      await reloadClient(gmPage);
    }

    expect(await readRaw(gmPage)).toEqual(before);
    expect(unexpected(gmErrors)).toEqual([]);
    expect(unexpected(playerErrors)).toEqual([]);
  });
});

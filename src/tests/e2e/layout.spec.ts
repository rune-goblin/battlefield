import { mkdirSync, writeFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';

import { activation } from '../../engine/index';
import {
  SEED_SITE, beginBattle, closeWindow, forwardOf, goToStep, leaveBattle, openBattleWindow, openSeedBattle, railOf, stepOf, windowOf,
  clearTestSites,
} from './fixtures/battle-window';
import { battleOn, cellOf, drag, screenOf, settle } from './fixtures/board';
import { test, expect, MODULE_ID, collectErrors } from './fixtures/foundry-clients';

const SHOTS = 'docs/plans/foundry-gameplay-shots';
const AUDIT = 'test-results/layout-audit';

const STEPS = [
  ['Battlefield', 'board'], ['Paint the map', 'paint'], ['Siege engines', 'siege'], ['Sides', 'sides'],
  ['Defending army', 'defenders'], ['Attacking army', 'attackers'], ['Review and begin', 'summary'],
] as const;

const SIZES = [
  { name: 'default', width: 1280, height: 800 },
  { name: '1024x700', width: 1024, height: 700 },
] as const;

type Size = (typeof SIZES)[number];

const chipOf = (page: Page): Locator => page.locator('.battlefield-chip');
// Popover panels portal into the shell's overlay layer, out of their `.popover`.
const panelOf = (win: Locator): Locator => win.locator('.overlay > .panel');

const fitWindow = (page: Page, size: Size): Promise<void> => page.evaluate(([id, w, h]) => {
  const app = (window as any).foundry.applications.instances.get(id);
  app?.setPosition({ width: w, height: h, left: 20, top: 20 });
}, [MODULE_ID, size.width, size.height] as const);

// proto: flags every box whose content spills past it, with the declarations that decide it,
// so the cause list reads from data and not from the pictures alone.
const audit = (page: Page): Promise<unknown> => page.evaluate(() => {
  const roots = [document.getElementById('battlefield'), ...document.querySelectorAll('.battlefield-surface')]
    .filter((e): e is HTMLElement => !!e);
  const path = (el: Element): string => {
    const parts: string[] = [];
    for (let e: Element | null = el; e && parts.length < 5 && e.id !== 'battlefield'; e = e.parentElement) {
      const cls = [...e.classList].filter((c) => !c.startsWith('svelte-')).slice(0, 3).join('.');
      parts.unshift(e.tagName.toLowerCase() + (cls ? `.${cls}` : ''));
    }
    return parts.join(' > ');
  };
  const style = (el: Element) => {
    const s = getComputedStyle(el);
    return {
      display: s.display, fontSize: s.fontSize, lineHeight: s.lineHeight, whiteSpace: s.whiteSpace, height: s.height,
      minHeight: s.minHeight, maxHeight: s.maxHeight, minWidth: s.minWidth, width: s.width, flex: s.flex, overflow: s.overflow,
      padding: s.padding, fontFamily: s.fontFamily.slice(0, 40), boxSizing: s.boxSizing,
    };
  };
  const faults: unknown[] = [];
  for (const root of roots) {
    for (const el of [root, ...root.querySelectorAll('*')]) {
      if (el instanceof SVGElement || el.tagName === 'CANVAS') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const h = el as HTMLElement;
      const s = getComputedStyle(h);
      if (s.visibility === 'hidden') continue;
      const clips = s.overflowX !== 'visible' || s.overflowY !== 'visible';
      const wide = h.scrollWidth - h.clientWidth;
      const tall = h.scrollHeight - h.clientHeight;
      const text = (h.innerText ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
      const scrolls = /auto|scroll/.test(s.overflowX + s.overflowY);
      if ((wide > 1 || tall > 1) && !scrolls && h.clientWidth > 0 && text) {
        faults.push({
          kind: clips ? 'clipped' : 'spills', el: path(h), text, wide, tall,
          box: { w: Math.round(r.width), h: Math.round(r.height) }, style: style(h),
        });
      }
    }
  }
  const root = document.querySelector('.battlefield-root');
  const probe = (sel: string) => { const e = root?.querySelector(sel); return e ? getComputedStyle(e).fontSize : null; };
  return {
    htmlFontSize: getComputedStyle(document.documentElement).fontSize,
    rootFontSize: root ? getComputedStyle(root).fontSize : null,
    typeTokens: root ? Object.fromEntries(['--type-body', '--type-small', '--type-label', '--type-1', '--type-4'].map((t) => [t, getComputedStyle(root).getPropertyValue(t)])) : null,
    probes: { h1: probe('h1'), h2: probe('h2'), h3: probe('h3'), button: probe('button'), muted: probe('.muted') },
    faults,
  };
});

// proto: ReignMaker's own suite may share this Foundry and pop its dialogs on every client;
// they would cover the window and take the clicks, so the survey drops them as they land.
const dropForeignDialogs = (page: Page): Promise<void> => page.evaluate(() => {
  const drop = () => document.querySelectorAll('.dialog-backdrop').forEach((e) => { if (!e.closest('#battlefield')) e.remove(); });
  drop();
  new MutationObserver(drop).observe(document.body, { childList: true, subtree: true });
});

/** One screenshot of the whole client, and the audit of the same moment beside it. */
async function snap(page: Page, size: Size, client: 'gm' | 'player', name: string): Promise<void> {
  const file = `${size.name}-${client}-${name}`;
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${SHOTS}/${file}.png` });
  mkdirSync(AUDIT, { recursive: true });
  writeFileSync(`${AUDIT}/${file}.json`, JSON.stringify(await audit(page), null, 1));
}

async function walkPopovers(page: Page, win: Locator, size: Size, client: 'gm' | 'player', at: string): Promise<void> {
  for (const [label, name] of [['Seating', 'seating'], ['Save / Load', 'save-load']] as const) {
    const toggle = win.getByRole('button', { name: label, exact: true });
    if (!(await toggle.isVisible())) continue;
    await toggle.click();
    const dialog = win.getByRole('dialog', { name: label });
    await expect(dialog).toBeVisible();
    await snap(page, size, client, `${at}-${name}`);
    await dialog.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(dialog).toBeHidden();
  }
}

async function walkWizard(page: Page, win: Locator, size: Size, client: 'gm' | 'player'): Promise<void> {
  for (const [label, name] of STEPS) {
    if (await stepOf(win, label).locator('button').isDisabled()) continue;
    await goToStep(win, label);
    await snap(page, size, client, `wizard-${name}`);
    if (client === 'player') continue;
    if (name === 'board') {
      await win.getByRole('button', { name: 'Grid settings' }).click();
      await expect(win.locator('dialog.grid-settings')).toBeVisible();
      await snap(page, size, client, 'wizard-board-grid-settings');
      await page.keyboard.press('Escape');
      await expect(win.locator('dialog.grid-settings')).toBeHidden();
    }
    if (name === 'defenders') {
      await win.getByRole('button', { name: 'Choose troops…' }).click();
      const picker = win.getByRole('dialog', { name: 'Choose troops' });
      await expect(picker).toBeVisible();
      await snap(page, size, client, 'wizard-defenders-troop-picker');
      await picker.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(picker).toBeHidden();
    }
  }
  await walkPopovers(page, win, size, client, 'wizard');
  if (client === 'gm') {
    await win.getByRole('button', { name: 'Quit', exact: true }).click();
    const quit = win.getByRole('alertdialog');
    if (await quit.isVisible().catch(() => false)) {
      await snap(page, size, client, 'wizard-quit');
      await page.keyboard.press('Escape');
      await expect(quit).toBeHidden();
    }
  }
}

async function walkBoard(gmPage: Page, gm: Locator, size: Size): Promise<void> {
  await gm.locator('.army-reel .unit-card').first().click();
  await expect(gm.locator('.army-reel .unit-card.on')).toBeVisible();
  await snap(gmPage, size, 'gm', 'battle-unit-picked');
  const picked = await battleOn(gmPage);
  const unit = picked.active!;
  const from = cellOf(picked, unit);
  await settle(gmPage, from);

  const [to] = [...activation(picked, unit)!.moves].sort(([, x], [, y]) => x.feet - y.feet)[0];
  await drag(gmPage, await screenOf(gmPage, from), await screenOf(gmPage, to));
  await expect(gm.locator('.popup-foot')).toBeVisible();
  await snap(gmPage, size, 'gm', 'battle-move-popup');
  await gm.locator('.popup-foot').getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(gm.locator('.popup-foot')).toBeHidden();

  const here = await screenOf(gmPage, from);
  await gmPage.mouse.click(here.x, here.y);
  const slices = gm.locator('.radial .slice');
  await expect(slices.first()).toBeVisible();
  await slices.first().hover();
  await snap(gmPage, size, 'gm', 'battle-radial');
  const labels = await slices.evaluateAll((els) => els.filter((e) => !e.classList.contains('dim')).map((e) => e.getAttribute('aria-label') ?? ''));
  const open = gm.locator('.radial, .popup-foot, .activity-options, .siege-heading');
  const dismiss = async () => {
    for (let k = 0; k < 4 && await open.first().isVisible(); k++) {
      const cancel = gm.getByRole('button', { name: 'Cancel', exact: true });
      if (await cancel.isVisible()) await cancel.click();
      else await gmPage.keyboard.press('Escape');
      await gmPage.waitForTimeout(200);
    }
  };
  // The ring re-renders every frame while it tracks its anchor, so a slice is pressed in the page.
  for (const label of labels) {
    try {
      await dismiss();
      await gmPage.mouse.click(here.x, here.y);
      const slice = gm.locator(`.radial .slice[aria-label="${label}"]`);
      await expect(slice).toBeVisible({ timeout: 5_000 });
      await slice.evaluate((el: HTMLElement) => el.click());
      await gmPage.waitForTimeout(500);
      await snap(gmPage, size, 'gm', `battle-radial-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
    } catch (e) {
      console.warn(`layout survey: the ${label} slice was not reached: ${(e as Error).message.split('\n')[0]}`);
    }
  }
  await dismiss();
}


const api = <T>(page: Page, verb: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(([id, name, rest]) => (window as any).game.modules.get(id).api[name](...rest), [MODULE_ID, verb, args] as const);
const infantry = { name: 'Line Infantry', level: 6, role: 'infantry', tactics: [] };
const openArmiesAt = (page: Page, site: string): Promise<{ ok: boolean }> => api(page, 'openBattleAt', site, {
  request: {
    board: { base: 'plains', size: 9, feature: 'none', seed: 5 },
    units: [
      { card: infantry, side: 'attacker' }, { card: { ...infantry, name: 'Apprentice Magician Clique', level: 4 }, side: 'attacker' },
      { card: { ...infantry, name: 'Kobold Warriors', level: 3 }, side: 'defender' },
    ],
  },
});

/** The screens a battle at a hex adds: the briefing, the GM's Battle menu, the Close and ruling
 * prompts, and the dusk report with Save and Close. */
async function walkSite(gmPage: Page, playerPage: Page, size: Size): Promise<void> {
  const site = `e2e-${Date.now()}-layout`;
  const reopen = async (): Promise<Locator> => {
    const opened = await openArmiesAt(gmPage, site);
    expect(opened, JSON.stringify(opened)).toMatchObject({ ok: true });
    const win = await openBattleWindow(gmPage);
    await fitWindow(gmPage, size);
    return win;
  };
  const menu = (win: Locator): Locator => win.getByRole('button', { name: 'Battle', exact: true });

  let gm = await reopen();
  await api(gmPage, 'saveBattle');
  await menu(gm).click();
  await expect(panelOf(gm)).toBeVisible();
  await snap(gmPage, size, 'gm', 'site-wizard-battle-menu');
  await menu(gm).click();
  expect(await api(gmPage, 'closeBattle')).toMatchObject({ ok: true });

  gm = await reopen();
  await expect(gm.getByRole('heading', { name: `Hex ${site}` })).toBeVisible();
  await snap(gmPage, size, 'gm', 'briefing-setup');
  await gm.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(windowOf(playerPage).locator('.battlefield-root')).toBeVisible();
  await fitWindow(playerPage, size);

  for (const label of ['Defending army', 'Attacking army']) {
    await goToStep(gm, label);
    const place = gm.locator('.unitlist button.deploy:not(.set):not(:disabled)');
    for (let n = await place.count(); n > 0; n = await place.count()) {
      await place.first().click();
      await expect(place).toHaveCount(n - 1);
    }
  }
  await goToStep(gm, 'Review and begin');
  await forwardOf(gm).click();
  await expect(railOf(gm)).toBeHidden();

  await menu(gm).click();
  await expect(panelOf(gm)).toBeVisible();
  await snap(gmPage, size, 'gm', 'site-battle-menu');
  await gm.getByRole('button', { name: 'Close', exact: true }).click();
  const prompt = gm.getByRole('alertdialog', { name: `Close the battle at hex ${site}?` });
  await expect(prompt).toBeVisible();
  await snap(gmPage, size, 'gm', 'site-close-prompt');
  await prompt.getByRole('button', { name: 'Cancel', exact: true }).click();

  await menu(gm).click();
  await gm.getByRole('button', { name: 'End battle', exact: true }).click();
  const ruling = gm.getByRole('alertdialog', { name: 'End the battle' });
  await expect(ruling.getByRole('button', { name: 'Draw', exact: true })).toBeVisible();
  await snap(gmPage, size, 'gm', 'site-ruling-prompt');
  await ruling.getByRole('button', { name: 'Cancel', exact: true }).click();

  await api(gmPage, 'saveBattle');
  expect(await api(gmPage, 'closeBattle')).toMatchObject({ ok: true });
  // proto: playing six rounds to dusk is slow, so the stored copy is set to the dusk its last round would reach.
  await gmPage.evaluate(async ([id, at]) => {
    const settings = (window as any).game.settings;
    const raw = settings.get(id, 'sites');
    const sites = typeof raw === 'string' ? JSON.parse(raw) : raw;
    Object.assign(sites[at].data.battle, { phase: 'ended', endedBy: 'dusk', winner: 'draw' });
    await settings.set(id, 'sites', typeof raw === 'string' ? JSON.stringify(sites) : sites);
  }, [MODULE_ID, site] as const);

  gm = await reopen();
  await expect(gm.getByText('Day 1 ended at dusk. Recovery comes next.')).toBeVisible();
  await snap(gmPage, size, 'gm', 'briefing-dusk');
  await gm.getByRole('button', { name: 'Start', exact: true }).click();
  const report = gm.getByRole('region', { name: 'Battle report' });
  await expect(report.getByRole('heading', { name: 'Tend to your armies' })).toBeVisible();
  await expect(windowOf(playerPage).getByRole('heading', { name: 'Tend to your armies' })).toBeVisible();
  await fitWindow(playerPage, size);
  await snap(gmPage, size, 'gm', 'dusk-report-recovery');
  await snap(playerPage, size, 'player', 'dusk-report-recovery');
  await report.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(report.getByRole('button', { name: 'Continue to recovery', exact: true })).toBeVisible();
  await snap(gmPage, size, 'gm', 'dusk-report-survivors');
  await report.getByRole('button', { name: 'End battle', exact: true }).click();
  await expect(ruling.getByRole('button', { name: 'Draw', exact: true })).toBeVisible();
  await snap(gmPage, size, 'gm', 'dusk-report-ruling-prompt');
  await ruling.getByRole('button', { name: 'Cancel', exact: true }).click();
  await report.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(gm).toBeHidden();
  await clearTestSites(gmPage);
}

for (const size of SIZES) {
  test.describe(`The layout survey at ${size.name}`, () => {
    test.use({ actionTimeout: 20_000 });
    test(`every stage, dialog and popover on both clients at ${size.name}`, async ({ gmPage, playerPage }) => {
      test.setTimeout(600_000);
      mkdirSync(SHOTS, { recursive: true });
      const gmErrors = collectErrors(gmPage);
      const playerErrors = collectErrors(playerPage);
      await dropForeignDialogs(gmPage);
      await dropForeignDialogs(playerPage);
      await closeWindow(playerPage);
      const gm = await openSeedBattle(gmPage);
      await fitWindow(gmPage, size);

      await walkWizard(gmPage, gm, size, 'gm');

      const player = await openBattleWindow(playerPage);
      await fitWindow(playerPage, size);
      await walkWizard(playerPage, player, size, 'player');
      await goToStep(player, 'Review and begin');
      await closeWindow(playerPage);

      await beginBattle(gm);
      await expect(windowOf(playerPage).locator('.battlefield-root')).toBeVisible();
      await fitWindow(playerPage, size);
      await snap(gmPage, size, 'gm', 'battle');
      await snap(playerPage, size, 'player', 'battle');
      await walkPopovers(gmPage, gm, size, 'gm', 'battle');
      await walkPopovers(playerPage, windowOf(playerPage), size, 'player', 'battle');

      await walkBoard(gmPage, gm, size);

      await windowOf(playerPage).locator('[data-action="close"]').click();
      await expect(chipOf(playerPage)).toBeVisible();
      await snap(playerPage, size, 'player', 'reopen-chip');
      await chipOf(playerPage).click();
      await expect(windowOf(playerPage).locator('.battlefield-root')).toBeVisible();

      await closeWindow(gmPage);
      if (await chipOf(gmPage).isVisible()) await snap(gmPage, size, 'gm', 'reopen-chip');
      await openBattleWindow(gmPage);
      await fitWindow(gmPage, size);

      // At a hex, End battle sits in the Battle menu.
      await gm.getByRole('button', { name: 'Battle', exact: true }).click();
      await gm.getByRole('button', { name: 'End battle', exact: true }).click();
      const dialog = gm.getByRole('alertdialog');
      await expect(dialog).toBeVisible();
      await snap(gmPage, size, 'gm', 'battle-end-dialog');
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
      await leaveBattle(gmPage);
      await closeWindow(playerPage);
      expect(gmErrors.filter((e) => /battlefield/i.test(e))).toEqual([]);
      expect(playerErrors.filter((e) => /battlefield/i.test(e))).toEqual([]);
    });

    test(`the briefing, the Battle menu, its prompts and the dusk report at ${size.name}`, async ({ gmPage, playerPage }) => {
      test.setTimeout(300_000);
      const gmErrors = collectErrors(gmPage);
      const playerErrors = collectErrors(playerPage);
      await dropForeignDialogs(gmPage);
      await dropForeignDialogs(playerPage);
      await closeWindow(playerPage);
      await openSeedBattle(gmPage);
      await leaveBattle(gmPage);
      await clearTestSites(gmPage);
      await walkSite(gmPage, playerPage, size);
      expect(gmErrors.filter((e) => /battlefield/i.test(e))).toEqual([]);
      expect(playerErrors.filter((e) => /battlefield/i.test(e))).toEqual([]);
    });
  });
}

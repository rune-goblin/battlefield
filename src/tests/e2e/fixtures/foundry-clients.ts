import { test as base, type Page, type BrowserContext } from '@playwright/test';

import { MODULE_ID } from '../../../adapters/foundry/module-id';

export { MODULE_ID };

export const PLAYER_NAME = '__e2e_player';

export interface JoinUser { id: string; name: string }

/** Drive Foundry's /join screen to log this context in as a specific user. */
export async function joinAs(page: Page, user: JoinUser, password = ''): Promise<void> {
  await page.goto('/join');
  // A world with "Hide players on join screen" set offers a name field in place of the list.
  const form = page.locator('select[name="userid"], input[name="username"]').first();
  await form.waitFor();
  if (await form.evaluate((el) => el.tagName === 'SELECT')) await form.selectOption(user.id);
  else await form.fill(user.name);
  if (password) await page.fill('input[name="password"]', password);
  await Promise.all([
    page.waitForURL(/\/game\b/, { timeout: 30_000 }),
    page.click('button[name="join"]'),
  ]);
  await waitForGameReady(page);
}

/** Join as the world's first GM (role ≥ 4). The test worlds use password-less users. */
export async function joinAsFirstGm(page: Page): Promise<void> {
  await page.goto('/join');
  await page.waitForLoadState('networkidle');
  const state = await page.evaluate(() => {
    const g = (window as any).game;
    return {
      view: g?.view ?? null,
      world: g?.world?.id ?? null,
      gm: (Array.from(g?.users?.values?.() ?? []) as any[])
        .filter((u) => u.role >= 4).map((u) => ({ id: u.id as string, name: u.name as string }))[0] ?? null,
    };
  });
  // No active world → Foundry bounced us to /setup. The usual cause is a world that needs
  // migration (older core/system than the running build); --world won't auto-launch those.
  if (state.view !== 'join' || !state.world) {
    throw new Error(
      `No active world at this port (Foundry view: "${state.view}"). The requested world likely needs ` +
        `migration — launch it once in your desktop Foundry to migrate it to the current build, then re-run. ` +
        `Or set TEST_WORLD to a world already on the current core/system version.`,
    );
  }
  if (!state.gm) throw new Error(`World "${state.world}" has no GM user (role ≥ 4) on /join`);
  await joinAs(page, state.gm);
}

/** Wait for `game.ready === true`. */
export async function waitForGameReady(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as any).game?.ready === true, undefined, { timeout: 120_000 });
}

/** Wait for this module to be active: `game.modules.get(MODULE_ID).active`. */
export async function waitForModuleActive(page: Page): Promise<void> {
  await page.waitForFunction(
    (id) => !!(window as any).game?.modules?.get(id)?.active,
    MODULE_ID,
    { timeout: 120_000 },
  );
}

/** Find or create the password-less player the second client joins as. */
export async function ensurePlayer(gmPage: Page): Promise<JoinUser> {
  return gmPage.evaluate(async (name) => {
    const g = (window as any).game;
    const existing = (Array.from(g.users.values()) as any[]).find((u) => u.name === name);
    const user = existing ?? await g.users.documentClass.create({ name, role: 1 });
    return { id: user.id as string, name };
  }, PLAYER_NAME);
}

// Foundry's permanent warning toasts overlay the app's top bar and intercept clicks. Each
// `.notification` sets `pointer-events: all`, so hide the stack outright.
const HIDE_NOTIFICATIONS = '#notifications { display: none !important; }';

/** Reload a logged-in client, as a player refreshing the page does. */
export async function reloadClient(page: Page): Promise<void> {
  await page.reload();
  await waitForGameReady(page);
  await waitForModuleActive(page);
  await page.addStyleTag({ content: HIDE_NOTIFICATIONS });
}

/** Every `console.error`, uncaught exception and failed request for one of this module's own
 * files on the page, for a spec to assert empty. A missing texture fails quietly in PIXI. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => { errors.push(err.message); });
  page.on('response', (res) => {
    if (res.status() >= 400 && res.url().includes(`/modules/${MODULE_ID}/`)) errors.push(`${res.status()} ${res.url()}`);
  });
  return errors;
}

type WorkerFixtures = {
  gmContext: BrowserContext;
  gmPage: Page;
  playerContext: BrowserContext;
  playerPage: Page;
};

/**
 * `gmPage` — a worker-scoped context logged into the test world as the first GM, with this
 * module active. `playerPage` — a second context logged in as `__e2e_player`, which the GM
 * client creates on first use and the world clone then keeps. Worker scope means one login
 * each for the whole suite (workers: 1); a spec leaves the battle and the world as it found
 * them.
 */
export const test = base.extend<object, WorkerFixtures>({
  gmContext: [
    async ({ browser }, use) => {
      const ctx = await browser.newContext();
      await use(ctx);
      await ctx.close();
    },
    { scope: 'worker' },
  ],
  gmPage: [
    async ({ gmContext }, use) => {
      const page = await gmContext.newPage();
      await joinAsFirstGm(page);
      await waitForModuleActive(page);
      await page.addStyleTag({ content: HIDE_NOTIFICATIONS });
      await use(page);
    },
    { scope: 'worker' },
  ],
  playerContext: [
    async ({ browser }, use) => {
      const ctx = await browser.newContext();
      await use(ctx);
      await ctx.close();
    },
    { scope: 'worker' },
  ],
  playerPage: [
    async ({ gmPage, playerContext }, use) => {
      const player = await ensurePlayer(gmPage);
      const page = await playerContext.newPage();
      await joinAs(page, player);
      await waitForModuleActive(page);
      await page.addStyleTag({ content: HIDE_NOTIFICATIONS });
      await use(page);
    },
    { scope: 'worker' },
  ],
});

export { expect } from '@playwright/test';

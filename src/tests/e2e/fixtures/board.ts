import { expect, type Page } from '@playwright/test';

import { notation, type BattleState } from '../../../engine/index';
import { MODULE_ID } from './foundry-clients';

export interface Point { x: number; y: number }

export const battleOn = (page: Page): Promise<BattleState> => page.evaluate(
  (id) => JSON.parse((window as any).game.settings.get(id, 'session')).battle,
  MODULE_ID,
);

export const screenOf = (page: Page, cell: string): Promise<Point> => page.evaluate(
  ([id, c]) => (window as any).game.modules.get(id).api.screenOf(c),
  [MODULE_ID, cell],
);

export const cellOf = (b: BattleState, unit: string): string => notation(b.units.find((u) => u.id === unit)!.square);

/** The reel centres the board on its pick, and a cell moves under the pointer until it lands. */
export async function settle(page: Page, cell: string): Promise<void> {
  await expect.poll(async () => {
    const first = await screenOf(page, cell);
    await page.waitForTimeout(150);
    const second = await screenOf(page, cell);
    return Math.hypot(first.x - second.x, first.y - second.y);
  }).toBeLessThan(0.5);
}

export async function drag(page: Page, from: Point, to: Point): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

/** A square screenshot of the board around one cell, `cells` pitches wide. */
export async function shotAround(page: Page, cell: string, pitch: number, name: string, cells = 3): Promise<void> {
  const c = await screenOf(page, cell);
  const half = (pitch * cells) / 2;
  await page.screenshot({ path: `test-results/live-check/${name}.png`, clip: { x: c.x - half, y: c.y - half, width: 2 * half, height: 2 * half } });
}

import { defaultSetup } from '../../runtime/session';
import { SEED_SITE, deployAll, leaveBattle, openBattleWindow } from './fixtures/battle-window';
import { test, expect, MODULE_ID } from './fixtures/foundry-clients';

const api = <T>(page: import('@playwright/test').Page, verb: string, ...args: unknown[]): Promise<T> =>
  page.evaluate(([id, name, rest]) => (window as any).game.modules.get(id).api[name](...rest), [MODULE_ID, verb, args] as const);

test('the seed battle stands deployed at its hex for the specs that follow', async ({ gmPage }) => {
  test.setTimeout(180_000);
  // The example force, plus what board.spec.ts drives: Line Infantry within reach of a Catapult,
  // and Kobold Warriors to rout.
  const infantry = { name: 'Line Infantry', level: 6, role: 'infantry', tactics: [] };
  const units = [
    ...defaultSetup().units.map(({ card, side }) => ({ card, side })),
    { card: infantry, side: 'attacker' },
    { card: { ...infantry, name: 'Kobold Warriors', level: 3 }, side: 'defender' },
  ];
  const opened = await api(gmPage, 'openBattleAt', SEED_SITE, {
    request: {
      // Nine hexes keeps the enemy inside the Catapult's long reach of nine.
      board: { base: 'plains', size: 9, feature: 'none', seed: 201113344 },
      units,
      emplacements: [{ engine: 'Catapult', side: 'attacker' }],
    },
  });
  expect(opened).toMatchObject({ ok: true });

  await deployAll(await openBattleWindow(gmPage));
  await api(gmPage, 'saveBattle');
  await expect.poll(() => api(gmPage, 'battleUnsaved')).toBe(false);
  await leaveBattle(gmPage);
  expect((await api<{ site: string }[]>(gmPage, 'battles')).map((e) => e.site)).toContain(SEED_SITE);
});

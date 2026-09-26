import { describe, expect, it } from 'vitest';
import { createTableCall } from '../adapters/foundry/tableCall.js';

function tableFor(role: { gm: boolean; openFails?: Error }) {
  const state = { value: '', window: false, chip: false, battle: false };
  const errors: unknown[] = [];
  const table = createTableCall({
    storage: { get: () => state.value, set: async (next) => { state.value = next; table.handleChange(next); } },
    isGm: () => role.gm,
    battleRunning: () => state.battle,
    windowOpen: () => state.window,
    openWindow: async () => {
      if (role.openFails) throw role.openFails;
      state.window = true;
    },
    closeWindow: async () => { state.window = false; },
    chip: { show: () => { state.chip = true; }, hide: () => { state.chip = false; } },
    onError: (error) => { errors.push(error); },
  });
  return { table, state, errors };
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the GM\'s call to the table', () => {
  it('opens a player\'s window once and leaves the chip when they shut it', async () => {
    const { table, state } = tableFor({ gm: false });

    await table.call();
    await settled();
    expect(state).toMatchObject({ window: true, chip: false });

    state.window = false;
    table.sync();
    expect(state.chip).toBe(true);
  });

  it('shows a late joiner the chip and opens nothing', () => {
    const { table, state } = tableFor({ gm: false });
    state.value = 'called';

    table.sync();

    expect(state).toMatchObject({ window: false, chip: true });
  });

  it('shuts the players\' windows on dismissal and leaves the GM\'s open', async () => {
    const player = tableFor({ gm: false });
    const gm = tableFor({ gm: true });
    for (const { table } of [player, gm]) { await table.call(); await settled(); }

    for (const { table } of [player, gm]) { await table.dismiss(); await settled(); }

    expect(player.state).toMatchObject({ window: false, chip: false });
    expect(gm.state).toMatchObject({ window: true, chip: false });
  });

  it('holds the chip while a battle runs, with no call', () => {
    const { table, state } = tableFor({ gm: false });
    state.battle = true;

    table.handleSession();

    expect(state).toMatchObject({ window: false, chip: true });
  });

  it('opens the window on a start it witnesses and keeps the chip after the player shuts it', async () => {
    const { table, state } = tableFor({ gm: false });
    table.handleSession();

    state.battle = true;
    table.handleSession();
    await settled();
    expect(state).toMatchObject({ window: true, chip: false });

    state.window = false;
    table.sync();
    expect(state.chip).toBe(true);
  });

  it('shuts a player\'s window and drops the chip when the GM ends the battle', async () => {
    const { table, state } = tableFor({ gm: false });
    state.battle = true;
    state.window = true;
    table.handleSession();

    state.battle = false;
    table.handleSession();
    await settled();

    expect(state).toMatchObject({ window: false, chip: false });
  });

  it('withdraws the call when the battle ends on the GM\'s client', async () => {
    const { table, state } = tableFor({ gm: true });
    await table.call();
    state.battle = true;
    table.handleSession();

    state.battle = false;
    table.handleSession();
    await settled();

    expect(state.value).toBe('');
  });

  it('reports a window that fails to open and still shows the chip', async () => {
    const failure = new Error('render failed');
    const { table, state, errors } = tableFor({ gm: false, openFails: failure });

    await table.call();
    await settled();

    expect(errors).toEqual([failure]);
    expect(state).toMatchObject({ window: false, chip: true });
  });
});

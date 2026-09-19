import { describe, expect, it } from 'vitest';
import { createTableCall } from '../adapters/foundry/tableCall.js';

function tableFor(role: { gm: boolean }) {
  const state = { value: '', window: false, chip: false };
  const table = createTableCall({
    storage: { get: () => state.value, set: async (next) => { state.value = next; table.handleChange(next); } },
    isGm: () => role.gm,
    windowOpen: () => state.window,
    openWindow: async () => { state.window = true; },
    closeWindow: async () => { state.window = false; },
    chip: { show: () => { state.chip = true; }, hide: () => { state.chip = false; } },
  });
  return { table, state };
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
});

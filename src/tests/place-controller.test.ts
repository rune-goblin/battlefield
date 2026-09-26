import { describe, expect, it, vi } from 'vitest';
import { createPlaceController, type PlaceDeps } from '../app/place-controller.svelte.js';
import { createNotificationService } from '../app/notifications.js';
import type { UnitCard } from '../engine/index.js';
import type { SetupUnit } from '../runtime/session.js';
import { openBoard } from './helpers.js';

const cavalry: UnitCard = { name: 'Cavalry', level: 7, role: 'cavalry', tactics: [] };
const unit = (id: string): SetupUnit => ({ id, card: cavalry, side: 'attacker', square: null, engines: [] });

describe('the place controller', () => {
  it('selects the unit the commit reports, though another landed after it', async () => {
    const addUnit = vi.fn(async () => ({ ok: true, commandId: 'c', revision: 1, added: [{ kind: 'unit', id: 'mine' }] } as const));
    const deps = {
      game: { setup: { board: openBoard('square'), units: [unit('mine'), unit('theirs')], emplacements: [] } },
      gameMap: { terrainAppearance: null, inkMap: null },
      notifications: createNotificationService(),
      addUnit,
    } as unknown as PlaceDeps;
    // Vitest loads Svelte's server build, where an effect never runs and needs no root.
    const c = createPlaceController(deps, { side: 'attacker', pieces: 'units' });

    await c.add(cavalry);

    expect(c.selected).toEqual({ kind: 'unit', id: 'mine' });
    c.close();
  });
});

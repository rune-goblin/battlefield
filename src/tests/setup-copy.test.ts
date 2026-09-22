import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSetupCopy } from '../app/setup-copy.js';
import { defaultSetup } from '../runtime/session.js';
import { openBoard } from './helpers.js';

afterEach(() => vi.restoreAllMocks());

describe('the UI setup copy', () => {
  it('copies nothing when battle actions retain the setup record', () => {
    const setup = { ...defaultSetup(), board: openBoard() };
    const read = createSetupCopy();
    const initial = read(setup);
    const clone = vi.spyOn(globalThis, 'structuredClone');
    for (let i = 0; i < 100; i++) expect(read(setup)).toBe(initial);
    expect(clone).not.toHaveBeenCalled();
  });

  it('copies changed troops without replacing terrain, settings, or engines', () => {
    const setup = { ...defaultSetup(), board: openBoard() };
    const read = createSetupCopy();
    const initial = read(setup);
    const next = { ...setup, units: setup.units.map((unit, i) => i ? unit : { ...unit, square: 'c1' }) };
    const clone = vi.spyOn(globalThis, 'structuredClone');
    const copy = read(next);
    expect(clone).toHaveBeenCalledTimes(1);
    expect(copy.units[0].square).toBe('c1');
    expect(copy.board).toBe(initial.board);
    expect(copy.spec).toBe(initial.spec);
    expect(copy.emplacements).toBe(initial.emplacements);
    expect(copy.units).not.toBe(next.units);
    copy.units[0].card.name = 'Local edit';
    expect(next.units[0].card.name).not.toBe('Local edit');
    expect(initial.units[0].square).toBeNull();
  });

  it('adopts terrain edits, imported records, scalar settings, and undo without stale data', () => {
    const setup = { ...defaultSetup(), board: openBoard() };
    const read = createSetupCopy();
    read(setup);
    const painted = structuredClone(setup.board);
    painted.squares[0][0].terrain = 'water';
    const changed = read({ ...setup, board: painted, roundsPerDay: 8 });
    expect(changed.board?.squares[0][0].terrain).toBe('water');
    expect(changed.board).not.toBe(painted);
    expect(changed.roundsPerDay).toBe(8);
    expect(read(setup).board?.squares[0][0].terrain).toBe('open');
    const imported = structuredClone(setup);
    imported.units[0].square = 'b2';
    expect(read(imported).units[0].square).toBe('b2');
  });
});

import { describe, expect, it } from 'vitest';
import { createBattle, offersAt, select, unit } from '../engine/index.js';
import { parse } from '../engine/board.js';
import { openBoard } from './helpers.js';
import type { UnitCard } from '../engine/cards.js';
import type { BattleState } from '../engine/types.js';

const archers: UnitCard = { name: 'Archers', level: 6, role: 'infantry', salvo: 'medium', tactics: [] };
const infantry: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [] };
const kobolds: UnitCard = { name: 'Kobolds', level: 3, role: 'infantry', tactics: [] };

function battle() {
  const state = createBattle({
    units: [
      { card: archers, side: 'attacker', square: 'c2' },
      { card: infantry, side: 'attacker', square: 'd2' },
      { card: kobolds, side: 'defender', square: 'c7' },
    ],
    board: openBoard(),
  });
  const me = state.units.find((u) => u.name === 'Archers')!.id;
  const foe = state.units.find((u) => u.name === 'Kobolds')!.id;
  return { state: select(state, me), me, foe };
}

const typesAt = (state: BattleState, kind: 'cell' | 'unit' | 'wall', target: string, from: string) =>
  offersAt(state, { kind, id: target }, from).map((o) => o.offer.type);

describe('what a target affords', () => {
  it('offers an enemy only the acts that name it', () => {
    const { state, me, foe } = battle();
    unit(state, foe).square = parse('c5');
    expect(typesAt(state, 'unit', foe, me)).toEqual(['shoot']);
  });

  it('offers your own piece what needs no target, and never an attack on yourself', () => {
    const { state, me } = battle();
    const mine = typesAt(state, 'unit', me, me);
    expect(mine).toContain('guard');
    expect(mine).not.toContain('shoot');
    expect(mine).not.toContain('fight');
  });

  // Commitment buys effects within the same hard range ceiling.
  it('offers every shoot activity in range and none beyond Reach', () => {
    const { state, me, foe } = battle();
    const activitiesAt = (square: string) => {
      unit(state, foe).square = parse(square);
      const shoot = offersAt(state, { kind: 'unit', id: foe }, me).find((o) => o.offer.type === 'shoot');
      return shoot?.activities.map((r) => r.label) ?? [];
    };
    expect(activitiesAt('c5')).toEqual(['Fire', 'Suppress', 'Pin']);
    expect(activitiesAt('f8')).toEqual([]);
  });

  it('offers nothing at an empty cell — movement is not an activity', () => {
    const { state, me } = battle();
    expect(typesAt(state, 'cell', 'f5', me)).toEqual([]);
  });
});

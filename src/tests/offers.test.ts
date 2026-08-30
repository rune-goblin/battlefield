import { describe, expect, it } from 'vitest';
import { createBattle, offersAt, select, unit } from '../engine/battle.js';
import { parse } from '../engine/board.js';
import { openBoard } from './helpers.js';
import { scriptedRng } from '../engine/rng.js';
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
  }, scriptedRng([10]));
  const me = state.units.find((u) => u.name === 'Archers')!.id;
  const foe = state.units.find((u) => u.name === 'Kobolds')!.id;
  return { state: select(state, me), me, foe };
}

const typesAt = (state: BattleState, kind: 'cell' | 'unit' | 'wall', target: string, from: string) =>
  offersAt(state, { kind, id: target }, from).map((o) => o.offer.type);

describe('what a target affords', () => {
  it('offers an enemy only the acts that name it', () => {
    const { state, me, foe } = battle();
    expect(typesAt(state, 'unit', foe, me)).toEqual(['shoot']);
  });

  it('offers your own piece what needs no target, and never an attack on yourself', () => {
    const { state, me } = battle();
    const mine = typesAt(state, 'unit', me, me);
    expect(mine).toContain('guard');
    expect(mine).not.toContain('shoot');
    expect(mine).not.toContain('fight');
  });

  // The rungs *are* the range: a shot is offered from a rung whose swing off effective range
  // reaches that far, so walking a target away drops rungs off the bottom rather than greying
  // out one Shoot button.
  it('drops a shoot rung once the target walks out of its band', () => {
    const { state, me, foe } = battle();
    const rungsAt = (square: string) => {
      unit(state, foe).square = parse(square);
      const shoot = offersAt(state, { kind: 'unit', id: foe }, me).find((o) => o.offer.type === 'shoot');
      return shoot?.rungs.map((r) => r.label) ?? [];
    };
    const close = rungsAt('c5');
    const far = rungsAt('c7');
    expect(close).toContain('Fire');
    expect(far).not.toContain('Fire');
    expect(far.length).toBeGreaterThan(0);
    expect(far.every((r) => close.includes(r))).toBe(true);
  });

  it('offers nothing at an empty cell — movement is not a rung', () => {
    const { state, me } = battle();
    expect(typesAt(state, 'cell', 'f5', me)).toEqual([]);
  });
});

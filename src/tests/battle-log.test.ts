import { describe, expect, it } from 'vitest';
import { battleLogBlocks } from '../app/battle-log.js';
import { act, createBattle, deselect, endActivation, select } from '../engine/index.js';
import { scriptedRng } from '../engine/rng.js';
import { openBoard } from './helpers.js';

const fixture = () => createBattle({ board: openBoard(), units: [
  { card: { name: 'First', role: 'infantry', level: 6, tactics: [] }, side: 'attacker', square: 'c2' },
  { card: { name: 'Second', role: 'infantry', level: 6, tactics: [] }, side: 'attacker', square: 'e2' },
  { card: { name: 'Enemy', role: 'infantry', level: 6, tactics: [] }, side: 'defender', square: 'c7' },
] });

describe('battle log turns', () => {
  it('previews the selected army without leaving empty turns after changing the selection', () => {
    const initial = fixture();
    const first = select(initial, 'u0');
    const second = select(first, 'u1');
    expect(second.log).toEqual(initial.log);
    expect(battleLogBlocks(second).filter((block) => block.kind === 'turn')).toMatchObject([{ unit: 'u1', side: 'attacker', ended: false, entries: [] }]);
    expect(battleLogBlocks(deselect(second)).filter((block) => block.kind === 'turn')).toEqual([]);
  });

  it('keeps enemy reactions inside the acting army turn and closes after end-turn effects', () => {
    const state = act(select(fixture(), 'u0'), { type: 'guard', unit: 'u0', activity: 1 }, scriptedRng([10]));
    state.log.push({ round: state.round, unit: 'u2', text: 'Enemy reacts.' });
    const finished = endActivation(state, scriptedRng([10]));
    expect(finished.log.filter((entry) => entry.turn).map((entry) => entry.turn)).toEqual(['start', 'end']);
    const turns = battleLogBlocks(finished).filter((block) => block.kind === 'turn');
    expect(turns).toHaveLength(1);
    expect(turns[0]).toMatchObject({ unit: 'u0', side: 'attacker', ended: true });
    expect(turns[0].entries.at(-1)?.unit).toBe('u2');
    expect(battleLogBlocks(state).filter((block) => block.kind === 'turn')).toHaveLength(1);
  });

  it('records boundaries for automatic completion and passes while preserving old entries', () => {
    const initial = fixture();
    initial.log.push({ round: 1, unit: 'u2', text: 'An older event.' });
    const full = act(initial, { type: 'guard', unit: 'u0', activity: 3 }, scriptedRng([10]));
    const pass = endActivation(select(initial, 'u0'), scriptedRng([10]));
    for (const state of [full, pass]) {
      expect(state.log.filter((entry) => entry.turn).map((entry) => entry.turn)).toEqual(['start', 'end']);
      expect(battleLogBlocks(state)[0]).toMatchObject({ kind: 'events', entries: initial.log });
      expect(battleLogBlocks(state)[1]).toMatchObject({ kind: 'turn', ended: true });
    }
  });
});

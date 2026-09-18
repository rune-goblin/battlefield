import { describe, expect, it } from 'vitest';
import { answerSurrender, canContinueBattle, declareDayOrder, nextDayBattlefield, recoverAtNight, recoveryDc, resolveDayOrders, startNextDay, suggestDeployment } from '../engine/aftermath.js';
import { createBattle, endActivation, isStanding } from '../engine/battle.js';
import { scriptedRng } from '../engine/rng.js';
import { levelDc } from '../engine/tables.js';
import { parse } from '../engine/board.js';
import { migrateMorale } from '../runtime/session.js';
import { openBoard } from './helpers.js';

function dusk() {
  const state = createBattle({ board: openBoard(), units: [
    { card: { name: 'Line', level: 6, role: 'infantry', disorder: 2, wounds: 2, overrides: { will: 14, fortitude: 14 } }, side: 'attacker', square: 'c2' },
    { card: { name: 'Horse', level: 6, role: 'cavalry', disorder: 1, wounds: 3, overrides: { will: 14, fortitude: 14 } }, side: 'attacker', square: 'e2' },
    { card: { name: 'Enemy', level: 6, role: 'infantry', disorder: 1, wounds: 1, overrides: { will: 14, fortitude: 14 } }, side: 'defender', square: 'c7' },
    { card: { name: 'Lost enemy', level: 15, role: 'infantry' }, side: 'defender', square: 'e7' },
  ] });
  state.units[3].disorder = 3;
  state.phase = 'ended'; state.endedBy = 'dusk'; state.winner = 'draw'; state.round = 6;
  return state;
}

describe('end-of-day decisions', () => {
  it('resolves recovery before decisions and requires both holds before deployment', () => {
    const state = dusk();
    expect(() => declareDayOrder(state, 'attacker', 'hold')).toThrow(/recovery/);
    const recovered = recoverAtNight(state, [{ unit: 'u0', activity: 'rally' }], scriptedRng([20]));
    expect(recovered.units[0].disorder).toBe(0);
    expect(() => startNextDay(recovered, suggestDeployment(recovered))).toThrow(/both holds/);
    const attacker = declareDayOrder(recovered, 'attacker', 'hold');
    expect(() => resolveDayOrders(attacker)).toThrow(/both armies/);
    const next = resolveDayOrders(declareDayOrder(attacker, 'defender', 'hold'));
    expect(next.endedBy).toBe('dusk');
    expect(() => resolveDayOrders(next)).toThrow(/already/);
    expect(() => recoverAtNight(next, [], scriptedRng([10]))).toThrow(/already/);
    expect(startNextDay(next, suggestDeployment(next)).day).toBe(2);
    expect(state.dayOrders).toBeUndefined();
  });

  it.each([
    ['withdraw', 'hold', 'defender'], ['hold', 'withdraw', 'attacker'], ['withdraw', 'withdraw', 'draw'],
  ] as const)('resolves %s / %s without additional casualties', (attacker, defender, winner) => {
    const state = recoverAtNight(dusk(), [], scriptedRng([10]));
    const next = resolveDayOrders(declareDayOrder(declareDayOrder(state, 'attacker', attacker), 'defender', defender));
    expect(next.endedBy).toBe('withdrawal'); expect(next.winner).toBe(winner);
    expect(next.units).toEqual(state.units);
    expect(canContinueBattle(next)).toBe(false);
    expect(() => recoverAtNight(next, [], scriptedRng([10]))).toThrow(/dusk/);
  });

  it('requires the opponent to accept surrender and returns a rejected proposal to its decision', () => {
    const state = declareDayOrder(declareDayOrder(recoverAtNight(dusk(), [], scriptedRng([10])), 'defender', 'hold'), 'attacker', 'surrender');
    expect(state.endedBy).toBe('dusk'); expect(state.winner).toBe('draw');
    expect(() => resolveDayOrders(state)).toThrow(/respond/);
    expect(() => answerSurrender(state, 'attacker', true)).toThrow(/has not proposed/);
    const rejected = answerSurrender(state, 'defender', false);
    expect(rejected.dayOrders!.choices.attacker).toBeUndefined();
    expect(rejected.endedBy).toBe('dusk');
    const accepted = answerSurrender(JSON.parse(JSON.stringify(state)), 'defender', true);
    expect(accepted.endedBy).toBe('surrender'); expect(accepted.winner).toBe('defender');
    expect(accepted.units).toEqual(state.units);
    expect(canContinueBattle(accepted)).toBe(false);
  });
});

describe('overnight recovery', () => {
  it('shares a penalty across both activities per side and counts morale once', () => {
    const state = dusk();
    const next = recoverAtNight(state, [
      { unit: 'u0', activity: 'rally' }, { unit: 'u1', activity: 'treat' }, { unit: 'u2', activity: 'rally' },
    ], scriptedRng([15]));
    expect(next.night!.map((r) => [r.penalty, r.check.modifier, r.check.dc])).toEqual([
      [2, 10, levelDc(6)], [2, 11, levelDc(6)], [0, 13, levelDc(6)],
    ]);
    expect(next.units[0].disorder).toBe(1);
    expect(next.units[1].wounds).toBe(2);
    expect(next.units[1].disorder).toBe(1);
    expect(state.night).toBeNull();
    expect(state.units[0].disorder).toBe(2);
  });

  it('critical recovery restores two of only its own track and caps at full', () => {
    const state = dusk();
    const healed = recoverAtNight(state, [{ unit: 'u0', activity: 'treat' }, { unit: 'u2', activity: 'treat' }], scriptedRng([20]));
    expect(healed.units[0].wounds).toBe(0);
    expect(healed.units[0].disorder).toBe(2);
    expect(healed.night!.map((r) => r.recovered)).toEqual([2, 1]);
    const rallied = recoverAtNight(state, [{ unit: 'u0', activity: 'rally' }], scriptedRng([20]));
    expect(rallied.units[0].disorder).toBe(0);
    expect(rallied.units[0].wounds).toBe(2);
  });

  it('both failures preserve wounds and morale', () => {
    const next = recoverAtNight(dusk(), [{ unit: 'u0', activity: 'treat' }, { unit: 'u1', activity: 'rally' }], scriptedRng([1, 5]));
    expect(next.night!.map((r) => r.check.degree)).toEqual(['critical-failure', 'failure']);
    expect(next.night!.map((r) => r.recovered)).toEqual([0, 0]);
    expect(next.units.slice(0, 2).map((u) => [u.wounds, u.disorder])).toEqual([[2, 2], [3, 1]]);
  });

  it('validates every declaration before rolling and prevents repeat nights', () => {
    const state = dusk();
    let rolls = 0;
    const rng = { d20: () => { rolls++; return 20; } };
    expect(() => recoverAtNight(state, [{ unit: 'u0', activity: 'rally' }, { unit: 'u3', activity: 'rally' }], rng)).toThrow(/standing/);
    expect(() => recoverAtNight(state, [{ unit: 'u0', activity: 'rally' }, { unit: 'u0', activity: 'treat' }], rng)).toThrow(/once/);
    expect(rolls).toBe(0);
    const next = recoverAtNight(state, [], rng);
    expect(() => recoverAtNight(JSON.parse(JSON.stringify(next)), [], rng)).toThrow(/already/);
  });

  it('bases rally DC on enemies returning tomorrow', () => {
    const state = dusk();
    expect(recoveryDc(state, { unit: 'u0', activity: 'rally' })).toBe(levelDc(6));
    state.units[3].status = 'destroyed';
    expect(recoveryDc(state, { unit: 'u0', activity: 'rally' })).toBe(levelDc(6));
    state.endedBy = 'rout';
    expect(canContinueBattle(state)).toBe(false);
  });
});

function holdAfterRecovery(state: ReturnType<typeof dusk>) {
  return resolveDayOrders(declareDayOrder(declareDayOrder(state, 'attacker', 'hold'), 'defender', 'hold'));
}

describe('another battlefield day', () => {
  it('previews a new map and carries survivors and recovery while archiving the old field', () => {
    const state = dusk();
    const engine = { name: 'Catapult', kind: 'artillery' as const, launch: 12, reach: 'long' as const, fired: true,
      status: 'crewed' as const, side: 'attacker' as const, square: parse('c2'), emplaced: false };
    state.units[0].engines = [engine];
    state.units[3].engines = [{ ...engine, side: 'defender', status: 'abandoned', square: parse('e7') }];
    state.engines = [{ ...engine, emplaced: true, square: parse('b2') }];
    state.board.walls['a1|b1'] = { tier: 1, boxes: 2, remaining: 0 };
    state.nextBoard = openBoard('hex', 11);
    state.nextBoard.spec.seed = 17;
    state.nextBoard.squares[4][4].terrain = 'forest';
    const night = holdAfterRecovery(recoverAtNight(state, [{ unit: 'u0', activity: 'rally' }], scriptedRng([20])));
    // Serialization preserves the selected map and the committed recovery result.
    const preview = nextDayBattlefield(JSON.parse(JSON.stringify(night)));
    expect(preview.board).toEqual(state.nextBoard);
    expect(preview.engines).toEqual([]);
    expect(preview.units[3].engines).toEqual([]);
    expect(night.board).toEqual(state.board);
    expect(night.engines).toHaveLength(1);
    const next = startNextDay(night, suggestDeployment(preview));
    expect(next.board).toEqual(state.nextBoard);
    expect(next.nextBoard).toBeNull();
    expect(next.previousBattlefields).toHaveLength(1);
    expect(next.previousBattlefields![0].board).toEqual(state.board);
    expect(next.previousBattlefields![0].engines).toHaveLength(2);
    expect(next.engines).toEqual([]);
    expect(next.units[0]).toMatchObject({ id: 'u0', wounds: 2, disorder: 0 });
    expect(next.units[0].engines[0]).toMatchObject({ status: 'crewed', side: 'attacker', fired: false });
    expect(next.units[3]).toMatchObject({ status: 'left', disorder: 3, engines: [] });
    expect(next.log.some((e) => e.text.includes('new battlefield'))).toBe(true);
    // Switching back to the same field retains its damage and emplacements.
    night.nextBoard = null;
    const same = startNextDay(night, suggestDeployment(nextDayBattlefield(night)));
    expect(same.board).toEqual(state.board);
    expect(same.engines).toHaveLength(1);
    expect(same.previousBattlefields).toBeUndefined();
  });

  it('preserves equipment ownership and recomputes emplacement crews after redeployment', () => {
    const state = dusk();
    const engine = { name: 'Catapult', kind: 'artillery' as const, launch: 12, reach: 'long' as const, fired: true,
      status: 'crewed' as const, side: 'attacker' as const, square: parse('c2'), emplaced: false };
    state.units[0].engines = [engine];
    state.engines = [{ ...engine, status: 'abandoned', square: parse('b2'), emplaced: true }];
    const night = holdAfterRecovery(recoverAtNight(state, [], scriptedRng([10])));
    const positions = suggestDeployment(night);
    positions.u0 = 'b3';
    const next = startNextDay(night, positions);
    expect(next.units[0].engines[0].square).toEqual(parse('b3'));
    expect(next.units[0].engines[0].fired).toBe(false);
    expect(next.engines[0]).toMatchObject({ square: parse('b2'), side: 'attacker', status: 'crewed', fired: false });
    expect(() => startNextDay(night, { ...positions, u0: 'b2' })).toThrow(/deployment/);
    expect(() => startNextDay(night, { ...positions, u1: 'b3' })).toThrow(/occupied/);
  });

  it('uses the configured eight-round day instead of the six-round default', () => {
    let state = createBattle({ board: openBoard(), roundsPerDay: 8, units: [
      { card: { name: 'A', level: 1, role: 'infantry' }, side: 'attacker', square: 'c2' },
      { card: { name: 'D', level: 1, role: 'infantry' }, side: 'defender', square: 'c7' },
    ] });
    for (let i = 0; i < 12; i++) state = endActivation(state, scriptedRng([10]));
    expect(state.round).toBe(7); expect(state.phase).toBe('battle');
    for (let i = 0; i < 4; i++) state = endActivation(state, scriptedRng([10]));
    expect(state.round).toBe(8); expect(state.endedBy).toBe('dusk');
  });

  it('preserves losses, terrain and morale, and clears temporary effects for the next day', () => {
    const state = dusk();
    state.units[1].status = 'destroyed';
    state.units[1].wounds = 4;
    state.units[0].suppressedBy = 'u2'; state.units[0].inspired = true;
    state.board.walls['a1|b1'] = { tier: 1, boxes: 2, remaining: 0 };
    state.roundsPerDay = 8;
    const night = holdAfterRecovery(recoverAtNight(state, [], scriptedRng([10])));
    const next = startNextDay(night, suggestDeployment(night));
    expect(next.day).toBe(2); expect(next.round).toBe(1); expect(next.roundsPerDay).toBe(8);
    expect(next.units.filter(isStanding).map((u) => u.id)).toEqual(['u0', 'u2']);
    expect(next.units[3].status).toBe('left'); expect(next.units[3].disorder).toBe(3);
    expect(next.units[0].disorder).toBe(2); expect(next.units[0].wounds).toBe(2);
    expect(next.units[0].inspired).toBe(false); expect(next.units[0].suppressedBy).toBeNull();
    expect(next.board).toEqual(state.board);
    expect(next.order).toEqual(['u0', 'u2']);
    expect(next.pending).toBe('attacker');
    expect(next.night).toBeNull();
    const afterRound = endActivation(endActivation(next, scriptedRng([10])), scriptedRng([10]));
    expect(afterRound.round).toBe(2);
    expect(afterRound.units[0].disorder).toBe(2);
    const invalid = suggestDeployment(night); invalid.u0 = 'c5';
    expect(() => startNextDay(night, invalid)).toThrow(/deployment/);
  });

  it('settles delayed wounds before deciding the dusk result', () => {
    let state = dusk(); state.phase = 'battle'; state.endedBy = null; state.winner = null;
    state.units[0].disorder = 0; state.units[1].disorder = 0;
    state = endActivation(state, scriptedRng([20]));
    // A late strike can leave damage on a unit whose activation has already ended.
    state.units[0].persistent = { dc: 20 }; state.units[0].wounds = 3;
    while (state.phase === 'battle') state = endActivation(state, scriptedRng([20]));
    expect(state.units[0].wounds).toBe(4);
    expect(state.units[0].status).toBe('destroyed');
    expect(state.units[0].persistent).toBeNull();
  });

  it('migrates previous saves without replacing campaign morale', () => {
    const old = JSON.parse(JSON.stringify(dusk()));
    delete old.day; delete old.roundsPerDay; delete old.night;
    const next = migrateMorale(old);
    expect(next.day).toBe(1); expect(next.roundsPerDay).toBe(6); expect(next.night).toBeNull();
    expect(next.units[0].disorder).toBe(2);
  });
});

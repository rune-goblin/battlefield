import { describe, expect, it } from 'vitest';
import {
  act, activatable, createBattle, declareDayOrder, endActivation, fleePlan, gridOf,
  isFleeEdge, isStanding, isSurvivor, notation, parse, recoverAtNight, resolveDayOrders,
  ROUTED_AT, scriptedRng, startNextDay, suggestDeployment, unit, type GridKind, type UnitCard,
} from '../engine/index.js';
import { createActionResolutionService } from '../services/ActionResolutionService.js';
import { deploymentProblem } from '../services/ArmyPreparationService.js';
import { freshSession } from '../runtime/session.js';
import { createRuntime } from '../runtime/createRuntime.js';
import { fakeArchive, openBoard } from './helpers.js';

const troop: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [], overrides: { will: 12 } };
const setup = () => createBattle({ board: openBoard(), units: [
  { card: troop, side: 'attacker', square: 'c2' },
  { card: troop, side: 'attacker', square: 'e2' },
  { card: troop, side: 'defender', square: 'g8' },
] });
const flee = (s = setup(), die = 20) => act(s, { type: 'flee', unit: 'u0', to: 'c1' }, scriptedRng([die]));

describe('Flee', () => {
  it('commits the move and escape together and restores both with one undo', async () => {
    const session = { ...freshSession(), stage: 'battle' as const, battle: setup() };
    const runtime = createRuntime({ session, dice: scriptedRng([20]), archive: fakeArchive(),
      repository: { load: async () => session, save: async () => {} } });
    const before = structuredClone(runtime.session.battle);
    const result = await runtime.submit({ type: 'action.resolve', action: { type: 'flee', unit: 'u0', to: 'c1' } });
    expect(result.ok).toBe(true);
    expect(runtime.session.battle!.units[0].status).toBe('camp');
    expect(runtime.session.lastCommit!.dice).toEqual([20]);
    expect((await runtime.submit({ type: 'session.undo' })).ok).toBe(true);
    expect(runtime.session.battle).toEqual(before);
  });
  it.each(['square', 'hex'] as GridKind[])('uses every perimeter edge in the starting zone on a %s board', kind => {
    const s = setup(); s.board = openBoard(kind);
    const g = gridOf(s.board), attacker = unit(s, 'u0'), defender = unit(s, 'u2');
    for (const c of g.cells()) {
      const boundary = g.neighbours(c).length < (kind === 'hex' ? 6 : 4);
      expect(isFleeEdge(s, attacker, notation(c))).toBe(boundary && c.rank < 3);
      expect(isFleeEdge(s, defender, notation(c))).toBe(boundary && c.rank >= 6);
    }
    expect(isFleeEdge(s, attacker, 'a99')).toBe(false);
  });

  it('reserves an action to flee after movement and rejects invalid or unaffordable exits', () => {
    const s = setup(), u = unit(s, 'u0');
    expect(fleePlan(s, u, 'c1')).toMatchObject({ moveActions: 1, actions: 2, path: ['c2', 'c1'] });
    expect(fleePlan(s, u, 'c2')).toBeNull();
    expect(() => act(s, { type: 'flee', unit: u.id, to: 'g9' }, scriptedRng([20]))).toThrow(/starting zone/);
    s.active = u.id; s.begun = true; u.actions = 1;
    expect(fleePlan(s, u, 'c1')).toBeNull();
    expect(() => flee(s)).toThrow(/plus one action/);
    u.square = parse('c1');
    expect(fleePlan(s, u, 'c1')).toMatchObject({ moveActions: 0, actions: 1 });
    u.rooted = 1;
    expect(fleePlan(s, u, 'c1')).toBeNull();
  });

  it.each([20, 12])('sends a successful escape to camp without morale loss (die %i)', die => {
    const start = setup(); unit(start, 'u0').disorder = 1;
    const s = flee(start, die), u = unit(s, 'u0');
    expect(u.status).toBe('camp'); expect(u.disorder).toBe(1);
    expect(isStanding(u)).toBe(false); expect(isSurvivor(u)).toBe(true);
    expect(activatable(s, 'attacker').map(u => u.id)).not.toContain(u.id);
    expect(s.log.filter(l => l.check)).toHaveLength(1);
    expect(s.log.filter(l => l.unit === u.id && l.turn === 'end')).toHaveLength(1);
    expect(unit(start, 'u0').status).toBe('active');
    expect(() => act(s, { type: 'flee', unit: u.id, to: 'c1' }, scriptedRng([20]))).toThrow(/activate/);
  });

  it.each([1, 5])('removes a failed escape as routed (die %i)', die => {
    const s = flee(setup(), die), u = unit(s, 'u0');
    expect(u.status).toBe('left'); expect(u.disorder).toBe(ROUTED_AT);
    expect(isSurvivor(u)).toBe(false);
    expect(suggestDeployment(s)).not.toHaveProperty(u.id);
  });

  it('allows leaving contact at the edge and keeps an already routed unit routed', () => {
    const s = setup(); unit(s, 'u0').square = parse('c1'); unit(s, 'u2').square = parse('c2');
    expect(act(s, { type: 'flee', unit: 'u0', to: 'c1' }, scriptedRng([20])).units[0].status).toBe('camp');
    unit(s, 'u0').disorder = ROUTED_AT;
    expect(act(s, { type: 'flee', unit: 'u0', to: 'c1' }, scriptedRng([20])).units[0].status).toBe('left');
  });

  it('retains camp troops through recovery and redeployment on the next day', () => {
    let s = flee(); unit(s, 'u0').wounds = 1;
    s.phase = 'ended'; s.endedBy = 'dusk'; s.winner = 'draw';
    s = recoverAtNight(s, 'attacker', [{ unit: 'u0', activity: 'treat' }], scriptedRng([20]));
    s = recoverAtNight(s, 'defender', [], scriptedRng([]));
    expect(unit(s, 'u0').wounds).toBe(0);
    s = resolveDayOrders(declareDayOrder(declareDayOrder(s, 'attacker', 'hold'), 'defender', 'hold'));
    const positions = suggestDeployment(s);
    expect(positions).toHaveProperty('u0');
    expect(deploymentProblem(s, 'attacker', { u0: positions.u0, u1: positions.u1 }, true)).toBeNull();
    const next = startNextDay(s, positions);
    expect(unit(next, 'u0').status).toBe('active');
    expect(next.order).toContain('u0');
  });

  it('emits the morale roll, rout, movement, and one activation end for the service', () => {
    const before = { ...freshSession(), stage: 'battle' as const, battle: setup() };
    const service = createActionResolutionService({ dice: scriptedRng([1]) });
    const action = { type: 'flee' as const, unit: 'u0', to: 'c1' };
    const after = service.act(before, action), events = service.events(before, after, action);
    expect(events.filter(e => e.type === 'checkResolved')).toHaveLength(1);
    expect(events.filter(e => e.type === 'unitRouted')).toMatchObject([{ unit: 'u0' }]);
    expect(events.filter(e => e.type === 'unitMoved')).toMatchObject([{ route: ['c2', 'c1'] }]);
    expect(events.filter(e => e.type === 'activationEnded')).toHaveLength(1);
  });

  it('awards the field to the remaining force when the last enemy escapes to camp', () => {
    const s = setup(); unit(s, 'u1').status = 'destroyed';
    const escaped = flee(s);
    const ended = endActivation(escaped, scriptedRng([]), 'u2');
    expect(ended.phase).toBe('ended'); expect(ended.winner).toBe('defender');
    expect(ended.endedBy).toBe('withdrawal'); expect(unit(ended, 'u0').status).toBe('camp');
  });
});

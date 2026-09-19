import { describe, expect, it } from 'vitest';
import { commitPlay } from '../app/presentation.js';
import { createBattle, type BattleState, type UnitCard } from '../engine/index.js';
import type { BattleEvent } from '../runtime/events.js';
import { freshSession, type BattleSession } from '../runtime/session.js';
import { openBoard } from './helpers.js';

const infantry: UnitCard = { name: 'Infantry', level: 6, role: 'infantry', tactics: [] };
const kobolds: UnitCard = { name: 'Kobolds', level: 3, role: 'infantry', tactics: [] };

const battleState = (): BattleState => createBattle({
  board: openBoard(),
  units: [
    { card: infantry, side: 'attacker', square: 'c2' },
    { card: kobolds, side: 'defender', square: 'c7' },
  ],
});

const base = freshSession();
const record = (revision: number, battle: BattleState, events: BattleEvent[] = []): BattleSession =>
  ({ ...base, stage: 'battle', battle, revision, lastCommit: { commandId: 'cmd-0', events, dice: [], userId: 'gm' } });

const walked: BattleEvent[] = [
  { id: 'cmd-0:0', type: 'unitMoved', unit: 'u0', from: 'c2', to: 'c4', route: ['c2', 'c3', 'c4'] },
  { id: 'cmd-0:1', type: 'unitMoved', unit: 'u0', from: 'c4', to: 'c5', route: ['c4', 'c5'] },
];

describe('event presentation', () => {
  it("joins an advance's legs into the one road the piece walks", () => {
    const battle = battleState();

    const play = commitPlay(record(1, battle), record(2, battle, walked));

    expect(play?.routes).toEqual([{ unit: 'u0', cells: ['c2', 'c3', 'c4', 'c5'] }]);
  });

  it('stays silent on a revision jump and on a first record', () => {
    const battle = battleState();

    expect(commitPlay(record(1, battle), record(3, battle, walked))).toBeNull();
    expect(commitPlay(null, record(2, battle, walked))).toBeNull();
    expect(commitPlay(record(1, battle), { ...record(2, battle, walked), battleId: 'battle-other' })).toBeNull();
  });

  it('flashes the piece that struck free and marks what it hit', () => {
    const battle = battleState();
    const struck: BattleEvent[] = [
      { id: 'cmd-0:0', type: 'freeStrikeResolved', unit: 'u1', target: 'u0', check: null, text: 'strikes' },
    ];

    const play = commitPlay(record(1, battle), record(2, battle, struck))!;

    expect(play.flashes).toEqual(['u1']);
    expect(play.arrows).toEqual([{ from: 'c7', to: 'c2', toCells: ['c2'], tone: 'fight' }]);
    expect(play.markers.map((m) => m.icon)).toEqual(['attack']);
  });

  it('bursts a cast on each piece it caught', () => {
    const battle = battleState();
    const cast: BattleEvent[] = [
      { id: 'cmd-0:0', type: 'spellResolved', unit: 'u0', tree: 'blast', activity: 1, targets: ['u1'], check: null },
    ];

    const play = commitPlay(record(1, battle), record(2, battle, cast))!;

    expect(play.bursts).toEqual([{ cell: 'c7', tree: 'blast', from: 'c2' }]);
    expect(play.markers.map((m) => m.icon)).toEqual(['cast:blast']);
  });

  it('marks the pieces the acting unit changed', () => {
    const battle = battleState();
    const acting = { ...battle, active: 'u0' };
    const hit: BattleEvent[] = [
      { id: 'cmd-0:0', type: 'checkResolved', unit: 'u0', text: 'hits', lands: { unit: 'u1', reads: 'attack' },
        check: { roll: 14, modifier: 6, total: 20, dc: 17, degree: 'success' } },
      { id: 'cmd-0:1', type: 'woundsChanged', unit: 'u1', from: 0, to: 1 },
    ];

    const play = commitPlay(record(1, acting), record(2, battle, hit))!;

    expect(play.arrows).toEqual([{ from: 'c2', to: 'c7', toCells: ['c7'], tone: 'fight' }]);
    expect(play.markers.map((m) => m.label)).toEqual(['Kobolds']);
  });

  it('reads each result over the piece it lands on, in the order it happened', () => {
    const battle = battleState();
    const check = (degree: 'critical-success' | 'success' | 'failure' | 'critical-failure') =>
      ({ roll: 10, modifier: 6, total: 16, dc: 17, degree });
    const fought: BattleEvent[] = [
      { id: 'cmd-0:0', type: 'checkResolved', unit: 'u0', text: 'strikes', lands: { unit: 'u1', reads: 'attack' }, check: check('failure') },
      { id: 'cmd-0:1', type: 'checkResolved', unit: 'u0', text: 'is repulsed', lands: { unit: 'u0', reads: 'repulse' }, check: check('failure') },
      { id: 'cmd-0:2', type: 'freeStrikeResolved', unit: 'u1', target: 'u0', text: 'strikes free', check: check('critical-success') },
      { id: 'cmd-0:3', type: 'checkResolved', unit: 'u0', text: 'braces', lands: { unit: 'u0', reads: 'check' }, check: check('success') },
      { id: 'cmd-0:4', type: 'unitRouted', unit: 'u0' },
    ];

    const play = commitPlay(record(1, battle), record(2, battle, fought))!;

    expect(play.popups).toEqual([
      { unit: 'u1', cell: 'c7', parts: [{ text: 'Miss', tone: 'bad' }] },
      { unit: 'u0', cell: 'c2', parts: [{ text: 'Repulsed', tone: 'warn' }] },
      { unit: 'u0', cell: 'c2', parts: [{ text: 'Critical Hit', tone: 'good' }] },
      { unit: 'u0', cell: 'c2', parts: [{ text: 'Success', tone: 'good' }] },
      { unit: 'u0', cell: 'c2', parts: [{ text: 'Routed', tone: 'warn', icon: 'routed' }] },
    ]);
  });

  it("follows each piece's result with what it cost in one popup, and keeps a brace silent", () => {
    const battle = battleState();
    const check = (degree: 'success' | 'failure') => ({ roll: 10, modifier: 6, total: 16, dc: 17, degree });
    const fought: BattleEvent[] = [
      { id: 'cmd-0:0', type: 'checkResolved', unit: 'u0', text: 'strikes', lands: { unit: 'u1', reads: 'attack' }, check: check('success') },
      { id: 'cmd-0:1', type: 'checkResolved', unit: 'u1', text: 'braces', lands: { unit: 'u1', reads: 'brace' }, check: check('failure') },
      { id: 'cmd-0:2', type: 'freeStrikeResolved', unit: 'u1', target: 'u0', text: 'strikes free', check: check('failure') },
      { id: 'cmd-0:3', type: 'woundsChanged', unit: 'u1', from: 0, to: 2 },
      { id: 'cmd-0:4', type: 'disorderChanged', unit: 'u1', from: 2, to: 3 },
      { id: 'cmd-0:5', type: 'unitRouted', unit: 'u1' },
      { id: 'cmd-0:6', type: 'disorderChanged', unit: 'u0', from: 1, to: 0 },
    ];

    const play = commitPlay(record(1, battle), record(2, battle, fought))!;

    expect(play.popups.map((p) => [p.unit, p.parts.map((part) => `${part.text}${part.icon ?? ''}:${part.tone}`)])).toEqual([
      ['u1', ['Hit:good']],
      ['u1', ['−2wounds:bad', '−1morale:bad']],
      ['u1', ['Routedrouted:warn']],
      ['u0', ['Miss:bad']],
      ['u0', ['+1morale:good']],
    ]);
  });

  it("reads a save against a cast as Resisted, and a failed save as the spell's name and what it left", () => {
    const battle = battleState();
    const cast = (degree: 'critical-success' | 'success' | 'failure'): BattleEvent =>
      ({ id: 'cmd-0:0', type: 'spellResolved', unit: 'u0', tree: 'controlling', activity: 3, targets: ['u1'],
        check: { roll: 10, modifier: 6, total: 16, dc: 17, degree } });
    const popupsFor = (events: BattleEvent[]) =>
      commitPlay(record(1, battle), record(2, battle, events))!.popups.map((p) => p.parts.map((part) => `${part.text}:${part.tone}`));

    expect(popupsFor([cast('critical-success')])).toEqual([['Resisted:bad']]);
    expect(popupsFor([cast('success'), { id: 'cmd-0:1', type: 'conditionGained', unit: 'u1', condition: 'frightened' }]))
      .toEqual([['Resisted:bad'], ['Frightened:warn']]);
    expect(popupsFor([
      cast('failure'),
      { id: 'cmd-0:1', type: 'disorderChanged', unit: 'u1', from: 0, to: 1 },
      { id: 'cmd-0:2', type: 'conditionGained', unit: 'u1', condition: 'stunned' },
      { id: 'cmd-0:3', type: 'conditionGained', unit: 'u1', condition: 'rooted' },
    ])).toEqual([['Hold:good'], ['−1:bad'], ['Stunned:warn', 'Held:warn']]);
  });

  it('reads a pinning shot as its result, its cost, and the conditions together', () => {
    const battle = battleState();
    const shot: BattleEvent[] = [
      { id: 'cmd-0:0', type: 'checkResolved', unit: 'u0', text: 'pins', lands: { unit: 'u1', reads: 'attack' },
        check: { roll: 14, modifier: 6, total: 20, dc: 17, degree: 'success' } },
      { id: 'cmd-0:1', type: 'woundsChanged', unit: 'u1', from: 0, to: 1 },
      { id: 'cmd-0:2', type: 'conditionGained', unit: 'u1', condition: 'suppressed' },
      { id: 'cmd-0:3', type: 'conditionGained', unit: 'u1', condition: 'pinned' },
    ];

    const play = commitPlay(record(1, battle), record(2, battle, shot))!;

    expect(play.popups.map((p) => p.parts.map((part) => part.text))).toEqual([['Hit'], ['−1'], ['Suppressed', 'Pinned']]);
  });

  it('reads an attack an aegis turned as Blocked over the warded piece, and one that passed as nothing', () => {
    const battle = battleState();
    const aegis = (degree: 'success' | 'failure'): BattleEvent[] => [
      { id: 'cmd-0:0', type: 'checkResolved', unit: 'u0', text: 'tests the aegis', lands: { unit: 'u1', reads: 'aegis' },
        check: { roll: 10, modifier: 6, total: 16, dc: 17, degree } },
    ];

    expect(commitPlay(record(1, battle), record(2, battle, aegis('failure')))!.popups)
      .toEqual([{ unit: 'u1', cell: 'c7', parts: [{ text: 'Blocked', tone: 'bad' }] }]);
    expect(commitPlay(record(1, battle), record(2, battle, aegis('success')))!.popups).toEqual([]);
  });

  it('says nothing over a repulse the attacker shrugged off', () => {
    const battle = battleState();
    const held: BattleEvent[] = [
      { id: 'cmd-0:0', type: 'checkResolved', unit: 'u0', text: 'is repulsed', lands: { unit: 'u0', reads: 'repulse' },
        check: { roll: 15, modifier: 6, total: 21, dc: 17, degree: 'success' } },
    ];

    expect(commitPlay(record(1, battle), record(2, battle, held))!.popups).toEqual([]);
  });
});

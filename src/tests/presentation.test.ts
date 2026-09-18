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
      { id: 'cmd-0:0', type: 'checkResolved', unit: 'u0', text: 'hits',
        check: { roll: 14, modifier: 6, total: 20, dc: 17, degree: 'success' } },
      { id: 'cmd-0:1', type: 'woundsChanged', unit: 'u1', from: 0, to: 1 },
    ];

    const play = commitPlay(record(1, acting), record(2, battle, hit))!;

    expect(play.arrows).toEqual([{ from: 'c2', to: 'c7', toCells: ['c7'], tone: 'fight' }]);
    expect(play.markers.map((m) => m.label)).toEqual(['Kobolds']);
  });
});

import { describe, expect, it } from 'vitest';
import {
  createBattle, ENGINES, parse,
  type BattleState, type EngineState, type Side, type UnitCard,
} from '../engine/index.js';
import { hitPointsFor, prepareOutcome } from '../services/OutcomeApplicationService.js';
import {
  freshSession, type BattleSession, type BattleSetupDraft, type SourceBinding,
} from '../runtime/session.js';
import { openBoard } from './helpers.js';

const card = (name: string): UnitCard => ({ name, level: 6, role: 'infantry', tactics: [] });
const engineCard = (name: string) => ENGINES.find((e) => e.name === name)!;

interface Piece { id: string; name: string; side: Side; square: string; engine?: { id: string; name: string } }

const PIECES: Piece[] = [
  { id: 'unit-line', name: 'Line Infantry', side: 'attacker', square: 'c2', engine: { id: 'eq-ram', name: 'Battering Ram' } },
  { id: 'unit-lancers', name: 'Lancers', side: 'attacker', square: 'd2' },
  { id: 'unit-kobolds', name: 'Kobold Warriors', side: 'defender', square: 'c7', engine: { id: 'eq-catapult', name: 'Crossbow Catapult' } },
  { id: 'unit-trolls', name: 'Troll Marauders', side: 'defender', square: 'd7' },
];
const EMPLACEMENT = { id: 'eq-ballista', name: 'Ballista', side: 'defender' as Side, square: 'e8' };

const SOURCES: SourceBinding[] = [
  { unitId: 'unit-line', actorUuid: 'Actor.line', campaignId: 'army-1', baseline: { hitPoints: 60, maxHitPoints: 60, demoralized: 0 } },
  { unitId: 'unit-kobolds', actorUuid: 'Actor.kobolds', baseline: { hitPoints: 24, maxHitPoints: 40, demoralized: 2 } },
];

function draft(): BattleSetupDraft {
  const board = openBoard();
  return {
    spec: board.spec,
    board,
    units: PIECES.map((p) => ({
      id: p.id, card: card(p.name), side: p.side, square: p.square, engines: p.engine ? [{ ...p.engine }] : [],
    })),
    emplacements: [{ ...EMPLACEMENT, square: EMPLACEMENT.square }],
  };
}

function endedBattle(): BattleState {
  const battle = createBattle({
    board: openBoard(),
    units: PIECES.map((p) => ({
      id: p.id,
      card: card(p.name),
      side: p.side,
      square: p.square,
      engines: p.engine ? [{ id: p.engine.id, card: engineCard(p.engine.name) }] : [],
    })),
    engines: [{ id: EMPLACEMENT.id, card: engineCard(EMPLACEMENT.name), side: EMPLACEMENT.side, square: EMPLACEMENT.square }],
  });
  battle.phase = 'ended';
  battle.endedBy = 'rout';
  battle.winner = 'attacker';
  battle.round = 4;
  return battle;
}

function sessionOf(edit: (battle: BattleState) => void = () => {}): BattleSession {
  const battle = endedBattle();
  edit(battle);
  return {
    ...freshSession('battle-outcome'), stage: 'aftermath', setup: draft(), battle, sources: SOURCES.map((s) => ({ ...s })),
  };
}

const unitOf = (battle: BattleState, id: string) => battle.units.find((u) => u.id === id)!;
const reportOn = (id: string, session: BattleSession) => prepareOutcome(session).units.find((u) => u.unitId === id)!;
const equipmentOn = (id: string, session: BattleSession) => prepareOutcome(session).equipment.find((e) => e.id === id)!;

describe('outcome preparation', () => {
  it('writes hit points back on the four wound thresholds', () => {
    expect([0, 1, 2, 3, 4].map((w) => hitPointsFor(w, 60))).toEqual([60, 45, 30, 15, 0]);

    const session = sessionOf((battle) => { unitOf(battle, 'unit-kobolds').wounds = 2; });

    expect(reportOn('unit-kobolds', session).after).toMatchObject({ hitPoints: 20, maxHitPoints: 40 });
    expect(reportOn('unit-line', session).after.hitPoints).toBe(60);
  });

  it('replaces Demoralized with the final disorder rather than keeping the higher value', () => {
    const rallied = sessionOf((battle) => { unitOf(battle, 'unit-kobolds').disorder = 0; });
    const worse = sessionOf((battle) => { unitOf(battle, 'unit-kobolds').disorder = 3; });

    expect(reportOn('unit-kobolds', rallied).before!.demoralized).toBe(2);
    expect(reportOn('unit-kobolds', rallied).after.demoralized).toBe(0);
    expect(reportOn('unit-kobolds', worse).after.demoralized).toBe(3);
  });

  it('requires Routed of every survivor at three disorder, including one that left the field', () => {
    const session = sessionOf((battle) => {
      unitOf(battle, 'unit-kobolds').disorder = 3;
      const trolls = unitOf(battle, 'unit-trolls');
      trolls.disorder = 3;
      trolls.status = 'left';
      const lancers = unitOf(battle, 'unit-lancers');
      lancers.disorder = 3;
      lancers.status = 'destroyed';
    });

    expect(reportOn('unit-kobolds', session).routed).toBe(true);
    expect(reportOn('unit-trolls', session).routed).toBe(true);
    expect(reportOn('unit-lancers', session).routed).toBe(false);
    expect(reportOn('unit-line', session).routed).toBe(false);
  });

  it('asks no historical-rout check of a unit that rallied before it left', () => {
    const session = sessionOf((battle) => {
      const trolls = unitOf(battle, 'unit-trolls');
      trolls.status = 'left';
      trolls.disorder = 1;
    });

    expect(reportOn('unit-trolls', session)).toMatchObject({ status: 'left', routed: false, disband: false });
  });

  it('records a departure from the field as its own status', () => {
    const session = sessionOf((battle) => { unitOf(battle, 'unit-trolls').status = 'left'; });

    expect(reportOn('unit-trolls', session).status).toBe('left');
    expect(reportOn('unit-line', session).status).toBe('active');
  });

  it('marks a destroyed unit for disbanding at no hit points', () => {
    const session = sessionOf((battle) => {
      const kobolds = unitOf(battle, 'unit-kobolds');
      kobolds.status = 'destroyed';
      kobolds.wounds = 4;
    });

    expect(reportOn('unit-kobolds', session)).toMatchObject({ disband: true, routed: false });
    expect(reportOn('unit-kobolds', session).after.hitPoints).toBe(0);
    expect(reportOn('unit-line', session).disband).toBe(false);
  });

  it('hands a captured engine to the capturing side', () => {
    const attached = sessionOf((battle) => { unitOf(battle, 'unit-line').engines[0].status = 'captured'; });
    const seized = sessionOf((battle) => {
      battle.engines[0].side = 'attacker';
      battle.engines[0].status = 'crewed';
    });

    expect(equipmentOn('eq-ram', attached)).toMatchObject({ before: 'attacker', after: 'defender', disposition: 'captured' });
    expect(equipmentOn('eq-ballista', seized)).toMatchObject({ before: 'defender', after: 'attacker', disposition: 'captured' });
  });

  it('counts an abandoned engine as lost and a crewed one as kept', () => {
    const session = sessionOf((battle) => { unitOf(battle, 'unit-kobolds').engines[0].status = 'abandoned'; });

    expect(equipmentOn('eq-catapult', session)).toMatchObject({ after: null, disposition: 'lost' });
    expect(equipmentOn('eq-ram', session)).toMatchObject({ before: 'attacker', after: 'attacker', disposition: 'kept' });
  });

  it('reads the equipment left on an earlier battlefield beside the equipment still in play', () => {
    const abandoned: EngineState = {
      id: 'eq-old', name: 'Ballista', kind: 'artillery', launch: 9, reach: 'medium',
      fired: true, status: 'abandoned', square: parse('e5'), side: 'attacker', emplaced: false,
    };
    const session = sessionOf((battle) => {
      battle.day = 2;
      battle.previousBattlefields = [{ day: 1, board: openBoard(), engines: [abandoned] }];
    });

    const outcome = prepareOutcome(session);

    expect(outcome.equipment.map((e) => e.id).sort()).toEqual(['eq-ballista', 'eq-catapult', 'eq-old', 'eq-ram']);
    expect(outcome.equipment.find((e) => e.id === 'eq-old')).toMatchObject({ day: 1, disposition: 'lost' });
    expect(outcome.equipment.find((e) => e.id === 'eq-ram')!.day).toBe(2);
  });

  it('reports the walls that still stand on every field fought over', () => {
    const session = sessionOf((battle) => {
      battle.day = 2;
      const earlier = openBoard();
      earlier.spec.construction = { kind: 'fort', tier: 1 };
      earlier.walls = { 'a1|a2': { tier: 1, boxes: 2, remaining: 2 } };
      battle.previousBattlefields = [{ day: 1, board: earlier, engines: [] }];
      battle.board.spec.construction = { kind: 'fort', tier: 2 };
      battle.board.walls = {
        'b1|b2': { tier: 2, boxes: 3, remaining: 1 },
        'c1|c2': { tier: 2, boxes: 3, remaining: 0 },
      };
    });

    expect(prepareOutcome(session).fortifications).toEqual([
      { day: 1, tier: 1, segments: 1, boxes: 2, remaining: 2, breached: 0 },
      { day: 2, tier: 2, segments: 2, boxes: 6, remaining: 1, breached: 1 },
    ]);
  });

  it('falls the loser’s survivors back one hex and nobody on a draw', () => {
    const session = sessionOf((battle) => { unitOf(battle, 'unit-trolls').status = 'destroyed'; });
    const drawn = sessionOf((battle) => { battle.winner = 'draw'; battle.endedBy = 'withdrawal'; });

    expect(prepareOutcome(session).fallback).toEqual({ side: 'defender', units: ['unit-kobolds'] });
    expect(reportOn('unit-line', session).fallsBack).toBe(false);
    expect(prepareOutcome(drawn).fallback).toBeNull();
  });

  it('refuses a dusk ending that can continue, and a battle still being fought', () => {
    const dusk = sessionOf((battle) => { battle.endedBy = 'dusk'; battle.winner = 'draw'; });
    const fighting = sessionOf((battle) => { battle.phase = 'battle'; });

    expect(() => prepareOutcome(dusk)).toThrow('the day ended at dusk and the battle can go on');
    expect(() => prepareOutcome(fighting)).toThrow('the battle is still being fought');
    expect(() => prepareOutcome({ ...sessionOf(), battle: null })).toThrow('no battle is under way');
  });

  it('prepares a dusk ending one side cannot continue', () => {
    const session = sessionOf((battle) => {
      battle.endedBy = 'dusk';
      for (const u of battle.units) if (u.side === 'defender') u.status = 'destroyed';
    });

    expect(prepareOutcome(session).endedBy).toBe('dusk');
  });

  it('reports a unit no campaign sent without a writeback of its own', () => {
    const outcome = prepareOutcome(sessionOf());
    const lancers = outcome.units.find((u) => u.unitId === 'unit-lancers')!;

    expect(lancers).toMatchObject({ actorUuid: null, before: null });
    expect(lancers.after).toEqual({ hitPoints: null, maxHitPoints: null, demoralized: 0 });
    expect(outcome.units.find((u) => u.unitId === 'unit-line')).toMatchObject({
      actorUuid: 'Actor.line', campaignId: 'army-1',
    });
  });
});

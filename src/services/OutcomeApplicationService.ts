import {
  canContinueBattle, MAX_WOUNDS, ROUTED_AT,
  type BattleState, type Board, type EngineState, type Side, type Unit,
} from '../engine/index.js';
import type { BattleSession, ImportBaseline } from '../runtime/session.js';

/** What the campaign writes on the actor behind a unit. */
export interface OutcomeValues {
  /** Null when no import baseline states a maximum to scale the wounds against. */
  hitPoints: number | null;
  maxHitPoints: number | null;
  /** The battle's final disorder, which replaces the campaign's Demoralized outright. */
  demoralized: number;
}

export interface OutcomeUnit {
  unitId: string;
  name: string;
  side: Side;
  /** Null for a unit no campaign sent. It still reports its result; nothing writes it back. */
  actorUuid: string | null;
  campaignId?: string;
  /** What the import read on the actor. The writeback compares against it before it writes. */
  before: ImportBaseline | null;
  after: OutcomeValues;
  wounds: number;
  disorder: number;
  status: Unit['status'];
  /** A survivor at the rout mark takes the campaign's Routed condition, including one that
   * left the field. One that rallied before it left finishes standing and takes none. */
  routed: boolean;
  disband: boolean;
  /** The loser's survivors fall back one hex toward their nearest friendly settlement. */
  fallsBack: boolean;
}

export type EquipmentDisposition = 'kept' | 'captured' | 'lost';

export interface OutcomeEquipment {
  id: string;
  name: string;
  /** The army that brought it, when the setup that made this battle still names it. */
  before: Side | null;
  /** Who works it now; null for a piece left on the field. */
  after: Side | null;
  status: EngineState['status'];
  disposition: EquipmentDisposition;
  /** The battlefield day it ended on. An earlier field keeps what stayed behind on it. */
  day: number;
}

/** One field's walls at the end of the day fought on it. */
export interface OutcomeFortification {
  day: number;
  tier: number | null;
  segments: number;
  boxes: number;
  remaining: number;
  breached: number;
}

export interface BattleOutcome {
  battleId: string;
  day: number;
  round: number;
  winner: Side | 'draw' | null;
  endedBy: BattleState['endedBy'];
  units: OutcomeUnit[];
  equipment: OutcomeEquipment[];
  /** Every field the battle was fought on, earliest day first. */
  fortifications: OutcomeFortification[];
  /** The losing army, whose survivors fall back one hex. Null for a draw. */
  fallback: { side: Side; units: string[] } | null;
}

const other = (side: Side): Side => (side === 'attacker' ? 'defender' : 'attacker');

/**
 * The writeback ladder: full, ⌊¾⌋, ⌊½⌋, ⌊¼⌋, 0. `woundsOf` in the PF2e adapter inverts it, so
 * a unit written back at one wound imports at one wound.
 */
export function hitPointsFor(wounds: number, maxHitPoints: number): number {
  if (maxHitPoints <= 0) return 0;
  const taken = Math.max(0, Math.min(MAX_WOUNDS, Math.trunc(wounds)));
  if (taken >= MAX_WOUNDS) return 0;
  const ladder = [
    maxHitPoints,
    Math.floor((maxHitPoints * 3) / 4),
    Math.floor(maxHitPoints / 2),
    Math.floor(maxHitPoints / 4),
  ];
  // proto: a survivor is never written back dead. A troop with fewer than four hit points
  // floors to zero on the lower rungs, and zero hit points is a destroyed unit.
  return Math.max(1, ladder[taken]);
}

function unitOutcome(unit: Unit, session: BattleSession, loser: Side | null): OutcomeUnit {
  const binding = session.sources.find((s) => s.unitId === unit.id);
  const max = binding ? binding.baseline.maxHitPoints : null;
  const survivor = unit.status !== 'destroyed';
  return {
    unitId: unit.id,
    name: unit.name,
    side: unit.side,
    actorUuid: binding?.actorUuid ?? null,
    ...(binding?.campaignId === undefined ? {} : { campaignId: binding.campaignId }),
    before: binding ? { ...binding.baseline } : null,
    after: {
      hitPoints: max === null ? null : hitPointsFor(unit.wounds, max),
      maxHitPoints: max,
      demoralized: unit.disorder,
    },
    wounds: unit.wounds,
    disorder: unit.disorder,
    status: unit.status,
    routed: survivor && unit.disorder >= ROUTED_AT,
    disband: unit.status === 'destroyed',
    fallsBack: survivor && loser !== null && unit.side === loser,
  };
}

/** Who brought each piece, by the equipment ID setup minted. An emplacement that changed hands
 * carries its captor's side in the battle, so the draft is the only record of its first owner. */
function originalOwners(session: BattleSession): Map<string, Side> {
  const owners = new Map<string, Side>();
  for (const u of session.setup.units) for (const e of u.engines) owners.set(e.id, u.side);
  for (const e of session.setup.emplacements) owners.set(e.id, e.side);
  return owners;
}

function equipmentOutcome(engine: EngineState, day: number, owners: Map<string, Side>): OutcomeEquipment {
  const before = owners.get(engine.id) ?? null;
  // An attached piece keeps its owner's side when it is captured; a seized emplacement instead
  // holds its captor's side already.
  const after = engine.status === 'abandoned' ? null
    : engine.status === 'captured' ? other(engine.side)
      : engine.side;
  const disposition: EquipmentDisposition = after === null ? 'lost'
    : engine.status === 'captured' || (before !== null && after !== before) ? 'captured'
      : 'kept';
  return { id: engine.id, name: engine.name, before, after, status: engine.status, disposition, day };
}

function fortificationOf(board: Board, day: number): OutcomeFortification {
  const walls = Object.values(board.walls ?? {});
  return {
    day,
    tier: board.spec.construction?.tier ?? null,
    segments: walls.length,
    boxes: walls.reduce((n, w) => n + w.boxes, 0),
    remaining: walls.reduce((n, w) => n + w.remaining, 0),
    breached: walls.filter((w) => w.remaining <= 0).length,
  };
}

/**
 * The battle as the campaign receives it: every unit's before and after, every piece of
 * equipment kept, captured or lost — on this field and on the ones the armies left — the walls
 * that still stand, and the loser's fallback. Pure, and it reads the record alone.
 */
export function prepareOutcome(session: BattleSession): BattleOutcome {
  const battle = session.battle;
  if (!battle) throw new Error('no battle is under way');
  if (battle.phase !== 'ended') throw new Error('the battle is still being fought');
  if (canContinueBattle(battle)) throw new Error('the day ended at dusk and the battle can go on');

  const loser = battle.winner === 'attacker' || battle.winner === 'defender' ? other(battle.winner) : null;
  const units = battle.units.map((u) => unitOutcome(u, session, loser));

  const owners = originalOwners(session);
  const seen = new Set<string>();
  const equipment: OutcomeEquipment[] = [];
  const collect = (engines: EngineState[], day: number) => {
    for (const e of engines) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      equipment.push(equipmentOutcome(e, day, owners));
    }
  };
  // The live pieces first: a field's archive holds what stayed on it, so a repeated ID would
  // be a stale copy of a piece that travelled.
  collect([...battle.engines, ...battle.units.flatMap((u) => u.engines)], battle.day);
  const fields = [...(battle.previousBattlefields ?? [])].sort((a, b) => a.day - b.day);
  for (const field of fields) collect(field.engines, field.day);

  return {
    battleId: session.battleId,
    day: battle.day,
    round: battle.round,
    winner: battle.winner,
    endedBy: battle.endedBy,
    units,
    equipment,
    fortifications: [
      ...fields.map((f) => fortificationOf(f.board, f.day)),
      fortificationOf(battle.board, battle.day),
    ],
    fallback: loser === null
      ? null
      : { side: loser, units: units.filter((u) => u.fallsBack).map((u) => u.unitId) },
  };
}

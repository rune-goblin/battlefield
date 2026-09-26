import {
  canContinueBattle, MAX_WOUNDS, opponent, ROUTED_AT,
  type BattleState, type Board, type EngineState, type Side, type Unit,
} from '../engine/index.js';
import type { BattleCommand, CommandResult } from '../runtime/commands.js';
import {
  CAMPAIGN_TARGET, writebackComplete,
  type BattleSession, type ImportBaseline, type WritebackStatus, type WritebackTarget,
  type WritebackValues, type WritebackVia,
} from '../runtime/session.js';

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
  // The draft's side is the army that brought the piece. An engine nobody claimed is worked by
  // neither army in the battle and is still that army's property in the campaign.
  for (const e of session.setup.emplacements) owners.set(e.id, e.side);
  return owners;
}

function equipmentOutcome(engine: EngineState, day: number, owners: Map<string, Side>): OutcomeEquipment {
  const before = owners.get(engine.id) ?? null;
  // An attached piece keeps its owner's side when it is captured; a seized emplacement instead
  // holds its captor's side already.
  const after = engine.status === 'abandoned' ? null
    : engine.status === 'captured' && engine.side ? opponent(engine.side)
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

  const loser = battle.winner === 'attacker' || battle.winner === 'defender' ? opponent(battle.winner) : null;
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

/** One battle, one operation. The host API is idempotent on this, so a save reloaded from
 * before finalization can never apply the same battle's outcome twice. */
export const operationIdFor = (battleId: string): string => `outcome-${battleId}`;

/** The campaign module that owns kingdom consequences. Both calls resolve the host API afresh,
 * so a module enabled after this client started is still found. */
export interface CampaignOutcomePort {
  available(): boolean;
  apply(outcome: BattleOutcome, operationId: string): Promise<CampaignApplyResult>;
}

export type CampaignApplyResult = { ok: true } | { ok: false; message: string };

/** Troop actors, read and written one at a time, in absolute values. */
export interface ActorWritebackPort {
  /** Null when this table does not hold the actor. */
  read(actorUuid: string): Promise<WritebackValues | null>;
  write(actorUuid: string, values: WritebackValues): Promise<void>;
}

const targetFor = (unit: OutcomeUnit): WritebackTarget[] => (
  unit.actorUuid === null || unit.before === null || unit.after.hitPoints === null ? [] : [{
    unitId: unit.unitId,
    name: unit.name,
    actorUuid: unit.actorUuid,
    desired: { hitPoints: unit.after.hitPoints, demoralized: unit.after.demoralized },
    baseline: { hitPoints: unit.before.hitPoints, demoralized: unit.before.demoralized },
    status: 'pending',
  }]);

/**
 * The GM's confirmation, as the record holds it: the operation ID and every target the run
 * will write, with the values already fixed. The outcome is prepared here rather than taken
 * from the caller, so the targets are the authority's own reading of the final record.
 */
export function beginWriteback(
  session: BattleSession, operationId: string, via: WritebackVia,
): BattleSession {
  if (session.writeback) throw new Error('the campaign outcome is already being applied');
  const outcome = prepareOutcome(session);
  const targets: WritebackTarget[] = via === 'campaign'
    ? [{ unitId: CAMPAIGN_TARGET, name: 'the campaign', actorUuid: null, desired: null, baseline: null, status: 'pending' }]
    : outcome.units.flatMap(targetFor);
  return { ...session, writeback: { operationId, via, targets } };
}

/** One target's progress, committed before the run moves to the next. */
export function markWritebackTarget(
  session: BattleSession, unitId: string, status: Exclude<WritebackStatus, 'pending'>, problem?: string,
): BattleSession {
  const record = session.writeback;
  if (!record) throw new Error('no campaign outcome is being applied');
  if (!record.targets.some((t) => t.unitId === unitId)) throw new Error(`${unitId} is no writeback target`);
  const targets = record.targets.map((target) => {
    if (target.unitId !== unitId) return target;
    const next: WritebackTarget = { ...target, status };
    delete next.problem;
    return problem === undefined ? next : { ...next, problem };
  });
  return { ...session, writeback: { ...record, targets } };
}

/** The GM's way out of a writeback that cannot finish: the record reopens and the battle stays
 * where it stands, so a conflict settled elsewhere does not leave the table wedged. */
export const abandonWriteback = (session: BattleSession): BattleSession => ({ ...session, writeback: null });

export interface WritebackConflict { unitId: string; message: string }

export interface WritebackReport {
  ok: boolean;
  operationId: string;
  /** The targets this run wrote. Empty on a second run over a finished writeback. */
  written: string[];
  conflicts: WritebackConflict[];
  /** Why the run stopped short. */
  message?: string;
}

export interface OutcomeRun {
  /** The record as it stands, read again after every commit. */
  session(): BattleSession;
  submit(command: BattleCommand): Promise<CommandResult>;
  /** The revision the GM confirmed the report at. A record that has moved refuses the run. */
  revision: number;
  /** The report the GM confirmed, handed to a campaign module as it stands. */
  outcome: BattleOutcome;
}

export interface OutcomeApplicationService {
  /**
   * Apply the confirmed outcome, target by target, committing each one's progress before the
   * next begins. Run it again after an interruption and it picks up at the first unfinished
   * target; run it again after it finished and it writes nothing.
   */
  applyOutcome(run: OutcomeRun): Promise<WritebackReport>;
}

export interface OutcomeApplicationDependencies {
  /** The campaign module's own writeback. Absent, or reporting itself away, hands the work to
   * the troop actors. */
  campaign?: CampaignOutcomePort | null;
  actors?: ActorWritebackPort | null;
}

type Step = { ok: true } | { ok: false; message: string };

const failure = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const same = (a: WritebackValues, b: WritebackValues): boolean =>
  a.hitPoints === b.hitPoints && a.demoralized === b.demoralized;

const reads = (values: WritebackValues): string =>
  `${values.hitPoints} hit points and ${values.demoralized} Demoralized`;

/**
 * The campaign handoff. Every actor mutation runs here, on the client that holds the executor,
 * which is the primary GM: two modules writing one actor from separate queues clobber each
 * other, so the writeback stays on one client and goes one target at a time.
 */
export function createOutcomeApplicationService(
  { campaign = null, actors = null }: OutcomeApplicationDependencies = {},
): OutcomeApplicationService {
  async function writeActor(target: WritebackTarget): Promise<Step> {
    if (!actors) return { ok: false, message: 'no troop adapter is installed' };
    const { actorUuid, desired, baseline } = target;
    if (!actorUuid || !desired) return { ok: false, message: `${target.name} names no actor to write` };
    let current: WritebackValues | null;
    try {
      current = await actors.read(actorUuid);
    } catch (error) {
      return { ok: false, message: failure(error) };
    }
    if (!current) return { ok: false, message: `${actorUuid} is not on this table` };
    // The desired values are the marker: an actor already carrying them was written by a run
    // that died before it could commit the target, so the baseline is not consulted.
    if (same(current, desired)) return { ok: true };
    if (baseline && !same(current, baseline)) {
      return {
        ok: false,
        message: `${target.name} has changed since the battle imported it: it holds ${reads(current)}, not ${reads(baseline)}`,
      };
    }
    try {
      await actors.write(actorUuid, desired);
    } catch (error) {
      return { ok: false, message: failure(error) };
    }
    return { ok: true };
  }

  async function applyTarget(
    target: WritebackTarget, via: WritebackVia, outcome: BattleOutcome, operationId: string,
  ): Promise<Step> {
    if (via === 'actors') return writeActor(target);
    if (!campaign) return { ok: false, message: 'no campaign module is installed' };
    try {
      const result = await campaign.apply(outcome, operationId);
      return result.ok ? { ok: true } : { ok: false, message: result.message };
    } catch (error) {
      return { ok: false, message: failure(error) };
    }
  }

  return {
    async applyOutcome({ session, submit, revision, outcome }) {
      const start = session();
      const operationId = operationIdFor(start.battleId);
      const written: string[] = [];
      const conflicts: WritebackConflict[] = [];
      const report = (ok: boolean, message?: string): WritebackReport =>
        ({ ok, operationId, written, conflicts, ...(message === undefined ? {} : { message }) });

      if (start.revision !== revision) {
        return report(false, `the battle has moved on to revision ${start.revision}`);
      }
      // The finished record is what makes a second run harmless on this side; the host API's
      // own idempotency covers a request that reaches it another way.
      if (start.writeback?.operationId === operationId && writebackComplete(start)) return report(true);

      if (!start.writeback) {
        const via: WritebackVia = campaign?.available() ? 'campaign' : 'actors';
        const begun = await submit({ type: 'outcome.begin', operationId, via });
        if (!begun.ok) return report(false, begun.message);
      }

      for (;;) {
        const record = session().writeback;
        if (!record) return report(false, 'the campaign writeback was dropped');
        const target = record.targets.find((t) => t.status !== 'written');
        if (!target) break;

        const step = await applyTarget(target, record.via, outcome, operationId);
        if (step.ok) written.push(target.unitId);
        else conflicts.push({ unitId: target.unitId, message: step.message });

        const marked = await submit({
          type: 'outcome.markTarget',
          unitId: target.unitId,
          status: step.ok ? 'written' : 'conflict',
          ...(step.ok ? {} : { problem: step.message }),
        });
        if (!marked.ok) return report(false, marked.message);
        // A conflict is the GM's to settle. The run stops with the record open at this target,
        // and the next run starts here rather than at the top.
        if (!step.ok) return report(false, step.message);
      }

      const finalized = await submit({ type: 'battle.finalize' });
      return finalized.ok ? report(true) : report(false, finalized.message);
    },
  };
}

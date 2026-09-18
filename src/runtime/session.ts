import {
  COMBATANTS, LAST_ROUND, OFFICIAL, ROUTED_AT, SIDES,
  type BattleState, type Board, type BoardSpec, type RecoveryChoice, type Side, type UnitCard, type Unit,
} from '../engine/index.js';
import { hotSeatControl, isSideControl, type SideControl } from './control.js';
import type { BattleEvent } from './events.js';
import type { InteractionKind, InteractionRecord } from './interactions.js';

export const SCHEMA_VERSION = 1;
// proto: the rules document carries no version of its own, so the record dates them. Reserved
// for review with the rest of the migration shape.
export const RULES_VERSION = '2026-09-18';

export type LifecycleStage = 'setup' | 'deployment' | 'battle' | 'aftermath' | 'finalized';
const LIFECYCLE_STAGES: LifecycleStage[] = ['setup', 'deployment', 'battle', 'aftermath', 'finalized'];

/** An engine riding with a unit, named by the library card it came from. */
export interface SetupEquipment { id: string; name: string }
export interface SetupUnit { id: string; card: UnitCard; side: Side; square: string | null; engines: SetupEquipment[] }
/** An engine deployed on a square of its own. `engines` on a SetupUnit is the attached kind. */
export interface SetupEngine { id: string; name: string; side: Side; square: string | null }
export interface BattleSetupDraft {
  spec: BoardSpec;
  board: Board | null;
  units: SetupUnit[];
  emplacements: SetupEngine[];
  roundsPerDay?: number;
}

/** What the last commit did and what it drew. `dice` holds the faces of the transition in
 * order, so a chat card is rebuilt from the same numbers the rules read. `userId` is who sent
 * it, so a viewer's own commit can be told apart from another user's for the activity notice. */
export interface CommitRecord { commandId: string; events: BattleEvent[]; dice: number[]; userId: string }

export interface BattleSession {
  schemaVersion: number;
  rulesVersion: string;
  battleId: string;
  revision: number;
  stage: LifecycleStage;
  setup: BattleSetupDraft;
  battle: BattleState | null;
  /** The shared decisions this stage and day are waiting on: side readiness, recovery
   * declarations, surrender responses, and next-day deployment. Each carries its own scope,
   * and a commit that leaves that scope clears it. */
  interactions: InteractionRecord[];
  /** Who plays each side and where each side's rotation stands. */
  control: SideControl;
  /** The user whose activation is open, named in the commit that made their side pending.
   * Null whenever no battle is running. */
  turn: string | null;
  lastCommit: CommitRecord | null;
  /** The most recent command IDs, so a resent command is answered instead of re-run. */
  recentCommandIds: string[];
}

// proto: ID format reserved for review. One shape for every identity the record holds.
const mintId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const newBattleId = (): string => mintId('battle');
/** A piece takes its ID when it enters setup and keeps it through the battle and beyond. */
export const newUnitId = (): string => mintId('unit');
export const newEquipmentId = (): string => mintId('eq');
export const newInteractionId = (): string => mintId('int');

export const randomSeed = () => Math.floor(Math.random() * 1e9);

export function defaultSetup(): BattleSetupDraft {
  const pick = (name: string) => [...COMBATANTS, ...OFFICIAL].find((c) => c.name === name)!;
  const unit = (name: string, side: Side, square: string): SetupUnit =>
    ({ id: newUnitId(), card: pick(name), side, square, engines: [] });
  return {
    spec: { base: 'plains', size: 11, feature: 'none', construction: null, seed: randomSeed() },
    board: null,
    emplacements: [],
    units: [
      unit('Line Infantry', 'attacker', 'e3'),
      unit('Heavy Cavalry', 'attacker', 'g3'),
      // Apprentice Magician Clique (L5) sits between Line Infantry (L6) and Heavy Cavalry (L7).
      unit('Apprentice Magician Clique', 'attacker', 'f3'),
      unit('Kobold Warriors', 'defender', 'e9'),
      unit('Troll Marauders', 'defender', 'g9'),
      // Mitflit Vermin Cavalry (L4) sits between Kobold Warriors (L3) and Troll Marauders (L8).
      unit('Mitflit Vermin Cavalry', 'defender', 'f9'),
    ],
  };
}

export function freshSession(battleId = newBattleId()): BattleSession {
  return {
    schemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    battleId,
    revision: 0,
    stage: 'setup',
    setup: defaultSetup(),
    battle: null,
    interactions: [],
    control: hotSeatControl(),
    turn: null,
    lastCommit: null,
    recentCommandIds: [],
  };
}

/** A save written before a field existed still parses; it crashes later, at render. Drop it
 * here so a missed schema bump costs a fresh start rather than a broken board. */
export const intactBattle = (b: BattleState | null | undefined): boolean =>
  !!b && Array.isArray(b.units) && Array.isArray(b.engines) && Array.isArray(b.log)
  // Units gained `selfBuffs`, which `finish` reads on every activation.
  && b.units.every((u) => Array.isArray(u.selfBuffs));

/** Apply the three-pip rule to an existing save while preserving battle progress. */
export function migrateMorale(battle: BattleState): BattleState {
  battle.day ??= 1;
  battle.roundsPerDay ??= LAST_ROUND;
  battle.night ??= null;
  for (const u of battle.units) {
    delete (u as Unit & { quality?: number }).quality;
    u.disorder = Math.max(0, Math.min(ROUTED_AT, u.disorder));
    if (u.status === 'active' && u.disorder >= ROUTED_AT) {
      for (const engine of u.engines) if (engine.status === 'crewed') engine.status = 'abandoned';
    }
  }
  return battle;
}

function isSetupDraft(value: unknown): value is BattleSetupDraft {
  const s = value as BattleSetupDraft | null;
  return !!s && typeof s === 'object' && !!s.spec && typeof s.spec === 'object' && Array.isArray(s.units);
}

/** Fill the fields a setup gained after it was written. A setup written before Wave 2.2 named
 * its pieces by array position and its attached engines by name alone; both take IDs here. */
function repairSetup(setup: BattleSetupDraft): BattleSetupDraft {
  setup.spec.size ??= (setup.board?.squares.length as 9 | 11 | undefined) ?? 11;
  setup.emplacements ??= [];
  for (const u of setup.units) {
    if (!u.id) u.id = newUnitId();
    const engines = (u.engines ?? []) as (SetupEquipment | string)[];
    u.engines = engines.map((e) => (typeof e === 'string'
      ? { id: newEquipmentId(), name: e }
      : { ...e, id: e.id || newEquipmentId() }));
  }
  for (const e of setup.emplacements) if (!e.id) e.id = newEquipmentId();
  return setup;
}

/** A battle keeps the unit IDs it was created with; its engines predate equipment IDs, and
 * nothing outside the record referred to them, so they take fresh ones. */
function repairBattleIds(battle: BattleState): BattleState {
  const engines = [
    ...battle.engines,
    ...battle.units.flatMap((u) => u.engines),
    ...(battle.previousBattlefields ?? []).flatMap((f) => f.engines),
  ];
  for (const e of engines) if (!e.id) e.id = newEquipmentId();
  return battle;
}

const intactInteraction = (value: unknown): boolean => {
  const i = value as InteractionRecord | null;
  return !!i && typeof i === 'object' && typeof i.id === 'string' && typeof i.kind === 'string'
    && Array.isArray(i.participants) && !!i.scope && typeof i.scope === 'object'
    && (i.status === 'open' || i.status === 'closed')
    && !!i.submissions && typeof i.submissions === 'object';
};

export function isBattleSession(value: unknown): value is BattleSession {
  const s = value as BattleSession | null;
  return !!s && typeof s === 'object'
    && s.schemaVersion === SCHEMA_VERSION
    && typeof s.rulesVersion === 'string'
    && typeof s.battleId === 'string' && s.battleId.length > 0
    && Number.isInteger(s.revision) && s.revision >= 0
    && LIFECYCLE_STAGES.includes(s.stage)
    && isSetupDraft(s.setup) && Array.isArray(s.setup.emplacements)
    && (s.battle === null || intactBattle(s.battle))
    && Array.isArray(s.interactions) && s.interactions.every(intactInteraction)
    && isSideControl(s.control)
    && (s.turn === null || typeof s.turn === 'string')
    && (s.lastCommit === null
      || (!!s.lastCommit && typeof s.lastCommit.commandId === 'string'
        && Array.isArray(s.lastCommit.events) && Array.isArray(s.lastCommit.dice)
        && typeof s.lastCommit.userId === 'string'))
    && Array.isArray(s.recentCommandIds);
}

function sessionFrom(setup: BattleSetupDraft, saved: BattleState | null, battleId: string): BattleSession {
  const battle = saved && intactBattle(saved) ? repairBattleIds(migrateMorale(saved)) : null;
  return {
    schemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    battleId,
    revision: 0,
    stage: battle ? 'battle' : 'setup',
    setup: repairSetup(setup),
    battle,
    interactions: [],
    control: hotSeatControl(),
    turn: null,
    lastCommit: null,
    recentCommandIds: [],
  };
}

/** The two fields Wave 2.4 put on the record, which Wave 3.5 folded into interactions. A save
 * written between those waves holds its night and its coming day here. */
interface HeldSubmissions {
  nightDeclarations?: Partial<Record<Side, RecoveryChoice[]>>;
  nextDeployment?: Partial<Record<Side, Record<string, string>>>;
}

/** The same submissions, as the interactions that hold them now, scoped to where the record
 * stands. A save mid-night therefore keeps the declaration the other army is waiting on. */
function foldSubmissions(s: BattleSession & HeldSubmissions): InteractionRecord[] {
  const scope = { stage: s.stage, day: s.battle?.day ?? null };
  const held: [InteractionKind, Partial<Record<Side, unknown>> | undefined][] = [
    ['night.recovery', s.nightDeclarations], ['nextDay.deployment', s.nextDeployment],
  ];
  delete s.nightDeclarations;
  delete s.nextDeployment;
  return held.flatMap(([kind, submissions]) => (submissions && Object.keys(submissions).length
    // No user is recorded on a folded submission: the save predates the question.
    ? [{ id: newInteractionId(), kind, initiator: '', participants: [...SIDES], scope, status: 'open' as const, submissions: { ...submissions } } as InteractionRecord]
    : []));
}

/** Read a record written by this schema, repairing what it predates. Null for anything else. */
export function reviveSession(value: unknown): BattleSession | null {
  const s = value as BattleSession | null;
  if (!s || typeof s !== 'object' || s.schemaVersion !== SCHEMA_VERSION || !isSetupDraft(s.setup)) return null;
  repairSetup(s.setup);
  s.battle = s.battle && intactBattle(s.battle) ? repairBattleIds(migrateMorale(s.battle)) : null;
  s.stage = LIFECYCLE_STAGES.includes(s.stage) ? s.stage : s.battle ? 'battle' : 'setup';
  if (!s.battle && s.stage === 'battle') s.stage = 'setup';
  // proto: no schema bump for the interactions Wave 3.5 added; a record written before them
  // carried the same submissions in two fields of its own. The migration's shape is reserved.
  s.interactions = Array.isArray(s.interactions) ? s.interactions.filter(intactInteraction) : foldSubmissions(s);
  // A record written before Wave 3.3 knew no seats. It loads into the hot seat, and a host
  // with real users reseats it as the save is installed.
  if (!isSideControl(s.control)) s.control = hotSeatControl();
  s.turn ??= null;
  s.lastCommit ??= null;
  // A commit written before Wave 3.1 recorded neither events nor dice; an empty list is what
  // it meant, and a record from before those fields still loads.
  if (s.lastCommit) {
    s.lastCommit.events ??= [];
    s.lastCommit.dice ??= [];
    // A commit written before Wave 3.6 named no sender; treat it as nobody's, so it reads as
    // another user's for the activity notice rather than silently matching every viewer.
    s.lastCommit.userId ??= '';
  }
  s.recentCommandIds ??= [];
  return isBattleSession(s) ? s : null;
}

/** The save before the session envelope: `{ stage, setup, battle }` under its own key. The
 * old stage named the setup tab, which is local state now, so the lifecycle stage comes
 * from the battle instead. */
export function migrateLegacySave(value: unknown, battleId = newBattleId()): BattleSession | null {
  const raw = value as { setup?: unknown; battle?: unknown } | null;
  if (!raw || typeof raw !== 'object' || !isSetupDraft(raw.setup)) return null;
  const session = sessionFrom(raw.setup, (raw.battle ?? null) as BattleState | null, battleId);
  return isBattleSession(session) ? session : null;
}

/** Read a save at whatever schema it was written in: the current envelope, or the pre-session
 * `{ stage, setup, battle }` shape. An archived slot can predate the schema running now, the
 * same way `battlefield.v4` can. Nothing else is recognized. */
export function migrateSession(value: unknown, battleId = newBattleId()): BattleSession | null {
  return reviveSession(value) ?? migrateLegacySave(value, battleId);
}

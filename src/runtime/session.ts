import { validatedAbilities, freshAbilityMemory } from '../engine/abilities.js';
import {
  COMBATANTS, LAST_ROUND, OFFICIAL, ROUTED_AT, SIDES, fortification, deriveStats, movementRates, speedOf, CELL_FEET,
  type BattleState, type Board, type BoardSize, type BoardSpec, type NightRecovery, type RecoveryChoice, type Side, type UnitCard, type Unit,
} from '../engine/index.js';
import { hotSeatControl, isSideControl, type SideControl } from './control.js';
import type { BattleEvent } from './events.js';
import type { InteractionKind, InteractionRecord } from './interactions.js';

export const SCHEMA_VERSION = 1;
// proto: the rules document carries no version of its own, so the record dates them. Reserved
// for review with the rest of the migration shape.
export const RULES_VERSION = '2026-09-24';

export type LifecycleStage = 'setup' | 'deployment' | 'battle' | 'aftermath' | 'finalized';
const LIFECYCLE_STAGES: LifecycleStage[] = ['setup', 'deployment', 'battle', 'aftermath', 'finalized'];

/** An engine riding with a unit, named by the library card it came from. */
export interface SetupEquipment { id: string; name: string }
export interface SetupUnit {
  id: string; card: UnitCard; side: Side; square: string | null; engines: SetupEquipment[];
  /** Whose banner an imported unit marched under, as the campaign names it. A label for the GM
   * sorting armies into sides; no rule reads it. */
  faction?: string;
}
/** An engine deployed on a square of its own. `engines` on a SetupUnit is the attached kind,
 * which only a campaign import fills. `hauled` holds while a friendly unit shares the square. */
export interface SetupEngine {
  id: string; name: string; side: Side; square: string | null; hauled?: boolean;
  /** Initial load. Omitted in older drafts, which start loaded. */
  loaded?: boolean;
}
export interface BattleSetupDraft {
  spec: BoardSpec;
  board: Board | null;
  units: SetupUnit[];
  emplacements: SetupEngine[];
  roundsPerDay?: number;
}

/** What a campaign's copy of a unit held when the battle imported it. The writeback compares
 * an actor against this before it touches it, so an edit made outside the battle shows up as a
 * conflict rather than being overwritten. */
export interface ImportBaseline {
  hitPoints: number;
  maxHitPoints: number;
  /** Demoralized stacks read off the actor; the battle carries them as disorder. */
  demoralized: number;
}

/** Where a unit came from. Actor UUIDs and campaign IDs live here, beside the record and
 * outside the rules: the engine never sees one. */
export interface SourceBinding {
  unitId: string;
  actorUuid: string;
  campaignId?: string;
  baseline: ImportBaseline;
}

/** The absolute values a campaign writeback puts on its copy of a unit. */
export interface WritebackValues {
  hitPoints: number;
  demoralized: number;
}

export type WritebackStatus = 'pending' | 'written' | 'conflict';

/** Who applies the outcome: the campaign module in one call, or the troop actors one at a
 * time. */
export type WritebackVia = 'campaign' | 'actors';

/** The single step that hands the whole outcome to a campaign module. */
export const CAMPAIGN_TARGET = 'campaign';

export interface WritebackTarget {
  /** The unit whose actor this step writes, or `CAMPAIGN_TARGET` for the one call that hands
   * the prepared outcome over whole. */
  unitId: string;
  name: string;
  actorUuid: string | null;
  /** Absolute, so a resumed run writes the numbers the interrupted one meant to rather than
   * numbers derived again from a record that has moved. Null on the campaign step. */
  desired: WritebackValues | null;
  /** What the import read, so a retry tells an untouched copy from one edited outside the
   * battle. Null on the campaign step. */
  baseline: WritebackValues | null;
  status: WritebackStatus;
  /** Why the GM has to look at this one. */
  problem?: string;
}

/** How far the campaign writeback got. It rides on the record, so an interrupted run resumes
 * at the first unfinished target and a second run over a finished one writes nothing. */
export interface WritebackRecord {
  /** Derived from the battle ID, so the host API refuses a second application of the same
   * battle however often it is asked. */
  operationId: string;
  via: WritebackVia;
  targets: WritebackTarget[];
}

/** What the last commit did and what it drew. `dice` holds the faces of the transition in
 * order, so a chat card is rebuilt from the same numbers the rules read. `userId` is who sent
 * it, so a viewer's own commit can be told apart from another user's for the activity notice. */
export interface CommitRecord { commandId: string; events: BattleEvent[]; dice: number[]; userId: string }

export interface BattleSession {
  schemaVersion: number;
  rulesVersion: string;
  battleId: string;
  /** The campaign's name for the ground this battle stands on — a kingdom-map hex under
   * ReignMaker. Null for a battle no campaign placed. */
  site: string | null;
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
  /** What each imported unit came from. Empty for a battle nobody imported. */
  sources: SourceBinding[];
  /** The campaign writeback, from the GM's confirmation to the last target. Null until one
   * opens; it survives a reload, which is what lets an interrupted run resume. */
  writeback: WritebackRecord | null;
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
  const unit = (name: string, side: Side): SetupUnit =>
    ({ id: newUnitId(), card: pick(name), side, square: null, engines: [] });
  return {
    spec: { base: 'plains', size: 15, feature: 'none', construction: null, seed: randomSeed() },
    board: null,
    emplacements: [],
    units: [
      unit('Town Militia', 'attacker'),
      unit('Heavy Cavalry', 'attacker'),
      unit('Apprentice Magician Clique', 'attacker'),
      unit('Troll Marauders', 'defender'),
      unit('Orc Raiding Party', 'defender'),
      unit('Swiftrun Clergy', 'defender'),
    ],
  };
}

export function freshSession(battleId = newBattleId()): BattleSession {
  return {
    schemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    battleId,
    site: null,
    revision: 0,
    stage: 'setup',
    setup: defaultSetup(),
    battle: null,
    interactions: [],
    control: hotSeatControl(),
    sources: [],
    writeback: null,
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
  if (Array.isArray(battle.night)) {
    // Before armies rolled separately, one night rolled both at once, so both have had theirs.
    const rolled: NightRecovery[] = battle.night;
    const sideOf = (id: string) => battle.units.find((u) => u.id === id)?.side ?? 'attacker';
    battle.night = Object.fromEntries(SIDES.map((side) => [side, rolled.filter((r) => sideOf(r.unit) === side)]));
  }
  for (const u of battle.units) {
    u.abilities = validatedAbilities(u.abilities ?? (u.noRetreat ? [{ version: 1, key: 'legacy-hold-ground', kind: 'resolve', label: 'No Retreat', delivery: 'passive', mode: 'ground' }] : []));
    u.noRetreat = false;
    u.abilityState ??= freshAbilityMemory(u.wounds);
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

/** Retire the old tier-zero barricade without restoring a breached wall. */
function repairFortifications(board: Board): void {
  if (board.spec.construction?.tier === 0) board.spec.construction.tier = 1;
  for (const wall of Object.values(board.walls)) {
    if (wall.tier !== 0) continue;
    const damage = wall.boxes - wall.remaining;
    wall.tier = 1;
    wall.boxes = fortification(1).boxes;
    if (wall.remaining > 0) wall.remaining = Math.max(0, wall.boxes - damage);
  }
}

/** Backfill source statistics only when the saved sheet still matches a catalogue card.
 * Preserve custom sheets, explicit overrides and battle statistics that have changed. */
function repairSourceAttacks(setup: BattleSetupDraft, battle: BattleState | null): void {
  for (const saved of setup.units) {
    const card = saved.card;
    const source = [...COMBATANTS, ...OFFICIAL].find(c => c.name === card.name && c.level === card.level && c.role === card.role);
    if (!card.sheet || !source?.sheet) continue;
    if (!Object.entries(card.sheet).every(([key, value]) =>
      JSON.stringify(source.sheet![key as keyof typeof source.sheet]) === JSON.stringify(value))) continue;
    const before = deriveStats(card);
    card.sheet = { ...source.sheet, ...card.sheet };
    const after = deriveStats(card);
    const unit = battle?.units.find(u => u.id === saved.id && u.name === card.name);
    if (!unit) continue;
    for (const key of ['spellAttack', 'spellDc'] as const) {
      if (unit.stats[key] === before[key]) unit.stats[key] = after[key];
    }
    unit.attackSources ??= {};
    unit.attackSources.strike ??= card.sheet.battleName;
    unit.attackSources.volley ??= card.sheet.salvoName;
  }
  for (const saved of setup.units) {
    const sheet = saved.card.sheet;
    const unit = battle?.units.find(u => u.id === saved.id && u.name === saved.card.name);
    if (!sheet || !unit) continue;
    const previous = unit.movementRates ? Math.max(...Object.values(unit.movementRates))
      : Math.max(1, Math.ceil(sheet.speed / 30)) * CELL_FEET;
    unit.sourceSpeed = { speed: sheet.speed, otherSpeeds: sheet.otherSpeeds?.map(s => ({ ...s })) };
    unit.movementRates = movementRates(saved.card);
    if (unit.speed === previous) {
      unit.speed = speedOf(saved.card);
      if (previous > 0) unit.feet *= unit.speed / previous;
    }
    unit.flying = unit.movementRates.fly > 0;
  }
}

/** Fill the fields a setup gained after it was written. A setup written before Wave 2.2 named
 * its pieces by array position and its attached engines by name alone; both take IDs here. */
function repairSetup(setup: BattleSetupDraft): BattleSetupDraft {
  if (setup.spec.construction?.tier === 0) setup.spec.construction.tier = 1;
  if (setup.board) repairFortifications(setup.board);
  setup.spec.size ??= (setup.board?.squares.length as BoardSize | undefined) ?? 11;
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
  repairFortifications(battle.board);
  if (battle.nextBoard) repairFortifications(battle.nextBoard);
  for (const field of battle.previousBattlefields ?? []) repairFortifications(field.board);
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

const isWritebackRecord = (value: unknown): value is WritebackRecord => {
  const w = value as WritebackRecord | null;
  return !!w && typeof w === 'object' && typeof w.operationId === 'string'
    && (w.via === 'campaign' || w.via === 'actors') && Array.isArray(w.targets);
};

/** A writeback with a target still to write. Undo and loading stay shut while one stands: the
 * campaign already holds part of this result. */
export const writebackRunning = (session: BattleSession): boolean =>
  !!session.writeback && session.writeback.targets.some((t) => t.status !== 'written');

/** Every target written. The battle finalizes on this and on nothing else. */
export const writebackComplete = (session: BattleSession): boolean =>
  !!session.writeback && session.writeback.targets.every((t) => t.status === 'written');

export function isBattleSession(value: unknown): value is BattleSession {
  const s = value as BattleSession | null;
  return !!s && typeof s === 'object'
    && s.schemaVersion === SCHEMA_VERSION
    && typeof s.rulesVersion === 'string'
    && typeof s.battleId === 'string' && s.battleId.length > 0
    && (s.site === null || typeof s.site === 'string')
    && Number.isInteger(s.revision) && s.revision >= 0
    && LIFECYCLE_STAGES.includes(s.stage)
    && isSetupDraft(s.setup) && Array.isArray(s.setup.emplacements)
    && (s.battle === null || intactBattle(s.battle))
    && Array.isArray(s.interactions) && s.interactions.every(intactInteraction)
    && isSideControl(s.control)
    && Array.isArray(s.sources)
    && (s.writeback === null || isWritebackRecord(s.writeback))
    && (s.turn === null || typeof s.turn === 'string')
    && (s.lastCommit === null
      || (!!s.lastCommit && typeof s.lastCommit.commandId === 'string'
        && Array.isArray(s.lastCommit.events) && Array.isArray(s.lastCommit.dice)
        && typeof s.lastCommit.userId === 'string'))
    && Array.isArray(s.recentCommandIds);
}

function sessionFrom(setup: BattleSetupDraft, saved: BattleState | null, battleId: string): BattleSession {
  const battle = saved && intactBattle(saved) ? repairBattleIds(migrateMorale(saved)) : null;
  repairSourceAttacks(setup, battle);
  return {
    schemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    battleId,
    site: null,
    revision: 0,
    stage: battle ? 'battle' : 'setup',
    setup: repairSetup(setup),
    battle,
    interactions: [],
    control: hotSeatControl(),
    sources: [],
    writeback: null,
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
  repairSourceAttacks(s.setup, s.battle && intactBattle(s.battle) ? s.battle : null);
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
  // proto: no schema bump for the source bindings Wave 5.1 added. A record written before them
  // was nobody's import, and an empty list says so. The migration's shape is reserved.
  if (!Array.isArray(s.sources)) s.sources = [];
  // proto: no schema bump for the writeback Wave 5.5 added. A record written before it applied
  // no outcome, and a null record says so. The migration's shape is reserved.
  if (!isWritebackRecord(s.writeback)) s.writeback = null;
  // proto: no schema bump for the site. A record written before it stood on no campaign ground.
  if (typeof s.site !== 'string') s.site = null;
  s.turn ??= null;
  s.lastCommit ??= null;
  // A commit written before Wave 3.1 recorded neither events nor dice; an empty list is what
  // it meant, and a record from before those fields still loads.
  if (s.lastCommit) {
    s.lastCommit.events ??= [];
    s.lastCommit.dice ??= [];
    // proto: a commit written before Wave 3.6 named no sender; treat it as nobody's, so it
    // reads as another user's for the activity notice rather than matching every viewer. No
    // schema bump — the migration's shape is reserved with the rest of the save migration.
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
 * same way `battlefield.v4` can. Nothing else is recognized. A record from a newer schema is
 * refused before the legacy path, which would keep its setup and drop the rest. */
export function migrateSession(value: unknown, battleId = newBattleId()): BattleSession | null {
  const version = (value as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof version === 'number' && version > SCHEMA_VERSION) return null;
  return reviveSession(value) ?? migrateLegacySave(value, battleId);
}

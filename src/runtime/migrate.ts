import { SIDES, type BattleState, type BoardSize, type RecoveryChoice, type Side } from '../engine/index.js';
import { upgradeBattle, upgradeBoard, upgradeCard, upgradeSourceStats, upgradeSpec } from '../engine/legacy.js';
import { hotSeatControl, isSideControl } from './control.js';
import type { InteractionKind, InteractionRecord } from './interactions.js';
import {
  intactBattle, intactInteraction, isBattleSession, isSetupDraft, isWritebackRecord, LIFECYCLE_STAGES,
  newBattleId, newEquipmentId, newInteractionId, newUnitId, RULES_VERSION, SCHEMA_VERSION,
  type BattleSession, type BattleSetupDraft, type SetupEquipment,
} from './session.js';

/** Fill the fields a setup gained after it was written. A setup written before Wave 2.2 named
 * its pieces by array position and its attached engines by name alone; both take IDs here. */
function repairSetup(setup: BattleSetupDraft): void {
  upgradeSpec(setup.spec);
  if (setup.board) upgradeBoard(setup.board);
  setup.spec.size ??= (setup.board?.squares.length as BoardSize | undefined) ?? 11;
  setup.emplacements ??= [];
  for (const u of setup.units) {
    upgradeCard(u.card);
    if (!u.id) u.id = newUnitId();
    const engines = (u.engines ?? []) as (SetupEquipment | string)[];
    u.engines = engines.map((e) => (typeof e === 'string'
      ? { id: newEquipmentId(), name: e }
      : { ...e, id: e.id || newEquipmentId() }));
  }
  for (const e of setup.emplacements) if (!e.id) e.id = newEquipmentId();
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

/** Schema 1 gained fields without a bump, so a schema-1 record may lack any of them. Each
 * takes the value that says nothing happened, and the battle and setup take the engine's
 * current shape. */
function toSchema2(s: BattleSession & HeldSubmissions): void {
  const battle = s.battle && intactBattle(s.battle) ? s.battle : null;
  for (const saved of s.setup.units) {
    upgradeSourceStats(saved, battle?.units.find((u) => u.id === saved.id && u.name === saved.card.name));
  }
  repairSetup(s.setup);
  // IDs first: the upgrade refreshes emplacements, which match engines by ID.
  s.battle = battle ? upgradeBattle(repairBattleIds(battle)) : null;
  s.stage = LIFECYCLE_STAGES.includes(s.stage) ? s.stage : s.battle ? 'battle' : 'setup';
  if (!s.battle && s.stage === 'battle') s.stage = 'setup';
  s.interactions = Array.isArray(s.interactions) ? s.interactions.filter(intactInteraction) : foldSubmissions(s);
  // A record written before Wave 3.3 knew no seats. It loads into the hot seat, and a host
  // with real users reseats it as the save is installed.
  if (!isSideControl(s.control)) s.control = hotSeatControl();
  if (!Array.isArray(s.sources)) s.sources = [];
  if (!isWritebackRecord(s.writeback)) s.writeback = null;
  if (typeof s.site !== 'string') s.site = null;
  s.turn ??= null;
  s.lastCommit ??= null;
  if (s.lastCommit) {
    s.lastCommit.events ??= [];
    s.lastCommit.dice ??= [];
    // Nobody's, so it reads as another user's commit for the activity notice rather than
    // matching every viewer.
    s.lastCommit.userId ??= '';
  }
  s.recentCommandIds ??= [];
}

/** Keyed by the schema version a step reads; each leaves the record one version on. */
export const STEPS: Record<number, (record: any) => void> = { 1: toSchema2 }; // proto: record typed loosely

/** Read a record of this schema or an older one, stepping it up to this one in place. Null
 * for anything else. A current record is validated and left as it is. */
export function reviveSession(value: unknown): BattleSession | null {
  const s = value as { schemaVersion?: unknown; setup?: unknown } | null;
  if (!s || typeof s !== 'object') return null;
  const version = s.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1 || version > SCHEMA_VERSION
    || !isSetupDraft(s.setup)) return null;
  for (let v = version; v < SCHEMA_VERSION; v++) {
    STEPS[v](s);
    s.schemaVersion = v + 1;
  }
  return isBattleSession(s) ? s : null;
}

/** The save before the session envelope: `{ stage, setup, battle }` under its own key. The
 * old stage named the setup tab, which is local state now, so the lifecycle stage comes
 * from the battle instead. */
export function migrateLegacySave(value: unknown, battleId = newBattleId()): BattleSession | null {
  const raw = value as { setup?: unknown; battle?: unknown } | null;
  if (!raw || typeof raw !== 'object' || !isSetupDraft(raw.setup)) return null;
  const battle = (raw.battle ?? null) as BattleState | null;
  return reviveSession({
    schemaVersion: 1,
    rulesVersion: RULES_VERSION,
    battleId,
    site: null,
    revision: 0,
    stage: battle && intactBattle(battle) ? 'battle' : 'setup',
    setup: raw.setup,
    battle,
    interactions: [],
    control: hotSeatControl(),
    sources: [],
    writeback: null,
    turn: null,
    lastCommit: null,
    recentCommandIds: [],
  });
}

/** Read a save at whatever schema it was written in: the current envelope, an older one, or
 * the pre-session `{ stage, setup, battle }` shape. An archived slot can predate the schema
 * running now, the same way `battlefield.v4` can. Nothing else is recognized. A record from a
 * newer schema is refused before the legacy path, which would keep its setup and drop the
 * rest. */
export function migrateSession(value: unknown, battleId = newBattleId()): BattleSession | null {
  const version = (value as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (typeof version === 'number' && version > SCHEMA_VERSION) return null;
  return reviveSession(value) ?? migrateLegacySave(value, battleId);
}

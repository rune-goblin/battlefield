import {
  COMBATANTS, LAST_ROUND, OFFICIAL, ROUTED_AT,
  type BattleState, type Board, type BoardSpec, type Side, type UnitCard, type Unit,
} from '../engine/index.js';

export const SCHEMA_VERSION = 1;
// proto: the rules document carries no version of its own, so the record dates them. Reserved
// for review with the rest of the migration shape.
export const RULES_VERSION = '2026-09-18';

export type LifecycleStage = 'setup' | 'deployment' | 'battle' | 'aftermath' | 'finalized';
const LIFECYCLE_STAGES: LifecycleStage[] = ['setup', 'deployment', 'battle', 'aftermath', 'finalized'];

export interface SetupUnit { card: UnitCard; side: Side; square: string | null; engines: string[] }
/** An engine deployed on a square of its own. `engines` on a SetupUnit is the attached kind. */
export interface SetupEngine { name: string; side: Side; square: string | null }
export interface BattleSetupDraft {
  spec: BoardSpec;
  board: Board | null;
  units: SetupUnit[];
  emplacements: SetupEngine[];
  roundsPerDay?: number;
}

/** Wave 3.1 names the ten execution events; until then a commit carries the shape alone. */
export interface BattleEvent { id: string; type: string }

export interface CommitRecord { commandId: string; events: BattleEvent[] }

export interface BattleSession {
  schemaVersion: number;
  rulesVersion: string;
  battleId: string;
  revision: number;
  stage: LifecycleStage;
  setup: BattleSetupDraft;
  battle: BattleState | null;
  lastCommit: CommitRecord | null;
  /** The most recent command IDs, so a resent command is answered instead of re-run. */
  recentCommandIds: string[];
}

// proto: ID format reserved for review with the unit and equipment IDs of Wave 2.2.
export const newBattleId = (): string =>
  `battle-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const randomSeed = () => Math.floor(Math.random() * 1e9);

export function defaultSetup(): BattleSetupDraft {
  const pick = (name: string) => [...COMBATANTS, ...OFFICIAL].find((c) => c.name === name)!;
  return {
    spec: { base: 'plains', size: 11, feature: 'none', construction: null, seed: randomSeed() },
    board: null,
    emplacements: [],
    units: [
      { card: pick('Line Infantry'), side: 'attacker', square: 'e3', engines: [] },
      { card: pick('Heavy Cavalry'), side: 'attacker', square: 'g3', engines: [] },
      // Apprentice Magician Clique (L5) sits between Line Infantry (L6) and Heavy Cavalry (L7).
      { card: pick('Apprentice Magician Clique'), side: 'attacker', square: 'f3', engines: [] },
      { card: pick('Kobold Warriors'), side: 'defender', square: 'e9', engines: [] },
      { card: pick('Troll Marauders'), side: 'defender', square: 'g9', engines: [] },
      // Mitflit Vermin Cavalry (L4) sits between Kobold Warriors (L3) and Troll Marauders (L8).
      { card: pick('Mitflit Vermin Cavalry'), side: 'defender', square: 'f9', engines: [] },
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

/** Fill the fields a setup gained after it was written. */
function repairSetup(setup: BattleSetupDraft): BattleSetupDraft {
  setup.spec.size ??= (setup.board?.squares.length as 9 | 11 | undefined) ?? 11;
  setup.emplacements ??= [];
  return setup;
}

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
    && (s.lastCommit === null
      || (!!s.lastCommit && typeof s.lastCommit.commandId === 'string' && Array.isArray(s.lastCommit.events)))
    && Array.isArray(s.recentCommandIds);
}

function sessionFrom(setup: BattleSetupDraft, saved: BattleState | null, battleId: string): BattleSession {
  const battle = saved && intactBattle(saved) ? migrateMorale(saved) : null;
  return {
    schemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    battleId,
    revision: 0,
    stage: battle ? 'battle' : 'setup',
    setup: repairSetup(setup),
    battle,
    lastCommit: null,
    recentCommandIds: [],
  };
}

/** Read a record written by this schema, repairing what it predates. Null for anything else. */
export function reviveSession(value: unknown): BattleSession | null {
  const s = value as BattleSession | null;
  if (!s || typeof s !== 'object' || s.schemaVersion !== SCHEMA_VERSION || !isSetupDraft(s.setup)) return null;
  repairSetup(s.setup);
  s.battle = s.battle && intactBattle(s.battle) ? migrateMorale(s.battle) : null;
  s.stage = LIFECYCLE_STAGES.includes(s.stage) ? s.stage : s.battle ? 'battle' : 'setup';
  if (!s.battle && s.stage === 'battle') s.stage = 'setup';
  s.lastCommit ??= null;
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

import {
  COMBATANTS, OFFICIAL, type BattleState, type Board, type BoardSpec, type Side, type UnitCard,
} from '../engine/index.js';
import { hotSeatControl, isSideControl, type SideControl } from './control.js';
import type { BattleEvent } from './events.js';
import type { InteractionRecord } from './interactions.js';
import type { MintPort } from './ports.js';

export const SCHEMA_VERSION = 2;
// proto: the rules document carries no version of its own, so the record dates them. Reserved
// for review with the rest of the migration shape.
export const RULES_VERSION = '2026-09-24';

export type LifecycleStage = 'setup' | 'deployment' | 'battle' | 'aftermath' | 'finalized';
export const LIFECYCLE_STAGES: LifecycleStage[] = ['setup', 'deployment', 'battle', 'aftermath', 'finalized'];

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

/** The mint every host runs on. A piece takes its ID when it enters setup and keeps it through
 * the battle and beyond. */
export const randomMint: MintPort = {
  seed: () => Math.floor(Math.random() * 1e9),
  // proto: ID format reserved for review. One shape for every identity the record holds.
  id: (kind) => `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
};

export function defaultSetup(mint: MintPort = randomMint): BattleSetupDraft {
  const pick = (name: string) => [...COMBATANTS, ...OFFICIAL].find((c) => c.name === name)!;
  const unit = (name: string, side: Side): SetupUnit =>
    ({ id: mint.id('unit'), card: pick(name), side, square: null, engines: [] });
  return {
    spec: { base: 'plains', size: 15, feature: 'none', construction: null, seed: mint.seed() },
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

/** A session in setup on the draft given, at revision 0 with the browser's hot seat. */
export function sessionWith(setup: BattleSetupDraft, battleId?: string, mint: MintPort = randomMint): BattleSession {
  return {
    schemaVersion: SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    battleId: battleId ?? mint.id('battle'),
    site: null,
    revision: 0,
    stage: 'setup',
    setup,
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

export function freshSession(battleId?: string, mint: MintPort = randomMint): BattleSession {
  // The battle ID draws before the example setup, so a fixed mint writes the record it always has.
  const id = battleId ?? mint.id('battle');
  return sessionWith(defaultSetup(mint), id, mint);
}

/** A save written before a field existed still parses; it crashes later, at render. Drop it
 * here so a missed schema bump costs a fresh start rather than a broken board. */
export const intactBattle = (b: BattleState | null | undefined): boolean =>
  !!b && Array.isArray(b.units) && Array.isArray(b.engines) && Array.isArray(b.log)
  // Units gained `selfBuffs`, which `finish` reads on every activation.
  && b.units.every((u) => Array.isArray(u.selfBuffs));

export function isSetupDraft(value: unknown): value is BattleSetupDraft {
  const s = value as BattleSetupDraft | null;
  return !!s && typeof s === 'object' && !!s.spec && typeof s.spec === 'object' && Array.isArray(s.units);
}

export const intactInteraction = (value: unknown): boolean => {
  const i = value as InteractionRecord | null;
  return !!i && typeof i === 'object' && typeof i.id === 'string' && typeof i.kind === 'string'
    && Array.isArray(i.participants) && !!i.scope && typeof i.scope === 'object'
    && (i.status === 'open' || i.status === 'closed')
    && !!i.submissions && typeof i.submissions === 'object';
};

export const isWritebackRecord = (value: unknown): value is WritebackRecord => {
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

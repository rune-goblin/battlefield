import type { Action, BoardSpec, DayOrder, RecoveryChoice, Side, SquareTerrain, UnitCard } from '../engine/index.js';

/** Wave 1.3 makes `unit` required in the engine's `Acts`. Until then the boundary carries the
 * requirement, so an action names its unit before it reaches the executor. */
export type TacticalAction = Action & { unit: string };

/** Mirrors `board/brush.ts`'s `Brush` structurally, declared fresh so `runtime` names no type
 * from `src/board` — the command boundary carries plain data, not a board-library import. */
export type PaintBrush =
  | { kind: 'terrain'; terrain: SquareTerrain }
  | { kind: 'elevation'; level: number }
  | { kind: 'wall'; tier: number }
  | { kind: 'wall-clear' }
  | { kind: 'erase' };

export interface PaintStroke { cells: string[]; edges: string[]; brush: PaintBrush }

/** A piece in setup: one of a side's units, or one of its emplaced engines. */
export interface PieceRef { kind: 'unit' | 'engine'; id: string }

export type BattleCommand =
  | { type: 'activation.select'; unitId: string }
  | { type: 'activation.deselect' }
  | { type: 'action.resolve'; action: TacticalAction }
  | { type: 'activation.end'; unitId: string }
  | { type: 'setup.generate' }
  | { type: 'setup.rerollSeed' }
  | { type: 'setup.editSpec'; spec: Partial<BoardSpec> }
  | { type: 'setup.setRoundsPerDay'; roundsPerDay: number }
  | { type: 'setup.paint'; stroke: PaintStroke }
  | { type: 'army.addUnit'; side: Side; card: UnitCard }
  | { type: 'army.removeUnit'; unitId: string }
  | { type: 'army.addEmplacement'; side: Side; engine: string }
  | { type: 'army.removeEmplacement'; emplacementId: string }
  | { type: 'army.attachEquipment'; unitId: string; engine: string }
  | { type: 'army.detachEquipment'; unitId: string; equipmentId: string }
  | { type: 'army.place'; piece: PieceRef; square: string }
  | { type: 'army.unplace'; piece: PieceRef }
  | { type: 'army.autoPlace'; piece: PieceRef }
  /** The seed rides along so the authority's draw is reproducible from the envelope. */
  | { type: 'army.generateForce'; side: Side; seed?: number }
  | { type: 'continuation.declareRecovery'; side: Side; choices: RecoveryChoice[] }
  | { type: 'continuation.declareDayOrder'; side: Side; order: DayOrder }
  | { type: 'continuation.confirmDayOrders' }
  | { type: 'continuation.answerSurrender'; side: Side; accept: boolean }
  /** Null keeps today's ground; a partial spec generates tomorrow's on the authority. */
  | { type: 'continuation.chooseBattlefield'; spec: Partial<BoardSpec> | null }
  | { type: 'continuation.declareDeployment'; side: Side; positions: Record<string, string> }
  | { type: 'continuation.startNextDay' }
  | { type: 'battle.start' }
  | { type: 'battle.returnToSetup' }
  | { type: 'battle.reset' }
  | { type: 'battle.finalize' }
  /** Rewind to the snapshot the last undoable commit replaced, under a new revision. */
  | { type: 'session.undo' }
  /** Replace the running record with a saved one, migrated and installed at the next revision. */
  | { type: 'session.load'; slot: string };

export type CommandType = BattleCommand['type'];

/** Which side of the line a command stands on: `setup` prepares the board and the forces
 * before a battle exists, `battle` acts on the one under way, `any` crosses it. The executor
 * gates every command on this table and `session.battle`. */
export type CommandStage = 'setup' | 'battle' | 'any';

export const COMMAND_STAGE: Record<CommandType, CommandStage> = {
  'activation.select': 'battle',
  'activation.deselect': 'battle',
  'action.resolve': 'battle',
  'activation.end': 'battle',
  'setup.generate': 'setup',
  'setup.rerollSeed': 'setup',
  'setup.editSpec': 'setup',
  'setup.setRoundsPerDay': 'setup',
  'setup.paint': 'setup',
  'army.addUnit': 'setup',
  'army.removeUnit': 'setup',
  'army.addEmplacement': 'setup',
  'army.removeEmplacement': 'setup',
  'army.attachEquipment': 'setup',
  'army.detachEquipment': 'setup',
  'army.place': 'setup',
  'army.unplace': 'setup',
  'army.autoPlace': 'setup',
  'army.generateForce': 'setup',
  'continuation.declareRecovery': 'battle',
  'continuation.declareDayOrder': 'battle',
  'continuation.confirmDayOrders': 'battle',
  'continuation.answerSurrender': 'battle',
  'continuation.chooseBattlefield': 'battle',
  'continuation.declareDeployment': 'battle',
  'continuation.startNextDay': 'battle',
  'battle.start': 'setup',
  'battle.returnToSetup': 'battle',
  'battle.reset': 'setup',
  'battle.finalize': 'battle',
  'session.undo': 'any',
  'session.load': 'any',
};

export interface CommandEnvelope {
  battleId: string;
  /** Stable across retries: the same command resent carries the same ID. */
  commandId: string;
  /** The revision the client built this command against. Wave 3.3 enforces it. */
  expectedRevision: number;
  command: BattleCommand;
}

/** `storage` takes its own notice in Wave 1.4; every other reason reads as a refused command. */
export type RejectionReason = 'battle' | 'stage' | 'unsupported' | 'engine' | 'storage';

export interface CommandAccepted { ok: true; commandId: string; revision: number }
export interface CommandRejected {
  ok: false;
  commandId: string;
  /** The revision still standing, so a client can refresh from it. */
  revision: number;
  reason: RejectionReason;
  message: string;
}
export type CommandResult = CommandAccepted | CommandRejected;

// proto: ID format reserved for review with the battle and unit IDs.
export const newCommandId = (): string =>
  `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

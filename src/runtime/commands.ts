import type { Action, BoardSpec, SquareTerrain } from '../engine/index.js';

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

export type BattleCommand =
  | { type: 'activation.select'; unitId: string }
  | { type: 'activation.deselect' }
  | { type: 'action.resolve'; action: TacticalAction }
  | { type: 'activation.end'; unitId: string }
  | { type: 'setup.generate' }
  | { type: 'setup.rerollSeed' }
  | { type: 'setup.editSpec'; spec: Partial<BoardSpec> }
  | { type: 'setup.setRoundsPerDay'; roundsPerDay: number }
  | { type: 'setup.paint'; stroke: PaintStroke };

export type CommandType = BattleCommand['type'];

/** Tactical commands act on the battle in progress; setup commands prepare the board and
 * placements before one exists. The executor gates each side of this table on `session.battle`. */
export const SETUP_COMMANDS: ReadonlySet<CommandType> = new Set([
  'setup.generate', 'setup.rerollSeed', 'setup.editSpec', 'setup.setRoundsPerDay', 'setup.paint',
] satisfies CommandType[]);

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

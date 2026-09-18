import type { Action } from '../engine/index.js';

/** Wave 1.3 makes `unit` required in the engine's `Acts`. Until then the boundary carries the
 * requirement, so an action names its unit before it reaches the executor. */
export type TacticalAction = Action & { unit: string };

export type BattleCommand =
  | { type: 'activation.select'; unitId: string }
  | { type: 'activation.deselect' }
  | { type: 'action.resolve'; action: TacticalAction }
  | { type: 'activation.end'; unitId: string };

export type CommandType = BattleCommand['type'];

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

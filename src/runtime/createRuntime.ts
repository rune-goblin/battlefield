import { randomRng } from '../engine/index.js';
import { createActionResolutionService } from '../services/ActionResolutionService.js';
import { createMapPreparationService } from '../services/MapPreparationService.js';
import { newCommandId, type BattleCommand, type CommandEnvelope, type CommandResult } from './commands.js';
import { createExecutor, type HistoryEffect, type HistorySnapshot, type SessionEdit } from './executeCommand.js';
import type { DicePort, SessionRepository } from './ports.js';
import type { BattleSession } from './session.js';

export interface RuntimeOptions {
  repository: SessionRepository;
  /** The record the host already holds. The store is seeded before its first render, so the
   * runtime is built around a session rather than loading one. */
  session: BattleSession;
  dice?: DicePort;
}

export interface Runtime {
  readonly session: BattleSession;
  readonly history: readonly HistorySnapshot[];
  /** Build the envelope from the committed record and run it. The hot seat's one client is
   * always at the current revision; a remote client sends its own envelope. */
  submit(command: BattleCommand): Promise<CommandResult>;
  execute(envelope: CommandEnvelope): Promise<CommandResult>;
  // proto: the writes Phase 2 has yet to turn into commands go through the same queue.
  change(edit: SessionEdit, history?: HistoryEffect): Promise<CommandResult>;
  undo(): Promise<CommandResult>;
  subscribe(listener: (session: BattleSession) => void): () => void;
}

/** The one place that wires the services, the ports, and the executor together. */
export function createRuntime({ repository, session, dice = randomRng }: RuntimeOptions): Runtime {
  const executor = createExecutor({
    repository,
    session,
    actions: createActionResolutionService({ dice }),
    map: createMapPreparationService(),
  });

  return {
    get session() { return executor.session; },
    get history() { return executor.history; },
    submit: (command) => executor.execute({
      battleId: executor.session.battleId,
      commandId: newCommandId(),
      expectedRevision: executor.session.revision,
      command,
    }),
    execute: (envelope) => executor.execute(envelope),
    change: (edit, history) => executor.change(edit, history),
    undo: () => executor.undo(),
    subscribe: (listener) => executor.subscribe(listener),
  };
}

import { randomRng } from '../engine/index.js';
import { createActionResolutionService } from '../services/ActionResolutionService.js';
import { createArmyPreparationService } from '../services/ArmyPreparationService.js';
import { createBattleContinuationService } from '../services/BattleContinuationService.js';
import { createBattleManager } from '../services/BattleManager.js';
import { createMapPreparationService } from '../services/MapPreparationService.js';
import { newCommandId, type BattleCommand, type CommandEnvelope, type CommandResult } from './commands.js';
import { createExecutor, type HistorySnapshot } from './executeCommand.js';
import type { BattleArchive, DicePort, SessionRepository } from './ports.js';
import type { BattleSession } from './session.js';

export interface RuntimeOptions {
  repository: SessionRepository;
  archive: BattleArchive;
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
  subscribe(listener: (session: BattleSession) => void): () => void;
}

/** The one place that wires the services, the ports, and the executor together. */
export function createRuntime({ repository, archive, session, dice = randomRng }: RuntimeOptions): Runtime {
  const executor = createExecutor({
    repository,
    archive,
    session,
    actions: createActionResolutionService({ dice }),
    map: createMapPreparationService(),
    army: createArmyPreparationService(),
    continuation: createBattleContinuationService({ dice }),
    manager: createBattleManager(),
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
    subscribe: (listener) => executor.subscribe(listener),
  };
}

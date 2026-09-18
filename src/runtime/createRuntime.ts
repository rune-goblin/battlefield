import { randomRng } from '../engine/index.js';
import { createActionResolutionService } from '../services/ActionResolutionService.js';
import { createArmyPreparationService } from '../services/ArmyPreparationService.js';
import { createBattleContinuationService } from '../services/BattleContinuationService.js';
import { createBattleManager } from '../services/BattleManager.js';
import { createMapPreparationService } from '../services/MapPreparationService.js';
import type { BattleCommand, CommandEnvelope, CommandResult } from './commands.js';
import { recordDice } from './dice.js';
import { createExecutor, type HistorySnapshot } from './executeCommand.js';
import { hotSeatPolicy, type SeatPolicy } from './policy.js';
import type { BattleArchive, DicePort, SessionRepository } from './ports.js';
import type { BattleSession } from './session.js';

export interface RuntimeOptions {
  repository: SessionRepository;
  archive: BattleArchive;
  /** The record the host already holds. The store is seeded before its first render, so the
   * runtime is built around a session rather than loading one. */
  session: BattleSession;
  dice?: DicePort;
  /** Who this client acts as, and the table it acts at. The browser plays hot seat. */
  policy?: SeatPolicy;
}

export interface Runtime {
  readonly session: BattleSession;
  readonly history: readonly HistorySnapshot[];
  /** The user this client submits as. */
  readonly userId: string;
  /** Run a command as this client's user, at whatever revision the authority holds. A remote
   * client sends its own envelope, built against the revision it can see. */
  submit(command: BattleCommand): Promise<CommandResult>;
  execute(envelope: CommandEnvelope): Promise<CommandResult>;
  subscribe(listener: (session: BattleSession) => void): () => void;
}

/** The one place that wires the services, the ports, and the executor together. */
export function createRuntime({
  repository, archive, session, dice = randomRng, policy = hotSeatPolicy(),
}: RuntimeOptions): Runtime {
  // Every service rolls through the recorder, so a commit holds the faces its own rules read.
  const recorder = recordDice(dice);
  const executor = createExecutor({
    repository,
    archive,
    session,
    dice: recorder,
    presence: policy.presence,
    actions: createActionResolutionService({ dice: recorder }),
    map: createMapPreparationService(),
    army: createArmyPreparationService(),
    continuation: createBattleContinuationService({ dice: recorder }),
    manager: createBattleManager(),
  });

  return {
    get session() { return executor.session; },
    get history() { return executor.history; },
    userId: policy.userId,
    submit: (command) => executor.submit(command, policy.userId),
    execute: (envelope) => executor.execute(envelope),
    subscribe: (listener) => executor.subscribe(listener),
  };
}

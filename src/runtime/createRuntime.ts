import { randomRng } from '../engine/index.js';
import { createActionResolutionService } from '../services/ActionResolutionService.js';
import { createArmyPreparationService } from '../services/ArmyPreparationService.js';
import { createBattleContinuationService } from '../services/BattleContinuationService.js';
import { createBattleManager } from '../services/BattleManager.js';
import { createMapPreparationService } from '../services/MapPreparationService.js';
import {
  createOutcomeApplicationService,
  type ActorWritebackPort, type BattleOutcome, type CampaignOutcomePort, type WritebackReport,
} from '../services/OutcomeApplicationService.js';
import type { BattleCommand, CommandEnvelope, CommandResult } from './commands.js';
import { recordDice } from './dice.js';
import { createExecutor, type HistorySnapshot } from './executeCommand.js';
import { hotSeatPolicy, type SeatPolicy } from './policy.js';
import type { BattleArchive, DicePort, SessionRepository, TableUser } from './ports.js';
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
  /** The campaign module that applies the final outcome. Absent hands the work to `actors`. */
  campaign?: CampaignOutcomePort | null;
  /** Troop actors, for the writeback a campaign module is not there to do. */
  actors?: ActorWritebackPort | null;
}

export interface Runtime {
  readonly session: BattleSession;
  readonly history: readonly HistorySnapshot[];
  /** The user this client submits as. */
  readonly userId: string;
  /** The user who answers for a side nobody holds and may issue any command. A client compares
   * it with its own user to know whether the controls it shows are live. */
  gmUserId(): string;
  /** Everyone the host would seat, for the GM's seating controls. */
  tableUsers(): TableUser[];
  /** Run a command as this client's user, at whatever revision the authority holds. A remote
   * client sends its own envelope, built against the revision it can see. */
  submit(command: BattleCommand): Promise<CommandResult>;
  execute(envelope: CommandEnvelope): Promise<CommandResult>;
  subscribe(listener: (session: BattleSession) => void): () => void;
  /**
   * Hand the GM's confirmed outcome to the campaign, one target at a time, committing each
   * one's progress before the next. It lives here because the runtime is built on the client
   * that holds the authority, and that client performs every actor mutation. Call it again
   * after an interruption to resume, or after it finished to write nothing.
   */
  applyOutcome(outcome: BattleOutcome, revision: number): Promise<WritebackReport>;
}

/** The one place that wires the services, the ports, and the executor together. */
export function createRuntime({
  repository, archive, session, dice = randomRng, policy = hotSeatPolicy(), campaign = null, actors = null,
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
  const outcomes = createOutcomeApplicationService({ campaign, actors });

  return {
    get session() { return executor.session; },
    get history() { return executor.history; },
    userId: policy.userId,
    gmUserId: () => policy.presence.gmUserId(),
    tableUsers: () => policy.presence.users().map((id) => ({
      id, name: policy.presence.displayName(id), online: policy.presence.online(id),
    })),
    submit: (command) => executor.submit(command, policy.userId),
    execute: (envelope) => executor.execute(envelope),
    subscribe: (listener) => executor.subscribe(listener),
    applyOutcome: (outcome, revision) => outcomes.applyOutcome({
      outcome,
      revision,
      session: () => executor.session,
      submit: (command) => executor.submit(command, policy.userId),
    }),
  };
}

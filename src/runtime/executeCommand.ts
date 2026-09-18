import type { BattleState } from '../engine/index.js';
import type { ActionResolutionService } from '../services/ActionResolutionService.js';
import type { ArmyPreparationService } from '../services/ArmyPreparationService.js';
import type { BattleContinuationService } from '../services/BattleContinuationService.js';
import type { BattleManager } from '../services/BattleManager.js';
import type { MapPreparationService } from '../services/MapPreparationService.js';
import { COMMAND_STAGE, type BattleCommand, type CommandEnvelope, type CommandResult, type CommandType, type RejectionReason } from './commands.js';
import type { SessionRepository } from './ports.js';
import type { BattleSession, BattleSetupDraft } from './session.js';

/** How far undo walks back, the depth the prototype's store kept. */
const HISTORY_LIMIT = 30;
/** Wave 3.3 answers a command ID found here with success; the executor records them from here. */
const RECENT_COMMAND_IDS = 20;

/** What a command does to the undo history. `push` records what it replaced; `clear` is a
 * boundary undo cannot cross, as the prototype's store held them. Selection is not an
 * activation, and a generated or reworded board was never undoable — only a paint stroke was.
 * `session.undo` is absent: it consumes the history rather than adding to it. */
const HISTORY: Record<Exclude<CommandType, 'session.undo'>, 'push' | 'keep' | 'clear'> = {
  'activation.select': 'keep',
  'activation.deselect': 'keep',
  'action.resolve': 'push',
  'activation.end': 'push',
  'setup.generate': 'keep',
  'setup.rerollSeed': 'keep',
  'setup.editSpec': 'keep',
  'setup.setRoundsPerDay': 'keep',
  'setup.paint': 'push',
  'army.addUnit': 'keep',
  'army.removeUnit': 'keep',
  'army.addEmplacement': 'keep',
  'army.removeEmplacement': 'keep',
  'army.attachEquipment': 'keep',
  'army.detachEquipment': 'keep',
  'army.place': 'keep',
  'army.unplace': 'keep',
  'army.autoPlace': 'keep',
  'army.generateForce': 'keep',
  'continuation.declareRecovery': 'clear',
  'continuation.declareDayOrder': 'keep',
  'continuation.confirmDayOrders': 'clear',
  'continuation.answerSurrender': 'clear',
  'continuation.chooseBattlefield': 'keep',
  'continuation.declareDeployment': 'keep',
  'continuation.startNextDay': 'clear',
  'battle.start': 'clear',
  'battle.returnToSetup': 'clear',
  'battle.reset': 'clear',
  'battle.finalize': 'clear',
};

export interface Services {
  actions: ActionResolutionService;
  map: MapPreparationService;
  army: ArmyPreparationService;
  continuation: BattleContinuationService;
  manager: BattleManager;
}

function applyCommand(
  session: BattleSession, command: Exclude<BattleCommand, { type: 'session.undo' }>,
  { actions, map, army, continuation, manager }: Services,
): BattleSession {
  switch (command.type) {
    case 'activation.select': return actions.select(session, command.unitId);
    case 'activation.deselect': return actions.deselect(session);
    case 'action.resolve': return actions.act(session, command.action);
    case 'activation.end': return actions.endActivation(session, command.unitId);
    case 'setup.generate': return map.generate(session);
    case 'setup.rerollSeed': return map.rerollSeed(session);
    case 'setup.editSpec': return map.editSpec(session, command.spec);
    case 'setup.setRoundsPerDay': return map.setRoundsPerDay(session, command.roundsPerDay);
    case 'setup.paint': return manager.paint(session, command.stroke);
    case 'army.addUnit': return army.addUnit(session, command.side, command.card);
    case 'army.removeUnit': return army.removeUnit(session, command.unitId);
    case 'army.addEmplacement': return army.addEmplacement(session, command.side, command.engine);
    case 'army.removeEmplacement': return army.removeEmplacement(session, command.emplacementId);
    case 'army.attachEquipment': return army.attachEquipment(session, command.unitId, command.engine);
    case 'army.detachEquipment': return army.detachEquipment(session, command.unitId, command.equipmentId);
    case 'army.place': return army.place(session, command.piece, command.square);
    case 'army.unplace': return army.unplace(session, command.piece);
    case 'army.autoPlace': return army.autoPlace(session, command.piece);
    case 'army.generateForce': return army.generateForce(session, command.side, command.seed);
    case 'continuation.declareRecovery': return continuation.declareRecovery(session, command.side, command.choices);
    case 'continuation.declareDayOrder': return continuation.declareDayOrder(session, command.side, command.order);
    case 'continuation.confirmDayOrders': return continuation.confirmDayOrders(session);
    case 'continuation.answerSurrender': return continuation.answerSurrender(session, command.side, command.accept);
    case 'continuation.chooseBattlefield': return continuation.chooseBattlefield(session, command.spec);
    case 'continuation.declareDeployment': return continuation.declareDeployment(session, command.side, command.positions);
    case 'continuation.startNextDay': return manager.startNextDay(session);
    case 'battle.start': return manager.start(session);
    case 'battle.returnToSetup': return manager.returnToSetup(session);
    case 'battle.reset': return manager.reset(session);
    case 'battle.finalize': return manager.finalize(session);
  }
}

export interface ExecutorOptions extends Services {
  repository: SessionRepository;
  session: BattleSession;
}

/** A change to the record, applied to the committed one inside the queue. A throw rejects. */
type SessionEdit = (session: BattleSession) => BattleSession;

/** What an undoable commit replaced. A tactical command replaces the battle; a setup command
 * (so far, only a paint stroke) replaces the whole setup draft, board and placements together,
 * so undo restores both from one snapshot. */
export type HistorySnapshot =
  | { kind: 'battle'; battle: BattleState }
  | { kind: 'setup'; setup: BattleSetupDraft };

export interface Executor {
  /** The committed record. It changes at a successful save and nowhere else. */
  readonly session: BattleSession;
  /** Snapshots to rewind to, oldest first, held in the authority's memory. */
  readonly history: readonly HistorySnapshot[];
  execute(envelope: CommandEnvelope): Promise<CommandResult>;
  /** Called with each committed record, after the save that made it durable. */
  subscribe(listener: (session: BattleSession) => void): () => void;
}

const failure = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * The commit boundary. Every shared change enters here, one at a time, and nothing leaves
 * until the record is durable: validate, resolve, bump the revision, save, then publish.
 * A rejection returns a result and leaves the session and the undo history as they were.
 */
export function createExecutor({ repository, session: initial, ...services }: ExecutorOptions): Executor {
  let session = initial;
  let history: HistorySnapshot[] = [];
  const listeners = new Set<(session: BattleSession) => void>();
  let queue: Promise<unknown> = Promise.resolve();

  const reject = (commandId: string, reason: RejectionReason, message: string): CommandResult =>
    ({ ok: false, commandId, revision: session.revision, reason, message });

  function commit(next: BattleSession, commandId: string): BattleSession {
    return {
      ...next,
      revision: next.revision + 1,
      // Wave 3.1 fills the events of the transition.
      lastCommit: { commandId, events: [] },
      recentCommandIds: [...next.recentCommandIds, commandId].slice(-RECENT_COMMAND_IDS),
    };
  }

  /** Resolve, save, then publish. `record` runs once the write is durable. */
  async function persist(
    commandId: string, edit: SessionEdit, record: (previous: BattleSession) => void,
  ): Promise<CommandResult> {
    const previous = session;
    let next: BattleSession;
    try {
      next = commit(edit(previous), commandId);
    } catch (error) {
      return reject(commandId, 'engine', failure(error));
    }
    try {
      await repository.save(next);
    } catch (error) {
      return reject(commandId, 'storage', failure(error));
    }

    session = next;
    record(previous);
    for (const listener of [...listeners]) listener(session);
    return { ok: true, commandId, revision: session.revision };
  }

  function run({ battleId, commandId, command }: CommandEnvelope): Promise<CommandResult> {
    if (battleId !== session.battleId) return Promise.resolve(reject(commandId, 'battle', `${battleId} is not the battle under way`));
    // The socket of Wave 4.2 delivers payloads this union cannot vouch for.
    if (!Object.hasOwn(COMMAND_STAGE, command?.type)) return Promise.resolve(reject(commandId, 'unsupported', `${command?.type} is not a command`));
    const stage = COMMAND_STAGE[command.type];
    if (stage === 'setup' && session.battle) return Promise.resolve(reject(commandId, 'stage', 'a battle is already under way'));
    if (stage === 'battle' && !session.battle) return Promise.resolve(reject(commandId, 'stage', 'no battle is under way'));
    // A finalized battle has been reported to the campaign. Only leaving it reopens the record.
    if (session.stage === 'finalized' && command.type !== 'battle.returnToSetup') {
      return Promise.resolve(reject(commandId, 'stage', 'this battle is finalized'));
    }
    if (command.type === 'session.undo') return rewind(commandId);

    return persist(commandId, (current) => applyCommand(current, command, services), (previous) => {
      const effect = HISTORY[command.type];
      if (effect === 'clear') history = [];
      if (effect !== 'push') return;
      history = [...history.slice(1 - HISTORY_LIMIT),
        previous.battle ? { kind: 'battle', battle: previous.battle } : { kind: 'setup', setup: previous.setup }];
    });
  }

  function rewind(commandId: string): Promise<CommandResult> {
    const previous = history.at(-1);
    if (!previous) return Promise.resolve(reject(commandId, 'stage', 'nothing to undo'));
    return persist(commandId, (current) => (previous.kind === 'battle'
      ? { ...current, battle: previous.battle } : { ...current, setup: previous.setup }), () => {
      history = history.slice(0, -1);
    });
  }

  function enqueue(work: () => Promise<CommandResult>): Promise<CommandResult> {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  }

  return {
    get session() { return session; },
    get history() { return history; },
    execute(envelope) { return enqueue(() => run(envelope)); },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

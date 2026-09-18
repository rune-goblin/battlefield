import type { BattleState } from '../engine/index.js';
import type { ActionResolutionService } from '../services/ActionResolutionService.js';
import type { BattleCommand, CommandEnvelope, CommandResult, CommandType, RejectionReason } from './commands.js';
import type { SessionRepository } from './ports.js';
import type { BattleSession } from './session.js';

/** How far undo walks back, the depth the prototype's store kept. */
const HISTORY_LIMIT = 30;
/** Wave 3.3 answers a command ID found here with success; the executor records them from here. */
const RECENT_COMMAND_IDS = 20;

/** Selection is not an activation, so undo still rewinds to the last completed one. */
const UNDOABLE: Record<CommandType, boolean> = {
  'activation.select': false,
  'activation.deselect': false,
  'action.resolve': true,
  'activation.end': true,
};

function applyCommand(
  session: BattleSession, command: BattleCommand, actions: ActionResolutionService,
): BattleSession {
  switch (command.type) {
    case 'activation.select': return actions.select(session, command.unitId);
    case 'activation.deselect': return actions.deselect(session);
    case 'action.resolve': return actions.act(session, command.action);
    case 'activation.end': return actions.endActivation(session, command.unitId);
  }
}

export interface ExecutorOptions {
  repository: SessionRepository;
  session: BattleSession;
  actions: ActionResolutionService;
}

export interface Executor {
  /** The committed record. It changes at a successful save and nowhere else. */
  readonly session: BattleSession;
  /** Battle states to rewind to, oldest first, held in the authority's memory. */
  readonly history: readonly BattleState[];
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
export function createExecutor({ repository, session: initial, actions }: ExecutorOptions): Executor {
  let session = initial;
  let history: BattleState[] = [];
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

  async function run({ battleId, commandId, command }: CommandEnvelope): Promise<CommandResult> {
    if (battleId !== session.battleId) return reject(commandId, 'battle', `${battleId} is not the battle under way`);
    // The socket of Wave 4.2 delivers payloads this union cannot vouch for.
    if (!Object.hasOwn(UNDOABLE, command?.type)) return reject(commandId, 'unsupported', `${command?.type} is not a command`);
    if (!session.battle) return reject(commandId, 'stage', 'no battle is under way');

    const previous = session;
    let next: BattleSession;
    try {
      next = commit(applyCommand(previous, command, actions), commandId);
    } catch (error) {
      return reject(commandId, 'engine', failure(error));
    }
    try {
      await repository.save(next);
    } catch (error) {
      return reject(commandId, 'storage', failure(error));
    }

    session = next;
    if (UNDOABLE[command.type] && previous.battle) {
      history = [...history.slice(1 - HISTORY_LIMIT), previous.battle];
    }
    for (const listener of [...listeners]) listener(session);
    return { ok: true, commandId, revision: session.revision };
  }

  return {
    get session() { return session; },
    get history() { return history; },
    execute(envelope) {
      const result = queue.then(() => run(envelope));
      queue = result.catch(() => {});
      return result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

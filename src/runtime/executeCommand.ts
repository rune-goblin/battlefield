import type { BattleState } from '../engine/index.js';
import type { ActionResolutionService } from '../services/ActionResolutionService.js';
import type { ArmyPreparationService } from '../services/ArmyPreparationService.js';
import type { MapPreparationService } from '../services/MapPreparationService.js';
import { newCommandId, SETUP_COMMANDS, type BattleCommand, type CommandEnvelope, type CommandResult, type CommandType, type RejectionReason } from './commands.js';
import type { SessionRepository } from './ports.js';
import type { BattleSession, BattleSetupDraft } from './session.js';

/** How far undo walks back, the depth the prototype's store kept. */
const HISTORY_LIMIT = 30;
/** Wave 3.3 answers a command ID found here with success; the executor records them from here. */
const RECENT_COMMAND_IDS = 20;

/** Selection is not an activation, so undo still rewinds to the last completed one. A generated
 * or reworded board is not undoable either — only a paint stroke was, in the prototype. */
const UNDOABLE: Record<CommandType, boolean> = {
  'activation.select': false,
  'activation.deselect': false,
  'action.resolve': true,
  'activation.end': true,
  'setup.generate': false,
  'setup.rerollSeed': false,
  'setup.editSpec': false,
  'setup.setRoundsPerDay': false,
  'setup.paint': true,
  'army.addUnit': false,
  'army.removeUnit': false,
  'army.addEmplacement': false,
  'army.removeEmplacement': false,
  'army.attachEquipment': false,
  'army.detachEquipment': false,
  'army.place': false,
  'army.unplace': false,
  'army.autoPlace': false,
  'army.generateForce': false,
};

export interface Services {
  actions: ActionResolutionService;
  map: MapPreparationService;
  army: ArmyPreparationService;
}

function applyCommand(
  session: BattleSession, command: BattleCommand, { actions, map, army }: Services,
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
    case 'setup.paint': return map.paint(session, command.stroke);
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
  }
}

export interface ExecutorOptions extends Services {
  repository: SessionRepository;
  session: BattleSession;
}

/** A change to the record, applied to the committed one inside the queue. A throw rejects. */
export type SessionEdit = (session: BattleSession) => BattleSession;

/** What a change does to the undo history. Setup, a committed night, a new day and resolved
 * orders are boundaries the prototype's store already cleared. */
export type HistoryEffect = 'keep' | 'clear';

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
  // proto: the store still writes lifecycle transitions and the continuation directly. They
  // commit here so the record keeps one writer and one order; Phase 2 turns each into a
  // command and this goes.
  change(edit: SessionEdit, history?: HistoryEffect): Promise<CommandResult>;
  /** Rewind to the snapshot the last undoable commit replaced, under a new revision. */
  undo(): Promise<CommandResult>;
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
    if (!Object.hasOwn(UNDOABLE, command?.type)) return Promise.resolve(reject(commandId, 'unsupported', `${command?.type} is not a command`));
    if (SETUP_COMMANDS.has(command.type)) {
      if (session.battle) return Promise.resolve(reject(commandId, 'stage', 'a battle is already under way'));
    } else if (!session.battle) {
      return Promise.resolve(reject(commandId, 'stage', 'no battle is under way'));
    }

    return persist(commandId, (current) => applyCommand(current, command, services), (previous) => {
      if (!UNDOABLE[command.type]) return;
      history = [...history.slice(1 - HISTORY_LIMIT),
        previous.battle ? { kind: 'battle', battle: previous.battle } : { kind: 'setup', setup: previous.setup }];
    });
  }

  function rewind(): Promise<CommandResult> {
    const commandId = newCommandId();
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
    change(edit, effect = 'keep') {
      return enqueue(() => persist(newCommandId(), edit, () => { if (effect === 'clear') history = []; }));
    },
    undo() { return enqueue(rewind); },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

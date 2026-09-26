import type { BattleState } from '../engine/index.js';
import { pruneSources } from './campaign.js';
import { COMMANDS, descriptorOf, type CommandContext, type HistoryEffect } from './commandTable.js';
import {
  newCommandId, type BattleCommand, type CommandAccepted, type CommandEnvelope, type CommandResult, type CommandType,
  type PieceRef, type RejectionReason,
} from './commands.js';
import { openTurn } from './control.js';
import type { DiceRecorder } from './dice.js';
import { stampEvents, type BattleEventBody } from './events.js';
import { clearObsolete } from './interactions.js';
import { refuseCommand } from './policy.js';
import { memorySites } from './memorySites.js';
import type { BattleArchive, BattleSites, PresencePort, SessionRepository } from './ports.js';
import type { Services } from './servicePorts.js';
import { writebackRunning, type BattleSession, type BattleSetupDraft } from './session.js';
import type { Side } from '../engine/index.js';

/** How far undo walks back, the depth the prototype's store kept. */
const UNDO_DEPTH = 30;
/** A command ID found among these is answered with success rather than run again. */
const RECENT_COMMAND_IDS = 20;

export interface ExecutorOptions extends Services {
  repository: SessionRepository;
  archive: BattleArchive;
  /** Absent on a host with no campaign map; the battles then live for the page's life. */
  sites?: BattleSites;
  session: BattleSession;
  /** The same dice the services roll, wrapped so each transition's faces reach its commit. */
  dice: DiceRecorder;
  /** Who is at the table, for naming a turn holder and for judging who sent a command. */
  presence: PresencePort;
  /** Where a subscriber's throw goes. The commit it followed stands, and the rest still hear it.
   * A throw from this handler goes to `console.error` with the error it was handed. */
  onListenerError?: (error: unknown) => void;
}

/** A change to the record, applied to the committed one inside the queue. A throw rejects. */
type SessionEdit = (session: BattleSession) => BattleSession;

/** What the transition did, derived from the two records once the edit has run. */
type EventSource = (previous: BattleSession, next: BattleSession) => BattleEventBody[];

interface Persistence {
  /** Whose descriptor names what the commit does to the undo history. */
  type: CommandType;
  edit: SessionEdit;
  describe?: EventSource;
  /** Undo restores the turn its own snapshot holds; every other commit opens one afresh. */
  seat?: boolean;
}

/** What an undoable commit replaced. A tactical command replaces the battle; a setup command
 * (so far, only a paint stroke) replaces the whole setup draft, board and placements together,
 * so undo restores both from one snapshot. The turn holder and the rotation pointers travel
 * with it: they move with the tactical state and have to come back with it. */
export type HistorySnapshot = { turn: string | null; next: Record<Side, number> } & (
  | { kind: 'battle'; battle: BattleState }
  | { kind: 'setup'; setup: BattleSetupDraft });

export interface Executor {
  /** The committed record. It changes at a successful save and nowhere else. */
  readonly session: BattleSession;
  /** Snapshots to rewind to, oldest first, held in the authority's memory. */
  readonly history: readonly HistorySnapshot[];
  execute(envelope: CommandEnvelope): Promise<CommandResult>;
  /** Run a command from a client that holds the authority itself. The envelope is built inside
   * the queue, at whatever revision is current, because such a client has no stale copy to
   * guard against — it is reading the record it is writing. */
  submit(command: BattleCommand, userId: string): Promise<CommandResult>;
  /** Called with each committed record, after the save that made it durable. */
  subscribe(listener: (session: BattleSession) => void): () => void;
}

/** Which activation the record stands in. It changes when one ends and the next opens, which
 * is exactly when the executor names a turn holder; an action within an activation leaves it. */
const activationKey = (b: BattleState): string => `${b.day}:${b.round}:${b.activated.length}:${b.pending}`;

const failure = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function addedPieces(previous: BattleSession, next: BattleSession): PieceRef[] {
  const units = new Set(previous.setup.units.map((u) => u.id));
  const engines = new Set(previous.setup.emplacements.map((e) => e.id));
  return [
    ...next.setup.units.filter((u) => !units.has(u.id)).map((u): PieceRef => ({ kind: 'unit', id: u.id })),
    ...next.setup.emplacements.filter((e) => !engines.has(e.id)).map((e): PieceRef => ({ kind: 'engine', id: e.id })),
  ];
}

/**
 * The commit boundary. Every shared change enters here, one at a time, and nothing leaves
 * until the record is durable: validate, resolve, bump the revision, save, then publish.
 * A rejection returns a result and leaves the session and the undo history as they were.
 */
export function createExecutor({
  repository, archive, sites = memorySites(), dice, presence, session: initial,
  // proto: a subscriber's throw goes to the console until a host gives it a surface.
  onListenerError = (error) => console.error(error),
  ...services
}: ExecutorOptions): Executor {
  let session = initial;
  let history: HistorySnapshot[] = [];
  const listeners = new Set<(session: BattleSession) => void>();
  let queue: Promise<unknown> = Promise.resolve();

  const reject = (commandId: string, reason: RejectionReason, message: string): CommandResult =>
    ({ ok: false, commandId, revision: session.revision, reason, message });

  /** Name the turn holder in the commit that opened the activation, and move that side's
   * pointer with it. A record with no battle running holds no turn. */
  function seatTurn(previous: BattleSession, next: BattleSession): BattleSession {
    const after = next.battle;
    if (!after || after.phase !== 'battle') return next.turn === null ? next : { ...next, turn: null };
    const before = previous.battle;
    const standing = before?.phase === 'battle' && activationKey(before) === activationKey(after);
    if (next.turn && standing) return next;
    const { holder, control } = openTurn(next.control, after.pending, presence);
    return { ...next, turn: holder, control };
  }

  function commit(
    next: BattleSession, commandId: string, events: BattleEventBody[], faces: number[], userId: string,
  ): BattleSession {
    return {
      ...next,
      revision: next.revision + 1,
      lastCommit: { commandId, events: stampEvents(commandId, events), dice: faces, userId },
      recentCommandIds: [...next.recentCommandIds, commandId].slice(-RECENT_COMMAND_IDS),
    };
  }

  /** What a commit does to the undo history, applied once the write is durable. */
  function remember(effect: HistoryEffect, previous: BattleSession): void {
    switch (effect) {
      case 'keep': return;
      case 'pop': history = history.slice(0, -1); return;
      case 'clear': history = []; return;
      case 'push': {
        const turn = previous.turn;
        const next = previous.control.next;
        history = [...history.slice(1 - UNDO_DEPTH), previous.battle
          ? { kind: 'battle', battle: previous.battle, turn, next }
          : { kind: 'setup', setup: previous.setup, turn, next }];
      }
    }
  }

  /** Resolve, save, then publish. The history moves once the write is durable. */
  async function persist(
    commandId: string, userId: string,
    { type, edit, describe = () => [], seat = true }: Persistence,
  ): Promise<CommandResult> {
    const previous = session;
    let next: BattleSession;
    // Faces a rejected edit drew belong to no commit; drop them before this one rolls.
    dice.take();
    try {
      // The commit that moves the stage or the day is the commit that drops the decisions the
      // old one was waiting on: one record never carries an answer to a question that is gone.
      const edited = pruneSources(clearObsolete(edit(previous)));
      const events = describe(previous, edited);
      next = commit(seat ? seatTurn(previous, edited) : edited, commandId, events, dice.take(), userId);
    } catch (error) {
      return reject(commandId, 'engine', failure(error));
    }
    try {
      await repository.save(next);
    } catch (error) {
      return reject(commandId, 'storage', failure(error));
    }

    session = next;
    remember(COMMANDS[type].history, previous);
    for (const listener of [...listeners]) {
      try {
        listener(session);
      } catch (error) {
        try {
          onListenerError(error);
        } catch (handlerError) {
          console.error(error);
          console.error(handlerError);
        }
      }
    }
    const accepted: CommandAccepted = { ok: true, commandId, revision: session.revision };
    if (COMMANDS[type].adds) accepted.added = addedPieces(previous, session);
    return accepted;
  }

  async function run({ battleId, commandId, expectedRevision, userId, command }: CommandEnvelope): Promise<CommandResult> {
    if (battleId !== session.battleId) return reject(commandId, 'battle', `${battleId} is not the battle under way`);
    // A client whose reply was lost resends the same command ID. The commit already happened,
    // so answer it with the revision that holds it rather than running the command twice.
    if (session.recentCommandIds.includes(commandId)) return { ok: true, commandId, revision: session.revision };
    // The socket of Wave 4.2 delivers payloads this union cannot vouch for.
    if (!Object.hasOwn(COMMANDS, command?.type)) return reject(commandId, 'unsupported', `${command?.type} is not a command`);
    // proto: the wording of a stale-revision refusal is reserved for review with the rest of
    // the turn and seat text. The revision travels with it so the client can refresh and ask.
    if (expectedRevision !== session.revision) {
      return reject(commandId, 'revision', `the battle has moved on to revision ${session.revision}`);
    }
    const descriptor = descriptorOf(command);
    const stage = descriptor.stage;
    if (stage === 'setup' && session.battle) return reject(commandId, 'stage', 'a battle is already under way');
    if (stage === 'battle' && !session.battle) return reject(commandId, 'stage', 'no battle is under way');
    // A finalized battle has been reported to the campaign. Only leaving it, or replacing it
    // outright with a loaded save, reopens the record.
    if (session.stage === 'finalized' && !descriptor.afterFinal) {
      return reject(commandId, 'stage', 'this battle is finalized');
    }
    // proto: the wording is reserved for review with the rest of the player-facing text.
    if (writebackRunning(session) && !descriptor.duringWriteback) {
      return reject(commandId, 'stage', 'the campaign outcome is being applied');
    }
    const refusal = refuseCommand(session, command, userId, presence);
    if (refusal) return reject(commandId, 'permission', refusal);
    if (command.type === 'session.undo') return rewind(commandId, userId);

    const ctx: CommandContext = { services, presence, userId, archive, sites };
    const barred = descriptor.refuse?.(session, command, ctx);
    if (barred) return reject(commandId, 'stage', barred);
    let prepared: unknown = null;
    if (descriptor.prepare) {
      try {
        prepared = await descriptor.prepare(session, command, ctx);
      } catch (error) {
        return reject(commandId, 'storage', failure(error));
      }
    }
    return persist(commandId, userId, {
      type: command.type,
      edit: (current) => descriptor.run!(current, command, ctx, prepared),
      describe: (previous, next) => descriptor.events?.(previous, next, command, ctx) ?? [],
    });
  }

  function rewind(commandId: string, userId: string): Promise<CommandResult> {
    const previous = history.at(-1);
    if (!previous) return Promise.resolve(reject(commandId, 'stage', 'nothing to undo'));
    return persist(commandId, userId, {
      type: 'session.undo',
      edit: (current) => ({
        ...current,
        ...(previous.kind === 'battle' ? { battle: previous.battle } : { setup: previous.setup }),
        turn: previous.turn,
        control: { ...current.control, next: previous.next },
      }),
      seat: false,
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
    submit(command, userId) {
      return enqueue(() => run({
        battleId: session.battleId, commandId: newCommandId(), expectedRevision: session.revision, userId, command,
      }));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

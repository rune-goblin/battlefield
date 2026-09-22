import type { BattleState } from '../engine/index.js';
import type { ActionResolutionService } from '../services/ActionResolutionService.js';
import type { ArmyPreparationService } from '../services/ArmyPreparationService.js';
import type { BattleContinuationService } from '../services/BattleContinuationService.js';
import type { BattleManager } from '../services/BattleManager.js';
import type { MapPreparationService } from '../services/MapPreparationService.js';
import { abandonWriteback, beginWriteback, markWritebackTarget } from '../services/OutcomeApplicationService.js';
import { pruneSources, sessionAtSite, sessionFromRequest, type BattleRequest } from './campaign.js';
import { COMMAND_STAGE, newCommandId, type BattleCommand, type CommandEnvelope, type CommandResult, type CommandType, type RejectionReason } from './commands.js';
import { openTurn, seatUsers } from './control.js';
import type { DiceRecorder } from './dice.js';
import { stampEvents, type BattleEventBody } from './events.js';
import { clearObsolete, dropInteraction } from './interactions.js';
import { assignSeats, reassignTurn, refuseCommand } from './policy.js';
import { memorySites } from './memorySites.js';
import type { BattleArchive, BattleSites, PresencePort, SessionRepository } from './ports.js';
import { migrateSession, writebackRunning, type BattleSession, type BattleSetupDraft } from './session.js';
import type { Side } from '../engine/index.js';

/** How far undo walks back, the depth the prototype's store kept. */
const HISTORY_LIMIT = 30;
/** A command ID found among these is answered with success rather than run again. */
const RECENT_COMMAND_IDS = 20;

/** What a command does to the undo history. `push` records what it replaced; `clear` is a
 * boundary undo cannot cross, as the prototype's store held them. Selection is not an
 * activation, and a generated or reworded board was never undoable — only a paint stroke was.
 * `session.undo` is absent: it consumes the history rather than adding to it. */
const HISTORY: Record<Exclude<CommandType, 'session.undo' | 'session.load' | 'session.install' | 'session.moveTo'>, 'push' | 'keep' | 'clear'> = {
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
  'army.setSide': 'keep',
  'army.swapSides': 'keep',
  'army.addEmplacement': 'keep',
  'army.removeEmplacement': 'keep',
  'army.setHauling': 'keep',
  'army.setEngineLoaded': 'keep',
  'army.place': 'keep',
  'army.unplace': 'keep',
  'army.autoPlace': 'keep',
  'army.generateForce': 'keep',
  'army.declareReady': 'keep',
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
  // The campaign holds part of this result the moment the first target lands, so undo closes
  // at the start of the writeback rather than at its end.
  'outcome.begin': 'clear',
  'outcome.markTarget': 'keep',
  'outcome.abandon': 'keep',
  'control.assign': 'keep',
  'turn.reassign': 'keep',
};

export interface Services {
  actions: ActionResolutionService;
  map: MapPreparationService;
  army: ArmyPreparationService;
  continuation: BattleContinuationService;
  manager: BattleManager;
}

/** What a finalized record still answers: leaving the battle, or replacing it outright. */
const AFTER_FINAL: CommandType[] = ['battle.returnToSetup', 'session.load', 'session.install', 'session.moveTo'];

/** What a record answers while the campaign writeback is under way. Undo and loading are shut
 * out: part of the result already sits in the campaign, and rewinding the battle behind it
 * would leave the two disagreeing. */
const DURING_WRITEBACK: CommandType[] = ['outcome.markTarget', 'outcome.abandon'];

function applyCommand(
  session: BattleSession, command: Exclude<BattleCommand, { type: 'session.undo' | 'session.load' | 'session.install' | 'session.moveTo' }>,
  { actions, map, army, continuation, manager }: Services, presence: PresencePort, userId: string,
): BattleSession {
  switch (command.type) {
    case 'control.assign': return assignSeats(session, command.control, presence);
    case 'turn.reassign': return reassignTurn(session, command.userId, presence);
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
    case 'army.setSide': return army.setSide(session, command.unitId, command.side);
    case 'army.swapSides': return army.swapSides(session);
    case 'army.addEmplacement': return army.addEmplacement(session, command.side, command.engine);
    case 'army.removeEmplacement': return army.removeEmplacement(session, command.emplacementId);
    case 'army.setHauling': return army.setHauling(session, command.emplacementId, command.hauling);
    case 'army.setEngineLoaded': return army.setEngineLoaded(session, command.emplacementId, command.loaded);
    case 'army.place': return army.place(session, command.piece, command.square);
    case 'army.unplace': return army.unplace(session, command.piece);
    case 'army.autoPlace': return army.autoPlace(session, command.piece);
    case 'army.generateForce': return army.generateForce(session, command.side, command.seed);
    case 'army.declareReady': return army.declareReady(session, command.side, command.ready, userId);
    case 'continuation.declareRecovery': return continuation.declareRecovery(session, command.side, command.choices, userId);
    case 'continuation.declareDayOrder': return continuation.declareDayOrder(session, command.side, command.order);
    case 'continuation.confirmDayOrders': return continuation.confirmDayOrders(session);
    case 'continuation.answerSurrender': return continuation.answerSurrender(session, command.side, command.accept, userId);
    case 'continuation.chooseBattlefield': return continuation.chooseBattlefield(session, command.spec);
    case 'continuation.declareDeployment': return continuation.declareDeployment(session, command.side, command.positions, userId);
    case 'continuation.startNextDay': return manager.startNextDay(session);
    case 'battle.start': return manager.start(session);
    case 'battle.returnToSetup': return manager.returnToSetup(session);
    case 'battle.reset': return manager.reset(session);
    case 'battle.finalize': return manager.finalize(session);
    case 'outcome.begin': return beginWriteback(session, command.operationId, command.via);
    case 'outcome.markTarget': return markWritebackTarget(session, command.unitId, command.status, command.problem);
    case 'outcome.abandon': return abandonWriteback(session);
  }
}

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
}

/** A change to the record, applied to the committed one inside the queue. A throw rejects. */
type SessionEdit = (session: BattleSession) => BattleSession;

/** What the transition did, derived from the two records once the edit has run. */
type EventSource = (previous: BattleSession, next: BattleSession) => BattleEventBody[];

interface Persistence {
  edit: SessionEdit;
  /** Run once the write is durable, with the record the commit replaced. */
  record?: (previous: BattleSession) => void;
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

/**
 * The commit boundary. Every shared change enters here, one at a time, and nothing leaves
 * until the record is durable: validate, resolve, bump the revision, save, then publish.
 * A rejection returns a result and leaves the session and the undo history as they were.
 */
export function createExecutor({ repository, archive, sites = memorySites(), dice, presence, session: initial, ...services }: ExecutorOptions): Executor {
  let session = initial;
  let history: HistorySnapshot[] = [];
  const listeners = new Set<(session: BattleSession) => void>();
  let queue: Promise<unknown> = Promise.resolve();

  const reject = (commandId: string, reason: RejectionReason, message: string): CommandResult =>
    ({ ok: false, commandId, revision: session.revision, reason, message });

  /** The two commands that resolve rules carry events. A setup or lifecycle command replaces
   * whole boards and forces, which a client adopts rather than plays. */
  function eventsOf(command: BattleCommand, previous: BattleSession, next: BattleSession): BattleEventBody[] {
    if (command.type === 'action.resolve') return services.actions.events(previous, next, command.action);
    if (command.type === 'activation.end') return services.actions.events(previous, next);
    return [];
  }

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

  /** Resolve, save, then publish. `record` runs once the write is durable. */
  async function persist(
    commandId: string, userId: string,
    { edit, record = () => {}, describe = () => [], seat = true }: Persistence,
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
    record(previous);
    for (const listener of [...listeners]) listener(session);
    return { ok: true, commandId, revision: session.revision };
  }

  function run({ battleId, commandId, expectedRevision, userId, command }: CommandEnvelope): Promise<CommandResult> {
    if (battleId !== session.battleId) return Promise.resolve(reject(commandId, 'battle', `${battleId} is not the battle under way`));
    // A client whose reply was lost resends the same command ID. The commit already happened,
    // so answer it with the revision that holds it rather than running the command twice.
    if (session.recentCommandIds.includes(commandId)) return Promise.resolve({ ok: true, commandId, revision: session.revision });
    // The socket of Wave 4.2 delivers payloads this union cannot vouch for.
    if (!Object.hasOwn(COMMAND_STAGE, command?.type)) return Promise.resolve(reject(commandId, 'unsupported', `${command?.type} is not a command`));
    // proto: the wording of a stale-revision refusal is reserved for review with the rest of
    // the turn and seat text. The revision travels with it so the client can refresh and ask.
    if (expectedRevision !== session.revision) {
      return Promise.resolve(reject(commandId, 'revision', `the battle has moved on to revision ${session.revision}`));
    }
    const stage = COMMAND_STAGE[command.type];
    if (stage === 'setup' && session.battle) return Promise.resolve(reject(commandId, 'stage', 'a battle is already under way'));
    if (stage === 'battle' && !session.battle) return Promise.resolve(reject(commandId, 'stage', 'no battle is under way'));
    // A finalized battle has been reported to the campaign. Only leaving it, or replacing it
    // outright with a loaded save, reopens the record.
    if (session.stage === 'finalized' && !AFTER_FINAL.includes(command.type)) {
      return Promise.resolve(reject(commandId, 'stage', 'this battle is finalized'));
    }
    // proto: the wording is reserved for review with the rest of the player-facing text.
    if (writebackRunning(session) && !DURING_WRITEBACK.includes(command.type)) {
      return Promise.resolve(reject(commandId, 'stage', 'the campaign outcome is being applied'));
    }
    const refusal = refuseCommand(session, command, userId, presence);
    if (refusal) return Promise.resolve(reject(commandId, 'permission', refusal));
    if (command.type === 'session.undo') return rewind(commandId, userId);
    if (command.type === 'session.load') return loadSession(commandId, command.slot, userId);
    if (command.type === 'session.install') return install(commandId, command.battleId, command.request, userId);
    if (command.type === 'session.moveTo') return moveTo(commandId, command, userId);

    return persist(commandId, userId, {
      edit: (current) => {
        const next = applyCommand(current, command, services, presence, userId);
        // A board or a force that changed after an army called itself ready needs that word
        // again: the other army agreed to fight what was on the table a moment ago.
        return COMMAND_STAGE[command.type] === 'setup' && command.type !== 'army.declareReady'
          ? dropInteraction(next, 'army.readiness') : next;
      },
      record: (previous) => {
        const effect = HISTORY[command.type];
        if (effect === 'clear') history = [];
        if (effect !== 'push') return;
        const turn = previous.turn;
        const next = previous.control.next;
        history = [...history.slice(1 - HISTORY_LIMIT), previous.battle
          ? { kind: 'battle', battle: previous.battle, turn, next }
          : { kind: 'setup', setup: previous.setup, turn, next }];
      },
      describe: (previous, next) => eventsOf(command, previous, next),
    });
  }

  function rewind(commandId: string, userId: string): Promise<CommandResult> {
    const previous = history.at(-1);
    if (!previous) return Promise.resolve(reject(commandId, 'stage', 'nothing to undo'));
    return persist(commandId, userId, {
      edit: (current) => ({
        ...current,
        ...(previous.kind === 'battle' ? { battle: previous.battle } : { setup: previous.setup }),
        turn: previous.turn,
        control: { ...current.control, next: previous.next },
      }),
      record: () => { history = history.slice(0, -1); },
      seat: false,
    });
  }

  /** Replace the record with a saved one. `migrateSession` runs inside the edit so a foreign
   * or corrupt slot rejects as an ordinary `engine` failure, through the same commit path
   * every other command takes — the authority still persists before it acknowledges. */
  async function loadSession(commandId: string, slot: string, userId: string): Promise<CommandResult> {
    let raw: unknown;
    try {
      raw = await archive.load(slot);
    } catch (error) {
      return reject(commandId, 'storage', failure(error));
    }
    return persist(commandId, userId, {
      edit: (current) => {
        const migrated = migrateSession(raw);
        if (!migrated) throw new Error(`${slot} is not a battlefield save`);
        return {
          ...migrated, revision: current.revision, interactions: [], recentCommandIds: [],
          // A save carried from another table names users this one may not have; the seating
          // is refitted here and the turn opens again under it.
          control: seatUsers(migrated.control, presence), turn: null,
        };
      },
      record: () => { history = []; },
    });
  }

  /** Install a battle a campaign asked for. The request is read inside the edit, so a
   * malformed one rejects like any other refused command. */
  // proto: a battle under way is never overwritten — one battle at a time, and the GM leaves
  // this one before the next import lands. Reserved with the rest of the import defaults.
  function install(
    commandId: string, battleId: string, request: BattleRequest, userId: string,
  ): Promise<CommandResult> {
    if (session.battle && session.stage !== 'finalized') {
      return Promise.resolve(reject(commandId, 'stage', 'a battle is already under way'));
    }
    return persist(commandId, userId, {
      edit: (current) => {
        const built = sessionFromRequest(request, battleId);
        // The imported seating knows no users; the table's own seats it, as a load does.
        return { ...built, revision: current.revision, control: seatUsers(built.control, presence) };
      },
      record: () => { history = []; },
    });
  }

  /** Park the battle the table holds and open the one at `site`. The park lands before the
   * session write, so a failure between the two leaves a spare copy and loses nothing. */
  async function moveTo(
    commandId: string, { site, battleId, opening }: Extract<BattleCommand, { type: 'session.moveTo' }>, userId: string,
  ): Promise<CommandResult> {
    if (session.site === site) return reject(commandId, 'stage', 'that battle is already open');
    const resolved = session.stage === 'finalized';
    if (session.site === null && session.battle && !resolved) {
      return reject(commandId, 'stage', 'a battle on no site is under way; save or end it first');
    }
    let raw: unknown;
    try {
      // A resolved battle leaves the map; any other is kept for the GM to come back to.
      if (session.site !== null) await (resolved ? sites.remove(session.site) : sites.park(session));
      raw = await sites.load(site);
    } catch (error) {
      return reject(commandId, 'storage', failure(error));
    }
    return persist(commandId, userId, {
      edit: (current) => {
        const parked = raw === null ? null : migrateSession(raw);
        if (raw !== null && !parked) throw new Error(`the battle parked at ${site} cannot be read`);
        const opened = parked ?? sessionAtSite(site, opening, battleId);
        return {
          // The same table comes back to it, so the answers it was waiting on still stand.
          ...opened, site, revision: current.revision, recentCommandIds: [],
          control: seatUsers(opened.control, presence), turn: null,
        };
      },
      record: () => { history = []; },
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

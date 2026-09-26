import type { Side } from '../engine/index.js';
import type { BattleCommand, CommandStage, CommandType, PieceRef } from './commands.js';
import { assignSeats, reassignTurn } from './control.js';
import type { BattleEventBody } from './events.js';
import type { BattleArchive, BattleSites, PresencePort } from './ports.js';
import type { Services } from './servicePorts.js';
import type { BattleSession } from './session.js';

export type CommandOf<T extends CommandType> = Extract<BattleCommand, { type: T }>;

export interface CommandContext {
  services: Services;
  presence: PresencePort;
  userId: string;
  archive: BattleArchive;
  sites: BattleSites;
}

/**
 * Who may issue a command. `tactical` is the open activation and belongs to the turn holder;
 * `side` is a decision one army makes, open to every user seated on it; `gm` covers the shared
 * record — the map, the lifecycle, undo, and the seating itself. A GM may issue any of them,
 * which is also how a player who drops mid-activation is played out.
 */
export type CommandScope = 'tactical' | 'side' | 'gm';

/** What a command does to the undo history. `push` records what it replaced; `clear` is a
 * boundary undo cannot cross, as the prototype's store held them; `pop` consumes the newest
 * snapshot, which only undo does. Selection is not an activation, and a generated or reworded
 * board was never undoable — only a paint stroke was. */
export type HistoryEffect = 'push' | 'keep' | 'clear' | 'pop';

type ScopeFacts<T extends CommandType> =
  | {
    scope: 'side';
    /** The army a side-scoped command speaks for, from its payload or from the piece it
     * names. `either` lets any seated user issue it: an emplacement belongs to neither army
     * until a unit stands on it, so either army's players may bring one and put it down.
     * Hauling stays with the army whose unit holds the engine. */
    side(session: BattleSession, command: CommandOf<T>): Side | 'either' | null;
  }
  | { scope: 'tactical' | 'gm'; side?: never };

export type CommandDescriptor<T extends CommandType> = {
  stage: CommandStage;
  history: HistoryEffect;
  /** A finalized record still answers leaving the battle, or replacing it outright. */
  afterFinal?: true;
  /** A record answers only these while the campaign writeback is under way. Undo and loading
   * are shut out: part of the result already sits in the campaign, and rewinding the battle
   * behind it would leave the two disagreeing. */
  duringWriteback?: true;
  /** The command creates pieces, and its reply names them. A command that replaces the whole
   * setup stays unmarked, or its reply would name every piece the setup holds. */
  adds?: true;
  /** Why the record cannot take the command as it stands. The executor answers it as a `stage`
   * refusal before any port is touched. */
  refuse?(session: BattleSession, command: CommandOf<T>, ctx: CommandContext): string | null;
  /** The port reads and writes that come ahead of the edit. A throw is a `storage` refusal and
   * commits nothing; what it resolves to reaches `run` as `prepared`. */
  prepare?(session: BattleSession, command: CommandOf<T>, ctx: CommandContext): Promise<unknown>;
  /** Absent on undo, which the executor runs itself. */
  run?(session: BattleSession, command: CommandOf<T>, ctx: CommandContext, prepared: unknown): BattleSession;
  /** Only the commands that resolve rules carry events. A setup or lifecycle command replaces
   * whole boards and forces, which a client adopts rather than plays. */
  events?(previous: BattleSession, next: BattleSession, command: CommandOf<T>, ctx: CommandContext): BattleEventBody[];
} & ScopeFacts<T>;

const pieceSide = (session: BattleSession, piece: PieceRef): Side | null => (piece.kind === 'unit'
  ? session.setup.units.find((u) => u.id === piece.id)?.side
  : session.setup.emplacements.find((e) => e.id === piece.id)?.side) ?? null;

const pieceOrEngineSide = (session: BattleSession, piece: PieceRef): Side | 'either' | null =>
  (piece.kind === 'engine' ? 'either' : pieceSide(session, piece));

export const COMMANDS: { readonly [T in CommandType]: CommandDescriptor<T> } = {
  'activation.select': {
    stage: 'battle', scope: 'tactical', history: 'keep',
    run: (s, c, { services }) => services.actions.select(s, c.unitId),
  },
  'activation.deselect': {
    stage: 'battle', scope: 'tactical', history: 'keep',
    run: (s, _c, { services }) => services.actions.deselect(s),
  },
  'action.resolve': {
    stage: 'battle', scope: 'tactical', history: 'push',
    run: (s, c, { services }) => services.actions.act(s, c.action),
    events: (previous, next, c, { services }) => services.actions.events(previous, next, c.action),
  },
  'activation.end': {
    stage: 'battle', scope: 'tactical', history: 'push',
    run: (s, c, { services }) => services.actions.endActivation(s, c.unitId),
    events: (previous, next, _c, { services }) => services.actions.events(previous, next),
  },
  'setup.generate': {
    stage: 'setup', scope: 'gm', history: 'keep',
    run: (s, _c, { services }) => services.map.generate(s),
  },
  'setup.rerollSeed': {
    stage: 'setup', scope: 'gm', history: 'keep',
    run: (s, _c, { services }) => services.map.rerollSeed(s),
  },
  'setup.editSpec': {
    stage: 'setup', scope: 'gm', history: 'keep',
    run: (s, c, { services }) => services.map.editSpec(s, c.spec),
  },
  'setup.setRoundsPerDay': {
    stage: 'setup', scope: 'gm', history: 'keep',
    run: (s, c, { services }) => services.map.setRoundsPerDay(s, c.roundsPerDay),
  },
  'setup.paint': {
    stage: 'setup', scope: 'gm', history: 'push',
    run: (s, c, { services }) => services.manager.paint(s, c.stroke),
  },
  'army.addUnit': {
    stage: 'setup', scope: 'side', history: 'keep', adds: true,
    side: (_s, c) => c.side,
    run: (s, c, { services }) => services.army.addUnit(s, c.side, c.card),
  },
  'army.removeUnit': {
    stage: 'setup', scope: 'side', history: 'keep',
    side: (s, c) => pieceSide(s, { kind: 'unit', id: c.unitId }),
    run: (s, c, { services }) => services.army.removeUnit(s, c.unitId),
  },
  'army.setSide': {
    stage: 'setup', scope: 'gm', history: 'keep',
    run: (s, c, { services }) => services.army.setSide(s, c.unitId, c.side),
  },
  'army.swapSides': {
    stage: 'setup', scope: 'gm', history: 'keep',
    run: (s, _c, { services }) => services.army.swapSides(s),
  },
  'army.addEmplacement': {
    stage: 'setup', scope: 'side', history: 'keep', adds: true,
    side: () => 'either',
    run: (s, c, { services }) => services.army.addEmplacement(s, c.side, c.engine),
  },
  'army.removeEmplacement': {
    stage: 'setup', scope: 'side', history: 'keep',
    side: () => 'either',
    run: (s, c, { services }) => services.army.removeEmplacement(s, c.emplacementId),
  },
  'army.setHauling': {
    stage: 'setup', scope: 'side', history: 'keep',
    side: (s, c) => pieceSide(s, { kind: 'engine', id: c.emplacementId }),
    run: (s, c, { services }) => services.army.setHauling(s, c.emplacementId, c.hauling),
  },
  'army.setEngineLoaded': {
    stage: 'setup', scope: 'side', history: 'keep',
    side: () => 'either',
    run: (s, c, { services }) => services.army.setEngineLoaded(s, c.emplacementId, c.loaded),
  },
  'army.place': {
    stage: 'setup', scope: 'side', history: 'keep',
    side: (s, c) => pieceOrEngineSide(s, c.piece),
    run: (s, c, { services }) => services.army.place(s, c.piece, c.square),
  },
  'army.unplace': {
    stage: 'setup', scope: 'side', history: 'keep',
    side: (s, c) => pieceOrEngineSide(s, c.piece),
    run: (s, c, { services }) => services.army.unplace(s, c.piece),
  },
  'army.autoPlace': {
    stage: 'setup', scope: 'side', history: 'keep',
    side: (s, c) => pieceOrEngineSide(s, c.piece),
    run: (s, c, { services }) => services.army.autoPlace(s, c.piece),
  },
  'army.generateForce': {
    stage: 'setup', scope: 'side', history: 'keep', adds: true,
    side: (_s, c) => c.side,
    run: (s, c, { services }) => services.army.generateForce(s, c.side, c.seed),
  },
  'army.declareReady': {
    stage: 'setup', scope: 'side', history: 'keep',
    side: (_s, c) => c.side,
    run: (s, c, { services, userId }) => services.army.declareReady(s, c.side, c.ready, userId),
  },
  'continuation.declareRecovery': {
    stage: 'battle', scope: 'side', history: 'clear',
    side: (_s, c) => c.side,
    run: (s, c, { services, userId }) => services.continuation.declareRecovery(s, c.side, c.choices, userId),
  },
  'continuation.declareDayOrder': {
    stage: 'battle', scope: 'side', history: 'keep',
    side: (_s, c) => c.side,
    run: (s, c, { services }) => services.continuation.declareDayOrder(s, c.side, c.order),
  },
  'continuation.confirmDayOrders': {
    stage: 'battle', scope: 'gm', history: 'clear',
    run: (s, _c, { services }) => services.continuation.confirmDayOrders(s),
  },
  'continuation.answerSurrender': {
    stage: 'battle', scope: 'side', history: 'clear',
    side: (_s, c) => c.side,
    run: (s, c, { services, userId }) => services.continuation.answerSurrender(s, c.side, c.accept, userId),
  },
  'continuation.chooseBattlefield': {
    stage: 'battle', scope: 'gm', history: 'keep',
    run: (s, c, { services }) => services.continuation.chooseBattlefield(s, c.spec),
  },
  'continuation.declareDeployment': {
    stage: 'battle', scope: 'side', history: 'keep',
    side: (_s, c) => c.side,
    run: (s, c, { services, userId }) => services.continuation.declareDeployment(s, c.side, c.positions, userId),
  },
  'continuation.startNextDay': {
    stage: 'battle', scope: 'gm', history: 'clear',
    run: (s, _c, { services }) => services.manager.startNextDay(s),
  },
  'battle.start': {
    stage: 'setup', scope: 'gm', history: 'clear',
    run: (s, _c, { services }) => services.manager.start(s),
  },
  'battle.returnToSetup': {
    stage: 'battle', scope: 'gm', history: 'clear', afterFinal: true,
    run: (s, _c, { services }) => services.manager.returnToSetup(s),
  },
  'battle.reset': {
    stage: 'setup', scope: 'gm', history: 'clear',
    run: (s, _c, { services }) => services.manager.reset(s),
  },
  'battle.finalize': {
    stage: 'battle', scope: 'gm', history: 'clear',
    run: (s, _c, { services }) => services.manager.finalize(s),
  },
  // The campaign holds part of this result the moment the first target lands, so undo closes
  // at the start of the writeback rather than at its end.
  'outcome.begin': {
    stage: 'battle', scope: 'gm', history: 'clear',
    run: (s, c, { services }) => services.outcome.begin(s, c.operationId, c.via),
  },
  'outcome.markTarget': {
    stage: 'battle', scope: 'gm', history: 'keep', duringWriteback: true,
    run: (s, c, { services }) => services.outcome.markTarget(s, c.unitId, c.status, c.problem),
  },
  'outcome.abandon': {
    stage: 'battle', scope: 'gm', history: 'keep', duringWriteback: true,
    run: (s, _c, { services }) => services.outcome.abandon(s),
  },
  'control.assign': {
    stage: 'any', scope: 'gm', history: 'keep',
    run: (s, c, { presence }) => assignSeats(s, c.control, presence),
  },
  'turn.reassign': {
    stage: 'battle', scope: 'gm', history: 'keep',
    run: (s, c, { presence }) => reassignTurn(s, c.userId, presence),
  },
  'session.undo': { stage: 'any', scope: 'gm', history: 'pop' },
  'session.load': {
    stage: 'any', scope: 'gm', history: 'clear', afterFinal: true,
    prepare: (_s, c, { archive }) => archive.load(c.slot),
    run: (s, c, { services, presence }, raw) => services.manager.load(s, raw, c.slot, presence),
  },
  'session.install': {
    stage: 'any', scope: 'gm', history: 'clear', afterFinal: true,
    refuse: (s, _c, { services }) => services.manager.installRefusal(s),
    run: (s, c, { services, presence }) => services.manager.install(s, c.battleId, c.request, presence),
  },
  // The record the table leaves is parked before the session write, so a failure between the
  // two leaves a spare copy and loses nothing.
  'session.moveTo': {
    stage: 'any', scope: 'gm', history: 'clear', afterFinal: true,
    refuse: (s, c, { services }) => services.manager.moveToRefusal(s, c.site),
    prepare: async (s, c, { services, sites }) => {
      const departure = services.manager.departure(s);
      if (departure === 'park') await sites.park(s);
      if (departure === 'remove') await sites.remove(s.site!);
      return sites.load(c.site);
    },
    run: (s, c, { services, presence }, parked) => services.manager.moveTo(s, parked, c, presence),
  },
};

/** One command's descriptor, widened so a caller holding the whole union can call it. */
export const descriptorOf = (command: BattleCommand): CommandDescriptor<CommandType> => COMMANDS[command.type];

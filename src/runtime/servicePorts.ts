import type { BoardSpec, DayOrder, RecoveryChoice, Side, UnitCard } from '../engine/index.js';
import type { BattleRequest } from './campaign.js';
import type { BattleCommand, PaintStroke, PieceRef, TacticalAction } from './commands.js';
import type { BattleEventBody } from './events.js';
import type { PresencePort } from './ports.js';
import type { BattleSession, WritebackStatus, WritebackVia } from './session.js';

/**
 * Selection, resolution, and the explicit end of an activation. One module sees the whole
 * transition, so nothing advances an activation twice. It holds no battle of its own: every
 * call reads the executor's working session and returns the next one.
 */
export interface ActionResolutionService {
  select(session: BattleSession, unitId: string): BattleSession;
  deselect(session: BattleSession): BattleSession;
  act(session: BattleSession, action: TacticalAction): BattleSession;
  endActivation(session: BattleSession, unitId: string): BattleSession;
  /** What the transition did, in the order it happened, for the commit to carry. */
  events(previous: BattleSession, next: BattleSession, action?: TacticalAction): BattleEventBody[];
}

export interface MapPreparationService {
  generate(session: BattleSession): BattleSession;
  rerollSeed(session: BattleSession): BattleSession;
  editSpec(session: BattleSession, spec: Partial<BoardSpec>): BattleSession;
  setRoundsPerDay(session: BattleSession, roundsPerDay: number): BattleSession;
}

/**
 * The force a side brings and where it stands. Every call reads the executor's working
 * session and returns the next one; the queries beside them answer a view's legality
 * question from a setup draft alone.
 */
export interface ArmyPreparationService {
  addUnit(session: BattleSession, side: Side, card: UnitCard): BattleSession;
  removeUnit(session: BattleSession, unitId: string): BattleSession;
  /** Both keep every piece's identity and lift it off the board: a deployment zone belongs to
   * a side. */
  setSide(session: BattleSession, unitId: string, side: Side): BattleSession;
  swapSides(session: BattleSession): BattleSession;
  addEmplacement(session: BattleSession, side: Side, engine: string): BattleSession;
  removeEmplacement(session: BattleSession, emplacementId: string): BattleSession;
  setHauling(session: BattleSession, emplacementId: string, hauling: boolean): BattleSession;
  setEngineLoaded(session: BattleSession, emplacementId: string, loaded: boolean): BattleSession;
  place(session: BattleSession, piece: PieceRef, square: string): BattleSession;
  unplace(session: BattleSession, piece: PieceRef): BattleSession;
  autoPlace(session: BattleSession, piece: PieceRef): BattleSession;
  generateForce(session: BattleSession, side: Side, seed?: number): BattleSession;
  /** One army's word that it has finished deploying, which `battle.start` waits for. */
  declareReady(session: BattleSession, side: Side, ready: boolean, userId: string): BattleSession;
}

/**
 * The night between two days and the ground the next one is fought on. Each army declares and
 * rolls its own recovery; deployments arrive one side at a time and wait in the record, and
 * `BattleManager` starts the day once both are legal.
 */
export interface BattleContinuationService {
  declareRecovery(session: BattleSession, side: Side, choices: RecoveryChoice[], userId: string): BattleSession;
  declareDayOrder(session: BattleSession, side: Side, order: DayOrder): BattleSession;
  confirmDayOrders(session: BattleSession): BattleSession;
  answerSurrender(session: BattleSession, side: Side, accept: boolean, userId: string): BattleSession;
  /** A partial spec generates tomorrow's field over today's; null keeps the ground as it is. */
  chooseBattlefield(session: BattleSession, spec: Partial<BoardSpec> | null): BattleSession;
  declareDeployment(session: BattleSession, side: Side, positions: Record<string, string>, userId: string): BattleSession;
}

type MoveTo = Extract<BattleCommand, { type: 'session.moveTo' }>;

/**
 * The lifecycle transitions. Each one either moves the session from one stage to the next or
 * draws on more than one service, and each commits once, so undo restores all of its parts
 * together.
 */
export interface BattleManager {
  /** Deploy the prepared setup and open the first day. */
  start(session: BattleSession): BattleSession;
  /** Drop the battle under way and reopen the setup draft that made it. */
  returnToSetup(session: BattleSession): BattleSession;
  /** Throw the draft away and start from the example force. */
  reset(session: BattleSession): BattleSession;
  /** Both sides' collected placements, validated against the coming field, then the engine's
   * next-day transition. */
  startNextDay(session: BattleSession): BattleSession;
  /** Close a battle that has ended for good. The campaign outcome is prepared from here. */
  finalize(session: BattleSession): BattleSession;
  /** A terrain edit and the placements it invalidates, as one change. */
  paint(session: BattleSession, stroke: PaintStroke): BattleSession;
  /** The saved record `raw` in place of this one. A foreign or corrupt slot throws, so it
   * rejects through the same commit path as any refused command. */
  load(session: BattleSession, raw: unknown, slot: string, presence: PresencePort): BattleSession;
  installRefusal(session: BattleSession): string | null;
  /** The battle a campaign asked for. A malformed request throws. */
  install(session: BattleSession, battleId: string, request: BattleRequest, presence: PresencePort): BattleSession;
  moveToRefusal(session: BattleSession, site: string): string | null;
  /** What becomes of the record the table leaves for another site. A resolved battle leaves the
   * map, and any other is kept for the GM to come back to. */
  departure(session: BattleSession): 'park' | 'remove' | null;
  /** Open the battle parked at the command's site, or a new one there when `parked` is null. */
  moveTo(session: BattleSession, parked: unknown | null, command: MoveTo, presence: PresencePort): BattleSession;
}

/** The record's side of the campaign writeback. The run that drives it stays in
 * `OutcomeApplicationService`, outside the executor. */
export interface OutcomeTransitions {
  begin(session: BattleSession, operationId: string, via: WritebackVia): BattleSession;
  markTarget(
    session: BattleSession, unitId: string, status: Exclude<WritebackStatus, 'pending'>, problem?: string,
  ): BattleSession;
  abandon(session: BattleSession): BattleSession;
}

/** What the executor calls to resolve a command. Runtime declares it and the services implement
 * it, so `createRuntime` is the one runtime module that imports a service. */
export interface Services {
  actions: ActionResolutionService;
  map: MapPreparationService;
  army: ArmyPreparationService;
  continuation: BattleContinuationService;
  manager: BattleManager;
  outcome: OutcomeTransitions;
}

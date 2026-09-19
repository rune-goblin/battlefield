import type { Side } from '../engine/index.js';
import type { BattleCommand, CommandType, PieceRef } from './commands.js';
import { assignControl, seatedOn, HOT_SEAT_USER, type ControlAssignment } from './control.js';
import type { PresencePort } from './ports.js';
import type { BattleSession } from './session.js';

/**
 * Who may issue a command. `tactical` is the open activation and belongs to the turn holder;
 * `side` is a decision one army makes, open to every user seated on it; `gm` covers the shared
 * record — the map, the lifecycle, undo, and the seating itself. A GM may issue any of them,
 * which is also how a player who drops mid-activation is played out.
 */
export type CommandScope = 'tactical' | 'side' | 'gm';

export const COMMAND_SCOPE: Record<CommandType, CommandScope> = {
  'activation.select': 'tactical',
  'activation.deselect': 'tactical',
  'action.resolve': 'tactical',
  'activation.end': 'tactical',
  'setup.generate': 'gm',
  'setup.rerollSeed': 'gm',
  'setup.editSpec': 'gm',
  'setup.setRoundsPerDay': 'gm',
  'setup.paint': 'gm',
  'army.addUnit': 'side',
  'army.removeUnit': 'side',
  'army.setSide': 'gm',
  'army.swapSides': 'gm',
  'army.addEmplacement': 'side',
  'army.removeEmplacement': 'side',
  'army.setHauling': 'side',
  'army.place': 'side',
  'army.unplace': 'side',
  'army.autoPlace': 'side',
  'army.generateForce': 'side',
  'army.declareReady': 'side',
  'continuation.declareRecovery': 'side',
  'continuation.declareDayOrder': 'side',
  'continuation.confirmDayOrders': 'gm',
  'continuation.answerSurrender': 'side',
  'continuation.chooseBattlefield': 'gm',
  'continuation.declareDeployment': 'side',
  'continuation.startNextDay': 'gm',
  'battle.start': 'gm',
  'battle.returnToSetup': 'gm',
  'battle.reset': 'gm',
  'battle.finalize': 'gm',
  'outcome.begin': 'gm',
  'outcome.markTarget': 'gm',
  'outcome.abandon': 'gm',
  'control.assign': 'gm',
  'turn.reassign': 'gm',
  'session.undo': 'gm',
  'session.load': 'gm',
  'session.install': 'gm',
};

const pieceSide = (session: BattleSession, piece: PieceRef): Side | null => (piece.kind === 'unit'
  ? session.setup.units.find((u) => u.id === piece.id)?.side
  : session.setup.emplacements.find((e) => e.id === piece.id)?.side) ?? null;

const SIDES: Side[] = ['attacker', 'defender'];

/** An emplacement belongs to neither army until a unit stands on it, so either army's players
 * may bring one and put it down. Hauling stays with the army whose unit holds the engine. */
const placesEngine = (command: BattleCommand): boolean => {
  switch (command.type) {
    case 'army.addEmplacement':
    case 'army.removeEmplacement':
      return true;
    case 'army.place':
    case 'army.unplace':
    case 'army.autoPlace':
      return command.piece.kind === 'engine';
    default:
      return false;
  }
};

/** The army a side-scoped command speaks for, from its payload or from the piece it names. */
export function commandSide(session: BattleSession, command: BattleCommand): Side | null {
  switch (command.type) {
    case 'army.addUnit':
    case 'army.addEmplacement':
    case 'army.generateForce':
    case 'army.declareReady':
    case 'continuation.declareRecovery':
    case 'continuation.declareDayOrder':
    case 'continuation.answerSurrender':
    case 'continuation.declareDeployment':
      return command.side;
    case 'army.place':
    case 'army.unplace':
    case 'army.autoPlace':
      return pieceSide(session, command.piece);
    case 'army.removeUnit':
      return pieceSide(session, { kind: 'unit', id: command.unitId });
    case 'army.removeEmplacement':
    case 'army.setHauling':
      return pieceSide(session, { kind: 'engine', id: command.emplacementId });
    default:
      return null;
  }
}

// proto: the wording a player reads when a seat or a turn refuses them is reserved for review.
/** Why this user may not issue this command, or null when they may. */
export function refuseCommand(
  session: BattleSession, command: BattleCommand, userId: string, presence: PresencePort,
): string | null {
  if (userId === presence.gmUserId()) return null;
  const scope = COMMAND_SCOPE[command.type];
  if (scope === 'gm') return 'only the GM can do that';
  if (scope === 'tactical') return session.turn === userId ? null : 'it is not your turn';
  if (placesEngine(command)) {
    return SIDES.some((side) => seatedOn(session.control, side, userId)) ? null : 'you hold no seat in this battle';
  }
  const side = commandSide(session, command);
  if (!side) return 'that piece belongs to no side';
  return seatedOn(session.control, side, userId) ? null : `you hold no seat on the ${side} side`;
}

export const assignSeats = (
  session: BattleSession, assignment: ControlAssignment, presence: PresencePort,
): BattleSession => ({ ...session, control: assignControl(session.control, assignment, presence) });

/** Hand the open turn to another seat on the side that is pending. */
export function reassignTurn(session: BattleSession, userId: string, presence: PresencePort): BattleSession {
  const battle = session.battle;
  if (!battle || battle.phase !== 'battle') throw new Error('no turn is open');
  if (userId !== presence.gmUserId() && !seatedOn(session.control, battle.pending, userId)) {
    throw new Error(`${userId} holds no seat on the ${battle.pending} side`);
  }
  return { ...session, turn: userId };
}

/** Which user a client acts as, and the table it acts at. */
export interface SeatPolicy {
  userId: string;
  presence: PresencePort;
}

/** One local user, seated on both sides and GM of the table. The browser plays this way; a
 * hosted table reads its own users instead. */
export const hotSeatPolicy = (userId = HOT_SEAT_USER): SeatPolicy => ({
  userId,
  presence: {
    online: () => true,
    gmUserId: () => userId,
    users: () => [userId],
    // proto: the hot seat's own label, reserved for review with the rest of the seat wording.
    displayName: () => 'This browser',
  },
});

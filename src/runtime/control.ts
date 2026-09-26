import { opponent, type Side } from '../engine/index.js';
import type { PresencePort } from './ports.js';
import type { BattleSession } from './session.js';

/**
 * Who plays each side. `auto`, the default, gives the GM one side and every other user at the
 * table the other, or gives the GM both and seats nobody else, which is how a GM plays a battle
 * through alone. `manual` is the GM's hand-built seating and shares every other rule. The
 * engine knows sides and units alone, so seats and turns live here and in the session record.
 */
export type GmSide = Side | 'both';

export const isGmSide = (value: unknown): value is GmSide =>
  value === 'attacker' || value === 'defender' || value === 'both';

export interface SideControl {
  mode: 'auto' | 'manual';
  /** What the GM plays in `auto` mode. */
  gmSide: GmSide;
  /** User IDs in turn order. */
  seats: Record<Side, string[]>;
  /** Where each side's rotation stands. It runs on across rounds and days, so players sharing
   * fewer armies still act equally often. */
  next: Record<Side, number>;
}

export type ControlAssignment = Pick<SideControl, 'mode' | 'gmSide' | 'seats'>;

// proto: one browser user plays both sides and is the GM. Wave 4.4 reads the world's users.
export const HOT_SEAT_USER = 'local';

export const freshControl = (gmSide: GmSide = 'attacker'): SideControl =>
  ({ mode: 'auto', gmSide, seats: { attacker: [], defender: [] }, next: { attacker: 0, defender: 0 } });

/** One user at both seats, and that user is the GM. */
export const hotSeatControl = (userId = HOT_SEAT_USER): SideControl =>
  ({ ...freshControl('both'), seats: { attacker: [userId], defender: [userId] } });

export const seatedOn = (control: SideControl, side: Side, userId: string): boolean =>
  control.seats[side].includes(userId);

export function isSideControl(value: unknown): value is SideControl {
  const c = value as SideControl | null;
  return !!c && typeof c === 'object'
    && (c.mode === 'auto' || c.mode === 'manual')
    && isGmSide(c.gmSide)
    && !!c.seats && Array.isArray(c.seats.attacker) && Array.isArray(c.seats.defender)
    && !!c.next && Number.isInteger(c.next.attacker) && Number.isInteger(c.next.defender);
}

export interface TurnOpening { holder: string; control: SideControl }

/**
 * Name the user whose activation this is and move that side's pointer past them. An offline
 * seat is passed over and keeps its place for the next cycle, so a player who comes back acts
 * again. A side with nobody online falls to the GM, which covers an empty seating too.
 */
export function openTurn(control: SideControl, side: Side, presence: PresencePort): TurnOpening {
  const seats = control.seats[side];
  const start = seats.length ? ((control.next[side] % seats.length) + seats.length) % seats.length : 0;
  for (let step = 0; step < seats.length; step += 1) {
    const index = (start + step) % seats.length;
    if (!presence.online(seats[index])) continue;
    return { holder: seats[index], control: { ...control, next: { ...control.next, [side]: index + 1 } } };
  }
  return { holder: presence.gmUserId(), control };
}

/**
 * Fit the seating to the users the host reports. `auto` rebuilds it: the GM holds `gmSide` and
 * every other user takes the other side, or watches when the GM holds both. `manual` keeps its order and drops users the host no
 * longer has, which is what a save carried from another table needs.
 */
export function seatUsers(control: SideControl, presence: PresencePort): SideControl {
  if (control.mode === 'manual') {
    const known = new Set(presence.users());
    return {
      ...control,
      seats: {
        attacker: control.seats.attacker.filter((u) => known.has(u)),
        defender: control.seats.defender.filter((u) => known.has(u)),
      },
    };
  }
  const gm = presence.gmUserId();
  if (control.gmSide === 'both') return { ...control, seats: { attacker: [gm], defender: [gm] } };
  const seats: Record<Side, string[]> = { attacker: [], defender: [] };
  seats[control.gmSide] = [gm];
  seats[opponent(control.gmSide)] = presence.users().filter((u) => u !== gm);
  return { ...control, seats };
}

/** The GM's hand-built seating. The pointers stand where they were, so a side that gains or
 * loses a seat carries on from the same place in its rotation. */
export const assignControl = (
  control: SideControl, assignment: ControlAssignment, presence: PresencePort,
): SideControl => seatUsers({ ...assignment, next: control.next }, presence);

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

const sameOrder = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((user, index) => user === b[index]);

/**
 * The seating the table's users now call for, or null when the record already holds it. The
 * authority runs this when the host's roster changes: `auto` rebuilds the player side from it,
 * and a manual seating loses the users the host no longer has. The null answer is what keeps a
 * roster event that changes nothing from costing a commit.
 */
export function reseatAssignment(control: SideControl, presence: PresencePort): ControlAssignment | null {
  const next = seatUsers(control, presence);
  if (sameOrder(next.seats.attacker, control.seats.attacker)
    && sameOrder(next.seats.defender, control.seats.defender)) return null;
  return { mode: next.mode, gmSide: next.gmSide, seats: next.seats };
}

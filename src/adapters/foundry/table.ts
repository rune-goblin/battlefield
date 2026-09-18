import type { PresencePort, SessionRepository } from '../../runtime/ports.js';

/**
 * The table, as this adapter reads it from `game.users`. Named as a port so the transport, the
 * host, and the pre-save guard test against a fake rather than a Foundry global.
 */
export interface TableUsers {
  currentUserId(): string;
  /** `game.users.activeGM`: the first active GM by ID, and therefore the same answer on every
   * client. Null while no GM is connected. */
  primaryGmId(): string | null;
  isActive(userId: string): boolean;
  activeUserIds(): string[];
}

export function foundryTableUsers(): TableUsers {
  return {
    currentUserId: () => game.user?.id ?? '',
    primaryGmId: () => game.users.activeGM?.id ?? null,
    isActive: (userId) => game.users.get(userId)?.active === true,
    activeUserIds: () => game.users.filter((user) => user.active).map((user) => user.id),
  };
}

/** Whether this client is the one that executes. `user.isGM` is true for an assistant GM too
 * and would run a request twice; `activeGM` names one client for the whole table. */
export const holdsAuthority = (users: TableUsers): boolean => {
  const primary = users.primaryGmId();
  return primary !== null && primary === users.currentUserId();
};

/** Who is at the table, for the executor's turn rotation and its permission checks. A side
 * with nobody online falls to the primary GM; Wave 4.4 builds the seating over the same port. */
export const foundryPresence = (users: TableUsers): PresencePort => ({
  online: (userId) => users.isActive(userId),
  gmUserId: () => users.primaryGmId() ?? users.currentUserId(),
  users: () => users.activeUserIds(),
});

/**
 * A save that runs only while this client still holds the authority. The check sits here
 * rather than at the command's arrival because `activeGM` can move in between: the executor
 * calls `save` inside its queue, immediately before the record becomes durable, and a refusal
 * there leaves state and history exactly as they were. A local queue is no distributed lock,
 * so this narrows the handoff window rather than closing it.
 */
export function primaryGmRepository(inner: SessionRepository, users: TableUsers): SessionRepository {
  return {
    load: () => inner.load(),
    async save(session) {
      if (!holdsAuthority(users)) throw new Error('this client no longer runs the battle');
      await inner.save(session);
    },
  };
}

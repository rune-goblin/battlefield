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
  /** Everyone the world holds, connected or not, with the name they are known by. Seats come
   * from this roster, so a player who steps away for a round keeps their place. */
  worldUsers(): WorldUser[];
}

/** A world user, as the seating reads them. */
export interface WorldUser { id: string; name: string; character?: string | null }

export function foundryTableUsers(): TableUsers {
  return {
    currentUserId: () => game.user?.id ?? '',
    primaryGmId: () => game.users.activeGM?.id ?? null,
    isActive: (userId) => game.users.get(userId)?.active === true,
    activeUserIds: () => game.users.filter((user) => user.active).map((user) => user.id),
    worldUsers: () => game.users.contents.map((user) => ({ id: user.id, name: user.name, character: user.character?.name ?? null })),
  };
}

/** Whether this client is the one that executes. `user.isGM` is true for an assistant GM too
 * and would run a request twice; `activeGM` names one client for the whole table. */
export const holdsAuthority = (users: TableUsers): boolean => {
  const primary = users.primaryGmId();
  return primary !== null && primary === users.currentUserId();
};

/** Who is at the table, for the executor's turn rotation, its permission checks, and the GM's
 * seating controls. Seats come from the world's whole roster and `online` is what skips a seat
 * whose player is away; a side with nobody online falls to the primary GM. */
export const foundryPresence = (users: TableUsers): PresencePort => ({
  online: (userId) => users.isActive(userId),
  gmUserId: () => users.primaryGmId() ?? users.currentUserId(),
  users: () => users.worldUsers().map((user) => user.id),
  displayName: (userId) => users.worldUsers().find((user) => user.id === userId)?.name ?? userId,
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

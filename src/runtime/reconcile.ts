import { newCommandId, type BattleCommand, type CommandResult } from './commands.js';
import type { TransportPort } from './ports.js';
import type { BattleSession } from './session.js';

/**
 * The delivered record when it is newer than the one in hand, null when it is not. The revision
 * line is the whole ordering: one battle runs at a time, and a loaded save carries the count on
 * rather than restarting it, so a record that fails to advance the revision is one this client
 * has already passed. A duplicate and a record that arrives late are both that.
 */
export const reconcile = (current: BattleSession, delivered: BattleSession): BattleSession | null =>
  (delivered.revision > current.revision ? delivered : null);

export interface ClientStoreOptions {
  transport: TransportPort;
  /** Who this client submits as. */
  userId: string;
  /** The record this client starts from: the durable one it read as it joined, or a fresh
   * session when it has read none. Every delivered record outranks a session at revision 0,
   * since a record is published only after a commit. */
  session: BattleSession;
}

export interface ClientStore {
  /** The newest record this client has adopted. */
  readonly session: BattleSession;
  readonly userId: string;
  submit(command: BattleCommand): Promise<CommandResult>;
  subscribe(listener: (session: BattleSession) => void): () => void;
  /** Leave the table: the transport stops delivering here. */
  close(): void;
}

/**
 * A client's copy of the record. It holds no rules and applies no command of its own: intent
 * goes to the authority, and the answer comes back as a record on the transport. A refused
 * command therefore leaves this copy exactly where it stood.
 */
export function createClientStore({ transport, userId, session }: ClientStoreOptions): ClientStore {
  let current = session;
  const listeners = new Set<(session: BattleSession) => void>();
  const stop = transport.onRecord((delivered) => {
    const next = reconcile(current, delivered);
    if (!next) return;
    current = next;
    for (const listener of [...listeners]) listener(current);
  });

  return {
    get session() { return current; },
    userId,
    submit(command) {
      // The expected revision is this client's own, stale or not. A command built against a
      // revision the authority has passed is refused there rather than landing on whatever
      // unit or activation is open now.
      return transport.request({
        battleId: current.battleId,
        commandId: newCommandId(),
        expectedRevision: current.revision,
        userId,
        command,
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    close: stop,
  };
}

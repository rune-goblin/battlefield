import type { StoreClient, TableSummons } from '../../app/client.js';
import type { BattleArchive, PresencePort } from '../../runtime/ports.js';
import type { BattlefieldHost } from './host.js';
import type { SessionWatcher } from './sessionWatcher.js';
import type { TableUsers } from './table.js';

export interface FoundryStoreClientOptions {
  host: BattlefieldHost;
  watcher: SessionWatcher;
  users: TableUsers;
  presence: PresencePort;
  archive: BattleArchive;
  table: TableSummons;
}

/**
 * The app's store on a Foundry client. Commands go through the host, which runs them on the
 * primary GM's client and sends them from every other. Records come from the session watcher
 * on every client, the primary GM's included: the setting change is the one state channel.
 */
export function foundryStoreClient(
  { host, watcher, users, presence, archive, table }: FoundryStoreClientOptions,
): StoreClient {
  return {
    get session() { return watcher.session; },
    // Undo history lives in the executor's memory, so only the primary GM's client has any.
    get history() { return host.runtime?.history ?? []; },
    get userId() { return users.currentUserId(); },
    gmUserId: () => presence.gmUserId(),
    tableUsers: () => presence.users().map((id) => ({
      id, name: presence.displayName(id), online: presence.online(id),
      character: users.worldUsers().find((user) => user.id === id)?.character ?? null,
    })),
    submit: (command) => host.submit(command),
    subscribe: (listener) => watcher.subscribe(listener),
    archive,
    table,
  };
}

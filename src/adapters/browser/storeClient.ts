import type { StoreClient } from '../../app/client.js';
import { createRuntime } from '../../runtime/createRuntime.js';
import type { StoreRecoveryPort } from '../../runtime/ports.js';
import { createStoreRecovery } from '../store-recovery.js';
import { createLocalArchive } from './localArchive.js';
import { createLocalRepository, loadSessionSync } from './localRepository.js';

/** The store on the browser's own page: a hot-seat runtime over the session saved in
 * `localStorage`, read when this is called, and the recovery for whichever key cannot be read.
 * The one local user owns the storage, so it may repair it. */
export function browserStoreClient(): { client: StoreClient; recovery: StoreRecoveryPort } {
  const recovery = createStoreRecovery({ mayRepair: () => true });
  const archive = createLocalArchive(undefined, recovery);
  const local = createRuntime({ repository: createLocalRepository(undefined, recovery), archive, session: loadSessionSync() });
  recovery.probe();
  const client: StoreClient = {
    get session() { return local.session; },
    get history() { return local.history; },
    userId: local.userId,
    gmUserId: () => local.gmUserId(),
    tableUsers: () => local.tableUsers(),
    submit: (command) => local.submit(command),
    subscribe: (listener) => local.subscribe(listener),
    archive,
  };
  return { client, recovery };
}

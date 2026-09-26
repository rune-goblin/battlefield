import type { StoreClient } from '../../app/client.js';
import { createRuntime } from '../../runtime/createRuntime.js';
import { createLocalArchive } from './localArchive.js';
import { createLocalRepository, loadSessionSync } from './localRepository.js';

/** The store on the browser's own page: a hot-seat runtime over the session saved in
 * `localStorage`, read when this is called. */
export function browserStoreClient(): StoreClient {
  const archive = createLocalArchive();
  const local = createRuntime({ repository: createLocalRepository(), archive, session: loadSessionSync() });
  return {
    get session() { return local.session; },
    get history() { return local.history; },
    userId: local.userId,
    gmUserId: () => local.gmUserId(),
    tableUsers: () => local.tableUsers(),
    submit: (command) => local.submit(command),
    subscribe: (listener) => local.subscribe(listener),
    archive,
  };
}

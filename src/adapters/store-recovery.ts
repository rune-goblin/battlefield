import type { StoredRecord, StoreRecoveryPort } from '../runtime/ports.js';
import type { JsonStore } from './json-store.js';

export interface StoreRecovery extends StoreRecoveryPort {
  track(record: StoredRecord, store: JsonStore<unknown>): void;
  /** A store's `onUnreadable`. */
  report(record: StoredRecord): void;
  /** Reads one tracked store, or all of them, and flags each by what it finds. */
  probe(record?: StoredRecord): void;
  /** Re-reads a record only while it is flagged, so a delivered record that reads cleanly
   * costs no migration on every commit. */
  recheck(record: StoredRecord): void;
}

export interface StoreRecoveryOptions {
  mayRepair: () => boolean;
  /** Runs when a record turns unreadable, once per turn. */
  onFlag?: (record: StoredRecord) => void;
}

export function createStoreRecovery({ mayRepair, onFlag }: StoreRecoveryOptions): StoreRecovery {
  const stores = new Map<StoredRecord, JsonStore<unknown>>();
  const flagged = new Set<StoredRecord>();
  const listeners = new Set<() => void>();
  const publish = () => { for (const listener of [...listeners]) listener(); };

  const flag = (record: StoredRecord, unreadable: boolean): void => {
    if (unreadable === flagged.has(record)) return;
    if (unreadable) flagged.add(record);
    else flagged.delete(record);
    if (unreadable) onFlag?.(record);
    publish();
  };

  const tracked = (record: StoredRecord): JsonStore<unknown> => {
    const store = stores.get(record);
    if (!store) throw new Error(`no stored ${record} is tracked`);
    return store;
  };

  const probe = (record?: StoredRecord): void => {
    for (const each of record ? [record] : [...stores.keys()]) flag(each, !tracked(each).readable());
  };

  return {
    unreadable: () => [...flagged],
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    get mayRepair() { return mayRepair(); },
    raw: (record) => tracked(record).raw(),
    async clear(record) {
      await tracked(record).clear();
      flag(record, false);
    },
    track(record, store) { stores.set(record, store); },
    report: (record) => flag(record, true),
    probe,
    recheck(record) {
      if (flagged.has(record) && stores.has(record)) probe(record);
    },
  };
}

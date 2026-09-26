import type { StoredRecord, StoreRecoveryPort } from '../runtime/ports.js';
import { STORAGE_NOTICE } from './command-notices.js';
import { downloadText } from './download.js';
import type { Notification, NotificationService } from './notifications.js';

const NAMES: Record<StoredRecord, string> = { session: 'battle session', archive: 'saved battles', sites: 'battle sites' };

/** What a notice calls the record. The stores use the same names. */
export const storedName = (record: StoredRecord): string => NAMES[record];

const nothingUnreadable: StoreRecoveryPort = {
  unreadable: () => [],
  subscribe: () => () => {},
  mayRepair: false,
  raw: () => null,
  clear: async () => {},
};

let port: StoreRecoveryPort = nothingUnreadable;
export const bindRecovery = (next: StoreRecoveryPort): void => { port = next; };

export const recoveryNoticeId = (record: StoredRecord): string => `unreadable-${record}`;

/** One notice for each unreadable record, standing until it reads again. A viewer who may
 * repair it can export the stored text or clear it; anyone else learns the GM must act. */
export function connectRecovery(notifications: NotificationService): () => void {
  const shown = new Set<StoredRecord>();

  // proto: wording, a first draft.
  function unreadable(record: StoredRecord): Notification {
    const title = `The stored ${storedName(record)} cannot be read`;
    if (!port.mayRepair) {
      return {
        id: recoveryNoticeId(record), tone: 'warning', title,
        message: 'The GM must export or clear it before changes can be saved.',
      };
    }
    return {
      id: recoveryNoticeId(record), tone: 'error', dismissible: false, title,
      message: 'Nothing is saved over it. Export a copy, or start fresh to clear it.',
      actions: [
        { label: 'Export the broken save', run: () => downloadText(`battlefield-${record}-unreadable.json`, port.raw(record) ?? '') },
        { label: 'Start fresh', run: () => notifications.show(confirming(record)) },
      ],
    };
  }

  // proto: wording, a first draft.
  function confirming(record: StoredRecord): Notification {
    return {
      id: recoveryNoticeId(record), tone: 'error', dismissible: false,
      title: `Clear the stored ${storedName(record)}?`,
      message: 'The stored value is deleted. Export it first to keep a copy.',
      actions: [
        { label: 'Clear and start fresh', run: () => void clear(record) },
        { label: 'Cancel', run: () => notifications.show(unreadable(record)) },
      ],
    };
  }

  async function clear(record: StoredRecord): Promise<void> {
    const failed = `${recoveryNoticeId(record)}-failed`;
    try {
      await port.clear(record);
    } catch (error) {
      notifications.show(unreadable(record));
      notifications.show({
        id: failed, tone: 'error', title: `The stored ${storedName(record)} could not be cleared`,
        message: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    notifications.dismiss(recoveryNoticeId(record));
    notifications.dismiss(failed);
    notifications.dismiss(STORAGE_NOTICE);
  }

  // A record already on screen keeps its notice, so a change to another record leaves a
  // confirm step where it is.
  const apply = (): void => {
    const now = port.unreadable();
    for (const record of [...shown]) {
      if (now.includes(record)) continue;
      shown.delete(record);
      notifications.dismiss(recoveryNoticeId(record));
    }
    for (const record of now) {
      if (shown.has(record)) continue;
      shown.add(record);
      notifications.show(unreadable(record));
    }
  };
  const unsubscribe = port.subscribe(apply);
  apply();
  return unsubscribe;
}

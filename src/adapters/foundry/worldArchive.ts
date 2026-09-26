import type { BattleArchive } from '../../runtime/ports.js';
import { archiveStore, createJsonArchive, type StoredEntry } from '../json-store.js';
import { ARCHIVE_SETTING, gameSettingStorage, type WorldSettingStorage } from './worldSettings.js';

/** The world setting keeps at most this many slots. Beyond it, a save evicts the oldest slot
 * to a downloaded file rather than dropping it, so the cap costs no data. */
export const ARCHIVE_LIMIT = 10;

export type DownloadFile = (filename: string, data: string) => void;

const defaultDownload: DownloadFile = (filename, data) =>
  foundry.utils.saveDataToFile(data, 'application/json', filename);

const filenameFor = (entry: StoredEntry): string => `${entry.name.replace(/[^\w-]+/g, '_') || 'battle'}.battlefield.json`;

/** Makes room for one more slot, oldest first. `saveDataToFile` is the release valve the
 * review names for going past the world setting's ten: an evicted slot leaves as a file a GM
 * can `import` again later, rather than vanishing when the eleventh battle is saved. */
function withinLimit(entries: StoredEntry[], download: DownloadFile): StoredEntry[] {
  let kept = entries;
  while (kept.length >= ARCHIVE_LIMIT) {
    const [oldest, ...rest] = [...kept].sort((a, b) => a.savedAt - b.savedAt);
    download(filenameFor(oldest), JSON.stringify(oldest));
    kept = rest;
  }
  return kept;
}

/** `BattleArchive` over the archive world setting. */
export function createFoundryArchive(
  storage: WorldSettingStorage = gameSettingStorage(ARCHIVE_SETTING),
  download: DownloadFile = defaultDownload,
  onUnreadable?: (message: string) => void,
): BattleArchive {
  return createJsonArchive(archiveStore(storage, onUnreadable), { beforeInsert: (entries) => withinLimit(entries, download) });
}

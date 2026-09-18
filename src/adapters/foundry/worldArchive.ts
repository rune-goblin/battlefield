import type { ArchiveEntry, BattleArchive } from '../../runtime/ports.js';
import type { BattleSession } from '../../runtime/session.js';
import { ARCHIVE_SETTING, gameSettingStorage, type WorldSettingStorage } from './worldSettings.js';

/** The world setting keeps at most this many slots. Beyond it, a save evicts the oldest slot
 * to a downloaded file rather than dropping it, so the cap costs no data. */
export const ARCHIVE_LIMIT = 10;

interface StoredEntry extends ArchiveEntry { data: unknown }

// proto: matches the slot ID shape of src/adapters/browser/localArchive.ts — reserved for
// review with the rest of the Stable ID format item.
const newSlotId = (): string => `slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export type DownloadFile = (filename: string, data: string) => void;

const defaultDownload: DownloadFile = (filename, data) =>
  foundry.utils.saveDataToFile(data, 'application/json', filename);

function readAll(storage: WorldSettingStorage): StoredEntry[] {
  try {
    const parsed: unknown = JSON.parse(storage.get() || '[]');
    return Array.isArray(parsed) ? parsed as StoredEntry[] : [];
  } catch {
    return [];
  }
}

const writeAll = (storage: WorldSettingStorage, entries: StoredEntry[]): Promise<void> =>
  storage.set(JSON.stringify(entries));

const metaOf = ({ slot, name, savedAt, day, round }: StoredEntry): ArchiveEntry => ({ slot, name, savedAt, day, round });
const notFound = (slot: string): never => { throw new Error(`no saved battle at ${slot}`); };
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
): BattleArchive {
  return {
    async list() {
      return readAll(storage).map(metaOf).sort((a, b) => b.savedAt - a.savedAt);
    },
    async save(name, session: BattleSession) {
      const entry: StoredEntry = {
        slot: newSlotId(), name, savedAt: Date.now(),
        day: session.battle?.day ?? null, round: session.battle?.round ?? null,
        data: session,
      };
      await writeAll(storage, [...withinLimit(readAll(storage), download), entry]);
      return metaOf(entry);
    },
    async load(slot) {
      const entry = readAll(storage).find((e) => e.slot === slot);
      return entry ? entry.data : notFound(slot);
    },
    async remove(slot) {
      await writeAll(storage, readAll(storage).filter((e) => e.slot !== slot));
    },
    async export(slot) {
      const entry = readAll(storage).find((e) => e.slot === slot);
      return entry ? JSON.stringify(entry) : notFound(slot);
    },
    async import(data) {
      const parsed = JSON.parse(data) as Partial<StoredEntry> | null;
      if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) throw new Error('not a battlefield save');
      const entry: StoredEntry = {
        slot: newSlotId(), name: typeof parsed.name === 'string' ? parsed.name : 'Imported battle',
        savedAt: Date.now(), day: parsed.day ?? null, round: parsed.round ?? null, data: parsed.data,
      };
      await writeAll(storage, [...withinLimit(readAll(storage), download), entry]);
      return metaOf(entry);
    },
  };
}

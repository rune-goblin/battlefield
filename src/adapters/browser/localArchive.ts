import type { ArchiveEntry, BattleArchive } from '../../runtime/ports.js';
import type { BattleSession } from '../../runtime/session.js';
import type { WebStorage } from './localRepository.js';

export const ARCHIVE_KEY = 'battlefield.archive.v1';

interface StoredEntry extends ArchiveEntry { data: unknown }

// proto: slot IDs share the battle/unit/command ID shape, reserved for review since Wave 1.1.
const newSlotId = (): string => `slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

function readAll(storage: WebStorage): StoredEntry[] {
  try {
    const raw = storage.getItem(ARCHIVE_KEY);
    const parsed: unknown = raw === null ? [] : JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as StoredEntry[] : [];
  } catch {
    return [];
  }
}

const writeAll = (storage: WebStorage, entries: StoredEntry[]): void =>
  storage.setItem(ARCHIVE_KEY, JSON.stringify(entries));

const metaOf = ({ slot, name, savedAt, day, round }: StoredEntry): ArchiveEntry => ({ slot, name, savedAt, day, round });

const notFound = (slot: string): never => { throw new Error(`no saved battle at ${slot}`); };

export function createLocalArchive(storage: WebStorage = globalThis.localStorage): BattleArchive {
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
      writeAll(storage, [...readAll(storage), entry]);
      return metaOf(entry);
    },
    async load(slot) {
      const entry = readAll(storage).find((e) => e.slot === slot);
      return entry ? entry.data : notFound(slot);
    },
    async remove(slot) {
      writeAll(storage, readAll(storage).filter((e) => e.slot !== slot));
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
      writeAll(storage, [...readAll(storage), entry]);
      return metaOf(entry);
    },
  };
}

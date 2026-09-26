import { STORED_NAMES, type ArchiveEntry, type BattleArchive } from '../runtime/ports.js';
import type { BattleSession } from '../runtime/session.js';
import type { StoreRecovery } from './store-recovery.js';

/** One stored string: a browser storage key or a Foundry world setting. */
export interface TextCell {
  get(): string | null;
  set(value: string): void | Promise<void>;
}

/** A stored value that is present but cannot be read. The store leaves it in place and
 * refuses to write over it. */
export class UnreadableStore extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'UnreadableStore';
  }
}

export interface JsonStore<T> {
  read(): T;
  write(value: T): Promise<void>;
  raw(): string | null;
  /** False when the stored value is present and unreadable. */
  readable(): boolean;
  /** Empties the cell, which then reads as absent, and lets a later corruption report again. */
  clear(): Promise<void>;
}

export interface JsonStoreOptions<T> {
  /** What the notice calls the stored value. */
  name: string;
  /** The value an absent cell reads as. */
  empty: () => T;
  /** The value a parsed cell holds, or null when it holds something else. */
  accept: (parsed: unknown) => T | null;
  onUnreadable?: (message: string) => void;
}

/**
 * A JSON value in one cell. An absent value reads as `empty()`. An unreadable one throws
 * `UnreadableStore` on every read and every write, and the cell keeps it byte for byte: after a
 * downgrade or a corrupt write the data survives, and the GM sees a notice.
 */
export function createJsonStore<T>(
  cell: TextCell, { name, empty, accept, onUnreadable }: JsonStoreOptions<T>,
): JsonStore<T> {
  const message = `The stored ${name} could not be read. It is left as it was, and nothing is saved over it until it is repaired or cleared.`;
  // The last text this store read cleanly or wrote. A write over it skips the re-parse, which
  // for a session is a full migration on every commit.
  let known: string | null = null;
  let noticed = false;

  const refuse = (cause?: unknown): never => {
    if (!noticed) {
      noticed = true;
      onUnreadable?.(message);
    }
    throw new UnreadableStore(message, { cause });
  };

  function parse(raw: string): T {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return refuse(error);
    }
    return accept(parsed) ?? refuse();
  }

  const absent = (raw: string | null): raw is null | '' => raw === null || raw === '';

  function read(): T {
    const raw = cell.get();
    if (absent(raw)) return empty();
    const value = parse(raw);
    known = raw;
    return value;
  }

  return {
    read,
    async write(value) {
      const raw = cell.get();
      if (!absent(raw) && raw !== known) parse(raw);
      const text = JSON.stringify(value);
      await cell.set(text);
      known = text;
    },
    raw: () => cell.get(),
    readable() {
      try {
        read();
        return true;
      } catch (error) {
        if (error instanceof UnreadableStore) return false;
        throw error;
      }
    },
    async clear() {
      await cell.set('');
      known = null;
      noticed = false;
    },
  };
}

export interface StoredEntry extends ArchiveEntry { data: unknown }

const isStoredEntry = (value: unknown): boolean =>
  !!value && typeof value === 'object'
  && typeof (value as { slot?: unknown }).slot === 'string'
  && typeof (value as { name?: unknown }).name === 'string';

const acceptEntries = (parsed: unknown): StoredEntry[] | null =>
  Array.isArray(parsed) && parsed.every(isStoredEntry) ? parsed as StoredEntry[] : null;

export function archiveStore(cell: TextCell, recovery?: StoreRecovery): JsonStore<StoredEntry[]> {
  const store = createJsonStore(cell, {
    name: STORED_NAMES.archive, empty: () => [], accept: acceptEntries, onUnreadable: () => recovery?.report('archive'),
  });
  recovery?.track('archive', store);
  return store;
}

// proto: slot IDs share the battle/unit/command ID shape, reserved for review since Wave 1.1.
const newSlotId = (): string => `slot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const metaOf = ({ slot, name, savedAt, day, round }: StoredEntry): ArchiveEntry => ({ slot, name, savedAt, day, round });

const notFound = (slot: string): never => { throw new Error(`no saved battle at ${slot}`); };

export interface JsonArchiveOptions {
  /** Makes room for one more entry. Runs on every save and import, before the new entry lands. */
  beforeInsert?: (entries: StoredEntry[]) => StoredEntry[];
}

export function createJsonArchive(
  store: JsonStore<StoredEntry[]>, { beforeInsert = (entries) => entries }: JsonArchiveOptions = {},
): BattleArchive {
  const insert = (entry: StoredEntry): Promise<void> => store.write([...beforeInsert(store.read()), entry]);

  return {
    async list() {
      return store.read().map(metaOf).sort((a, b) => b.savedAt - a.savedAt);
    },
    async save(name, session: BattleSession) {
      const entry: StoredEntry = {
        slot: newSlotId(), name, savedAt: Date.now(),
        day: session.battle?.day ?? null, round: session.battle?.round ?? null,
        data: session,
      };
      await insert(entry);
      return metaOf(entry);
    },
    async load(slot) {
      const entry = store.read().find((e) => e.slot === slot);
      return entry ? entry.data : notFound(slot);
    },
    async remove(slot) {
      await store.write(store.read().filter((e) => e.slot !== slot));
    },
    async export(slot) {
      const entry = store.read().find((e) => e.slot === slot);
      return entry ? JSON.stringify(entry) : notFound(slot);
    },
    async import(data) {
      const parsed = JSON.parse(data) as Partial<StoredEntry> | null;
      if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) throw new Error('not a battlefield save');
      const entry: StoredEntry = {
        slot: newSlotId(), name: typeof parsed.name === 'string' ? parsed.name : 'Imported battle',
        savedAt: Date.now(), day: parsed.day ?? null, round: parsed.round ?? null, data: parsed.data,
      };
      await insert(entry);
      return metaOf(entry);
    },
  };
}

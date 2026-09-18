import type { BattleSession } from './session.js';

/** The one durable copy of the record. `load` always resolves: an unreadable or foreign save
 * yields a fresh session. `save` rejects when the write fails, so the executor can hold the
 * commit rather than acknowledge it. */
export interface SessionRepository {
  load(): Promise<BattleSession>;
  save(session: BattleSession): Promise<void>;
}

/** A saved battle's metadata, without the record itself. */
export interface ArchiveEntry {
  slot: string;
  name: string;
  savedAt: number;
  day: number | null;
  round: number | null;
}

/** Saved battles, addressed by slot. Saving copies the active record and changes no shared
 * state, so it needs no command; loading does, since it replaces the session every client
 * holds. `load` and `import` hand back whatever schema the slot was written in — the caller
 * migrates it, the way `SessionRepository.load` already does for `battlefield.v4`. */
export interface BattleArchive {
  list(): Promise<ArchiveEntry[]>;
  save(name: string, session: BattleSession): Promise<ArchiveEntry>;
  load(slot: string): Promise<unknown>;
  remove(slot: string): Promise<void>;
  export(slot: string): Promise<string>;
  import(data: string): Promise<ArchiveEntry>;
}

/** The authority's dice. The shape is the engine's `Rng`, so a service hands it straight to a
 * rule; Wave 3.1 wraps it to record the faces a transition drew. */
export interface DicePort {
  d20(): number;
}

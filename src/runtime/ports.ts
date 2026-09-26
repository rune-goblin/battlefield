import type { CommandEnvelope, CommandResult } from './commands.js';
import type { BattleSession, LifecycleStage } from './session.js';

/** The one durable copy of the record. `load` always resolves: an absent save yields a fresh
 * session, and so does an unreadable one, which the store leaves exactly as it found it. While
 * the stored value stays unreadable every `save` rejects, so no commit lands over it. `save`
 * also rejects when the write fails, so the executor can hold the commit rather than
 * acknowledge it. */
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

/** A battle standing on campaign ground, without the record itself. */
export interface SiteEntry {
  site: string;
  battleId: string;
  savedAt: number;
  stage: LifecycleStage;
  day: number | null;
  round: number | null;
}

/** The battles a campaign has placed and the table has left, one to a site. The active battle
 * lives in the `SessionRepository`; `session.moveTo` parks it here as it opens another, so a
 * table holds many battles and plays one. `load` hands back whatever schema the record was
 * parked in, as `BattleArchive.load` does. */
export interface BattleSites {
  list(): Promise<SiteEntry[]>;
  park(session: BattleSession): Promise<void>;
  load(site: string): Promise<unknown | null>;
  remove(site: string): Promise<void>;
}

/** A record the host keeps in one stored cell. */
export type StoredRecord = 'session' | 'archive' | 'sites';

/** The stored records this client cannot read, and the way out of each. `raw` is the stored
 * text byte for byte, for an export. `clear` empties one record so it reads as absent and
 * leaves the others as they are. Only a viewer who `mayRepair` is offered either. */
export interface StoreRecoveryPort {
  unreadable(): readonly StoredRecord[];
  subscribe(listener: () => void): () => void;
  readonly mayRepair: boolean;
  raw(record: StoredRecord): string | null;
  clear(record: StoredRecord): Promise<void>;
}

/** The authority's dice. The shape is the engine's `Rng`, so a service hands it straight to a
 * rule; Wave 3.1 wraps it to record the faces a transition drew. */
export interface DicePort {
  d20(): number;
}

/** The authority's seeds and identities. A service that seeds a field or names a new piece or
 * interaction draws from here, so a test can fix every value an edit writes. */
export interface MintPort {
  seed(): number;
  id(kind: 'battle' | 'unit' | 'eq' | 'int'): string;
}

/** A client's line to the authority. `request` carries one command and waits for the reply,
 * which names a revision and nothing more. State travels on `onRecord` alone: the authority
 * saves the record, the host delivers it, and every client adopts it. A reply lost on the way
 * back therefore costs nothing the next delivered record does not repair. */
export interface TransportPort {
  request(envelope: CommandEnvelope): Promise<CommandResult>;
  /** Returns the call that stops the deliveries. */
  onRecord(listener: (session: BattleSession) => void): () => void;
}

/** Who is at the table. The executor reads it when a turn opens — an offline seat is skipped
 * and a side with nobody online falls to the GM — and when it checks who sent a command. */
export interface PresencePort {
  online(userId: string): boolean;
  /** The GM who answers for a side nobody is holding, and who may issue any command. */
  gmUserId(): string;
  /** Every user the host would seat, connected or not. `auto` control rebuilds the player side
   * from it, and a manual seating drops the users it no longer names. */
  users(): string[];
  /** What a seat editor calls this user. The host's own name for them, never an ID. */
  displayName(userId: string): string;
}

/** One of the host's users, as the seating controls read them. */
export interface TableUser {
  id: string;
  name: string;
  online: boolean;
}

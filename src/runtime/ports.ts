import type { BattleSession } from './session.js';

/** The one durable copy of the record. `load` always resolves: an unreadable or foreign save
 * yields a fresh session. `save` rejects when the write fails, so the executor can hold the
 * commit rather than acknowledge it. */
export interface SessionRepository {
  load(): Promise<BattleSession>;
  save(session: BattleSession): Promise<void>;
}

/** The authority's dice. The shape is the engine's `Rng`, so a service hands it straight to a
 * rule; Wave 3.1 wraps it to record the faces a transition drew. */
export interface DicePort {
  d20(): number;
}

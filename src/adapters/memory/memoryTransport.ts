import type { CommandEnvelope, CommandResult } from '../../runtime/commands.js';
import type { TransportPort } from '../../runtime/ports.js';
import type { BattleSession } from '../../runtime/session.js';

/** The authority as a transport sees it: it runs an envelope and publishes the records it has
 * made durable. A `Runtime` satisfies this. */
export interface TransportAuthority {
  execute(envelope: CommandEnvelope): Promise<CommandResult>;
  subscribe(listener: (session: BattleSession) => void): () => void;
}

/**
 * What one client's line does to the records bound for it. Every fault acts on deliveries:
 * a request always reaches the authority, and a reply that never arrives is Wave 4.2's timeout
 * rather than this wave's fault. A dropped record is repaired by the next one, since each
 * delivery carries the whole record.
 */
export interface LinkFaults {
  /** Hold every record until `flush` runs. */
  delay?: boolean;
  /** Hand each released record over twice. */
  duplicate?: boolean;
  /** Release the held records newest first. */
  reorder?: boolean;
  /** Lose the record at a revision outright. */
  drop?: (revision: number) => boolean;
}

export interface MemoryLink extends TransportPort {
  /** Mutable in place: a test turns a fault on between commits. */
  readonly faults: LinkFaults;
  /** Release the records this link is holding, under its current faults. */
  flush(): void;
  /** The revisions handed to this client, in the order it saw them. */
  readonly delivered: readonly number[];
}

export interface MemoryNetwork {
  connect(faults?: LinkFaults): MemoryLink;
  /** Release every link's held records. */
  flush(): void;
  readonly links: readonly MemoryLink[];
}

interface Link extends MemoryLink {
  accept(session: BattleSession): void;
}

function createLink(authority: TransportAuthority, faults: LinkFaults): Link {
  let held: BattleSession[] = [];
  const delivered: number[] = [];
  const listeners = new Set<(session: BattleSession) => void>();

  // A record crosses a wire, so the client gets a copy of its own — a socket message and a
  // world setting both arrive as fresh data, and a client that shared the authority's objects
  // would look synchronized while proving nothing.
  const hand = (session: BattleSession): void => {
    delivered.push(session.revision);
    const copy = structuredClone(session);
    for (const listener of [...listeners]) listener(copy);
  };

  const release = (session: BattleSession): void => {
    if (faults.drop?.(session.revision)) return;
    hand(session);
    if (faults.duplicate) hand(session);
  };

  return {
    faults,
    get delivered() { return delivered; },
    accept(session) {
      if (faults.delay) held.push(session);
      else release(session);
    },
    flush() {
      const queue = faults.reorder ? [...held].reverse() : held;
      held = [];
      for (const session of queue) release(session);
    },
    request(envelope) { return authority.execute(structuredClone(envelope)); },
    onRecord(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

/**
 * Several clients and one authority in a single process, with the deliveries under a test's
 * hand. The dev page of Wave 3.7 runs on this too; Wave 4.2 puts the same port over Foundry's
 * socket and the world setting's `onChange`.
 */
export function createMemoryNetwork(authority: TransportAuthority): MemoryNetwork {
  const links: Link[] = [];
  authority.subscribe((session) => { for (const link of [...links]) link.accept(session); });

  return {
    links,
    connect(faults = {}) {
      const link = createLink(authority, faults);
      links.push(link);
      return link;
    },
    flush() { for (const link of links) link.flush(); },
  };
}

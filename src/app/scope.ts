/** One cleanup registered against a scope. `dispose` runs when the scope closes, and runs at
 * most once, so it may be written as if it were the only owner of what it releases. */
export interface ScopeCleanup {
  label: string;
  dispose(): void;
}

/**
 * A client-side lifetime: one view, or one activation inside it. Whatever a panel opens while
 * the scope is alive — a timer, an overlay, a reply it is waiting on — is registered here and
 * released together when the scope closes. Nothing shared lives in a scope; the authority
 * clears the session's own interactions in the transition commit.
 */
export interface LocalScope {
  readonly key: string;
  readonly closed: boolean;
  /** Returns the call that takes the cleanup back, for something released early. */
  register(cleanup: ScopeCleanup): () => void;
  /** Resolve `work` only while this scope is open. A reply that lands after an activation
   * closed answers null, so it writes nothing into the one that followed. */
  whileOpen<T>(work: Promise<T>): Promise<T | null>;
  close(): void;
}

export function createScope(key: string): LocalScope {
  const cleanups: (ScopeCleanup | null)[] = [];
  let closed = false;
  return {
    key,
    get closed() { return closed; },

    register(cleanup) {
      if (closed) {
        cleanup.dispose();
        return () => {};
      }
      const slot = cleanups.length;
      cleanups.push(cleanup);
      return () => { if (cleanups[slot] === cleanup) cleanups[slot] = null; };
    },

    async whileOpen(work) {
      const value = await work;
      return closed ? null : value;
    },

    close() {
      if (closed) return;
      closed = true;
      // Reverse order: a later registration may rest on an earlier one. A cleanup that throws
      // must not keep the rest from running — the scope is going either way.
      for (let i = cleanups.length - 1; i >= 0; i -= 1) {
        try {
          cleanups[i]?.dispose();
        } catch {
          cleanups[i] = null;
        }
      }
      cleanups.length = 0;
    },
  };
}

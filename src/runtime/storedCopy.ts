import type { BattleSession } from './session.js';

/** The parts of a record a Save keeps. Opening a battle reseats the table and names a new turn
 * under a new revision, so those never count as a change. */
const KEPT = ['battleId', 'site', 'stage', 'setup', 'battle', 'interactions', 'sources', 'writeback'] as const;

/** Key order differs between a record built in memory and one read back from storage. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const keptOf = (record: unknown): string => {
  const r = (record ?? {}) as Record<string, unknown>;
  return canonical(Object.fromEntries(KEPT.map((key) => [key, r[key] ?? null])));
};

/** Whether the live battle differs from the copy stored at its site. A battle on no site has
 * nowhere to save to, and a sited battle with no stored copy has never been saved. */
export function unsavedAgainst(live: BattleSession, stored: unknown | null): boolean {
  if (live.site === null) return false;
  if (stored === null) return true;
  return keptOf(live) !== keptOf(stored);
}

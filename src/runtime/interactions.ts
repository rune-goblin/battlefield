import { SIDES, type RecoveryChoice, type Side } from '../engine/index.js';
import type { MintPort } from './ports.js';
import type { BattleSession, LifecycleStage } from './session.js';

/** What one side submits to each shared decision. Ordinary targeting and hover stay local;
 * these four are the decisions a battle waits on, so they live in the record every client
 * reads. */
export interface InteractionValue {
  'army.readiness': boolean;
  'night.recovery': RecoveryChoice[];
  'day.surrender': boolean;
  'nextDay.deployment': Record<string, string>;
}

export type InteractionKind = keyof InteractionValue;

/** The lifecycle an interaction belongs to. A commit that leaves the stage or the day behind
 * makes every record scoped to it obsolete. */
export interface InteractionScope { stage: LifecycleStage; day: number | null }

export interface InteractionRecord<K extends InteractionKind = InteractionKind> {
  id: string;
  kind: K;
  /** The user whose submission opened it. */
  initiator: string;
  /** The sides whose seats may answer. */
  participants: Side[];
  scope: InteractionScope;
  /** `closed` once the workflow has consumed the submissions. They stay readable until the
   * scope ends, so a panel can show what each army declared. */
  status: 'open' | 'closed';
  submissions: Partial<Record<Side, InteractionValue[K]>>;
}

export const scopeOf = (session: BattleSession): InteractionScope =>
  ({ stage: session.stage, day: session.battle?.day ?? null });

const sameScope = (a: InteractionScope, b: InteractionScope): boolean =>
  a.stage === b.stage && a.day === b.day;

/**
 * Drop every record the commit left behind. A battle that starts, ends, or reaches its next
 * day moves the scope, and a decision scoped to where the session was is one nobody can answer
 * any more. The executor runs this on the edited record, so the clearing lands in the same
 * commit as the change that caused it.
 */
export function clearObsolete(session: BattleSession): BattleSession {
  const scope = scopeOf(session);
  const kept = session.interactions.filter((i) => sameScope(i.scope, scope));
  return kept.length === session.interactions.length ? session : { ...session, interactions: kept };
}

export function interactionOf<K extends InteractionKind>(
  records: readonly InteractionRecord[], kind: K,
): InteractionRecord<K> | null {
  return (records.find((i) => i.kind === kind) as InteractionRecord<K> | undefined) ?? null;
}

export function submissionOf<K extends InteractionKind>(
  records: readonly InteractionRecord[], kind: K, side: Side,
): InteractionValue[K] | undefined {
  return interactionOf(records, kind)?.submissions[side];
}

export const hasSubmitted = (records: readonly InteractionRecord[], kind: InteractionKind, side: Side): boolean =>
  submissionOf(records, kind, side) !== undefined;

/** Every side has answered, so the workflow can run. */
export const allSubmitted = (records: readonly InteractionRecord[], kind: InteractionKind): boolean =>
  SIDES.every((side) => hasSubmitted(records, kind, side));

/** Record one side's answer, opening the interaction if this is the first. A later submission
 * from the same side replaces the earlier one: the last word before the side confirms stands. */
export function submitTo<K extends InteractionKind>(
  session: BattleSession, kind: K, side: Side, value: InteractionValue[K], userId: string, mint: MintPort,
): BattleSession {
  const open = interactionOf(session.interactions, kind);
  const record: InteractionRecord<K> = open
    ? { ...open, submissions: { ...open.submissions, [side]: value } }
    : {
      id: mint.id('int'),
      kind,
      initiator: userId,
      participants: [...SIDES],
      scope: scopeOf(session),
      status: 'open',
      submissions: { [side]: value },
    };
  return { ...session, interactions: [...session.interactions.filter((i) => i.kind !== kind), record] };
}

/** The workflow has consumed the submissions. They stay on the record until its scope ends. */
export function closeInteraction(session: BattleSession, kind: InteractionKind): BattleSession {
  const open = interactionOf(session.interactions, kind);
  if (!open || open.status === 'closed') return session;
  return {
    ...session,
    interactions: session.interactions.map((i) => (i === open ? { ...i, status: 'closed' as const } : i)),
  };
}

/** Take the record away outright, for a decision whose grounds have changed. */
export function dropInteraction(session: BattleSession, kind: InteractionKind): BattleSession {
  const kept = session.interactions.filter((i) => i.kind !== kind);
  return kept.length === session.interactions.length ? session : { ...session, interactions: kept };
}

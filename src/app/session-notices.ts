import type { Side } from '../engine/index.js';
import { seatedOn } from '../runtime/control.js';
import type { BattleEvent } from '../runtime/events.js';
import type { InteractionKind } from '../runtime/interactions.js';
import type { BattleSession } from '../runtime/session.js';
import { unitOf } from './battle-lookup.js';
import { COMMAND_NOTICE } from './command-notices.js';
import type { Notification } from './notifications.js';

export const TURN_NOTICE = 'turn';
export const ACTIVITY_NOTICE = 'activity';
export const DECISION_NOTICE = 'decision';

/** How long an activity summary lingers before it clears itself. */
const ACTIVITY_EXPIRES_MS = 6000;

/** What `noticesFor` needs to know about the client it derives notices for. */
export interface NoticeViewer { userId: string; isGm: boolean }

export interface Notices { show: Notification[]; dismiss: string[] }

// proto: every title and message below is a first draft. Reserved for review with the rest of
// the player-facing wording for turns, seats, and notices.
const DECISION_TITLE: Record<InteractionKind, string> = {
  'army.readiness': 'Deployment',
  'night.recovery': 'Recovery',
  'day.surrender': 'Surrender',
  'nextDay.deployment': 'Next day',
};
const DECISION_MESSAGE: Record<InteractionKind, string> = {
  'army.readiness': "Your army's readiness is needed before the battle can start.",
  'night.recovery': 'Declare which of your units recover tonight.',
  'day.surrender': 'Answer the offered surrender.',
  'nextDay.deployment': "Place your side's survivors for the next battlefield.",
};

const decidesFor = (session: BattleSession, viewer: NoticeViewer, side: Side): boolean =>
  viewer.isGm || seatedOn(session.control, side, viewer.userId);

function turnNotice(next: BattleSession, viewer: NoticeViewer): Notification {
  const holder = next.turn!;
  return holder === viewer.userId
    ? { id: TURN_NOTICE, title: 'Your turn', message: 'Pick any available unit.', tone: 'info' }
    : { id: TURN_NOTICE, title: 'Turn', message: `${holder} is playing.`, tone: 'info' };
}

const actorOf = (event: BattleEvent): string | null => ('unit' in event && event.unit ? event.unit : null);

/** A one-line reading of what the commit did, for a viewer who did not send it. */
function activitySummary(session: BattleSession): string {
  const events = session.lastCommit?.events ?? [];
  if (events.some((e) => e.type === 'battleEnded')) return 'The battle has ended.';
  const round = events.find((e) => e.type === 'roundEnded');
  const actorId = events.map(actorOf).find((unit) => unit !== null) ?? null;
  const name = actorId ? (session.battle && unitOf(session.battle, actorId)?.name) || actorId : null;
  if (round) return name ? `${name} ended the round.` : `Round ${round.round} ended.`;
  return name ? `${name} acted.` : 'The battle moved on.';
}

/** The interaction, if any, that this viewer's side still owes an answer to. */
function openDecision(session: BattleSession, viewer: NoticeViewer) {
  return session.interactions.find((i) => i.status === 'open'
    && i.participants.some((side) => decidesFor(session, viewer, side) && i.submissions[side] === undefined));
}

/**
 * A pure reading of what changed between two adopted records, for one viewer. `previous` is
 * null for the first record a client ever adopts: a fresh join or a freshly loaded save. The
 * presentation module calls this on every adopted record, alongside `commitPlay`.
 */
export function noticesFor(previous: BattleSession | null, next: BattleSession, viewer: NoticeViewer): Notices {
  const show: Notification[] = [];
  // Any prior rejection notice speaks to a record that has since moved on; a fresh commit,
  // whoever sent it, makes it stale. `dismiss` is a no-op when nothing is shown under the ID.
  const dismiss: string[] = [COMMAND_NOTICE];

  if (next.turn !== (previous?.turn ?? null)) {
    if (next.turn) show.push(turnNotice(next, viewer));
    else dismiss.push(TURN_NOTICE);
  }

  const advanced = !!previous && previous.battleId === next.battleId && next.revision === previous.revision + 1;
  const own = next.lastCommit?.userId === viewer.userId;
  if (advanced && next.lastCommit && next.lastCommit.events.length > 0 && !own) {
    show.push({
      id: ACTIVITY_NOTICE, title: 'Activity', message: activitySummary(next), tone: 'info',
      expiresInMs: ACTIVITY_EXPIRES_MS,
    });
  }

  const decision = openDecision(next, viewer);
  if (decision) show.push({ id: DECISION_NOTICE, title: DECISION_TITLE[decision.kind], message: DECISION_MESSAGE[decision.kind], tone: 'info' });
  else dismiss.push(DECISION_NOTICE);

  return { show, dismiss };
}

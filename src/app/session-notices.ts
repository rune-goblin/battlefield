import type { Side } from '../engine/index.js';
import { seatedOn } from '../runtime/control.js';
import type { InteractionKind } from '../runtime/interactions.js';
import type { BattleSession } from '../runtime/session.js';
import { COMMAND_NOTICE } from './command-notices.js';
import type { Notification } from './notifications.js';

export const DECISION_NOTICE = 'decision';

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

/** The interaction, if any, that this viewer's side still owes an answer to. */
function openDecision(session: BattleSession, viewer: NoticeViewer) {
  return session.interactions.find((i) => i.status === 'open'
    && i.participants.some((side) => decidesFor(session, viewer, side) && i.submissions[side] === undefined));
}

/** A pure reading of one adopted record, for one viewer. The presentation module calls this
 * on every adopted record, alongside `commitPlay`. */
export function noticesFor(next: BattleSession, viewer: NoticeViewer): Notices {
  const show: Notification[] = [];
  // Any prior rejection notice speaks to a record that has since moved on; a fresh commit,
  // whoever sent it, makes it stale. `dismiss` is a no-op when nothing is shown under the ID.
  const dismiss: string[] = [COMMAND_NOTICE];

  const decision = openDecision(next, viewer);
  if (decision) show.push({ id: DECISION_NOTICE, title: DECISION_TITLE[decision.kind], message: DECISION_MESSAGE[decision.kind], tone: 'info' });
  else dismiss.push(DECISION_NOTICE);

  return { show, dismiss };
}

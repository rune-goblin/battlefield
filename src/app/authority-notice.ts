import type { Notification } from './notifications.js';

/** One notice for the state of the table's authority. It stands until authority returns. */
export const AUTHORITY_NOTICE = 'authority';

export interface AuthorityState {
  /** The client that executes: the table's active GM, or the local user in the browser. */
  primaryGm: string | null;
  /** The authority is moving from one client to another. */
  handingOff: boolean;
  /** A command went unanswered, so whether it committed is unknown. */
  unanswered: boolean;
}

export type AuthorityStatus = 'held' | 'absent' | 'handoff' | 'unanswered';

export const authorityStatus = ({ primaryGm, handingOff, unanswered }: AuthorityState): AuthorityStatus =>
  (primaryGm === null ? 'absent' : handingOff ? 'handoff' : unanswered ? 'unanswered' : 'held');

/**
 * With nobody to execute, every client reads and no command travels. A handoff and a lost
 * reply both leave the table playable: the new primary's readiness gate holds a request until
 * it can run it, and a command already sent may yet commit.
 */
export const commandsEnabled = (status: AuthorityStatus): boolean => status !== 'absent';

// proto: the wording is a first draft, reserved for review with the rest of the player-facing text.
const NOTICE: Record<Exclude<AuthorityStatus, 'held'>, { title: string; message: string }> = {
  absent: { title: 'No GM at the table', message: 'The battle can be read until a GM connects.' },
  handoff: { title: 'The GM is changing', message: 'The new GM is loading the battle.' },
  unanswered: { title: 'No answer from the GM', message: 'Whether the last command took effect is unknown. It will show when the battle next moves.' },
};

export const authorityNotice = (status: AuthorityStatus): Notification | null =>
  (status === 'held' ? null : { id: AUTHORITY_NOTICE, ...NOTICE[status], tone: 'warning' });

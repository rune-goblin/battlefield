import { HOT_SEAT_USER } from '../runtime/control.js';
import {
  authorityNotice, authorityStatus, commandsEnabled, AUTHORITY_NOTICE,
  type AuthorityState, type AuthorityStatus,
} from './authority-notice.js';
import type { NotificationService } from './notifications.js';

// The browser holds its own authority: the one local user executes every command it issues.
// Under Foundry the adapter reports the table's active GM over this instead.
const state = $state<AuthorityState>({ primaryGm: HOT_SEAT_USER, handingOff: false, unanswered: false });

const listeners = new Set<(status: AuthorityStatus) => void>();

/** Where this client stands with the authority. Views read `mayCommand` to know whether the
 * controls they show can reach an executor at all. */
export const authority = {
  get status(): AuthorityStatus { return authorityStatus(state); },
  get mayCommand(): boolean { return commandsEnabled(authorityStatus(state)); },
};

export function reportAuthority(next: AuthorityState): void {
  state.primaryGm = next.primaryGm;
  state.handingOff = next.handingOff;
  state.unanswered = next.unanswered;
  for (const listener of [...listeners]) listener(authority.status);
}

/** Show the notice for as long as the authority is away, the way the presentation module
 * connects the session notices. */
export function connectAuthority(notifications: NotificationService): () => void {
  const apply = (status: AuthorityStatus): void => {
    const notice = authorityNotice(status);
    if (notice) notifications.show(notice);
    else notifications.dismiss(AUTHORITY_NOTICE);
  };
  listeners.add(apply);
  apply(authority.status);
  return () => { listeners.delete(apply); };
}

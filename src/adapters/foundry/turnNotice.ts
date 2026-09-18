import { noticesFor, TURN_NOTICE } from '../../app/session-notices.js';
import type { BattleSession } from '../../runtime/session.js';

export interface TurnAnnouncerOptions {
  /** Read at delivery time: the client's own user is built after the module loads. */
  viewer(): { userId: string; isGm: boolean };
  /** Whether the app's window is on screen. Its own notification host lives inside that
   * window, so with the window away a notice has nowhere to land. */
  visible(): boolean;
  notify(message: string): void;
}

/**
 * The one notice that leaves the app's own window. Every other notice is presentation inside
 * the shell; a player whose window is closed or minimized would miss the turn that is theirs,
 * and a missed turn stalls the table. Feed it every adopted record.
 */
export function createTurnAnnouncer(
  { viewer, visible, notify }: TurnAnnouncerOptions,
): (session: BattleSession) => void {
  let previous: BattleSession | null = null;
  return (next) => {
    const seen = previous;
    previous = next;
    if (visible()) return;
    const who = viewer();
    if (next.turn !== who.userId) return;
    // proto: the turn wording is the app's own, reserved for review with the rest of the
    // player-facing text; here the title and the message travel as one line.
    const notice = noticesFor(seen, next, who).show.find((n) => n.id === TURN_NOTICE);
    if (notice) notify(`${notice.title} — ${notice.message}`);
  };
}

/** The host's own toast, outside the app's window and taking a bare string. */
export const announceThroughHost = (message: string): void => {
  ui.notifications.info(message);
};

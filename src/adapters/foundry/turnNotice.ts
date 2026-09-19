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
    // proto: wording reserved for review with the rest of the player-facing text.
    if (seen?.turn !== next.turn) notify('Your turn');
  };
}

/** The host's own toast, outside the app's window and taking a bare string. */
export const announceThroughHost = (message: string): void => {
  ui.notifications.info(message);
};

import type { WorldSettingStorage } from './worldSettings.js';

const CALLED = 'called';

/** The floating panel a client keeps while the table is called and its window is shut. */
export interface ReopenChip {
  show(reopen: () => void): void;
  hide(): void;
}

export interface TableCallOptions {
  storage: WorldSettingStorage;
  isGm(): boolean;
  /** The battle the session record holds, and whether it is under way. */
  battle(): { id: string; running: boolean };
  windowOpen(): boolean;
  openWindow(): Promise<unknown>;
  closeWindow(): Promise<unknown>;
  chip: ReopenChip;
  onError(error: unknown): void;
}

export interface TableCall {
  readonly called: boolean;
  /** The GM brings every player to the battle, or sends them away. */
  call(): Promise<void>;
  dismiss(): Promise<void>;
  /** The setting's `onChange`, which every client hears. */
  handleChange(raw: string): void;
  /** Every delivered session record. The GM's client calls the table when a battle starts and
   * dismisses it when the battle ends or the record moves to another battle. */
  handleSession(): void;
  /** Fit the chip to the window: call it at `ready` and whenever the window opens or shuts. */
  sync(): void;
}

/**
 * Who is brought to the battle, and the chip that brings them back. The call is the one thing
 * that shows players a battle: a world setting outside the session record, so a player who
 * joins late or reconnects reads it like anyone else and gets the chip. The GM opening another
 * battle drops the call, so players see nothing until the GM calls them to it. The window opens
 * once per call; after that the chip is the way back.
 */
export function createTableCall(
  { storage, isGm, battle, windowOpen, openWindow, closeWindow, chip, onError }: TableCallOptions,
): TableCall {
  const called = (): boolean => storage.get() === CALLED;
  // Null until the first record lands, so a client that loads into a battle witnesses nothing.
  let last: { id: string; running: boolean } | null = null;
  const sync = (): void => {
    if (called() && !windowOpen()) chip.show(() => { openWindow().catch(onError); });
    else chip.hide();
  };
  // A window that failed to open or shut still leaves the chip fitted to what is on screen.
  const settle = (step: Promise<unknown>): void => {
    step.then(sync, (error: unknown) => { onError(error); sync(); });
  };
  return {
    get called() { return called(); },
    call: () => storage.set(CALLED),
    dismiss: () => storage.set(''),
    handleChange(raw) {
      if (raw === CALLED) settle(openWindow());
      // The GM may still be reading the result, so only the players' windows shut.
      else if (!isGm()) settle(closeWindow());
      else sync();
    },
    handleSession() {
      const now = battle();
      const before = last;
      last = now;
      sync();
      if (!before || !isGm()) return;
      const same = before.id === now.id;
      if (same && !before.running && now.running && !called()) storage.set(CALLED).catch(onError);
      else if ((!same || (before.running && !now.running)) && called()) storage.set('').catch(onError);
    },
    sync,
  };
}

/** The chip as a bare element on the page: the app's own window is shut whenever it shows. */
export function domReopenChip(): ReopenChip {
  let element: HTMLButtonElement | null = null;
  return {
    show(reopen) {
      if (element) return;
      element = document.createElement('button');
      element.type = 'button';
      element.className = 'battlefield-surface battlefield-chip';
      element.title = 'Open the battle';
      element.setAttribute('aria-label', 'Open the battle');
      element.innerHTML = '<i class="fa-solid fa-swords"></i>';
      element.addEventListener('click', reopen);
      // The column beside the sidebar moves with it when the sidebar collapses.
      (document.getElementById('ui-right-column-1') ?? document.body).prepend(element);
    },
    hide() {
      element?.remove();
      element = null;
    },
  };
}

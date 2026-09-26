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
  /** Whether the session record holds a battle under way. */
  battleRunning(): boolean;
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
  /** Every delivered session record. A battle that starts opens the window once, and one the
   * GM ends shuts the players' windows. */
  handleSession(): void;
  /** Fit the chip to the window: call it at `ready` and whenever the window opens or shuts. */
  sync(): void;
}

/**
 * Who is brought to the battle, and the chip that brings them back. A battle under way holds
 * the chip on every client until the GM ends it. The GM's call does the same before a battle
 * starts, for players who deploy their own army: it is a world setting of its own, outside the
 * session record, so a loaded save leaves the players where they are and a player who joins
 * late reads it like anyone else. The window opens once; after that the chip is the way back.
 */
export function createTableCall(
  { storage, isGm, battleRunning, windowOpen, openWindow, closeWindow, chip, onError }: TableCallOptions,
): TableCall {
  const called = (): boolean => storage.get() === CALLED;
  const wanted = (): boolean => called() || battleRunning();
  // Null until the first record lands: a client that loads into a running battle gets the
  // chip, and only a start it witnesses opens the window.
  let wasRunning: boolean | null = null;
  const sync = (): void => {
    if (wanted() && !windowOpen()) chip.show(() => { openWindow().catch(onError); });
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
      else if (!isGm() && !battleRunning()) settle(closeWindow());
      else sync();
    },
    handleSession() {
      const running = battleRunning();
      const started = wasRunning === false && running;
      const ended = wasRunning === true && !running;
      wasRunning = running;
      if (started) settle(openWindow());
      else if (ended && !isGm()) settle(closeWindow());
      else sync();
      // The end of the battle releases the players the call was holding.
      if (ended && isGm() && called()) storage.set('').catch(onError);
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
      element.className = 'battlefield-chip';
      element.title = 'Open the battle';
      element.setAttribute('aria-label', 'Open the battle');
      element.innerHTML = '<i class="fa-solid fa-chess-rook"></i>';
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

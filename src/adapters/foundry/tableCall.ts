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
  windowOpen(): boolean;
  openWindow(): Promise<unknown>;
  closeWindow(): Promise<unknown>;
  chip: ReopenChip;
}

export interface TableCall {
  readonly called: boolean;
  /** The GM brings every player to the battle, or sends them away. */
  call(): Promise<void>;
  dismiss(): Promise<void>;
  /** The setting's `onChange`, which every client hears. */
  handleChange(raw: string): void;
  /** Fit the chip to the window: call it at `ready` and whenever the window opens or shuts. */
  sync(): void;
}

/**
 * The GM's call to the table. It is a world setting of its own, outside the session record, so
 * a reset or a loaded save leaves the players where they are, and a player who joins late reads
 * it like anyone else. The window opens once, on the call; after that the chip is the way back.
 */
export function createTableCall(
  { storage, isGm, windowOpen, openWindow, closeWindow, chip }: TableCallOptions,
): TableCall {
  const called = (): boolean => storage.get() === CALLED;
  const sync = (): void => {
    if (called() && !windowOpen()) chip.show(() => { void openWindow(); });
    else chip.hide();
  };
  return {
    get called() { return called(); },
    call: () => storage.set(CALLED),
    dismiss: () => storage.set(''),
    handleChange(raw) {
      if (raw === CALLED) void openWindow().then(sync);
      // The GM may still be reading the result, so only the players' windows shut.
      else if (!isGm()) void closeWindow().then(sync);
      else sync();
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
      element.innerHTML = '<i class="fa-solid fa-chess-rook"></i><span>Battlefield</span>';
      element.addEventListener('click', reopen);
      document.body.append(element);
    },
    hide() {
      element?.remove();
      element = null;
    },
  };
}

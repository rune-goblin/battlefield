/** open: the panel is there. rail: collapsed to a strip that names it. hidden: gone, and only
 * the top bar's toggle brings it back. */
export type DockState = 'open' | 'rail' | 'hidden';
export type DockSide = 'left' | 'right';

// View state, not game state: which panels this player has open belongs to this browser, and
// must never travel to another seat. Hence its own key, outside the session record.
const KEY = 'battlefield.ui.v1';

interface Saved { left: DockState; right: DockState }

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Saved;
      const ok = (s: unknown): s is DockState => s === 'open' || s === 'rail' || s === 'hidden';
      if (ok(p.left) && ok(p.right)) return p;
    }
  } catch { /* fresh start */ }
  return { left: 'open', right: 'open' };
}

const saved = load();

export const ui = $state({
  dock: { left: saved.left, right: saved.right } as Record<DockSide, DockState>,
  /** Which docks the current stage fills. A toggle for a dock nobody filled does nothing. */
  has: { left: false, right: false } as Record<DockSide, boolean>,
  /** What the chrome covers, in CSS pixels. Setup and manual framing use the clear area. */
  chrome: { left: 0, right: 0, top: 0, bottom: 0 },
});

/** The map the player can actually see: the canvas minus the chrome over it. */
export function visibleRect(width = window.innerWidth, height = window.innerHeight): { x: number; y: number; width: number; height: number } {
  const { left, right, top, bottom } = ui.chrome;
  return {
    x: left,
    y: top,
    width: Math.max(1, width - left - right),
    height: Math.max(1, height - top - bottom),
  };
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ left: ui.dock.left, right: ui.dock.right })); } catch { /* storage unavailable */ }
}

export function setDock(side: DockSide, state: DockState) {
  ui.dock[side] = state;
  persist();
}

/** The top bar's toggle: open a dock that is put away, put away one that is open. A railed
 * dock opens rather than hides — the strip is already the "put away" state. */
export function toggleDock(side: DockSide) {
  setDock(side, ui.dock[side] === 'open' ? 'hidden' : 'open');
}

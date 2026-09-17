let root: HTMLElement | null = null;
let pointerInApp = true;

function trackPointer(e: PointerEvent): void {
  pointerInApp = e.target instanceof Node && !!root?.contains(e.target);
}

/** `App.svelte` registers its own root element. Until it does — and in the browser, where the
 * page is the app's alone — every event counts as the app's. */
export function setAppRoot(el: HTMLElement | null): void {
  root?.ownerDocument.removeEventListener('pointerdown', trackPointer, true);
  root = el;
  pointerInApp = true;
  el?.ownerDocument.addEventListener('pointerdown', trackPointer, true);
}

/** Inside Foundry the app owns one window and the rest of the page belongs to the host: a key
 * typed into chat must not reach the board. A keystroke with nothing focused lands on `<body>`,
 * which belongs to no one, so the last pointer press decides who hears it. */
export function withinApp(target: EventTarget | null): boolean {
  if (!root) return true;
  if (target instanceof Node && root.contains(target)) return true;
  const doc = root.ownerDocument;
  return (target === doc.body || target === doc.documentElement) && pointerInApp;
}

/** A trackpad pinch reaches the page as a ctrl-wheel, and outside the canvas Chrome answers it
 * by zooming the whole document — the panel, the radial menu and the board's own canvas along
 * with it, and the zoom sticks across reloads. Only the board scales here; ⌘+/− still works. */
export function blockPageZoom(): void {
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey && withinApp(e.target)) e.preventDefault();
  }, { passive: false });
}

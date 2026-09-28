/**
 * Moves a popover or dialog into the shell's overlay layer, the top of its stacking order.
 * Opened from inside the top bar or a dock, it would otherwise stack within that layer and sit
 * under the army reel and the board's name tags. The host stays inside the app root, so the
 * app's tokens and its reset still reach it, and inside Svelte's mount root, so delegated events
 * still arrive. Svelte removes the moved node itself when its block unmounts.
 */
export const hostOf = (node: Element): HTMLElement | null =>
  node.closest('.shell')?.querySelector<HTMLElement>(':scope > .overlay') ?? null;

export const portal = (node: HTMLElement): void => { hostOf(node)?.append(node); };

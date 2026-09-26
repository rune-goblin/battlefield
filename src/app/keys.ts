import { withinApp } from './app-root.js';

/** Attach on `<svelte:document>`. Foundry consumes the app's Escape at the window and stops its
 * propagation there, and Svelte then skips every window handler that has not run yet. */
export const onEscape = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === 'Escape' && withinApp(e.target)) fn(); };

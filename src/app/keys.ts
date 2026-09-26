import { withinApp } from './app-root.js';

export const onEscape = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === 'Escape' && withinApp(e.target)) fn(); };

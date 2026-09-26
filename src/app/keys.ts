export const onEscape = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === 'Escape') fn(); };

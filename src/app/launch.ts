import { SESSION_KEY } from '../adapters/browser/localRepository.js';
import { freshSession } from '../runtime/session.js';

// The landing page's choice arrives as `?new` or `?example`. It has to land in storage before
// `game.svelte.ts` reads the session at import, so `main.ts` imports this module first.
const params = new URLSearchParams(location.search);
const blank = params.has('new');
if (blank || params.has('example')) {
  const session = freshSession();
  // proto: a new battle is the example with both armies emptied.
  if (blank) session.setup.units = [];
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* private browsing */ }
  params.delete('new');
  params.delete('example');
  // A reload resumes the battle rather than starting another.
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
}

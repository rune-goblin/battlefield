import { SESSION_KEY } from '../adapters/browser/localRepository.js';
import { freshSession } from '../runtime/session.js';

/** Store the landing page's choice, which arrives as `?new` or `?example`. `main.ts` calls this
 * before the browser's client reads the saved session. */
export function applyLaunchChoice(): void {
  const params = new URLSearchParams(location.search);
  const blank = params.has('new');
  if (!blank && !params.has('example')) return;
  const session = freshSession();
  // proto: a new battle is the example with both armies emptied.
  if (blank) session.setup.units = [];
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch { /* private browsing */ }
  params.delete('new');
  params.delete('example');
  // A reload resumes the battle rather than starting another.
  history.replaceState(null, '', `${location.pathname}${params.size ? `?${params}` : ''}${location.hash}`);
}

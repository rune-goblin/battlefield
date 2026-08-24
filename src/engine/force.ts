import type { SiegeEngineCard, UnitCard } from './cards.js';
import { COMBATANTS } from './combatants.js';
import { ENGINES } from './engines.js';
import { OFFICIAL } from './official.js';
import { ROSTER } from './roster.js';
import type { Random } from './rng.js';

export const LIBRARY: UnitCard[] = [...COMBATANTS, ...OFFICIAL, ...ROSTER];

export interface ForceUnit { card: UnitCard; engine: SiegeEngineCard | null; }

export interface ForceOptions {
  count?: number;
  wallsTier?: number;
  attacking?: boolean;
  library?: UnitCard[];
  engines?: SiegeEngineCard[];
}

function pick<T>(rnd: Random, items: T[]): T { return items[Math.floor(rnd() * items.length)]; }

// The opponent sets the budget: same unit count give or take one, levels within three of
// its average, and the total level within a tenth of its total.
export function generateForce(opponent: UnitCard[], rnd: Random, opts: ForceOptions = {}): ForceUnit[] {
  const library = opts.library ?? LIBRARY;
  const engines = opts.engines ?? ENGINES;
  const target = opponent.reduce((s, c) => s + c.level, 0) || 12;
  const avg = opponent.length ? target / opponent.length : 6;
  const count = opts.count ?? Math.max(1, opponent.length + Math.floor(rnd() * 3) - 1);
  const band = library.filter(c => Math.abs(c.level - avg) <= 3);
  const pool = band.length >= 3 ? band : library;

  let units: UnitCard[] = Array.from({ length: count }, () => pick(rnd, pool));
  for (let i = 0; i < 20; i++) {
    const total = units.reduce((s, c) => s + c.level, 0);
    if (Math.abs(total - target) <= Math.max(1, target / 10)) break;
    const want = total > target ? (c: UnitCard) => c.level < avg : (c: UnitCard) => c.level > avg;
    const j = Math.floor(rnd() * units.length);
    const candidates = pool.filter(want);
    if (!candidates.length) break;
    units = units.map((c, k) => k === j ? pick(rnd, candidates) : c);
  }

  const wantsSiege = opts.attacking && (opts.wallsTier ?? 0) > 0;
  const engineChance = wantsSiege ? 0.75 : 0.2;
  const suitable = engines.filter(e => Math.abs(e.level - avg) <= 3 && (wantsSiege || e.kind === 'artillery'));
  const gunner = rnd() < engineChance && suitable.length ? Math.floor(rnd() * units.length) : -1;
  return units.map((card, i) => ({ card, engine: i === gunner ? pick(rnd, suitable) : null }));
}

import type { SiegeEngineCard } from './cards.js';
import type { EngineState } from './types.js';
import { ENGINES } from './engines.js';

export const engineNamed = (name: string): SiegeEngineCard | undefined => ENGINES.find((card) => card.name === name);

/** The catalogue's kind wins over the stored one. */
export const engineKind = (e: Pick<EngineState, 'name' | 'kind'>) => engineNamed(e.name)?.kind ?? e.kind;

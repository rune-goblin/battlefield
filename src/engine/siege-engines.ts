import type { SiegeEngineCard } from './cards.js';
import type { EngineState } from './types.js';
import { ENGINES } from './engines.js';

export const engineNamed = (name: string): SiegeEngineCard | undefined => ENGINES.find((card) => card.name === name);

/** Equipment uses its imported kind, including older saves whose own field may be stale. */
export const engineKind = (e: Pick<EngineState, 'name' | 'kind'>) => engineNamed(e.name)?.kind ?? e.kind;

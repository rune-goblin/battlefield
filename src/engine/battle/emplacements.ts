import { notation, sameCell, type Square } from '../board.js';
import { convertSpeed, type SiegeEngineCard } from '../cards.js';
import { CELL_FEET } from '../path.js';
import { engineKind, engineNamed } from '../siege-engines.js';
import type { BattleState, EngineState, Side, Unit } from '../types.js';
import { dist, isStanding, log } from './state.js';

export const engineState = (e: SiegeEngineCard, id: string, side: Side | null, square: Square, emplaced: boolean): EngineState => {
  const card = engineNamed(e.name);
  const steps = (card?.loadSteps ?? e.loadSteps) === 0 ? 0 : card?.loadCost ?? e.loadCost ?? 1;
  return { id, name: e.name, kind: e.kind, launch: e.launch, reach: e.reach, fired: false, status: 'crewed', square, side, emplaced,
    speed: e.speed, loadCost: e.loadCost, loadSteps: steps, loaded: steps, hauling: false };
};

/**
 * An occupant works an emplacement immediately, regardless of its previous owner. Without
 * an occupant, the first adjacent friendly reserves it. The shot limit belongs to the engine.
 */
export const crewOf = (state: BattleState, e: EngineState): Unit | null =>
  state.units.find((u) => isStanding(u) && dist(state, u.square, e.square) === 0)
  ?? state.units.find((u) => u.side === e.side && isStanding(u) && dist(state, u.square, e.square) === 1) ?? null;

/** Every engine this unit may fire: the ones riding with it, plus any emplacement it crews. */
export const enginesOf = (state: BattleState, u: Unit): EngineState[] =>
  [...u.engines, ...state.engines.filter((e) => crewOf(state, e)?.id === u.id)];

/** An emplaced engine is crewed exactly while a friendly stands by it — nothing sets that. */
export function refreshEmplacements(state: BattleState) {
  // A standing friendly in the same hex can recover equipment that a routed crew left.
  for (const owner of state.units) for (const e of [...owner.engines]) {
    if (e.status !== 'abandoned' || !state.units.some(u => u.side === e.side && isStanding(u) && sameCell(u.square, e.square))) continue;
    owner.engines = owner.engines.filter(x => x.id !== e.id);
    e.emplaced = true;
    e.hauling = false;
    state.engines.push(e);
  }
  for (const e of state.engines) {
    const crew = crewOf(state, e);
    if (crew && sameCell(crew.square, e.square) && e.side !== crew.side) {
      e.side = crew.side;
      log(state, crew, `${crew.name} takes the ${e.name} on ${notation(e.square)}.`);
    }
    e.status = crew ? 'crewed' : 'abandoned';
  }
}

/** Equipment uses its imported movement and loading profile, including older saves. */
export const engineCard = (e: EngineState) => engineNamed(e.name);
export const engineSpeed = (e: EngineState): number | null => {
  const source = engineCard(e)?.sourceSpeed;
  if (source != null && (e.speed === undefined || e.speed === convertSpeed(source)
    || e.speed === Math.ceil(source / 30) * CELL_FEET || e.speed === Math.ceil(source / 15) * CELL_FEET / 2)) {
    return convertSpeed(source);
  }
  const speed = e.name === 'Wolf Fang' ? CELL_FEET : e.speed !== undefined ? e.speed
    : engineCard(e)?.speed !== undefined ? engineCard(e)!.speed! : (engineKind(e) === 'ram' ? null : 0);
  // Older saves store half-hex rates. Round them to the same whole hexes as new imports.
  return speed === null || speed === 0 ? speed : Math.ceil(speed / CELL_FEET) * CELL_FEET;
};
export const isFixedEngine = (card: SiegeEngineCard): boolean =>
  engineSpeed({ name: card.name, kind: card.kind, speed: card.speed } as EngineState) === 0;
export const engineLoadCost = (e: EngineState): number => engineCard(e)?.loadCost ?? e.loadCost ?? 1;
/** Each load action fills one pip. Old saves used a separate full-load step count. */
export const engineLoadSteps = (e: EngineState): number =>
  (engineCard(e)?.loadSteps ?? e.loadSteps) === 0 ? 0 : engineLoadCost(e);
export const engineLoadProgress = (e: EngineState): number => {
  const total = engineLoadSteps(e);
  if (!total) return 0;
  const previousTotal = e.loadSteps ?? engineCard(e)?.loadSteps ?? total;
  return Math.max(0, Math.min(total, Math.floor((e.loaded ?? previousTotal) * total / Math.max(1, previousTotal))));
};
export const engineLoaded = (e: EngineState): boolean => engineLoadProgress(e) >= engineLoadSteps(e);
export function engineLoading(e: EngineState): { total: number; completed: number; label: string } {
  const total = engineLoadSteps(e), completed = engineLoadProgress(e);
  return { total, completed, label: completed < total ? `${completed}/${total} loaded`
    : e.fired ? 'Loaded · fired this round' : 'Ready to fire' };
}

/** The siege menu belongs to equipment in the unit's hex. */
export const siegeEngines = (state: BattleState, u: Unit): EngineState[] =>
  !isStanding(u) ? [] : enginesOf(state, u).filter(e =>
    // Existing saves can retain an abandoned flag after a unit entered the hex.
    (e.status === 'crewed' || state.engines.includes(e)) && sameCell(e.square, u.square));

export function abandonEngines(state: BattleState, u: Unit) {
  for (const e of u.engines) {
    if (e.status !== 'crewed') continue;
    e.status = 'abandoned';
    e.hauling = false;
    e.square = u.square;
    log(state, u, `${u.name} abandons its ${e.name} on ${notation(e.square)}.`);
  }
}

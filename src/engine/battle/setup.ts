import { validatedAbilities, freshAbilityMemory } from '../abilities.js';
import { abilityMemory, unitAbilities, exploitBonus, refreshAbilityAuras } from '../ability-effects.js';
import { at, deployRanks, gridOf, parse, sameCell, type Board, type Square } from '../board.js';
import { cardTraits, deriveStats, speedOf, movementRates, type SiegeEngineCard, type UnitCard } from '../cards.js';
import { treesFor } from '../ladders.js';
import { clone } from '../clone.js';
import { freshConditions } from '../conditions.js';
import {
  ACTIONS_PER_ACTIVATION, LAST_ROUND, ROUTED_AT, type BattleState, type EngineState, type Side, type Unit,
} from '../types.js';
import { isRouted, activatable, nextSide } from './state.js';
import { engineState, refreshEmplacements, isFixedEngine, abandonEngines } from './emplacements.js';

/** An engine riding with a unit. Its `id` is the equipment ID setup gave it. */
export interface AttachedEngine { card: SiegeEngineCard; id?: string; }

export interface Deployment { id?: string; card: UnitCard; side: Side; square: string; engines?: AttachedEngine[]; }

/** An engine deployed on a square of its own rather than attached to a unit. The unit deployed
 * on or beside it claims it, and with none there it starts the battle as nobody's. `side` is
 * the army that brought it, which the campaign outcome reads. */
export interface Emplacement {
  id?: string; card: SiegeEngineCard; side: Side; square: string;
  /** The unit deployed on this square starts the battle hauling it. */
  hauled?: boolean;
  /** Initial load; defaults to loaded. Capture preserves the engine's current load. */
  loaded?: boolean;
}

/** Who claims an emplacement at deployment: the unit on its square, else the first beside it. */
function emplacementClaimant(
  board: Board, units: readonly { side: Side; square: Square }[], square: Square,
): Side | null {
  const beside = gridOf(board).neighbours(square);
  const claimant = units.find((u) => sameCell(u.square, square))
    ?? units.find((u) => beside.some((n) => sameCell(n, u.square)));
  return claimant?.side ?? null;
}

/** A deployment that carries no ID takes one from its position. BattleManager always passes
 * IDs, so only tests and the two-client dev page reach these. */
const positionalUnitId = (index: number) => `u${index}`;
const positionalAttachedId = (unitId: string, slot: number) => `${unitId}:engine:${slot}`;
const positionalEmplacedId = (index: number) => `engine:${index}`;

export interface BattleSetup { units: Deployment[]; board: Board; engines?: Emplacement[]; roundsPerDay?: number; }

export function canDeploy(board: Board, side: Side, ambush: boolean, sq: Square): boolean {
  return gridOf(board).inBounds(sq) && deployRanks(side, ambush, board.squares.length).includes(sq.rank) && at(board, sq).terrain !== 'water';
}

/** An emplacement stands on any dry square of the board, whichever army's ranks it lies in. */
export function canEmplace(board: Board, sq: Square): boolean {
  return gridOf(board).inBounds(sq) && at(board, sq).terrain !== 'water';
}

export function createBattle(setup: BattleSetup): BattleState {
  const roundsPerDay = setup.roundsPerDay ?? LAST_ROUND;
  if (!Number.isInteger(roundsPerDay) || roundsPerDay < 1) throw new Error('rounds per day must be a positive integer');
  const taken = new Set<string>();
  const units: Unit[] = setup.units.map((d, index) => {
    const traits = cardTraits(d.card);
    const sq = parse(d.square);
    if (!canDeploy(setup.board, d.side, traits.tactics.includes('ambush'), sq)) throw new Error(`${d.card.name} cannot deploy on ${d.square}`);
    if (taken.has(d.square)) throw new Error(`${d.square} is already occupied`);
    taken.add(d.square);
    const id = d.id ?? positionalUnitId(index);
    return {
      id, name: d.card.name, side: d.side, level: d.card.level, role: d.card.role,
      abilities: validatedAbilities(d.card.abilities ?? []), abilityReview: d.card.abilityReview ?? [],
      abilityState: freshAbilityMemory(d.card.wounds ?? 0), traits: d.card.traits ?? [], immuneFear: d.card.immuneFear ?? false, attackTags: d.card.attackTags,
      stats: deriveStats(d.card), tactics: traits.tactics,
      ...(d.card.sheet ? { attackSources: { strike: d.card.sheet.battleName, volley: d.card.sheet.salvoName } } : {}),
      tradition: traits.caster ? traits.tradition : null,
      trees: treesFor(d.card), castTrees: [],
      speed: speedOf(d.card),
      ...(d.card.sheet ? { movementRates: movementRates(d.card), sourceSpeed: {
        speed: d.card.sheet.speed, otherSpeeds: d.card.sheet.otherSpeeds?.map(s => ({ ...s })),
      } } : {}),
      actions: ACTIONS_PER_ACTIVATION, attacked: false, feet: 0,
      engines: (d.engines ?? []).map((e, slot) =>
        engineState(e.card, e.id ?? positionalAttachedId(id, slot), d.side, sq, false)),
      square: sq, wounds: d.card.wounds ?? 0, disorder: Math.max(0, Math.min(ROUTED_AT, d.card.disorder ?? 0)), status: 'active' as const,
      ...freshConditions(),
    };
  });
  const engineSquares = new Set<string>();
  const emplaced: EngineState[] = [];
  (setup.engines ?? []).forEach((e, index) => {
    const sq = parse(e.square);
    if (!canEmplace(setup.board, sq)) throw new Error(`${e.card.name} cannot deploy on ${e.square}`);
    if (engineSquares.has(e.square)) throw new Error(`${e.square} is already occupied`);
    engineSquares.add(e.square);
    const crew = units.find((u) => sameCell(u.square, sq));
    const engine = engineState(e.card, e.id ?? positionalEmplacedId(index), emplacementClaimant(setup.board, units, sq), sq, true);
    if (e.loaded === false) engine.loaded = 0;
    if (e.hauled && crew && !isFixedEngine(e.card) && !crew.engines.some((x) => x.hauling)) {
      engine.emplaced = false;
      engine.hauling = true;
      crew.engines.push(engine);
    } else emplaced.push(engine);
  });
  const state: BattleState = {
    day: 1, roundsPerDay, night: null,
    units, engines: emplaced, order: units.map((u) => u.id), round: 1,
    pending: 'attacker', active: null, begun: false, activated: [], lastSide: null,
    board: clone(setup.board),
    phase: 'battle', winner: null, endedBy: null,
    log: [{ round: 1, text: 'Round 1 begins.' }],
  };
  for (const u of state.units) {
    if (isRouted(u)) abandonEngines(state, u);
    if (unitAbilities(u).some(a => a.kind === 'advantage' && a.predicate === 'quarry')) abilityMemory(u).quarry = state.units.find(t => t.side !== u.side)?.id;
  }
  refreshAbilityAuras(state);
  state.pending = nextSide(state) ?? 'attacker';
  if (activatable(state, 'attacker').length === activatable(state, 'defender').length) {
    const initiative = (side: Side) => Math.max(0, ...state.units.filter(u => u.side === side).map(u => exploitBonus(state, u, null, 'initiative')));
    if (initiative('defender') > initiative('attacker')) state.pending = 'defender';
  }
  refreshEmplacements(state);
  refreshAbilityAuras(state);
  return state;
}

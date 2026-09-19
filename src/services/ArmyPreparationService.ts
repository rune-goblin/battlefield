import {
  canDeploy, deploymentCells, ENGINES, generateForce as buildForce, gridOf, isFixedEngine, isSurvivor, notation, parse, seededRandom,
  type BattleState, type Board, type Side, type Square, type UnitCard,
} from '../engine/index.js';
import type { PieceRef } from '../runtime/commands.js';
import { submitTo } from '../runtime/interactions.js';
import {
  newEquipmentId, newUnitId, randomSeed,
  type BattleSession, type BattleSetupDraft, type SetupEngine, type SetupUnit,
} from '../runtime/session.js';

/**
 * The force a side brings and where it stands. Every call reads the executor's working
 * session and returns the next one; the queries beside them answer a view's legality
 * question from a setup draft alone.
 */
export interface ArmyPreparationService {
  addUnit(session: BattleSession, side: Side, card: UnitCard): BattleSession;
  removeUnit(session: BattleSession, unitId: string): BattleSession;
  addEmplacement(session: BattleSession, side: Side, engine: string): BattleSession;
  removeEmplacement(session: BattleSession, emplacementId: string): BattleSession;
  setHauling(session: BattleSession, emplacementId: string, hauling: boolean): BattleSession;
  place(session: BattleSession, piece: PieceRef, square: string): BattleSession;
  unplace(session: BattleSession, piece: PieceRef): BattleSession;
  autoPlace(session: BattleSession, piece: PieceRef): BattleSession;
  generateForce(session: BattleSession, side: Side, seed?: number): BattleSession;
  /** One army's word that it has finished deploying, which `battle.start` waits for. */
  declareReady(session: BattleSession, side: Side, ready: boolean, userId: string): BattleSession;
}

export const isAmbush = (u: SetupUnit): boolean => (u.card.tactics ?? []).includes('ambush');

export function pieceOf(setup: BattleSetupDraft, ref: PieceRef): SetupUnit | SetupEngine | undefined {
  return ref.kind === 'unit'
    ? setup.units.find((u) => u.id === ref.id)
    : setup.emplacements.find((e) => e.id === ref.id);
}

// A unit and its own army's engine may share a square; no other two pieces do.
function occupied(setup: BattleSetupDraft, side: Side, kind: PieceRef['kind'], exclude: PieceRef | null): Set<string> {
  const out = new Set<string>();
  for (const u of setup.units) {
    if (u.square && u.id !== exclude?.id && (kind === 'unit' || u.side !== side)) out.add(u.square);
  }
  for (const e of setup.emplacements) {
    if (e.square && e.id !== exclude?.id && (kind === 'engine' || e.side !== side)) out.add(e.square);
  }
  return out;
}

/** The emplacement a unit stands on, which it works and may haul. */
export function engineUnder(setup: BattleSetupDraft, unit: SetupUnit): SetupEngine | undefined {
  return unit.square === null ? undefined
    : setup.emplacements.find((e) => e.side === unit.side && e.square === unit.square);
}

export const canHaul = (engine: SetupEngine): boolean => {
  const card = ENGINES.find((e) => e.name === engine.name);
  return !!card && !isFixedEngine(card);
};

/** The open deploy squares for one side. Excluding a piece lets its own square count as a
 * destination, which moving a placed token needs. */
export function deployableCells(
  setup: BattleSetupDraft, side: Side, ambush: boolean, exclude: PieceRef | null = null,
  kind: PieceRef['kind'] = exclude?.kind ?? 'unit',
): string[] {
  const board = setup.board;
  if (!board) return [];
  const taken = occupied(setup, side, kind, exclude);
  const out: string[] = [];
  for (const sq of gridOf(board).cells()) {
    const n = notation(sq);
    if (canDeploy(board, side, ambush, sq) && !taken.has(n)) out.push(n);
  }
  return out;
}

/** Where one piece may stand, on its own side's ranks and under its own ambush rule. */
export function cellsFor(setup: BattleSetupDraft, ref: PieceRef): string[] {
  const piece = pieceOf(setup, ref);
  if (!piece) return [];
  return deployableCells(setup, piece.side, ref.kind === 'unit' && isAmbush(piece as SetupUnit), ref);
}

/** Where the Place button puts a piece: nearest its own edge, then nearest the centre file. */
export function autoCell(setup: BattleSetupDraft, ref: PieceRef): string | null {
  const piece = pieceOf(setup, ref);
  const board = setup.board;
  if (!piece || !board) return null;
  // The Place button never stacks a unit on an engine; that is the player's own choice.
  const held = new Set([...setup.units, ...setup.emplacements].map((p) => p.square));
  const open = cellsFor(setup, ref).filter((n) => !held.has(n)).map(parse);
  if (!open.length) return null;
  const size = board.squares.length;
  const home = (c: Square) => (piece.side === 'attacker' ? c.rank : size - 1 - c.rank);
  open.sort((a, b) => home(a) - home(b) || Math.abs(a.file - (size - 1) / 2) - Math.abs(b.file - (size - 1) / 2));
  return notation(open[0]);
}

/**
 * Deployment validation for a later day. The survivors redeploy on the coming field, which the
 * engine's `deploymentCells` rules over; `complete` demands a cell for every survivor of the
 * side, which starting the day needs and a submission still being built does not.
 */
export function deploymentProblem(
  field: BattleState, side: Side, positions: Record<string, string> | undefined, complete = false,
): string | null {
  if (!positions) return `the ${side} has not chosen a deployment`;
  const survivors = field.units.filter((u) => u.side === side && isSurvivor(u));
  const taken = new Set<string>();
  for (const [unitId, cell] of Object.entries(positions)) {
    const u = survivors.find((s) => s.id === unitId);
    if (!u) return `${unitId} does not deploy for the ${side}`;
    if (!deploymentCells(field, u).includes(cell)) return `${u.name} cannot deploy on ${cell}`;
    if (taken.has(cell)) return `${cell} is taken twice`;
    taken.add(cell);
  }
  if (complete && survivors.some((u) => !positions[u.id])) return `every standing ${side} unit needs a deployment cell`;
  return null;
}

/** The setup as it stands on a freshly painted board: a piece whose square turned to water is
 * off the board again. Painting only ever adds water or leaves a square as it was, so a stroke
 * never needs `canDeploy`'s rank and ambush rules, only the one terrain it can newly forbid. */
export function clearWaterPlacements(board: Board, setup: BattleSetupDraft): BattleSetupDraft {
  const onWater = (square: string | null): boolean => {
    if (!square) return false;
    const sq = parse(square);
    return board.squares[sq.rank][sq.file].terrain === 'water';
  };
  return settleHauling({
    ...setup,
    board,
    units: setup.units.map((u) => (onWater(u.square) ? { ...u, square: null } : u)),
    emplacements: setup.emplacements.map((e) => (onWater(e.square) ? { ...e, square: null } : e)),
  });
}

/** One side is ready when it has a unit and everything it owns stands on a square. */
export function sideReady(setup: BattleSetupDraft, side: Side): boolean {
  const us = setup.units.filter((u) => u.side === side);
  return us.length > 0 && us.every((u) => u.square !== null)
    && setup.emplacements.filter((e) => e.side === side).every((e) => e.square !== null);
}

/** Hauling lasts only while a unit of the engine's army stands on it. */
function settleHauling(setup: BattleSetupDraft): BattleSetupDraft {
  const crewed = (e: SetupEngine) => e.square !== null && setup.units.some((u) => u.side === e.side && u.square === e.square);
  if (setup.emplacements.every((e) => !e.hauled || crewed(e))) return setup;
  return { ...setup, emplacements: setup.emplacements.map((e) => (e.hauled && !crewed(e) ? { ...e, hauled: false } : e)) };
}

const withSetup = (session: BattleSession, setup: BattleSetupDraft): BattleSession =>
  ({ ...session, setup: settleHauling(setup) });

function engineCard(name: string) {
  const card = ENGINES.find((e) => e.name === name);
  if (!card) throw new Error(`${name} is not an engine`);
  return card;
}

function unitOf(setup: BattleSetupDraft, unitId: string): SetupUnit {
  const unit = setup.units.find((u) => u.id === unitId);
  if (!unit) throw new Error(`${unitId} is not a unit in this force`);
  return unit;
}

function standing(session: BattleSession, ref: PieceRef, square: string | null): BattleSession {
  if (!pieceOf(session.setup, ref)) throw new Error(`${ref.id} is not a piece in this force`);
  const setup = session.setup;
  return withSetup(session, ref.kind === 'unit'
    ? { ...setup, units: setup.units.map((u) => (u.id === ref.id ? { ...u, square } : u)) }
    : { ...setup, emplacements: setup.emplacements.map((e) => (e.id === ref.id ? { ...e, square } : e)) });
}

/** A siege force is worth building against walls; the board says how strong they are. */
const wallsTier = (board: Board | null): number =>
  Math.max(-1, ...Object.values(board?.walls ?? {}).map((w) => w.tier)) + 1;

export function createArmyPreparationService(): ArmyPreparationService {
  return {
    addUnit: (session, side, card) => withSetup(session, {
      ...session.setup,
      units: [...session.setup.units,
        { id: newUnitId(), card: structuredClone(card), side, square: null, engines: [] }],
    }),

    removeUnit: (session, unitId) => {
      unitOf(session.setup, unitId);
      return withSetup(session, { ...session.setup, units: session.setup.units.filter((u) => u.id !== unitId) });
    },

    addEmplacement: (session, side, engine) => withSetup(session, {
      ...session.setup,
      emplacements: [...session.setup.emplacements,
        { id: newEquipmentId(), name: engineCard(engine).name, side, square: null }],
    }),

    removeEmplacement: (session, emplacementId) => {
      if (!session.setup.emplacements.some((e) => e.id === emplacementId)) {
        throw new Error(`${emplacementId} is not an emplacement in this force`);
      }
      return withSetup(session, {
        ...session.setup,
        emplacements: session.setup.emplacements.filter((e) => e.id !== emplacementId),
      });
    },

    setHauling: (session, emplacementId, hauling) => {
      const setup = session.setup;
      const engine = setup.emplacements.find((e) => e.id === emplacementId);
      if (!engine) throw new Error(`${emplacementId} is not an emplacement in this force`);
      if (hauling && !canHaul(engine)) throw new Error(`${engine.name} is fixed in place`);
      if (hauling && !setup.units.some((u) => u.side === engine.side && u.square !== null && u.square === engine.square)) {
        throw new Error(`no unit stands on ${engine.name} to haul it`);
      }
      return withSetup(session, {
        ...setup, emplacements: setup.emplacements.map((e) => (e === engine ? { ...e, hauled: hauling } : e)),
      });
    },

    place: (session, piece, square) => {
      if (!cellsFor(session.setup, piece).includes(square)) throw new Error(`nothing deploys on ${square}`);
      return standing(session, piece, square);
    },

    unplace: (session, piece) => standing(session, piece, null),

    autoPlace: (session, piece) => {
      const cell = autoCell(session.setup, piece);
      if (!cell) throw new Error('no square is open for it');
      return standing(session, piece, cell);
    },

    generateForce: (session, side, seed = randomSeed()) => {
      const setup = session.setup;
      const other: Side = side === 'attacker' ? 'defender' : 'attacker';
      const opponent = setup.units.filter((u) => u.side === other).map((u) => u.card);
      const force = buildForce(opponent, seededRandom(seed), {
        attacking: side === 'attacker', wallsTier: wallsTier(setup.board),
      });
      return withSetup(session, {
        ...setup,
        units: [
          ...setup.units.filter((u) => u.side !== side),
          // Engines deploy in the siege step, so a generated force brings units alone.
          ...force.map(({ card }) => ({
            id: newUnitId(), card: structuredClone(card), side, square: null, engines: [],
          })),
        ],
      });
    },

    declareReady: (session, side, ready, userId) => {
      // proto: the wording a refusal shows is reserved for review with the rest of the
      // player-facing text.
      if (ready && !sideReady(session.setup, side)) throw new Error(`the ${side} has a piece still off the board`);
      return submitTo(session, 'army.readiness', side, ready, userId);
    },
  };
}

import {
  canDeploy, generateBoard, parse, type Board, type BoardSpec,
} from '../engine/index.js';
import type { PaintBrush, PaintStroke } from '../runtime/commands.js';
import type { BattleSession } from '../runtime/session.js';
import { randomSeed, type BattleSetupDraft } from '../runtime/session.js';

export interface MapPreparationService {
  generate(session: BattleSession): BattleSession;
  rerollSeed(session: BattleSession): BattleSession;
  editSpec(session: BattleSession, spec: Partial<BoardSpec>): BattleSession;
  setRoundsPerDay(session: BattleSession, roundsPerDay: number): BattleSession;
  paint(session: BattleSession, stroke: PaintStroke): BattleSession;
}

function paintCell(board: Board, key: string, brush: PaintBrush): void {
  const sq = parse(key);
  const square = board.squares[sq.rank][sq.file];
  if (brush.kind === 'terrain') {
    square.terrain = brush.terrain;
    if (brush.terrain === 'water') square.elevation = 0;
  } else if (brush.kind === 'elevation') {
    square.elevation = brush.level;
  } else if (brush.kind === 'erase') {
    square.terrain = 'open';
    square.elevation = 0;
  }
}

function paintEdge(board: Board, key: string, brush: PaintBrush): void {
  if (brush.kind === 'wall') board.walls[key] = { tier: brush.tier, boxes: brush.tier + 1, remaining: brush.tier + 1 };
  else if (brush.kind === 'wall-clear' || brush.kind === 'erase') delete board.walls[key];
}

function applyStroke(board: Board, stroke: PaintStroke): Board {
  const next = structuredClone(board);
  for (const key of stroke.cells) paintCell(next, key, stroke.brush);
  for (const key of stroke.edges) paintEdge(next, key, stroke.brush);
  return next;
}

/** A piece stays where it stands unless the board under it no longer holds it. */
function clearUndeployable(board: Board, setup: BattleSetupDraft): BattleSetupDraft {
  return {
    ...setup,
    board,
    units: setup.units.map((u) => (u.square && !canDeploy(board, u.side, u.card.tactics?.includes('ambush') ?? false, parse(u.square))
      ? { ...u, square: null } : u)),
    emplacements: setup.emplacements.map((e) => (e.square && !canDeploy(board, e.side, false, parse(e.square))
      ? { ...e, square: null } : e)),
  };
}

/** Painting only ever turns a square to water or leaves it as it was; a stroke never needs
 * `canDeploy`'s rank and ambush rules, only the one terrain it can newly forbid. */
function clearWaterPlacements(board: Board, setup: BattleSetupDraft): BattleSetupDraft {
  const onWater = (square: string | null): boolean => {
    if (!square) return false;
    const sq = parse(square);
    return board.squares[sq.rank][sq.file].terrain === 'water';
  };
  return {
    ...setup,
    board,
    units: setup.units.map((u) => (onWater(u.square) ? { ...u, square: null } : u)),
    emplacements: setup.emplacements.map((e) => (onWater(e.square) ? { ...e, square: null } : e)),
  };
}

function generateFrom(setup: BattleSetupDraft): BattleSetupDraft {
  return clearUndeployable(generateBoard(setup.spec), setup);
}

const withSetup = (session: BattleSession, setup: BattleSetupDraft): BattleSession => ({ ...session, setup });

export function createMapPreparationService(): MapPreparationService {
  return {
    generate: (session) => withSetup(session, generateFrom(session.setup)),

    rerollSeed: (session) => withSetup(session, generateFrom({
      ...session.setup, spec: { ...session.setup.spec, seed: randomSeed() },
    })),

    editSpec: (session, spec) => withSetup(session, { ...session.setup, spec: { ...session.setup.spec, ...spec } }),

    setRoundsPerDay: (session, roundsPerDay) => withSetup(session, { ...session.setup, roundsPerDay }),

    paint: (session, stroke) => {
      const board = session.setup.board;
      if (!board) throw new Error('no board to paint');
      return withSetup(session, clearWaterPlacements(applyStroke(board, stroke), session.setup));
    },
  };
}

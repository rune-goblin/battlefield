import {
  BRIDGE_AXES, wallsFor, canDeploy, canEmplace, generateBoard, parse, makeWall, type Board, type BoardSpec,
} from '../engine/index.js';
import type { PaintBrush, PaintStroke } from '../runtime/commands.js';
import type { BattleSession } from '../runtime/session.js';
import { randomSeed, type BattleSetupDraft } from '../runtime/session.js';

export interface MapPreparationService {
  generate(session: BattleSession): BattleSession;
  rerollSeed(session: BattleSession): BattleSession;
  editSpec(session: BattleSession, spec: Partial<BoardSpec>): BattleSession;
  setRoundsPerDay(session: BattleSession, roundsPerDay: number): BattleSession;
}

function paintCell(board: Board, key: string, brush: PaintBrush): void {
  const sq = parse(key);
  const square = board.squares[sq.rank][sq.file];
  if (brush.kind === 'terrain') {
    // A bridge brush on a cell that is already a bridge turns the deck rather than repainting
    // it, the way a second gate stroke turns the gate.
    if (brush.terrain === 'bridge' && square.terrain === 'bridge') {
      square.bridgeTurns = ((square.bridgeTurns ?? 0) + 1) % BRIDGE_AXES[board.grid];
      return;
    }
    square.terrain = brush.terrain;
    delete square.bridgeTurns;
  } else if (brush.kind === 'elevation') {
    square.elevation = brush.level;
  } else if (brush.kind === 'erase') {
    square.terrain = 'open';
    square.elevation = 0;
    delete square.bridgeTurns;
  }
}

function paintEdge(board: Board, key: string, brush: PaintBrush): void {
  const ends = key.split('|').sort((a, b) => parse(b).rank - parse(a).rank || parse(b).file - parse(a).file);
  if (brush.kind === 'wall') board.walls[key] = makeWall(brush.tier, ends[0]);
  else if (brush.kind === 'gate') {
    const w = board.walls[key];
    if (!w) return;
    const inside = wallsFor(board).insideOf(key) ?? ends[0];
    const reversed = ends.find((id) => id !== inside)!;
    // A starts on the inferred interior. Explicit facing preserves B even on a closed fort.
    // Open A → closed A → open B → closed B → plain wall, then repeat.
    if (!w.gate) {
      w.inside = inside;
      w.gate = { open: true, flipped: false, facing: inside };
    } else if (w.gate.open) {
      w.inside = inside;
      w.gate = { ...w.gate, open: false, facing: inside };
    } else if (!w.gate.flipped) {
      w.inside = reversed;
      w.gate = { open: true, flipped: true, facing: reversed };
    } else {
      w.inside = reversed;
      delete w.gate;
    }
  }
  else if (brush.kind === 'wall-clear' || brush.kind === 'erase') delete board.walls[key];
}

/** The terrain half of a stroke. `BattleManager` joins it to the placement cleanup, so the
 * board and the pieces standing on it move in one commit. */
export function applyStroke(board: Board, stroke: PaintStroke): Board {
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
    emplacements: setup.emplacements.map((e) => (e.square && !canEmplace(board, parse(e.square))
      ? { ...e, square: null } : e)),
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
  };
}

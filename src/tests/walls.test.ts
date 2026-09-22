import { describe, expect, it } from 'vitest';
import { act, scriptedRng, statusesGained, createBattle, defenceOf, edgeKey, fortification, gateReason, garrisoned, gridOf, makeWall, notation, parse, statusesOf, wallsFor,
  type Board, type GridKind, type UnitCard } from '../engine/index.js';
import { generateBoard } from '../engine/board.js';
import { applyStroke } from '../services/MapPreparationService.js';
import { openBoard } from './helpers.js';

function enclose(board: Board, cells: string[], tier = 3) {
  const inside = new Set(cells), grid = gridOf(board);
  for (const id of cells) for (const n of grid.neighbours(parse(id))) {
    if (!inside.has(notation(n))) board.walls[edgeKey(parse(id), n)] = makeWall(tier, notation(n)); // Deliberately reversed facing.
  }
}
const courtyard = ['d4', 'e4', 'f4', 'd5', 'e5', 'f5', 'd6', 'e6', 'f6'];
const card: UnitCard = { name: 'Line', level: 5, role: 'infantry', salvo: 'long', tactics: [] };
function battle(board = openBoard()) {
  return createBattle({ board, units: [{ card, side: 'attacker', square: 'c2' }, { card, side: 'defender', square: 'c7' }] });
}

describe('walls service', () => {
  it.each(['square', 'hex'] as GridKind[])('finds a multi-hex interior and infers facing on %s grids', kind => {
    const board = openBoard(kind), grid = gridOf(board), center = parse('e5');
    const cells = [center, ...grid.neighbours(center)].map(notation);
    enclose(board, cells);
    const walls = wallsFor(board);
    expect(walls.regions).toHaveLength(1);
    expect([...walls.regions[0].cells].sort()).toEqual(cells.sort());
    expect(walls.fortifiedAt(center)).toMatchObject({ label: 'Fortified · Stone', cover: 3 });
    expect(walls.fortifiedAt(parse('a5'))).toBeNull();
    for (const key of Object.keys(board.walls)) expect(cells).toContain(walls.insideOf(key));
    expect(walls.coverBetween(parse('a5'), center)).toBe(3);
  });

  it('preserves the footprint through open gates and breaches, but removes cover through the opening', () => {
    const board = openBoard(); enclose(board, courtyard, 4);
    const key = 'e3|e4'; board.walls[key].gate = { open: false };
    const walls = wallsFor(board);
    expect(walls.coverBetween(parse('e2'), parse('e5'))).toBe(4);
    board.walls[key].gate!.open = true;
    expect(wallsFor(board)).toBe(walls);
    expect(walls.fortifiedAt(parse('e5'))).not.toBeNull();
    expect(walls.coverBetween(parse('e2'), parse('e5'))).toBe(0);
    board.walls[key].gate!.open = false; board.walls[key].remaining = 0;
    expect(walls.coverBetween(parse('e2'), parse('e5'))).toBe(0);
    expect(walls.coverBetween(parse('b5'), parse('e5'))).toBe(4);
    delete board.walls[key];
    expect(wallsFor(board).fortifiedAt(parse('e5'))).toBeNull();
  });

  it('uses the actual crossed segment for a mixed perimeter and never stacks nested walls', () => {
    const board = openBoard(); enclose(board, courtyard, 4);
    board.walls['e3|e4'] = makeWall(1);
    const walls = wallsFor(board);
    expect(walls.fortifiedAt(parse('e5'))).toMatchObject({ label: 'Fortified · Mixed walls', cover: 1, maxCover: 4 });
    expect(walls.coverBetween(parse('e2'), parse('e5'))).toBe(1);
    expect(walls.coverBetween(parse('b5'), parse('e5'))).toBe(4);
    enclose(board, ['e5'], 2);
    const nested = wallsFor(board);
    expect(nested.fortifiedAt(parse('e5'))!.regions).toHaveLength(2);
    expect(nested.coverBetween(parse('b5'), parse('e5'))).toBe(4);
    expect(nested.coverBetween(parse('e4'), parse('e5'))).toBe(2);
    expect(nested.coverBetween(parse('e5'), parse('f5'))).toBe(0);
    expect(nested.insideOf('e4|e5')).toBe('e5');
  });

  it('keeps concave courtyards and separate forts distinct', () => {
    const board = openBoard();
    enclose(board, ['c3', 'd3', 'c4'], 2);
    enclose(board, ['g6'], 4);
    const walls = wallsFor(board);
    expect(walls.regions).toHaveLength(2);
    expect(walls.fortifiedAt(parse('c3'))).toMatchObject({ cover: 2 });
    expect(walls.fortifiedAt(parse('d4'))).toBeNull();
    expect(walls.fortifiedAt(parse('g6'))).toMatchObject({ cover: 4 });
    expect(walls.coverBetween(parse('e6'), parse('g6'))).toBe(4);
    expect(walls.coverBetween(parse('c3'), parse('c4'))).toBe(0);
  });

  it('retains local protection for open runs without inventing an enclosure', () => {
    const board = openBoard(); board.walls['e3|e4'] = makeWall(2, 'e4');
    const walls = wallsFor(board);
    expect(walls.fortifiedAt(parse('e4'))).toBeNull();
    expect(walls.coverBetween(parse('e2'), parse('e4'))).toBe(2);
    expect(walls.coverBetween(parse('e5'), parse('e4'))).toBe(0);
  });

  it('supports explicit generated courtyards at the map edge and older generated maps', () => {
    const board = generateBoard({ base: 'plains', seed: 7, construction: { kind: 'fort', tier: 4 } });
    for (const id of board.fortInterior!) expect(wallsFor(board).fortifiedAt(parse(id))).not.toBeNull();
    const old = structuredClone(board); delete old.fortInterior;
    for (const id of board.fortInterior!) expect(wallsFor(old).fortifiedAt(parse(id))).not.toBeNull();
    board.walls = {};
    expect(wallsFor(board).fortifiedAt(parse(board.fortInterior![0]))).toBeNull();
  });

  it('ignores terrain and units when detecting enclosures and shares layout across clones', () => {
    const board = openBoard();
    for (const row of board.squares) for (const c of row) { c.terrain = 'water'; c.elevation = 2; }
    expect(wallsFor(board).fortifiedAt(parse('e5'))).toBeNull();
    enclose(board, courtyard);
    const original = wallsFor(board), copy = wallsFor(structuredClone(board));
    expect(copy.regions).toBe(original.regions);
    board.walls['e3|e4'].tier = 4;
    expect(wallsFor(board)).toBe(original);
    expect(original.coverBetween(parse('e2'), parse('e5'))).toBe(4);
  });
});

describe('Fortified condition and combat', () => {
  it('follows position and loads without a saved condition on the unit', () => {
    const state = battle(); enclose(state.board, courtyard);
    const u = state.units[0];
    expect(statusesOf(u, state.board)).not.toContain('fortified');
    u.square = parse('e5');
    expect(statusesOf(u, state.board)).toContain('fortified');
    const saved = JSON.parse(JSON.stringify(state));
    expect(statusesOf(saved.units[0], saved.board)).toContain('fortified');
    u.square = parse('c3');
    expect(statusesOf(u, state.board)).not.toContain('fortified');
  });

  it('gains the condition through an open gate and loses it when the unit moves out', () => {
    const state = battle(); enclose(state.board, courtyard);
    state.units[0].square = parse('e3');
    state.board.walls['e3|e4'].gate = { open: true };
    const entered = act(state, { type: 'move', unit: 'u0', to: 'e4' }, scriptedRng([]));
    expect(statusesGained(state.units[0], entered.units[0], state.board, entered.board)).toContain('fortified');
    expect(statusesOf(entered.units[0], entered.board)).toContain('fortified');
    const left = act(entered, { type: 'move', unit: 'u0', to: 'e3' }, scriptedRng([]));
    expect(statusesOf(left.units[0], left.board)).not.toContain('fortified');
  });

  it('applies +4 cover once, bypasses it from inside or at high angle, and leaves hardness at 2', () => {
    const state = battle(); enclose(state.board, courtyard, 4);
    const [a, d] = state.units; a.square = parse('e2'); d.square = parse('e5');
    const base = defenceOf(state, d, a, false);
    expect(defenceOf(state, d, a, true)).toBe(base + 4);
    expect(defenceOf(state, d, a, true, true)).toBe(base);
    d.guard = { defence: 2, cap: false, holds: false };
    expect(defenceOf(state, d, a, true)).toBe(base + 4);
    d.guard = null; a.square = parse('e4');
    expect(defenceOf(state, d, a, true)).toBe(base);
    expect(fortification(4).hardness).toBe(2);
  });

  it('preserves both painted gate facings inside a closed fort and when battle begins', () => {
    let board = openBoard(); enclose(board, courtyard);
    const key = 'e3|e4';
    for (const [inside, open] of [['e4', true], ['e4', false], ['e3', true], ['e3', false]] as const) {
      board = applyStroke(board, { cells: [], edges: [key], brush: { kind: 'gate' } });
      expect(wallsFor(board).insideOf(key)).toBe(inside);
      expect(board.walls[key].gate!.open).toBe(open);
      const state = battle(JSON.parse(JSON.stringify(board)));
      expect(wallsFor(state.board).insideOf(key)).toBe(inside);
      expect(state.board.walls[key].gate!.open).toBe(open);
      state.units[0].square = parse(inside);
      expect(gateReason(state, state.units[0], key)).toBeNull();
      expect(wallsFor(state.board).fortifiedAt(parse('e5'))).not.toBeNull();
    }
    board = applyStroke(board, { cells: [], edges: [key], brush: { kind: 'gate' } });
    expect(board.walls[key].gate).toBeUndefined();
    expect(wallsFor(board).insideOf(key)).toBe('e4');
  });

  it('uses inferred gate interiors and grants a wall firing position only outward', () => {
    const state = battle(); enclose(state.board, courtyard);
    const [a, d] = state.units; d.square = parse('e4'); a.square = parse('e2');
    state.pending = 'defender';
    state.board.walls['e3|e4'].gate = { open: false };
    expect(gateReason(state, d, 'e3|e4')).toBeNull();
    expect(garrisoned(state, d, a)).toBe(true);
    a.square = parse('e5');
    expect(garrisoned(state, d, a)).toBe(false);
    expect(garrisoned(state, a)).toBe(false);
  });
});

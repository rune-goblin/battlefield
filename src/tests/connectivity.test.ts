import { describe, expect, it } from 'vitest';
import { at, edgeKey, generateBoard, gridOf, hasGroundConnection, parse, reachable, stepFeet } from '../engine/index.js';
import { terrainGroup } from '../board/terrain-textures.js';
import { openBoard } from './helpers.js';

describe('river connectivity and bridges', () => {
  it.each([23, 48])('detects the disconnected generated river at seed %i', seed => {
    expect(hasGroundConnection(generateBoard({base:'plains',feature:'river',size:9,seed}))).toBe(false);
  });

  it.each(['hex', 'square'] as const)('a bridge or shallows reconnects a %s river', kind => {
    const board = openBoard(kind); board.spec.feature = 'river';
    for (const cell of gridOf(board).cells().filter(c => c.rank === 4)) at(board, cell).terrain = 'water';
    expect(hasGroundConnection(board)).toBe(false);
    at(board, parse('e5')).terrain = 'bridge';
    expect(hasGroundConnection(board)).toBe(true);
    expect(JSON.parse(JSON.stringify(board)).squares[4][4].terrain).toBe('bridge');
    expect(terrainGroup(board, parse('e5'))).toBe('water');
    at(board, parse('e5')).terrain = 'shallows';
    expect(hasGroundConnection(board)).toBe(true);
  });

  it('requires a complete crossing across a wide river and respects walls and cliffs', () => {
    const board = openBoard(); board.spec.feature = 'river';
    for (const cell of gridOf(board).cells().filter(c => c.rank === 3 || c.rank === 4)) at(board, cell).terrain = 'water';
    at(board, parse('e4')).terrain = 'bridge';
    expect(hasGroundConnection(board)).toBe(false);
    at(board, parse('e5')).terrain = 'bridge';
    expect(hasGroundConnection(board)).toBe(true);
    const key = edgeKey(parse('e4'), parse('e5'));
    board.walls[key] = {tier:1,boxes:2,remaining:2};
    expect(hasGroundConnection(board)).toBe(false);
    delete board.walls[key]; at(board, parse('e5')).elevation = 2;
    expect(hasGroundConnection(board)).toBe(false);
  });

  it('prices bridges as open ground and retains terrain and barrier validation', () => {
    const board = openBoard(); const from = parse('c2'), to = parse('d2');
    at(board, to).terrain = 'bridge';
    expect(stepFeet(board, from, to)).toBe(10);
    expect(reachable(board, from, {budget:10}).has('d2')).toBe(true);
    at(board, to).elevation = 1;
    expect(stepFeet(board, from, to)).toBe(20);
    expect(reachable(board, from, {budget:10}).has('d2')).toBe(false);
    board.walls[edgeKey(from, to)] = {tier:1,boxes:2,remaining:2};
    expect(stepFeet(board, from, to)).toBe(Infinity);
  });
});

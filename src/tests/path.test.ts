import { describe, expect, it } from 'vitest';
import { edgeKey, parse } from '../engine/board.js';
import { CELL_FEET, feetTo, pathTo, reachable, stepFeet } from '../engine/path.js';
import { openBoard } from './helpers.js';

const from = parse('c2');
const walk = (board = openBoard('hex'), budget = 100, flying = false) =>
  reachable(board, from, { budget, flying });

describe('terrain costs in feet', () => {
  it('charges two squares\u2019 worth for difficult ground, three for very difficult', () => {
    const board = openBoard('hex');
    board.squares[2][2].terrain = 'forest';
    board.squares[1][3].terrain = 'swamp';
    board.squares[1][1].terrain = 'settlement';
    board.squares[0][2].elevation = 1;
    const r = walk(board, CELL_FEET * 3);
    expect(feetTo(r, 'c3')).toBe(20);
    expect(feetTo(r, 'd2')).toBe(30);
    expect(feetTo(r, 'b2')).toBe(10);
    expect(feetTo(r, 'c1')).toBe(20);
  });

  it('routes around slow ground on hex without ever using a diagonal', () => {
    const board = openBoard('hex');
    board.squares[2][2].terrain = 'swamp';
    const r = walk(board);
    expect(feetTo(r, 'c4')).toBe(20);
    expect(pathTo(r, 'c4')).toEqual(['c2', 'd3', 'c4']);
  });
});

describe('blocked edges', () => {
  const walled = () => {
    const board = openBoard('hex');
    board.squares[2][2].terrain = 'water';
    board.walls[edgeKey(parse('c2'), parse('d2'))] = { tier: 1, boxes: 2, remaining: 2 };
    board.squares[1][1].elevation = 2;
    return board;
  };

  it('will not enter water, cross a standing wall, or climb a cliff', () => {
    const board = walled();
    expect(stepFeet(board, from, parse('c3'))).toBe(Infinity);
    expect(stepFeet(board, from, parse('d2'))).toBe(Infinity);
    expect(stepFeet(board, from, parse('b2'))).toBe(Infinity);
    const r = walk(board, CELL_FEET);
    expect([...r.keys()].sort()).toEqual(['c1', 'c2', 'd1', 'd3']);
  });

  it('takes a breached wall as a crossing', () => {
    const board = walled();
    board.walls[edgeKey(parse('c2'), parse('d2'))].remaining = 0;
    expect(stepFeet(board, from, parse('d2'))).toBe(10);
  });

  it('lets a flier over all three for the price of open ground', () => {
    const board = walled();
    const r = walk(board, CELL_FEET, true);
    for (const cell of ['b2', 'c3', 'd2']) expect(feetTo(r, cell)).toBe(10);
  });
});

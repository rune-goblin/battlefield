import { describe, expect, it } from 'vitest';
import { at, barrierBetween, count, generateBoard, gridOf, NEUTRAL_RANKS, parse, SIZE, wallBudget, type Board } from '../engine/board.js';
import { hasGroundConnection } from '../engine/connectivity.js';
import { liesLow } from '../engine/terrain.js';

const cells = (b: Board) => gridOf(b).cells();

const seeds = Array.from({ length: 30 }, (_, i) => i * 7 + 1);

function every(boards: Board[], check: (b: Board) => boolean): boolean { return boards.every(check); }

describe('generateBoard', () => {
  it('is deterministic for a seed', () => {
    const a = generateBoard({ base: 'forest', feature: 'river', seed: 42 });
    const b = generateBoard({ base: 'forest', feature: 'river', seed: 42 });
    expect(b).toEqual(a);
  });

  it('plains carry few trees and marsh', () => {
    const boards = seeds.map(seed => generateBoard({ base: 'plains', seed }));
    expect(every(boards, b => count(b, 'forest') <= 9 && count(b, 'swamp') <= 3 && count(b, 'water') <= 2)).toBe(true);
  });

  it('forest boards run from a quarter to two thirds wooded', () => {
    const boards = seeds.map(seed => generateBoard({ base: 'forest', seed }));
    expect(every(boards, b => count(b, 'forest') >= 22 && count(b, 'forest') <= 60)).toBe(true);
  });

  it('hills raise a quarter of the board or more, off the home ranks, with no cliff', () => {
    const boards = seeds.map(seed => generateBoard({ base: 'hills', seed }));
    expect(every(boards, b => cells(b).filter(sq => at(b, sq).elevation > 0).length >= 22)).toBe(true);
    expect(every(boards, b => cells(b).every(sq => at(b, sq).elevation === 0 || (sq.rank >= 2 && sq.rank <= SIZE - 3)))).toBe(true);
    expect(every(boards, b => cells(b).every(sq => gridOf(b).neighbours(sq).every(n => barrierBetween(b, sq, n)?.kind !== 'cliff')))).toBe(true);
  });

  it('lays swamp and shallows at level 0 or below, and water at level 0', () => {
    for (const base of ['hills', 'mountains', 'swamp'] as const) for (const feature of ['none', 'river', 'lakeside'] as const) {
      const boards = seeds.map(seed => generateBoard({ base, feature, seed }));
      expect(every(boards, b => cells(b).every(sq => !liesLow(at(b, sq).terrain) || at(b, sq).elevation <= 0))).toBe(true);
      expect(every(boards, b => cells(b).every(sq => at(b, sq).terrain !== 'water' || at(b, sq).elevation === 0))).toBe(true);
    }
  });

  it('sinks hollows on a swamp board and keeps them clear of cliffs', () => {
    const boards = seeds.map(seed => generateBoard({ base: 'swamp', seed }));
    expect(every(boards, b => cells(b).filter(sq => at(b, sq).elevation < 0).length >= 5)).toBe(true);
    expect(every(boards, b => cells(b).every(sq => gridOf(b).neighbours(sq).every(n => barrierBetween(b, sq, n)?.kind !== 'cliff')))).toBe(true);
  });

  it('rarely lays swamp and rough ground on one board', () => {
    const boards = Array.from({ length: 200 }, (_, i) => generateBoard({ base: 'hills', seed: i + 1 }));
    expect(boards.filter(b => count(b, 'swamp') && count(b, 'rough')).length).toBeLessThanOrEqual(20);
  });

  it('cliffs never seal one deployment zone from the other', () => {
    const boards = seeds.map(seed => generateBoard({ base: 'mountains', feature: 'lakeside', seed }));
    expect(every(boards, hasGroundConnection)).toBe(true);
  });

  it('mountains have a peak that makes a cliff', () => {
    const boards = seeds.map(seed => generateBoard({ base: 'mountains', seed }));
    expect(boards.some(b => cells(b).some(sq => at(b, sq).elevation === 2))).toBe(true);
    const foot = (b: Board, sq: { file: number; rank: number }) => gridOf(b).neighbours(sq).find(n => at(b, n).elevation === 0);
    const b = boards.find(b => cells(b).some(sq => at(b, sq).elevation === 2 && foot(b, sq)))!;
    const peak = cells(b).find(sq => at(b, sq).elevation === 2 && foot(b, sq))!;
    const low = foot(b, peak);
    expect(low && barrierBetween(b, peak, low)).toEqual({ kind: 'cliff' });
  });

  it('a river crosses every file and leaves one or two shallows', () => {
    const boards = seeds.map(seed => generateBoard({ base: 'plains', feature: 'river', seed }));
    for (const b of boards) {
      for (let file = 0; file < SIZE; file++) {
        const crossed = cells(b).some(sq => sq.file === file && ['water', 'shallows'].includes(at(b, sq).terrain));
        expect(crossed).toBe(true);
      }
      expect(count(b, 'shallows')).toBeGreaterThanOrEqual(1);
      expect(count(b, 'shallows')).toBeLessThanOrEqual(2);
      expect(cells(b).every(sq => at(b, sq).terrain !== 'water' || NEUTRAL_RANKS.includes(sq.rank))).toBe(true);
    }
  });

  it('a lakeside puts a block of water against one flank', () => {
    const boards = seeds.map(seed => generateBoard({ base: 'plains', feature: 'lakeside', seed }));
    expect(every(boards, b => count(b, 'water') >= 8)).toBe(true);
    expect(every(boards, b => cells(b).some(sq => {
      const files = cells(b).filter(c => c.rank === sq.rank).map(c => c.file);
      return (sq.file === Math.min(...files) || sq.file === Math.max(...files)) && at(b, sq).terrain === 'water';
    }))).toBe(true);
  });

  it('a fort spends its wall budget on a block against the defender edge', () => {
    for (const tier of [0, 1, 2, 3]) {
      const b = generateBoard({ base: 'plains', construction: { kind: 'fort', tier }, seed: 9 });
      expect(Object.keys(b.walls)).toHaveLength(wallBudget(tier));
      expect(Object.values(b.walls).every(w => w.boxes === tier + 1)).toBe(true);
      expect(cells(b).every(sq => at(b, sq).terrain !== 'settlement' || sq.rank >= SIZE - 3)).toBe(true);
    }
  });

  it('a wall is a barrier until breached', () => {
    const b = generateBoard({ base: 'plains', construction: { kind: 'fort', tier: 2 }, seed: 9 });
    const [key] = Object.keys(b.walls);
    const [x, y] = key.split('|').map(parse);
    expect(barrierBetween(b, x, y)?.kind).toBe('wall');
    b.walls[key].remaining = 0;
    expect(barrierBetween(b, x, y)).toBeNull();
  });

  it('keeps the deployment ranks passable', () => {
    for (const base of ['plains', 'forest', 'hills', 'mountains', 'swamp', 'desert'] as const) {
      for (const feature of ['none', 'river', 'lakeside'] as const) {
        const b = generateBoard({ base, feature, construction: { kind: 'fort', tier: 3 }, seed: 5 });
        for (const rank of [0, 1, 2, SIZE - 3, SIZE - 2, SIZE - 1]) {
          const open = cells(b).filter(sq => sq.rank === rank && at(b, sq).terrain !== 'water').length;
          expect(open).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });
});

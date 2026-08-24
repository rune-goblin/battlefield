import { describe, expect, it } from 'vitest';
import { allSquares, at, barrierBetween, count, generateBoard, parse, SIZE, wallBudget, type Board } from '../engine/board.js';

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
    expect(every(boards, b => count(b, 'forest') <= 6 && count(b, 'swamp') <= 3 && count(b, 'water') <= 2)).toBe(true);
  });

  it('forest hexes are mostly trees', () => {
    const boards = seeds.map(seed => generateBoard({ base: 'forest', seed }));
    expect(every(boards, b => count(b, 'forest') >= 30)).toBe(true);
  });

  it('hills raise a ridge across the middle ranks only', () => {
    const boards = seeds.map(seed => generateBoard({ base: 'hills', seed }));
    expect(every(boards, b => allSquares().some(sq => at(b, sq).elevation === 1))).toBe(true);
    expect(every(boards, b => allSquares().every(sq => at(b, sq).elevation === 0 || (sq.rank >= 2 && sq.rank <= 5)))).toBe(true);
    expect(every(boards, b => allSquares().every(sq => at(b, sq).elevation < 2))).toBe(true);
  });

  it('mountains have a peak that makes a cliff', () => {
    const boards = seeds.map(seed => generateBoard({ base: 'mountains', seed }));
    expect(boards.some(b => allSquares().some(sq => at(b, sq).elevation === 2))).toBe(true);
    const b = boards.find(b => allSquares().some(sq => at(b, sq).elevation === 2))!;
    const peak = allSquares().find(sq => at(b, sq).elevation === 2)!;
    const low = [{ file: peak.file, rank: peak.rank + 1 }, { file: peak.file, rank: peak.rank - 1 }, { file: peak.file + 1, rank: peak.rank }, { file: peak.file - 1, rank: peak.rank }]
      .find(sq => sq.rank >= 0 && sq.rank < SIZE && sq.file >= 0 && sq.file < SIZE && at(b, sq).elevation === 0);
    expect(low && barrierBetween(b, peak, low)).toEqual({ kind: 'cliff' });
  });

  it('a river crosses every file and leaves one or two shallows', () => {
    const boards = seeds.map(seed => generateBoard({ base: 'plains', feature: 'river', seed }));
    for (const b of boards) {
      for (let file = 0; file < SIZE; file++) {
        const crossed = allSquares().some(sq => sq.file === file && ['water', 'shallows'].includes(at(b, sq).terrain));
        expect(crossed).toBe(true);
      }
      expect(count(b, 'shallows')).toBeGreaterThanOrEqual(1);
      expect(count(b, 'shallows')).toBeLessThanOrEqual(2);
      expect(allSquares().every(sq => at(b, sq).terrain !== 'water' || (sq.rank >= 3 && sq.rank <= 4))).toBe(true);
    }
  });

  it('a lakeside puts a block of water against a file edge', () => {
    const boards = seeds.map(seed => generateBoard({ base: 'plains', feature: 'lakeside', seed }));
    expect(every(boards, b => count(b, 'water') >= 8)).toBe(true);
    expect(every(boards, b => allSquares().some(sq => (sq.file === 0 || sq.file === SIZE - 1) && at(b, sq).terrain === 'water'))).toBe(true);
  });

  it('a fort spends its wall budget on a block against the defender edge', () => {
    for (const tier of [0, 1, 2, 3]) {
      const b = generateBoard({ base: 'plains', construction: { kind: 'fort', tier }, seed: 9 });
      expect(Object.keys(b.walls)).toHaveLength(wallBudget(tier));
      expect(Object.values(b.walls).every(w => w.boxes === tier + 1)).toBe(true);
      expect(allSquares().every(sq => at(b, sq).terrain !== 'settlement' || sq.rank >= 6)).toBe(true);
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
        for (const rank of [0, 1, 2, 5, 6, 7]) {
          const open = allSquares().filter(sq => sq.rank === rank && at(b, sq).terrain !== 'water').length;
          expect(open).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });
});

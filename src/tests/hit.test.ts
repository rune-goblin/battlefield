import { describe, expect, it } from 'vitest';
import { EDGE_BAND, hitTest, nearestEdge } from '../board/hit.js';
import { hexGrid, squareGrid, type Grid } from '../engine/index.js';

const SIZE = 60;

// The band is the only hit rule with no other home: 0.18 of a cell from the segment, and
// closer to the segment than to the cell centre.
describe.each([['square', squareGrid], ['hex', hexGrid]] as [string, Grid][])('%s edge band', (_kind, grid) => {
  const cell = grid.parse('d4');
  const neighbour = grid.neighbours(cell)[0];
  const [a, b] = grid.edgeSegment(cell, neighbour, SIZE);
  const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const centre = grid.center(cell, SIZE);
  // `depth` is a fraction of a cell, measured from the edge midpoint toward the centre.
  const towardCentre = (depth: number) => {
    const span = Math.hypot(centre.x - midpoint.x, centre.y - midpoint.y);
    const fraction = (depth * SIZE) / span;
    return { x: midpoint.x + (centre.x - midpoint.x) * fraction, y: midpoint.y + (centre.y - midpoint.y) * fraction };
  };

  it('takes the edge just inside the band', () => {
    const point = towardCentre(EDGE_BAND * 0.8);
    expect(nearestEdge(point, cell, grid, SIZE)?.inBand).toBe(true);
    expect(hitTest(point, { grid, size: SIZE, edges: () => true })).toEqual({ kind: 'edge', id: grid.edgeKey(cell, neighbour) });
  });

  it('takes the cell just outside the band', () => {
    const point = towardCentre(EDGE_BAND * 1.6);
    expect(nearestEdge(point, cell, grid, SIZE)?.inBand).toBe(false);
    expect(hitTest(point, { grid, size: SIZE, edges: () => true })).toEqual({ kind: 'cell', id: 'd4' });
  });

  it('takes the cell inside the band when the edge is not one the gesture can pick', () => {
    const point = towardCentre(EDGE_BAND * 0.8);
    expect(hitTest(point, { grid, size: SIZE, edges: () => false })).toEqual({ kind: 'cell', id: 'd4' });
  });

  it('takes the cell inside the band when edges are not live', () => {
    const point = towardCentre(EDGE_BAND * 0.8);
    expect(hitTest(point, { grid, size: SIZE })).toEqual({ kind: 'cell', id: 'd4' });
  });

  it('answers the whole occupied hex with its piece, edge band included', () => {
    const tokens = () => [{ id: 'unit-1', cell: 'd4' }];
    for (const point of [centre, towardCentre(EDGE_BAND * 0.5), towardCentre(EDGE_BAND * 1.5)]) {
      expect(hitTest(point, { grid, size: SIZE, edges: () => true, tokens })).toEqual({ kind: 'token', id: 'unit-1' });
    }
  });

  it('leaves an empty hex to its own edges and ground', () => {
    const tokens = () => [{ id: 'unit-1', cell: 'a1' }];
    expect(hitTest(centre, { grid, size: SIZE, edges: () => true, tokens })).toEqual({ kind: 'cell', id: 'd4' });
  });
});

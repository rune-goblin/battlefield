import { describe, expect, it } from 'vitest';
import { gateHandles, gateLeaves } from '../board/gate-geometry.js';
import { gridOf, notation, parse } from '../engine/index.js';
import { openBoard } from './helpers.js';

describe('gate doors', () => {
  it.each(['square', 'hex'] as const)('opens away from either interior on every %s edge orientation', kind => {
    const grid = gridOf(openBoard(kind));
    const home = parse('e5');
    for (const neighbour of grid.neighbours(home)) {
      const [a, b] = grid.edgeSegment(home, neighbour, 100);
      const edge = { x: b.x - a.x, y: b.y - a.y };
      const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      for (const inside of [home, neighbour]) {
        const interior = grid.center(inside, 100);
        const closed = gateLeaves(a, b, interior, false);
        const open = gateLeaves(a, b, interior, true);
        for (const isOpen of [false, true]) {
          for (const { anchor, center } of gateHandles(a, b, interior, isOpen, 6)) {
            expect((center.x - anchor.x) * (interior.x - anchor.x) + (center.y - anchor.y) * (interior.y - anchor.y), 'handles stay on the inner face').toBeGreaterThan(0);
          }
        }
        expect(closed.map(leaf => leaf.tip)).toEqual([midpoint, midpoint]);
        open.forEach((leaf, index) => {
          expect(leaf.hinge).toEqual(closed[index].hinge);
          const vector = { x: leaf.tip.x - leaf.hinge.x, y: leaf.tip.y - leaf.hinge.y };
          expect(vector.x * edge.x + vector.y * edge.y).toBeCloseTo(0);
          expect(vector.x * (interior.x - midpoint.x) + vector.y * (interior.y - midpoint.y), notation(inside)).toBeLessThan(0);
          expect(Math.hypot(vector.x, vector.y)).toBeCloseTo(Math.hypot(midpoint.x - leaf.hinge.x, midpoint.y - leaf.hinge.y));
        });
        expect(Math.hypot(open[0].tip.x - open[1].tip.x, open[0].tip.y - open[1].tip.y))
          .toBeCloseTo(Math.hypot(open[0].hinge.x - open[1].hinge.x, open[0].hinge.y - open[1].hinge.y));
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import { hexGrid, squareGrid } from '../engine/grid.js';
import { polygonArea, terrainRegions } from '../board/terrain-regions.js';
import { areaTrees, forestTrees } from '../board/forest-placement.js';
import { blendWeights, coverage, createBlendField } from '../board/terrain-blending.js';
import { createTextureSample, DEFAULT_TREES, normalizeTextureSettings, TERRAIN_GROUPS } from '../board/terrain-textures.js';

describe('terrain masks', () => {
  for (const grid of [hexGrid, squareGrid]) {
    it(`merges adjoining ${grid.kind} cells and removes their shared edge`, () => {
      const a = grid.parse('e5'), b = grid.neighbours(a)[0];
      const regions = terrainRegions(grid, [a, b], 37);
      expect(regions).toHaveLength(1);
      expect(regions[0].holes).toHaveLength(0);
      expect(regions[0].outline).toHaveLength(grid.vertices(a, 37).length * 2 - 2);
      expect(polygonArea(regions[0].outline)).toBeCloseTo(2 * polygonArea(grid.vertices(a, 37)));
    });
    it(`retains an enclosed hole in the ${grid.kind} grid`, () => {
      const centre = grid.parse('e5');
      const cells = grid.cells().filter(cell => grid.distance(cell, centre) <= 2 && grid.distance(cell, centre) > 0);
      const regions = terrainRegions(grid, cells, 41.7);
      expect(regions).toHaveLength(1);
      expect(regions[0].holes).toHaveLength(1);
      expect(polygonArea(regions[0].outline) + polygonArea(regions[0].holes[0]))
        .toBeCloseTo(cells.length * polygonArea(grid.vertices(centre, 41.7)));
    });
    it(`keeps separate ${grid.kind} islands`, () => {
      expect(terrainRegions(grid, [grid.parse('e2'), grid.parse('e8')], 50)).toHaveLength(2);
    });
  }
  it('covers every hex on irregular masks without overlap', () => {
    for (let seed = 0; seed < 30; seed++) {
      const cells = hexGrid.cells().filter((_, i) => ((i * 31 + seed * 17) % 23) > 7);
      const regions = terrainRegions(hexGrid, cells, 59.23);
      const area = regions.reduce((sum, r) => sum + polygonArea(r.outline) + r.holes.reduce((n, h) => n + polygonArea(h), 0), 0);
      expect(area).toBeCloseTo(cells.length * polygonArea(hexGrid.vertices(hexGrid.parse('e5'), 59.23)));
    }
  });
});

describe('forest sprites', () => {
  it('places the exact inclusive count range inside every forest hex', () => {
    const counts = new Set<number>();
    for (const cell of hexGrid.cells()) {
      const trees = forestTrees(hexGrid, cell, 60, { min: 3, max: 8 });
      expect(trees.length).toBeGreaterThanOrEqual(3);
      expect(trees.length).toBeLessThanOrEqual(8);
      counts.add(trees.length);
      for (const tree of trees) expect(hexGrid.key(hexGrid.fromPoint(tree.position, 60)!)).toBe(hexGrid.key(cell));
      expect(forestTrees(hexGrid, cell, 60, { min: 20, max: 20 })).toHaveLength(20);
      expect(forestTrees(hexGrid, cell, 60, { min: 0, max: 0 })).toHaveLength(0);
    }
    expect([...counts].sort()).toEqual([3, 4, 5, 6, 7, 8]);
  });
  it('reaches hex edges while keeping tree roots in the forest', () => {
    const cell = hexGrid.parse('e5');
    const centre = hexGrid.center(cell, 100);
    const trees = forestTrees(hexGrid, cell, 100, { min: 20, max: 20 });
    // The old placement kept every root within a central disc of radius 36.
    expect(trees.filter(tree => Math.hypot(tree.position.x - centre.x, tree.position.y - centre.y) > 45).length).toBeGreaterThan(5);
    const vertices = hexGrid.vertices(cell, 100);
    const edgeDistance = (p: { x: number; y: number }) => Math.min(...vertices.map((a, i) => {
      const b = vertices[(i + 1) % vertices.length];
      return Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);
    }));
    expect(trees.filter(tree => edgeDistance(tree.position) < tree.size / 2).length).toBeGreaterThan(5);
    for (const tree of trees) {
      expect(hexGrid.key(hexGrid.fromPoint(tree.position, 100)!)).toBe(hexGrid.key(cell));
      // Even a rotated rectangular frame extends less than a quarter pitch beyond its root.
      expect(tree.size / Math.sqrt(2)).toBeLessThan(25);
    }
  });
  it('preserves layout through redraw and resize', () => {
    const cell = hexGrid.parse('e5'), range = { min: 3, max: 8 };
    const first = forestTrees(hexGrid, cell, 50, range);
    expect(forestTrees(hexGrid, cell, 50, range)).toEqual(first);
    const larger = forestTrees(hexGrid, cell, 100, range);
    first.forEach((tree, i) => {
      expect(larger[i].position.x).toBeCloseTo(tree.position.x * 2);
      expect(larger[i].position.y).toBeCloseTo(tree.position.y * 2);
      expect(larger[i].size).toBeCloseTo(tree.size * 2);
    });
  });
});

describe('elevation stacking', () => {
  const centre = hexGrid.parse('e5');
  const high = hexGrid.cells().filter(cell => hexGrid.distance(cell, centre) <= 1);
  const raised = new Set(high.map(hexGrid.key));
  const low = hexGrid.cells().filter(cell => !raised.has(hexGrid.key(cell)));
  const field = createBlendField(hexGrid, [low, high], 16);
  const settings = { mode: 'natural', width: 0.15, irregularity: 0.2, patchSize: 0.25 } as const;
  const covered = coverage(field, settings, blendWeights(field, settings), [1]);

  it('ripples along the hex edge without gaining or losing ground', () => {
    let bite = 0, spill = 0;
    for (let i = 0; i < field.owners.length; i++) {
      if (field.owners[i] === 1 && covered[i] < 0.5) bite++;
      if (field.owners[i] === 0 && covered[i] > 0.5) spill++;
    }
    expect(bite).toBeGreaterThan(0);
    // Every bite out of the raised ground is paid for by a bulge out of it, to within the
    // texels one step of the histogram can't separate.
    expect(Math.abs(bite - spill)).toBeLessThan(bite * 0.05);
  });
  it('steps rather than ramps, so the boundary is an edge and not a gradient', () => {
    const partial = [...covered].filter(value => value > 0.02 && value < 0.98).length;
    expect(partial).toBeLessThan(covered.length * 0.02);
  });
});

describe('area mode', () => {
  const patch = hexGrid.cells().filter(cell => hexGrid.distance(cell, hexGrid.parse('e5')) <= 1);
  const range = { min: 3, max: 8 };
  it('plants the same total as hex by hex, and roots every tree in the patch', () => {
    const perHex: ReturnType<typeof forestTrees> = [];
    for (const cell of patch) perHex.push(...forestTrees(hexGrid, cell, 60, range, perHex));
    const area = areaTrees(hexGrid, patch, 60, range);
    expect(area.length).toBeGreaterThanOrEqual(patch.length * range.min);
    expect(area.length).toBeLessThanOrEqual(patch.length * range.max);
    const keys = new Set(patch.map(hexGrid.key));
    for (const tree of area) expect(keys.has(hexGrid.key(hexGrid.fromPoint(tree.position, 60)!))).toBe(true);
    // The whole point of the switch: same wood, different arrangement.
    expect(area.map(t => t.position)).not.toEqual(perHex.map(t => t.position));
  });
  it('seeds each patch independently of the order its cells arrive in', () => {
    const first = areaTrees(hexGrid, patch, 60, range);
    expect(areaTrees(hexGrid, [...patch].reverse(), 60, range)).toEqual(first);
  });
  it('scatters two separate woods apart', () => {
    const far = [hexGrid.parse('b8'), hexGrid.parse('h2')];
    expect(areaTrees(hexGrid, far, 60, { min: 4, max: 4 })).toHaveLength(4 + 4);
  });
});

it.each([0, 1, 7, 42, 1234, 99999])('exhibits every terrain group in a connected patch of multiple hexes (layout %i)', (seed) => {
  const { groups } = createTextureSample(seed);
  expect(Object.keys(groups)).toHaveLength(61);
  for (const group of TERRAIN_GROUPS) {
    const cells = hexGrid.cells().filter(cell => groups[hexGrid.key(cell)] === group);
    expect(cells.length).toBeGreaterThanOrEqual(3);
    expect(terrainRegions(hexGrid, cells, 1)).toHaveLength(1);
  }
});

it('repairs obsolete and invalid saved settings', () => {
  const settings = normalizeTextureSettings({ terrains: { forest: { texture: 'missing.jpg', scale: -3 } }, trees: { min: 27, max: -1 } });
  expect(settings.terrains.forest.scale).toBe(0.25);
  expect(settings.terrains.forest.texture).not.toBe('missing.jpg');
  expect(settings.trees).toEqual({ ...DEFAULT_TREES, min: 20, max: 20 });
});

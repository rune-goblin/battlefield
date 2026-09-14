import { describe, expect, it } from 'vitest';

import { hexGrid, type Cell } from '../engine/grid.js';
import { defaultInkSettings, inkPatch } from '../board/ink-map.js';

const cells = (...keys: string[]): Cell[] => keys.map((k) => ({ file: k.charCodeAt(0) - 97, rank: Number(k.slice(1)) - 1 }));

describe('inkPatch', () => {
  const settings = defaultInkSettings();
  const wood = cells('e4', 'e5', 'e6', 'd5', 'f5', 'd6', 'c5', 'c6', 'f6');

  it('stands at least one drawing, and no two of a patch alike', () => {
    expect(inkPatch(hexGrid, cells('e5'), 60, settings, 1).heroes).toHaveLength(1);
    const { heroes } = inkPatch(hexGrid, wood, 60, settings, 1);
    expect(heroes.length).toBeGreaterThanOrEqual(1);
    expect(new Set(heroes.map((h) => Math.floor(h.variant * 16))).size).toBe(heroes.length);
  });

  it('stands no drawing on a terrain without art, and fills it right across', () => {
    // The tuned default density saturates the spacing, so this counts against an unsaturated one.
    const sparse = { ...settings, fill: { ...settings.fill, density: 5 } };
    const { heroes, fills } = inkPatch(hexGrid, wood, 60, sparse, 1, false);
    expect(heroes).toHaveLength(0);
    const filled = new Set(fills.map((f) => hexGrid.key(hexGrid.fromPoint(f.position, 60)!)));
    expect(filled.size).toBe(wood.length);
    expect(fills.length).toBeGreaterThanOrEqual(wood.length * sparse.fill.density * 0.8);
  });

  it('keeps the fills clear of the drawings and of each other', () => {
    const { heroes, fills } = inkPatch(hexGrid, wood, 60, settings, 1);
    for (const { position, width } of heroes) {
      for (const mark of fills) {
        const dx = (mark.position.x - position.x) / (width * 0.5 + mark.cell * 0.36);
        const dy = (mark.position.y - position.y) / (width * 0.5 + mark.cell * 0.36);
        expect(dx * dx + dy * dy).toBeGreaterThanOrEqual(1);
      }
    }
    for (const a of fills) {
      for (const b of fills) {
        if (a === b) continue;
        expect(Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y)).toBeGreaterThanOrEqual((a.cell + b.cell) * 0.36);
      }
    }
    expect(fills.length).toBeGreaterThan(wood.length);
  });

  it('keeps every drawing wholly on its patch, board edge included', () => {
    const edge = hexGrid.cells().filter((c) => c.file === 0);
    const keys = new Set(edge.map((c) => hexGrid.key(c)));
    const { heroes } = inkPatch(hexGrid, edge, 60, settings, 1);
    for (const { position, width } of heroes) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const probe = { x: position.x + width * 0.5 * Math.cos(a), y: position.y + settings.ink.lift * 60 + width * 0.32 * Math.sin(a) };
        const cell = hexGrid.fromPoint(probe, 60);
        expect(cell && keys.has(hexGrid.key(cell))).toBe(true);
      }
    }
  });

  it('draws from the patch alone', () => {
    const a = inkPatch(hexGrid, wood, 60, settings, 1);
    expect(inkPatch(hexGrid, [...wood].reverse(), 60, settings, 1)).toEqual(a);
    expect(inkPatch(hexGrid, wood.slice(0, 4), 60, settings, 1).fills).not.toEqual(a.fills);
  });
});

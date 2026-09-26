import { describe, expect, it } from 'vitest';
import { createBattle, edgeKey, gridOf, makeWall, notation, parse, type Board, type UnitCard } from '../engine/index.js';
import { unitSheet } from '../app/battle/unit-sheet.js';
import { openBoard } from './helpers.js';

function enclose(board: Board, cells: string[], tier: number) {
  const inside = new Set(cells), grid = gridOf(board);
  for (const id of cells) for (const n of grid.neighbours(parse(id))) {
    if (!inside.has(notation(n))) board.walls[edgeKey(parse(id), n)] = makeWall(tier, notation(n));
  }
}

describe('unit sheet', () => {
  it('names the tradition and the mixed-wall cover range for a caster in a fort', () => {
    const board = openBoard();
    enclose(board, ['d4', 'e4', 'f4', 'd5', 'e5', 'f5', 'd6', 'e6', 'f6'], 4);
    board.walls['e3|e4'] = makeWall(1);
    const cleric: UnitCard = { name: 'Cleric', level: 6, role: 'infantry', caster: true, tradition: 'divine', tactics: [] };
    const line: UnitCard = { name: 'Line', level: 5, role: 'infantry', tactics: [] };
    const battle = createBattle({ board, units: [{ card: cleric, side: 'defender', square: 'c7' }, { card: line, side: 'attacker', square: 'c2' }] });
    battle.units[0].square = parse('e5');
    const sheet = unitSheet(battle, battle.units[0]);
    expect(sheet.caster?.label).toBe('Divine caster');
    expect(sheet.fortified).toEqual({ label: 'Fortified · Mixed walls', cover: '+1–4 ranged cover' });
    expect(sheet.checks.map(c => c.label)).toContain('Spell DC');
  });
});

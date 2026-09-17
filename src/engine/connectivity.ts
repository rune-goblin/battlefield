import { at, deployRanks, gridOf, notation, type Board } from './board.js';
import { CELL_FEET, stepFeet } from './path.js';
import { ACTIONS_PER_ACTIVATION } from './types.js';

/** A ground route between the deployment zones, without units or magic. Every edge must
 * be affordable within a slow unit's activation; movement cannot bank across turns. */
export function hasGroundConnection(board: Board): boolean {
  const grid = gridOf(board);
  const attackerRanks = new Set(deployRanks('attacker', false, board.squares.length));
  const defenderRanks = new Set(deployRanks('defender', false, board.squares.length));
  const frontier = grid.cells().filter(cell => attackerRanks.has(cell.rank) && at(board, cell).terrain !== 'water');
  const visited = new Set(frontier.map(notation));
  for (let i = 0; i < frontier.length; i++) {
    const from = frontier[i];
    if (defenderRanks.has(from.rank)) return true;
    for (const to of grid.neighbours(from)) {
      const key = notation(to);
      if (visited.has(key) || stepFeet(board, from, to) > ACTIONS_PER_ACTIVATION * CELL_FEET) continue;
      visited.add(key);
      frontier.push(to);
    }
  }
  return false;
}

import { notation, type Square } from './board.js';
import type { ActivityTarget, BattleState, Unit } from './types.js';

export const wallName = (key: string): string => key.replace('|', ' / ');
export const unitTarget = (u: Unit): ActivityTarget => ({ kind: 'unit', id: u.id, label: u.name });
export const groupTarget = (units: Unit[]): ActivityTarget =>
  ({ kind: 'unit', id: units.map(u => u.id).sort().join('+'), label: units.map(u => u.name).join(', ') });
export const cellTarget = (id: string, label: string = id): ActivityTarget => ({ kind: 'cell', id, label });
export const wallTarget = (key: string, label: string = wallName(key)): ActivityTarget => ({ kind: 'wall', id: key, label });
export const moveTarget = (u: Unit, to: Square): ActivityTarget =>
  cellTarget(`${notation(u.square)}+${notation(to)}`, `${u.name} to ${notation(to)}`);
export const pairTarget = (a: ActivityTarget, b: ActivityTarget): ActivityTarget => cellTarget(`${a.id}+${b.id}`, `${a.label}; ${b.label}`);

export function occupantTarget(state: BattleState, cell: string): ActivityTarget {
  const u = state.units.find(u => u.status === 'active' && notation(u.square) === cell);
  return u ? unitTarget(u) : cellTarget(cell);
}

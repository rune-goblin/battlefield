import { edgeCells, notation, type Square } from './board.js';
import type { ActivityTarget, BattleState, TargetRef, Unit } from './types.js';

type TransferTarget = Extract<ActivityTarget, { kind: 'transfer' }>;

/** The identity of a target: a group or a shape keys the same whatever order it lists its parts
 * in, and a transfer keys its moves in order. */
export function targetKey(ref: TargetRef): string {
  switch (ref.kind) {
    case 'unit': return [...ref.ids].sort().join('+');
    case 'cell': return [...ref.cells].sort().join('+');
    case 'wall': return ref.edge;
    case 'transfer': return ref.moves.map(({ unit, to }) => `${unit}>${to}`).join('+');
  }
}

const offered = <T extends TargetRef>(ref: T, label: string): T & { id: string; label: string } =>
  ({ ...ref, id: targetKey(ref), label });

/** The bare target of an offered one, without the fields a menu or the board adds to it. */
export function refOf(t: TargetRef): TargetRef {
  switch (t.kind) {
    case 'unit': return { kind: 'unit', ids: [...t.ids] };
    case 'cell': return { kind: 'cell', cells: [...t.cells] };
    case 'wall': return { kind: 'wall', edge: t.edge };
    case 'transfer': return { kind: 'transfer', moves: t.moves.map(({ unit, to }) => ({ unit, to })) };
  }
}

const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every(v => typeof v === 'string');
const isMove = (value: unknown): boolean => {
  const m = value as Record<string, unknown> | null;
  return !!m && typeof m === 'object' && typeof m.unit === 'string' && typeof m.to === 'string';
};

export function isTargetRef(value: unknown): value is TargetRef {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  switch (v.kind) {
    case 'unit': return isStrings(v.ids);
    case 'cell': return isStrings(v.cells);
    case 'wall': return typeof v.edge === 'string';
    case 'transfer': return Array.isArray(v.moves) && v.moves.every(isMove);
    default: return false;
  }
}

/** The hexes a target covers: each active unit's own hex, a shape's hexes, the two a wall
 * divides, and each moved ally's hex followed by the hex it lands on. */
export function targetCells(state: BattleState, ref: TargetRef): string[] {
  switch (ref.kind) {
    case 'unit': return ref.ids.flatMap((id) => {
      const u = state.units.find((x) => x.id === id && x.status === 'active');
      return u ? [notation(u.square)] : [];
    });
    case 'cell': return [...ref.cells];
    case 'wall': return edgeCells(ref.edge);
    case 'transfer': return ref.moves.flatMap(({ unit, to }) => {
      const u = state.units.find((x) => x.id === unit);
      return u ? [notation(u.square), to] : [];
    });
  }
}

export const wallName = (key: string): string => edgeCells(key).join(' / ');
export const unitTarget = (u: Unit): ActivityTarget => offered({ kind: 'unit', ids: [u.id] }, u.name);
export const groupTarget = (units: Unit[]): ActivityTarget =>
  offered({ kind: 'unit', ids: units.map(u => u.id).sort() }, units.map(u => u.name).join(', '));
export function cellTarget(cells: string | string[], label?: string): ActivityTarget {
  const list = typeof cells === 'string' ? [cells] : cells;
  return offered({ kind: 'cell', cells: list }, label ?? list.join(' / '));
}
export const wallTarget = (key: string, label: string = wallName(key)): ActivityTarget => offered({ kind: 'wall', edge: key }, label);
export const moveTarget = (u: Unit, to: Square): TransferTarget =>
  offered({ kind: 'transfer', moves: [{ unit: u.id, to: notation(to) }] }, `${u.name} to ${notation(to)}`);
export const pairTarget = (a: TransferTarget, b: TransferTarget): TransferTarget =>
  offered({ kind: 'transfer', moves: [...a.moves, ...b.moves] }, `${a.label}; ${b.label}`);

export function occupantTarget(state: BattleState, cell: string): ActivityTarget {
  const u = state.units.find(u => u.status === 'active' && notation(u.square) === cell);
  return u ? unitTarget(u) : cellTarget(cell);
}

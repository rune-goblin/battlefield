import { at, gridOf, notation, parse, fortification } from './board.js';
import { ENGINES } from './engines.js';
import { hasSight } from './sight.js';
import type { SiegeMode } from './siege-profiles.js';
import type { ActivityTarget, BattleState, EngineState } from './types.js';

/** Canonical targets are shared by the menu and command validation. A shape is one target. */
export function siegeTargets(state: BattleState, e: EngineState, mode: SiegeMode): ActivityTarget[] {
  const g = gridOf(state.board);
  const kind = ENGINES.find(card => card.name === e.name)?.kind ?? e.kind;
  const max = kind === 'ram' ? 1 : ({ short: 3, medium: 5, long: 7, extreme: 11 }[e.reach ?? 'medium']);
  const inRange = (id: string) => {
    const sq = parse(id), d = g.distance(e.square, sq);
    return d >= (mode.minimum ?? (kind === 'ram' ? 0 : 1)) && d <= max && hasSight(state.board, e.square, sq);
  };
  if (mode.shape === 'wall') return Object.entries(state.board.walls)
    .filter(([key, w]) => w.remaining > 0 && key.split('|').some(id => inRange(id) && (kind !== 'ram' || id === notation(e.square))))
    .map(([id, w]) => ({ kind: 'wall', id, label: `${w.gate ? 'Gate' : 'Wall'} ${id.replace('|', ' / ')} · ${w.remaining}/${w.boxes} · hardness ${fortification(w.tier).hardness}` }));
  const affected = (u: BattleState['units'][number]) => u.status === 'active'
    && (!mode.groundOnly || (!u.flying && !u.flies))
    && (!mode.cavalryOnly || u.role === 'cavalry')
    && (!mode.waterOnly || ['water', 'shallows'].includes(at(state.board, u.square).terrain));
  if (mode.shape === 'single') return state.units.filter(u => u.side !== e.side && affected(u) && inRange(notation(u.square)))
    .map(u => ({ kind: 'unit', id: u.id, label: u.name }));
  const groups: string[][] = [];
  if (mode.shape === 'burst') for (const c of g.cells()) for (const corner of g.corners(c)) groups.push(corner.map(notation));
  if (mode.shape === 'wide') for (const c of g.cells()) groups.push([c, ...g.neighbours(c)].map(notation));
  if (mode.shape === 'line') for (const first of g.neighbours(e.square)) {
    const cells = [first];
    while (cells.length < 3) {
      const next = g.beyond(cells.length === 1 ? e.square : cells[cells.length - 2], cells[cells.length - 1]);
      if (!next) break;
      cells.push(next);
    }
    groups.push(cells.map(notation));
  }
  if (mode.shape === 'cone') for (const first of g.neighbours(e.square)) {
    const outer = g.neighbours(first).filter(c => g.distance(e.square, c) === 2);
    for (let i = 0; i < outer.length; i++) for (let j = i + 1; j < outer.length; j++) {
      if (g.distance(outer[i], outer[j]) === 1) groups.push([first, outer[i], outer[j]].map(notation));
    }
  }
  const unique = [...new Set(groups.map(cells => cells.sort().join('+')))];
  return unique.filter(id => id.split('+').every(inRange)
    && (mode.effect === 'rough' || mode.effect === 'web' || state.units.some(u => affected(u) && id.split('+').includes(notation(u.square))))).map(id => {
    const names = state.units.filter(u => affected(u) && id.split('+').includes(notation(u.square)))
      .map(u => `${u.name}${u.side === e.side ? ' (ally)' : ''}`);
    return { kind: 'cell', id, label: `${id.replaceAll('+', ' / ')}${names.length ? ` — ${names.join(', ')}` : ''}` };
  });
}

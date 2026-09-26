import { at, edgeCells, gridOf, notation, parse, fortification } from './board.js';
import { engineKind } from './siege-engines.js';
import { hasSight, sightBlock } from './sight.js';
import { siegeModes, type SiegeMode } from './siege-profiles.js';
import { cellTarget, unitTarget, wallName, wallTarget } from './targets.js';
import { BANDS, type ActivityTarget, type BattleState, type EngineState } from './types.js';

/** Canonical targets are shared by the menu and command validation. A shape is one target. */
export function siegeTargets(state: BattleState, e: EngineState, mode: SiegeMode): ActivityTarget[] {
  const g = gridOf(state.board);
  const kind = engineKind(e);
  const max = kind === 'ram' ? 1 : BANDS[e.reach ?? 'medium'];
  const inRange = (id: string) => {
    const sq = parse(id), d = g.distance(e.square, sq);
    return d >= (mode.minimum ?? (kind === 'ram' ? 0 : 1)) && d <= max && hasSight(state.board, e.square, sq);
  };
  if (mode.shape === 'wall') return Object.entries(state.board.walls)
    .filter(([key, w]) => w.remaining > 0 && edgeCells(key).some(id => inRange(id) && (kind !== 'ram' || id === notation(e.square))))
    .map(([id, w]) => wallTarget(id, `${w.gate ? 'Gate' : 'Wall'} ${wallName(id)} · ${w.remaining}/${w.boxes} · hardness ${fortification(w.tier).hardness}`));
  const affected = (u: BattleState['units'][number]) => u.status === 'active'
    && (!mode.groundOnly || (!u.flying && !u.flies))
    && (!mode.cavalryOnly || u.role === 'cavalry')
    && (!mode.waterOnly || ['water', 'shallows'].includes(at(state.board, u.square).terrain));
  if (mode.shape === 'single') return state.units.filter(u => u.side !== e.side && affected(u) && inRange(notation(u.square)))
    .map(unitTarget);
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
    // Friendly fire hits allies caught in the area, but an area needs an enemy in it to be worth aiming at.
    && (mode.effect === 'rough' || mode.effect === 'web' || state.units.some(u => u.side !== e.side && affected(u) && id.split('+').includes(notation(u.square))))).map(id => {
    const names = state.units.filter(u => affected(u) && id.split('+').includes(notation(u.square)))
      .map(u => `${u.name}${u.side === e.side ? ' (ally)' : ''}`);
    return cellTarget(id, `${id.replaceAll('+', ' / ')}${names.length ? ` — ${names.join(', ')}` : ''}`);
  });
}

/** Why `cell` is no target for this mode: range, sight, then an empty hex. Null when some target covers it. */
export function siegeCellReason(state: BattleState, e: EngineState, activity: number, cell: string): string | null {
  const mode = siegeModes(e.name, engineKind(e))[activity - 1];
  if (siegeTargets(state, e, mode).some(t => (t.kind === 'wall' ? edgeCells(t.id) : t.kind === 'cell' ? t.id.split('+')
    : state.units.filter(u => u.id === t.id).map(u => notation(u.square))).includes(cell))) return null;
  const g = gridOf(state.board), kind = engineKind(e);
  const max = kind === 'ram' ? 1 : BANDS[e.reach ?? 'medium'];
  const min = mode.minimum ?? (kind === 'ram' ? 0 : 1), d = g.distance(e.square, parse(cell));
  if (d < min) return min > 1 ? `Too close: the ${e.name} needs at least ${min} hexes.` : 'The engine cannot fire on its own hex.';
  if (d > max) return `Out of range: ${cell} is ${d} hexes away and the ${e.name} reaches ${max}.`;
  const blind = sightBlock(state.board, e.square, parse(cell));
  if (blind) return blind;
  if (mode.shape === 'wall') return 'No standing wall or gate here.';
  const here = state.units.find(u => u.status === 'active' && notation(u.square) === cell);
  if (!here) return 'No enemy here to hit.';
  if (here.side === e.side) return `${here.name} is an ally. Aim the area where it catches an enemy.`;
  return mode.shape === 'single' ? `${here.name} cannot be hit by this attack.` : `No ${mode.label} area covering ${cell} stays in range and sight.`;
}

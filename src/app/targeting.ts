import {
  edgeCells, gridOf, notation, occupantTarget, refOf, targetCells, unitTarget, type ActionOffer, type ActivityAction,
  type ActivityOption, type ActivityTarget, type BattleState, type BoardObject, type Tree, type Unit,
} from '../engine/index.js';
import type { TargetArrow, TargetIcon } from '../board/index.js';

export type TargetGeometry = 'hex' | 'edge' | 'corner' | 'group';
export interface TargetMarker {
  id: string;
  label: string;
  cells: string[];
  anchorCells: string[];
  geometry: TargetGeometry;
  icon: TargetIcon;
  selected?: boolean;
}
export type TargetChoice = ActivityTarget & TargetMarker;
export type TargetingHit =
  | { kind: 'hex'; id: string } | { kind: 'edge'; id: string } | { kind: 'target'; id: string } | { kind: 'corner'; cells: string[] };
export interface TargetResolution {
  action: ActivityAction;
  markers: TargetMarker[];
  arrows: TargetArrow[];
  effects: { cell: string; tree: Tree; from: string }[];
}

const sameCells = (a: readonly string[], b: readonly string[]): boolean => {
  const x = [...a].sort(), y = [...b].sort();
  return x.length === y.length && x.every((cell, i) => cell === y[i]);
};

export const targetText = (target: { label: string }, cells: string[]): string => `${target.label} · ${cells.join(' + ')}`;

export const cellsForTarget = targetCells;

export const targetingIcon = (offer: Pick<ActionOffer, 'type' | 'spell'>): TargetIcon =>
  offer.spell ? `cast:${offer.spell}`
    : ({ fight: 'attack', shoot: 'shoot', rally: 'rally', guard: 'block', cast: 'cast' } as const)[offer.type];

export { targetAnchor } from '../board/index.js';

/** Adapts exact engine targets to board picks, icons, previews and one action/effect plan. */
export class TargetingService {
  readonly choices: TargetChoice[];
  readonly icon: TargetIcon;
  readonly style: 'attack' | 'deploy';

  get placement(): boolean { return this.offer.spell === 'movement' && this.activity.index >= 3; }

  private placementCells(target: TargetChoice, selected: string[]): string[] {
    const cells = target.cells;
    return cells.length === 4 && selected[0] === cells[2] ? [...cells.slice(2), ...cells.slice(0, 2)] : cells;
  }

  candidates(selected: string[] = []): TargetChoice[] {
    return this.choices.filter(target => this.placement
      ? selected.every((cell, i) => this.placementCells(target, selected)[i] === cell)
      : selected.every(cell => target.cells.includes(cell)));
  }

  /** Groups select recipients; transfers select each source followed by its destination. */
  surface(selected: string[] = []): TargetMarker[] {
    const candidates = this.candidates(selected);
    if (!this.placement && !candidates.some(target => target.geometry === 'group')) return candidates;
    const cells = [...new Set(candidates.flatMap(target => this.placement
      ? selected.length === 0 && target.cells.length === 4 ? [target.cells[0], target.cells[2]]
        : this.placementCells(target, selected).slice(selected.length, selected.length + 1)
      : target.cells))];
    return [...new Set([...selected, ...cells])].map(cell => ({ ...this.hexMarker(cell), selected: selected.includes(cell) }));
  }

  hexMarker(cell: string): TargetMarker {
    return {
      id: `hex:${cell}`, label: occupantTarget(this.state, cell).label,
      cells: [cell], anchorCells: [cell], geometry: 'hex', icon: this.icon,
    };
  }

  pickCell(cell: string, selected: string[] = []): { selected: string[]; target: TargetChoice | null } | null {
    if (selected.includes(cell)) return { selected: this.placement ? selected.slice(0, selected.indexOf(cell)) : selected.filter(value => value !== cell), target: null };
    const next = [...selected, cell];
    const matches = this.candidates(next);
    if (!matches.length) return null;
    return { selected: next, target: matches.find(target => target.cells.length === next.length) ?? null };
  }

  markersFor(target: TargetChoice): TargetMarker[] {
    return target.geometry === 'group' ? target.cells.map((cell) => ({ ...target, id: `${target.id}:${cell}`, cells: [cell], anchorCells: [cell], geometry: 'hex' })) : [target];
  }

  /** Resolve both exact choices and intermediate surface picks into visible aiming arrows. A
   * hovered `edge` takes precedence over the hovered `cell`. */
  arrows(selected: string[] = [], targetId: string | null = null, cell: string | null = null, edge: string | null = null): TargetArrow[] {
    if (this.placement && this.activity.index === 4) {
      const choice = this.candidates(selected).find(target => target.id === targetId);
      const cells = choice ? this.placementCells(choice, selected) : [...selected];
      const hovered = edge ? null : cell ?? (targetId?.startsWith('hex:') ? targetId.slice(4) : null);
      if (!choice && hovered && !cells.includes(hovered) && this.surface(selected).some(marker => marker.cells.includes(hovered))) cells.push(hovered);
      return cells.flatMap((to, i) => i % 2 === 1 ? [{ from: cells[i - 1], to, toCells: [to], tone: 'movement' as const }] : []);
    }
    const surface = this.surface(selected);
    const choice = this.candidates(selected).find((target) => target.id === targetId);
    const point = edge ? edgeCells(edge) : cell ? [cell] : null;
    const marker = surface.find((target) => target.id === targetId)
      ?? (point ? surface.find((target) => target.geometry !== 'group' && sameCells(target.anchorCells, point)) : undefined);
    const marks = choice ? this.markersFor(choice) : marker ? [marker] : [];
    if (!this.placement) marks.push(...surface.filter((target) => target.selected));
    else if (!marks.length && selected.length) marks.push(...surface.filter((target) => target.selected));
    const unique = [...new Map(marks.map((target) => [target.anchorCells.join('+'), target])).values()];
    return unique.map((target) => ({
      from: this.placement && (choice || (selected.length && !target.selected))
        ? choice?.cells[0] ?? selected[0] : notation(this.actor.square),
      to: target.anchorCells[0], toCells: target.anchorCells, tone: this.offer.spell ?? this.offer.type,
    }));
  }

  constructor(readonly state: BattleState, readonly actor: Unit, readonly offer: ActionOffer, readonly activity: ActivityOption) {
    this.icon = targetingIcon(offer);
    this.style = offer.hostile || offer.type === 'shoot' || offer.type === 'fight' || offer.spell === 'blast' || offer.spell === 'controlling' ? 'attack' : 'deploy';
    const targets: ActivityTarget[] = activity.needsTarget ? activity.targets
      : [unitTarget(actor)];
    this.choices = activity.legal ? targets.map((target) => this.describe(target)) : [];
  }

  private describe(target: ActivityTarget): TargetChoice {
    const cells = targetCells(this.state, target);
    const placement = this.offer.spell === 'movement' && this.activity.index >= 3;
    const siegeArea = this.activity.activity.startsWith('siege-') && target.kind === 'cell' && cells.length > 1;
    const corner = siegeArea && gridOf(this.state.board).corners(gridOf(this.state.board).parse(cells[0])).some(cs => sameCells(cs.map(notation), cells));
    const geometry: TargetGeometry = siegeArea ? (corner ? 'corner' : 'hex') : target.kind === 'wall' ? 'edge'
      : this.offer.spell === 'blast' && this.activity.index === 3 ? 'corner'
        : this.offer.spell === 'blast' && this.activity.index === 2 ? 'edge'
          : cells.length > 1 && !placement ? 'group' : 'hex';
    return {
      ...target, cells, geometry, icon: this.icon,
      anchorCells: placement ? cells.filter((_, i) => i % 2 === 1) : cells,
    };
  }

  matches(hit: TargetingHit): TargetChoice[] {
    return this.choices.filter((target) => {
      if (hit.kind === 'target') return target.id === hit.id;
      if (hit.kind === 'hex') return target.kind !== 'wall' && target.cells.includes(hit.id);
      if (hit.kind === 'edge') return target.geometry === 'edge' && sameCells(target.anchorCells, edgeCells(hit.id));
      return target.geometry === 'corner' && sameCells(target.anchorCells, hit.cells);
    });
  }

  forRef(obj: BoardObject): TargetChoice[] {
    if (obj.kind === 'wall') return this.matches({ kind: 'edge', id: obj.id });
    if (obj.kind === 'cell') return this.matches({ kind: 'hex', id: obj.id });
    return this.choices.filter((target) => target.kind === 'unit' ? target.ids.includes(obj.id)
      : target.kind !== 'wall' && target.cells.some((cell) => this.state.units.some((u) => u.id === obj.id && notation(u.square) === cell)));
  }

  preview(id: string | null) {
    const choice = this.choices.find((target) => target.id === id);
    if (!choice) return null;
    const link = { from: notation(this.actor.square), to: choice.anchorCells[0], toCells: choice.anchorCells };
    return {
      choice, cells: choice.cells, style: this.style,
      shot: this.offer.type === 'shoot' ? link : null,
      cast: this.offer.spell ? { ...link, tree: this.offer.spell } : null,
    };
  }

  resolve(id?: string): TargetResolution | null {
    if (!this.activity.legal) return null;
    const target = this.activity.needsTarget ? this.choices.find((choice) => choice.id === id) : this.choices[0];
    if (!target) return null;
    let cells = target.cells;
    if (this.offer.type === 'rally') {
      const g = gridOf(this.state.board);
      cells = this.activity.index === 3 ? this.state.units.filter((u) => u.status === 'active' && u.side === this.actor.side && g.distance(u.square, this.actor.square) <= 2).map((u) => notation(u.square))
        : [...new Set([notation(this.actor.square), ...cells])];
    }
    const placement = this.offer.spell === 'movement' && this.activity.index >= 3;
    const effectCells = placement ? target.anchorCells : cells;
    return {
      action: { ability: this.offer.ability, type: this.offer.type, unit: this.actor.id, activity: this.activity.index, spell: this.offer.spell ?? undefined, target: this.activity.needsTarget ? refOf(target) : undefined },
      markers: this.offer.type === 'rally' ? cells.map((cell) => ({ ...target, id: `rally:${cell}`, cells: [cell], anchorCells: [cell], geometry: 'hex' })) : this.markersFor(target),
      arrows: this.offer.type === 'rally' ? cells.map((cell) => ({ from: notation(this.actor.square), to: cell, tone: 'rally' })) : this.arrows([], target.id),
      effects: this.offer.spell ? effectCells.map((cell) => ({ cell, tree: this.offer.spell!, from: notation(this.actor.square) })) : [],
    };
  }
}

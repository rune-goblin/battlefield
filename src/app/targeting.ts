import {
  gridOf, notation, type ActionOffer, type ActivityAction, type ActivityOption,
  type ActivityTarget, type BattleState, type TargetRef, type Tree, type Unit,
} from '../engine/index.js';
import type { TargetIcon } from '../board/art.js';
import type { TargetArrow } from '../board/target-point.js';

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
export interface TargetChoice extends ActivityTarget, TargetMarker {}
export interface TargetingHit { kind: 'hex' | 'edge' | 'corner' | 'target'; id: string }
export interface TargetResolution {
  action: ActivityAction;
  markers: TargetMarker[];
  arrows: TargetArrow[];
  effects: { cell: string; tree: Tree; from: string }[];
}

export function cellsForTarget(state: BattleState, target: ActivityTarget): string[] {
  if (target.kind === 'wall') return target.id.split('|');
  if (target.kind === 'cell') return target.id.split('+');
  return target.id.split('+').flatMap((id) => {
    const u = state.units.find((unit) => unit.id === id && unit.status === 'active');
    return u ? [notation(u.square)] : [];
  });
}

export const targetingIcon = (offer: Pick<ActionOffer, 'type' | 'spell'>): TargetIcon =>
  offer.spell ? `cast:${offer.spell}`
    : ({ fight: 'attack', shoot: 'shoot', rally: 'rally', guard: 'block', cast: 'cast' } as const)[offer.type];

export { targetAnchor } from '../board/target-point.js';

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
    return [...new Set([...selected, ...cells])].map(cell => ({
      id: `hex:${cell}`, label: `${this.activity.label}: ${this.state.units.find(u => u.status === 'active' && notation(u.square) === cell)?.name ?? cell}`,
      cells: [cell], anchorCells: [cell], geometry: 'hex', icon: this.icon, selected: selected.includes(cell),
    }));
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

  /** Resolve both exact choices and intermediate surface picks into visible aiming arrows. */
  arrows(selected: string[] = [], targetId: string | null = null, cell: string | null = null): TargetArrow[] {
    if (this.placement && this.activity.index === 4) {
      const choice = this.candidates(selected).find(target => target.id === targetId);
      const cells = choice ? this.placementCells(choice, selected) : [...selected];
      const hovered = cell ?? (targetId?.startsWith('hex:') ? targetId.slice(4) : null);
      if (!choice && hovered && !cells.includes(hovered) && this.surface(selected).some(marker => marker.cells.includes(hovered))) cells.push(hovered);
      return cells.flatMap((to, i) => i % 2 === 1 ? [{ from: cells[i - 1], to, toCells: [to], tone: 'movement' as const }] : []);
    }
    const surface = this.surface(selected);
    const choice = this.candidates(selected).find((target) => target.id === targetId);
    const marker = surface.find((target) => target.id === targetId)
      ?? (cell ? surface.find((target) => target.geometry !== 'group'
        && target.anchorCells.slice().sort().join('|') === cell.split('|').sort().join('|')) : undefined);
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
      : [{ kind: 'unit', id: actor.id, label: actor.name }];
    this.choices = activity.legal ? targets.map((target) => this.describe(target)) : [];
  }

  private describe(target: ActivityTarget): TargetChoice {
    const cells = cellsForTarget(this.state, target);
    const placement = this.offer.spell === 'movement' && this.activity.index >= 3;
    const siegeArea = this.activity.activity.startsWith('siege-') && target.kind === 'cell' && cells.length > 1;
    const corner = siegeArea && gridOf(this.state.board).corners(gridOf(this.state.board).parse(cells[0])).some(cs => cs.map(notation).sort().join('+') === cells.slice().sort().join('+'));
    const geometry: TargetGeometry = siegeArea ? (corner ? 'corner' : 'hex') : target.kind === 'wall' ? 'edge'
      : this.offer.spell === 'blast' && this.activity.index === 3 ? 'corner'
        : this.offer.spell === 'blast' && this.activity.index === 2 ? 'edge'
          : cells.length > 1 && !placement ? 'group' : 'hex';
    return {
      ...target, cells, geometry, icon: this.icon,
      anchorCells: placement ? cells.filter((_, i) => i % 2 === 1) : cells,
      label: `${this.activity.label}: ${target.label}`,
    };
  }

  matches(hit: TargetingHit): TargetChoice[] {
    return this.choices.filter((target) => {
      if (hit.kind === 'target') return target.id === hit.id;
      if (hit.kind === 'hex') return target.kind !== 'wall' && target.cells.includes(hit.id);
      if (hit.kind === 'edge') return target.geometry === 'edge'
        && target.anchorCells.slice().sort().join('|') === hit.id.split(/[|+]/).sort().join('|');
      return target.geometry === 'corner'
        && target.anchorCells.slice().sort().join('+') === hit.id.split('+').sort().join('+');
    });
  }

  forRef(ref: TargetRef): TargetChoice[] {
    if (ref.kind === 'wall') return this.matches({ kind: 'edge', id: ref.id });
    if (ref.kind === 'cell') return this.matches({ kind: 'hex', id: ref.id });
    return this.choices.filter((target) => target.kind === 'unit' && target.id.split('+').includes(ref.id)
      || target.kind === 'cell' && target.cells.some((cell) => this.state.units.some((u) => u.id === ref.id && notation(u.square) === cell)));
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
      action: { ability: this.offer.ability, type: this.offer.type, unit: this.actor.id, activity: this.activity.index, spell: this.offer.spell ?? undefined, target: this.activity.needsTarget ? target.id : undefined },
      markers: this.offer.type === 'rally' ? cells.map((cell) => ({ ...target, id: `rally:${cell}`, cells: [cell], anchorCells: [cell], geometry: 'hex' })) : this.markersFor(target),
      arrows: this.offer.type === 'rally' ? cells.map((cell) => ({ from: notation(this.actor.square), to: cell, tone: 'rally' })) : this.arrows([], target.id),
      effects: this.offer.spell ? effectCells.map((cell) => ({ cell, tree: this.offer.spell!, from: notation(this.actor.square) })) : [],
    };
  }
}

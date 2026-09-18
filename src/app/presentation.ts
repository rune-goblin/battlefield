import { notation, type BattleState, type Tree, type Verb } from '../engine/index.js';
import type { TargetArrow, TargetIcon } from '../board/index.js';
import type { BattleEvent } from '../runtime/events.js';
import type { BattleSession } from '../runtime/session.js';
import type { TargetMarker } from './targeting.js';

/** What one commit shows on the board: the roads walked, the pieces that struck free, the
 * spell effects, and the marks the blows left. */
export interface CommitPlay {
  routes: { unit: string; cells: string[] }[];
  flashes: string[];
  bursts: { cell: string; tree: Tree; from: string }[];
  markers: TargetMarker[];
  arrows: TargetArrow[];
}

export interface PresentationSink {
  route(unit: string, cells: string[]): void;
  flash(unit: string): void;
  burst(cell: string, tree: Tree, from: string): void;
  /** The afterglow of a resolved action: marks where it landed and arrows to each. */
  resolved(markers: TargetMarker[], arrows: TargetArrow[]): void;
}

const unitOf = (battle: BattleState, id: string) => battle.units.find((u) => u.id === id) ?? null;

function cellOf(battle: BattleState, id: string): string | null {
  const u = unitOf(battle, id);
  return u ? notation(u.square) : null;
}

/** An advance yields its move and then its melee leg. The token spends one route per move, so
 * the legs are joined into the single road the piece walks. */
function routesOf(events: readonly BattleEvent[]): { unit: string; cells: string[] }[] {
  const routes: { unit: string; cells: string[] }[] = [];
  for (const event of events) {
    if (event.type !== 'unitMoved') continue;
    const open = routes.find((r) => r.unit === event.unit);
    if (!open) routes.push({ unit: event.unit, cells: [...event.route] });
    else open.cells.push(...(open.cells.at(-1) === event.route[0] ? event.route.slice(1) : event.route));
  }
  return routes;
}

/** Where a blow came from and what it was. */
interface Mark { from: string; icon: TargetIcon; tone: Tree | Verb }

function marksOf(events: readonly BattleEvent[], battle: BattleState, actor: string | null): Map<string, Mark> {
  const marks = new Map<string, Mark>();
  for (const event of events) {
    if (event.type === 'spellResolved') {
      for (const target of event.targets) marks.set(target, { from: event.unit, icon: `cast:${event.tree}`, tone: event.tree });
    } else if (event.type === 'freeStrikeResolved') {
      marks.set(event.target, { from: event.unit, icon: 'attack', tone: 'fight' });
    }
  }
  // proto: a cast and a free strike name their targets; every other blow is read from the pieces
  // the acting unit changed, since `checkResolved` carries no target. A miss leaves no mark.
  // A round's end settles persistent wounds across the field, which the unit that closed the
  // round did not deal, so that commit marks nothing rather than pointing at every bleeding piece.
  if (!actor || events.some((event) => event.type === 'roundEnded')) return marks;
  const side = unitOf(battle, actor)?.side;
  for (const event of events) {
    if (event.type !== 'woundsChanged' && event.type !== 'disorderChanged') continue;
    if (event.unit === actor || marks.has(event.unit)) continue;
    const ally = unitOf(battle, event.unit)?.side === side;
    marks.set(event.unit, { from: actor, icon: ally ? 'rally' : 'attack', tone: ally ? 'rally' : 'fight' });
  }
  return marks;
}

function playFor(events: readonly BattleEvent[], battle: BattleState, actor: string | null): CommitPlay {
  const marks = [...marksOf(events, battle, actor)]
    .flatMap(([id, mark]) => {
      const to = cellOf(battle, id);
      const from = cellOf(battle, mark.from);
      return to && from ? [{ id, mark, to, from }] : [];
    });
  return {
    routes: routesOf(events),
    flashes: events.flatMap((event) => (event.type === 'freeStrikeResolved' ? [event.unit] : [])),
    bursts: events.flatMap((event) => (event.type === 'spellResolved'
      ? event.targets.flatMap((target) => {
        const cell = cellOf(battle, target);
        const from = cellOf(battle, event.unit);
        return cell && from ? [{ cell, tree: event.tree, from }] : [];
      })
      : [])),
    markers: marks.map(({ id, mark, to }) => ({
      id: `resolved:${id}`,
      label: unitOf(battle, id)?.name ?? id,
      cells: [to], anchorCells: [to], geometry: 'hex', icon: mark.icon,
    })),
    arrows: marks.map(({ mark, to, from }) => ({ from, to, toCells: [to], tone: mark.tone })),
  };
}

/**
 * What the record that just arrived has to show. Null when this client did not watch the commit
 * happen: a joining client, a loaded save, and a missed delivery all adopt the state and play
 * nothing, since the events in hand describe a transition the board never showed.
 */
export function commitPlay(previous: BattleSession | null, next: BattleSession): CommitPlay | null {
  const commit = next.lastCommit;
  if (!previous || !commit || !next.battle) return null;
  if (previous.battleId !== next.battleId || next.revision !== previous.revision + 1) return null;
  return playFor(commit.events, next.battle, previous.battle?.active ?? null);
}

export interface Presentation {
  /** Called with every adopted record, committed or delivered. */
  observe(session: BattleSession): void;
  /** The board view takes the play while it is on screen. */
  connect(sink: PresentationSink): () => void;
}

export function createPresentation(seed: BattleSession): Presentation {
  let last: BattleSession = seed;
  let sink: PresentationSink | null = null;
  return {
    observe(session) {
      const play = commitPlay(last, session);
      last = session;
      if (!play || !sink) return;
      for (const route of play.routes) sink.route(route.unit, route.cells);
      for (const unit of play.flashes) sink.flash(unit);
      for (const burst of play.bursts) sink.burst(burst.cell, burst.tree, burst.from);
      if (play.markers.length || play.arrows.length) sink.resolved(play.markers, play.arrows);
    },
    connect(next) {
      sink = next;
      return () => { if (sink === next) sink = null; };
    },
  };
}

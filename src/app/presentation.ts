import { castActivityOf, MAX_WOUNDS, notation, type BattleState, type Tree, type Verb } from '../engine/index.js';
import type { PopupPart, TargetArrow, TargetIcon } from '../board/index.js';
import type { BattleEvent } from '../runtime/events.js';
import type { BattleSession } from '../runtime/session.js';
import { unitOf } from './battle-lookup.js';
import type { NotificationService } from './notifications.js';
import { noticesFor, type NoticeViewer } from './session-notices.js';
import { conditionWord, DESTROYED, effectWord, RESISTED, ROUTED, tookHold, wordFor, type ResultWord } from './result-words.js';
import type { TargetMarker } from './targeting.js';

/** What floats over a piece at one moment: a word, or every bar a blow moved, side by side.
 * `cell` is where the piece stands once the commit settles, for a piece the board has already
 * taken off. */
export interface ResultPopup { unit: string; cell: string; parts: PopupPart[] }

/** What one commit shows on the board: the roads walked, the pieces that struck free, the
 * spell effects, the marks the blows left, and the word each roll came to. */
export interface CommitPlay {
  routes: { unit: string; cells: string[] }[];
  flashes: string[];
  bursts: { cell: string; tree: Tree; from: string }[];
  markers: TargetMarker[];
  arrows: TargetArrow[];
  popups: ResultPopup[];
}

export interface PresentationSink {
  route(unit: string, cells: string[]): void;
  flash(unit: string): void;
  burst(cell: string, tree: Tree, from: string): void;
  /** The afterglow of a resolved action: marks where it landed and arrows to each. */
  resolved(markers: TargetMarker[], arrows: TargetArrow[]): void;
  popup(popup: ResultPopup): void;
}

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

function wordOf(event: BattleEvent): { unit: string; word: ResultWord | null } | null {
  if (event.type === 'checkResolved') return event.lands && { unit: event.lands.unit, word: wordFor(event.lands.reads, event.check.degree) };
  if (event.type === 'freeStrikeResolved') return event.check && { unit: event.target, word: wordFor('attack', event.check.degree) };
  // A cast carries a check only where the target's own save announces it. A save is the caster's
  // failure, so it reads Resisted in red even where a lesser effect still lands; a failed save
  // reads as the spell's own name, and the conditions and disorder it leaves follow.
  if (event.type === 'spellResolved' && event.check && event.targets.length) {
    const saved = event.check.degree === 'success' || event.check.degree === 'critical-success';
    return { unit: event.targets[0], word: saved ? RESISTED : tookHold(castActivityOf(event.tree, event.activity).label) };
  }
  return null;
}

function effectOf(event: BattleEvent): { unit: string; word: ResultWord } | null {
  if (event.type === 'woundsChanged') return { unit: event.unit, word: effectWord('wounds', event.to - event.from) };
  if (event.type === 'disorderChanged') return { unit: event.unit, word: effectWord('morale', event.to - event.from) };
  if (event.type === 'conditionGained') return { unit: event.unit, word: conditionWord(event.condition) };
  return event.type === 'unitRouted' ? { unit: event.unit, word: ROUTED } : null;
}

/** The events list every roll before any change of state, which would read a Blast's hits down
 * the line and only then its wounds. Each effect is moved up to follow the last word over its
 * own piece, so a blow reads as its result and then what it cost. The bars one blow moved show
 * together, and so do the conditions it left. */
const kindOf = (event: BattleEvent): 'bars' | 'conditions' | null =>
  event.type === 'woundsChanged' || event.type === 'disorderChanged' ? 'bars' : event.type === 'conditionGained' ? 'conditions' : null;

function popupsOf(events: readonly BattleEvent[], battle: BattleState): ResultPopup[] {
  const popups: ResultPopup[] = [];
  const kinds = new Map<ResultPopup, 'bars' | 'conditions'>();
  const popupOf = (said: { unit: string; word: ResultWord | null } | null): ResultPopup | null => {
    const cell = said && cellOf(battle, said.unit);
    return said?.word && cell ? { unit: said.unit, cell, parts: [said.word] } : null;
  };
  for (const event of events) {
    const word = popupOf(wordOf(event));
    if (word) popups.push(word);
  }
  for (const event of events) {
    const effect = popupOf(effectOf(event));
    if (!effect) continue;
    const last = popups.map((p) => p.unit).lastIndexOf(effect.unit);
    const kind = kindOf(event);
    if (kind && last >= 0 && kinds.get(popups[last]) === kind) popups[last].parts.push(...effect.parts);
    else popups.splice(last < 0 ? popups.length : last + 1, 0, effect);
    if (kind) kinds.set(effect, kind);
  }
  // proto: no event names a death, so the wound that fills the track stands for it. It is the
  // last word over the piece.
  for (const event of events) {
    if (event.type !== 'woundsChanged' || event.to < MAX_WOUNDS) continue;
    const death = popupOf({ unit: event.unit, word: DESTROYED });
    if (death) popups.splice(popups.map((p) => p.unit).lastIndexOf(event.unit) + 1, 0, death);
  }
  return popups;
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
    popups: popupsOf(events, battle),
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
  /** The notification host takes the session notices while the app is mounted. */
  connectNotices(notifications: NotificationService, viewer: NoticeViewer): () => void;
}

interface NoticeHost { service: NotificationService; viewer: NoticeViewer }

function deliver(host: NoticeHost, next: BattleSession): void {
  const { show, dismiss } = noticesFor(next, host.viewer);
  for (const message of show) host.service.show(message);
  for (const id of dismiss) host.service.dismiss(id);
}

export function createPresentation(seed: BattleSession): Presentation {
  let last: BattleSession = seed;
  let sink: PresentationSink | null = null;
  let notices: NoticeHost | null = null;
  return {
    observe(session) {
      const play = commitPlay(last, session);
      if (notices) deliver(notices, session);
      last = session;
      if (!play || !sink) return;
      for (const route of play.routes) sink.route(route.unit, route.cells);
      for (const unit of play.flashes) sink.flash(unit);
      for (const burst of play.bursts) sink.burst(burst.cell, burst.tree, burst.from);
      if (play.markers.length || play.arrows.length) sink.resolved(play.markers, play.arrows);
      for (const popup of play.popups) sink.popup(popup);
    },
    connect(next) {
      sink = next;
      return () => { if (sink === next) sink = null; };
    },
    connectNotices(service, viewer) {
      const entry = { service, viewer };
      notices = entry;
      // The record the client joined on was adopted before any host existed, and the runtime
      // never replays it. Reading it as a first record raises the turn and decision notices a
      // reload or a join has to show, and the null `previous` keeps the activity backlog out.
      deliver(entry, last);
      return () => { if (notices === entry) notices = null; };
    },
  };
}

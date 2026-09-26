import { fromStore } from 'svelte/store';
import { commandReporter, COMMAND_NOTICE } from '../command-notices.js';
import { createScope } from '../scope.js';
import { tick } from 'svelte';
import { activeUnit, activation, notation, siegeEngines, siegeAttackOffer, engineLoading, type SiegeAction, canFocus, type Unit, type EngineState, statusesOf, unitOutcome, positionNotes, wallName, edgeCells, type TargetRef,
  gateReason, siegeReason, wallsFor, fortification, engineKind, engineSpeed, engineLoadSteps, engineLoadProgress, haulingSpeed, CELL_FEET, levelDc } from '../../engine/index.js';
import { offerReason } from './action-menu.js';
import { unitSheet } from './unit-sheet.js';
import { statusEffectsOf } from '../status-effects.js';
import { unitToken } from '../presentation.js';
import { withinApp } from '../app-root.js';
import type { HighlightStyle, TokenPick, TokenModel, EngineTokenModel, FallenModel, BoardEventOf } from '../../board/index.js';
import { createDragController, DRAG_NOTICE, type DragPorts } from './drag-controller.svelte.js';
import { createPickerController, type PickerPorts } from './picker-controller.svelte.js';
import { afterBoardSettles, presentationHooks } from './presentation-hooks.js';
import { createRingController, type RingPorts } from './ring-controller.svelte.js';
import type { BattleContext } from './battle-context.js';
import type { BoardView } from '../../board/index.js';
import type { deselectUnit, endActivation, game, presentation, selectUnit, tableUsers, takeAction, undo } from '../game.svelte.js';
import type { gameMap } from '../map-style.svelte.js';
import type { NotificationService } from '../notifications.js';
import type { offTurnNote, viewer } from '../viewer.svelte.js';

export type BattleBoard = Pick<BoardView, 'screenOf' | 'cellRadius' | 'centerOn' | 'setRoute' | 'burst' | 'combatText' | 'remainingMs'>;

export interface BattleDeps {
  game: typeof game;
  viewer: typeof viewer;
  gameMap: typeof gameMap;
  presentation: typeof presentation;
  takeAction: typeof takeAction;
  selectUnit: typeof selectUnit;
  deselectUnit: typeof deselectUnit;
  endActivation: typeof endActivation;
  undo: typeof undo;
  tableUsers: typeof tableUsers;
  offTurnNote: typeof offTurnNote;
  notifications: NotificationService;
  board: () => BattleBoard | undefined;
}

export function createBattleController(deps: BattleDeps) {
  const notifications = deps.notifications;
  const notices = fromStore(notifications);
  const run = commandReporter(notifications);
  /** This view's own lifetime. Every timer and notice it opens is released together when it
   * goes, the activation scope below included. */
  const view = createScope('battle');
  view.register({ label: 'notices', dispose: () => { notifications.dismiss(DRAG_NOTICE); notifications.dismiss(COMMAND_NOTICE); } });

  let focus = $state(0);

  const ctx: BattleContext = {
    get b() { return b; },
    get active() { return active; },
    get act() { return act; },
    get offers() { return offers; },
    get focus() { return focus; },
    set focus(next) { focus = next; },
    run,
    requireTurn,
    takeAction: deps.takeAction,
    notifications,
  };
  // Each port resolves its siblings on read, so all three exist before any is reached.
  const dragPorts: DragPorts = {
    notices,
    get turnScope() { return turnScope; },
    get picker() { return picker; },
    get ring() { return ring; },
  };
  const pickerPorts: PickerPorts = {
    get hoveredCell() { return hoveredCell; },
    get hoveredEdge() { return hoveredEdge; },
    clearHover: () => { hoveredCell = null; hoveredEdge = null; },
    siege: {
      get engine() { return siegeEngine; },
      get offer() { return siegeOffer; },
      fire: fireSiege,
    },
    get drag() { return drag; },
    get ring() { return ring; },
  };
  const ringPorts: RingPorts = {
    board: deps.board,
    cellOf: (id) => cellOf(id),
    gates: {
      get nearby() { return nearbyGates; },
      open: () => { cancelAction(); gateOpen = true; },
    },
    siege: {
      get equipment() { return siegeEquipment; },
      open: openSiege,
    },
    get drag() { return drag; },
    get picker() { return picker; },
  };
  const drag = createDragController(ctx, dragPorts);
  const picker = createPickerController(ctx, pickerPorts);
  const ring = createRingController(ctx, ringPorts);

  const b = $derived(deps.game.battle!);
  // Only an army the player has actually chosen is active. The engine falls back to the first
  // one still to act, which would pick for them — the carousel exists so they pick.
  const active = $derived(b.active ? activeUnit(b) : null);
  // The whole engine surface for the active unit in one call: the menu, the movement pool,
  // and where it reaches — `moves`/`charges` drive the drag, `offers` drive the popups.
  const act = $derived(active ? activation(b, active.id) : null);
  const sheet = $derived(active ? unitSheet(b, active) : null);
  const offers = $derived(act?.offers ?? []);
  const roster = $derived(b.units.filter((u) => u.side === b.pending && u.status === 'active'));
  let gateOpen = $state(false);
  let gateBusy = $state(false);
  const nearbyGates = $derived(active ? Object.entries(b.board.walls).filter(([key, w]) => w.gate && w.remaining > 0 && edgeCells(key).includes(notation(active.square))) : []);
  const gates = $derived.by(() => {
    if (!active) return [];
    const walls = wallsFor(b.board);
    const here = notation(active.square);
    return nearbyGates.map(([key, wall]) => {
      const fort = fortification(wall.tier);
      const inside = walls.insideOf(key);
      return {
        key, open: !!wall.gate?.open, name: wallName(key),
        detail: `${wallName(key)} · ${fort.name} · ${wall.remaining}/${wall.boxes} · hardness ${fort.hardness} · interior ${inside}`,
        reason: gateReason(b, active, key), interior: inside === here,
      };
    });
  });
  async function operateGate(edge: string) {
    if (!active || gateBusy || !requireTurn()) return;
    gateBusy = true;
    try {
      await run(deps.takeAction({ type: 'gate', unit: active.id, edge, open: !b.board.walls[edge].gate!.open }));
    } finally { gateBusy = false; }
  }
  let siegeOpen = $state(false);
  let siegeSelected = $state<string | null>(null);
  let siegeBusy = $state(false);
  const siegeEquipment = $derived(active ? siegeEngines(b, active) : []);
  const siegeEngine = $derived(siegeSelected ? siegeEquipment.find(e => e.id === siegeSelected) ?? null : siegeEquipment[0] ?? null);
  const siegeOffer = $derived(active && siegeEngine ? siegeAttackOffer(b, active, siegeEngine) : null);

  /** The selected engine's popup, each operation with its refusal. */
  const siegePanel = $derived.by(() => {
    if (!active || !siegeEngine) return null;
    const e = siegeEngine;
    const steps = engineLoadSteps(e);
    return {
      isRam: engineKind(e) === 'ram',
      fixed: engineSpeed(e) === 0,
      loadingLabel: engineLoading(e).label,
      loads: steps > 0,
      loadReason: siegeReason(b, active, e, 'load'),
      loadRemaining: steps - engineLoadProgress(e),
      attackReason: siegeReason(b, active, e, 'attack') ?? (siegeOffer ? offerReason(siegeOffer) ?? null : 'No target in range'),
      haulReason: siegeReason(b, active, e, 'haul'),
      haulHexes: haulingSpeed(active, e, true) / CELL_FEET,
      releaseHexes: haulingSpeed(active, e, false) / CELL_FEET,
    };
  });

  async function openSiege(id?: string) {
    if (!requireTurn()) return;
    if (id && !siegeEquipment.some(e => e.id === id)) {
      const crew = b.units.find(u => siegeEngines(b, u).some(e => e.id === id));
      if (!crew || (locked && active?.id !== crew.id)) return;
      const result = await run(deps.selectUnit(crew.id));
      if (!result.ok) return;
      await tick();
    }
    cancelAction();
    siegeSelected = id ?? siegeEquipment[0]?.id ?? null;
    siegeOpen = true;
  }

  async function operateSiege(operation: SiegeAction['operation']) {
    if (!active || !siegeEngine || siegeBusy || !requireTurn()) return;
    if (operation === 'attack') {
      if (!siegeOffer) return;
      siegeSelected = siegeEngine.id;
      picker.openActivityPicker(siegeOffer, 'siege');
      siegeOpen = false;
      return;
    }
    siegeBusy = true;
    try {
      await run(deps.takeAction({ type: 'siege', unit: active.id, engine: siegeEngine.id, operation }));
    } finally { siegeBusy = false; }
  }

  async function fireSiege(activity: NonNullable<SiegeAction['activity']>, target: TargetRef, commitment: number) {
    if (!active || !siegeEngine || siegeBusy || !requireTurn()) return;
    const engine = siegeEngine.id, unit = active.id, turn = activationKey;
    siegeBusy = true;
    try {
      const result = await run(deps.takeAction({ type: 'siege', operation: 'attack', engine, unit, activity, target, focus: commitment }));
      // Keep the next operation within reach while this crew still has its turn.
      if (result.ok && !view.closed && turn === activationKey && myTurn && active && active.actions > 0
        && siegeSelected === engine && !picker.activityPick && !picker.aim && !picker.blastOpen
        && !ring.radial && !ring.castPick && !drag.pending) siegeOpen = true;
    } finally { siegeBusy = false; }
  }

  // Once an action is spent the choice is made: the engine refuses a second `select`.
  const locked = $derived(b.begun);

  // Every client draws this board; the one whose turn it is plays it. A viewer outside the
  // turn keeps the board's own reading tools — hover, popups, the log — and sends nothing.
  const myTurn = $derived(deps.viewer.mayAct);
  function requireTurn(): boolean {
    if (myTurn) return true;
    // proto: the wording is reserved for review with the rest of the turn and seat text.
    notifications.show({ id: COMMAND_NOTICE, title: 'Not your turn', message: deps.offTurnNote(), tone: 'error' });
    return false;
  }

  // Tracks the pointer's own cell while a spell is armed, so its cast line can follow the
  // cursor before a target is picked — see `cast` below.
  let hoveredCell = $state<string | null>(null);
  let hoveredEdge = $state<string | null>(null);

  // The hover runs both ways: a card in the reel rings its miniature, and a miniature under the
  // pointer lights its card. One unit is hot at a time, whichever end the pointer is at.
  let hoveredCard = $state<string | null>(null);
  // Only a piece with a card of its own: the tie is between the two halves of the reel's own
  // roster, so an enemy under the pointer stays dark.
  const hoveredPiece = $derived(
    roster.find((u) => !b.activated.includes(u.id) && notation(u.square) === hoveredCell)?.id ?? null,
  );
  const hot = $derived(hoveredCard ?? hoveredPiece);

  const FLASH_MS = 700;
  let flashing = $state<string[]>([]);
  let flashTimers: ReturnType<typeof setTimeout>[] = [];
  function flash(id: string) {
    flashing = [...flashing, id];
    flashTimers.push(setTimeout(() => { flashing = flashing.filter((x) => x !== id); }, FLASH_MS));
  }
  // The flash belongs to the commit that caused it, not to the activation, so it outlives the
  // activation scope and goes with the view.
  view.register({ label: 'flash timers', dispose: () => { for (const t of flashTimers) clearTimeout(t); } });
  const flashSet = $derived(new Set(flashing));

  /** Everything the local interaction holds: open popups, an unreleased drag, the refusal a
   * drag left on the board. None of it is the engine's, and none of it survives the activation
   * that opened it. */
  function dropLocalInteraction() {
    siegeOpen = false; siegeSelected = null; gateOpen = false;
    focus = 0;
    drag.clear(); drag.resetBands();
    ring.clear();
    picker.clear();
  }

  /** Cancel the whole action so the next click on the acting unit opens its wheel. */
  function cancelAction() {
    siegeOpen = false; siegeSelected = null; gateOpen = false;
    focus = 0;
    drag.clear(); notifications.dismiss(DRAG_NOTICE);
    ring.clear();
    picker.clear();
  }

  /** One step back up the chain the ring starts: popup, then the wash, then the tree picker
   * (Cast only), then the ring, then nothing. Nothing is committed until the last click, so
   * every stage can be walked out of. Each controller walks its own part; the order is here. */
  function stepBack() {
    if (drag.blockedNotice) { notifications.dismiss(DRAG_NOTICE); return; }
    const reopen = picker.stepBack();
    if (reopen === 'siege') siegeOpen = true;
    else if (reopen === 'trees') ring.openTrees();
    else if (reopen === 'ring') ring.openRing();
    if (reopen) return;
    if (drag.pending) { drag.unpark(); return; }
    if (picker.aim) { picker.closeAim(); return; }
    if (drag.meleeTarget) { drag.closeMelee(); return; }
    if (ring.stepBack()) return;
    if (gateOpen) { gateOpen = false; return; }
    if (siegeOpen) siegeOpen = false;
  }

  function onWindowPointerDown(e: PointerEvent) {
    drag.notePress();
    ring.onWindowPointerDown(e);
  }

  /** One activation, named the way the executor names a turn: a new unit, a new activation, a
   * new round, or a new holder closes the scope and everything registered against it. */
  const activationKey = $derived(`${b.day}:${b.round}:${b.activated.length}:${b.pending}:${active?.id ?? ''}:${deps.game.turn ?? ''}`);
  let turnScope = createScope('');
  view.register({ label: 'activation scope', dispose: () => turnScope.close() });
  $effect(() => {
    if (turnScope.key === activationKey) return;
    turnScope.close();
    turnScope = createScope(activationKey);
    turnScope.register({ label: 'local interaction', dispose: dropLocalInteraction });
    turnScope.register({ label: 'drag refusal', dispose: () => notifications.dismiss(DRAG_NOTICE) });
  });

  const cellOf = (id: string) => {
    const u = b.units.find((x) => x.id === id);
    return u ? notation(u.square) : null;
  };

  const stepBy = (key: string, length: number) => (key === 'ArrowDown' ? 1 : length - 1);

  function onKey(e: KeyboardEvent) {
    if (!withinApp(e.target)) return;
    // One Escape, one step back — the same walk out that a click off the target takes.
    if (e.key === 'Escape') { stepBack(); return; }
    // Native controls handle Enter themselves; a disabled choice must never confirm another action.
    if (e.target instanceof Element && e.target.closest('button, input, select, textarea, summary, a')) return;
    if (picker.blastOpen || picker.activityPick) return;
    if (drag.pending) {
      if (e.key === 'Enter') { e.preventDefault(); void drag.commit(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        drag.stepRow(stepBy(e.key, drag.pending.rows.length));
      }
      return;
    }
    if (!picker.aim) return;
    if (e.key === 'Enter') { e.preventDefault(); picker.takeAim(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      picker.stepAimRow(stepBy(e.key, picker.aimActivities.length));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      picker.stepAimVerb(e.key === 'ArrowRight' ? 1 : picker.aim.groups.length - 1);
    }
  }
  const cost = $derived(drag.picked ? drag.dropCost(drag.picked) : picker.aimed ? (picker.aimed.cost ?? 0) + (picker.aimGroup && canFocus(picker.aimGroup.offer.type, picker.aimGroup.offer.spell) ? focus : 0) : 0);
  const actionsLeft = $derived(act?.actions ?? 0);
  // The round and the side are announced as the board finishes showing the commit that changed
  // them: the walk, the cast, the words and the statuses play out, and the announcement comes in
  // over the last word's fade. The first look comes a beat after the record, which is when the
  // board has taken up what it has to show.
  const ANNOUNCE_OVERLAP_MS = 500;
  let announced = $state<{ day: number; round: number; activated: number; pending: Unit['side']; player: string | null } | null>(null);
  /** Who plays the activation being announced. Nothing at a table of one, where the name is no news. */
  function playerNow(): string | null {
    if (deps.tableUsers().length < 2 || !deps.game.turn) return null;
    return deps.viewer.isHolder ? 'Your turn' : deps.viewer.holderName;
  }
  $effect(() => {
    if (b.phase !== 'battle') { announced = null; return; }
    const next = { day: b.day, round: b.round, activated: b.activated.length, pending: b.pending, player: playerNow() };
    return afterBoardSettles(deps.board, ANNOUNCE_OVERLAP_MS, () => { announced = next; });
  });

  const hooks = presentationHooks(deps.board, flash, (markers, arrows) => {
    picker.showResolved(markers, arrows);
  });
  view.register({ label: 'resolution timer', dispose: hooks.dispose });

  const highlights = $derived<{ style: HighlightStyle; cells: string[] }[]>([
    { style: ring.propStyle, cells: ring.propCells },
    { style: picker.aimStyle, cells: picker.aimCells },
    { style: picker.pickerOffer ? picker.styleFor(picker.pickerOffer) : 'deploy', cells: picker.activityPick ? (picker.targetHover && picker.pickerPreview ? picker.targetCells(picker.pickerPreview) : picker.pickerService?.surface(picker.activityPick.selected).flatMap((target) => target.cells) ?? []) : [] },
    { style: 'attack', cells: picker.blastOpen ? (picker.blastPreview ? picker.targetCells(picker.blastPreview) : picker.blastCandidates.flatMap(picker.targetCells)) : [] },
    ...drag.bandHighlights,
    ...drag.previewHighlights,
  ]);

  // The acting piece's own hex, in its side's colour: once a unit is picked, the board stops
  // offering the choice and marks the one that was made.
  const selectedHex = $derived(active ? { cell: notation(active.square), side: active.side } : null);

  /** Which of the acting side's pieces are still yours to pick. It runs only while the
   * choice is open: the moment a piece is selected the board goes still and every piece
   * returns to full size, with the selected hex carrying the answer instead. */
  function pickOn(u: Unit): TokenPick | null {
    if (b.active || u.side !== b.pending) return null;
    return b.activated.includes(u.id) ? 'spent' : 'ready';
  }

  const boardEngines = $derived([...b.engines, ...b.units.flatMap(u => u.engines)]);
  function engineOn(u: Unit): EngineState | undefined {
    return u.engines.find(e => e.status === 'crewed')
      ?? boardEngines.find(e => notation(e.square) === notation(u.square));
  }
  const tokens = $derived.by<TokenModel[]>(() => [
    ...b.units.filter((u) => u.status === 'active').map((u) => {
      const e = engineOn(u);
      return unitToken(u, notation(u.square), {
        engine: e?.name ?? null,
        engineId: e?.id,
        loading: e ? engineLoading(e) : undefined,
        verdict: drag.dragTarget?.id === u.id ? (drag.dragTarget.attack ? 'attack' : 'no') : null,
        statuses: statusesOf(u, b.board),
        pick: pickOn(u),
        ring: active?.id === u.id ? 'active' : flashSet.has(u.id) ? 'flash' : hot === u.id ? 'selected' : null,
      });
    }),
    ...boardEngines.filter(e => !b.units.some(u => u.status === 'active' && notation(u.square) === notation(e.square)))
      .map((e): EngineTokenModel => ({ kind: 'engine', id: e.id, side: e.side, name: e.name, cell: notation(e.square), ring: null, loading: engineLoading(e) })),
  ]);

  const fallen = $derived(b.units.filter((u) => u.status === 'destroyed')
    .map((u): FallenModel => ({ id: u.id, name: u.name, cell: notation(u.square) })));

  function onCell(e: BoardEventOf<'cell'>) {
    if (gateOpen) { gateOpen = false; return; }
    if (siegeOpen) { siegeOpen = false; return; }
    notifications.dismiss(DRAG_NOTICE);
    if (picker.activityPick) { picker.pickActivityCell(e.cell); return; }
    if (picker.blastOpen) { picker.pickBlastCell(e.cell); return; }
    // A click on the parked destination confirms the row it has chosen. Anywhere else is a
    // cancel: while something is open or armed, a stray click walks one step back rather than
    // meaning something new, so a verb picked by mistake costs one click to undo.
    if (drag.pending) {
      if (drag.pending.cell === e.cell) {
        if (drag.picked?.kind !== 'charge' && drag.picked?.kind !== 'advance') void drag.commit();
        return;
      }
      stepBack();
      return;
    }
    if (picker.aim) { stepBack(); return; }
    if (ring.castPick) { stepBack(); return; }
    if (drag.meleeTarget) { drag.closeMelee(); return; }
    const p = ring.arming;
    if (p) {
      if (p.cells.includes(e.cell)) ring.applyProp(p, e.cell);
      else stepBack();
      return;
    }
    // Nothing open and bare ground under the click: the pick goes back and the side is
    // choosing again. A unit that has already spent an action keeps its turn — `deselect`
    // refuses — so the click reads as a miss rather than losing what was done. A viewer
    // outside the turn is just looking at the ground, so nothing is sent and nothing is said.
    if (myTurn) void run(deps.deselectUnit());
  }
  function onToken(e: BoardEventOf<'token'>) {
    notifications.dismiss(DRAG_NOTICE);
    if (!picker.activityPick && boardEngines.some(engine => engine.id === e.id)) { void openSiege(e.id); return; }
    if (gateOpen) { gateOpen = false; return; }
    if (siegeOpen) { siegeOpen = false; return; }
    if (picker.activityPick) { const cell = cellOf(e.id); if (cell) picker.pickActivityCell(cell); return; }
    if (picker.blastOpen) { const cell = cellOf(e.id); if (cell) picker.pickBlastCell(cell); return; }
    // Before an army is chosen the board is the second way into the army reel.
    if (!active) {
      const own = b.units.find((x) => x.id === e.id);
      if (own) pickUnit(own, false);
      return;
    }
    // Clicking the target preserves the melee review; its Confirm button executes it.
    if (drag.pending) {
      if ((drag.picked?.kind === 'charge' || drag.picked?.kind === 'advance') && drag.picked.enemy === e.id) return;
      stepBack();
      return;
    }
    if (picker.aim) { stepBack(); return; }
    if (ring.castPick) { stepBack(); return; }
    if (drag.meleeTarget) { drag.closeMelee(); return; }
    const u = b.units.find((x) => x.id === e.id);
    const cell = u ? notation(u.square) : '';
    const p = ring.arming;
    if (p) {
      if (p.cells.includes(cell)) ring.applyProp(p, cell);
      else stepBack();
      return;
    }
    // Your own piece is the verbs; anyone else's is what you can do to them.
    if (e.id === active?.id) { ring.openRing(); return; }
    // Until an action is spent, one of your own pieces still waiting to go is a change of
    // mind, not a target. Verb-first still aims at an ally: `arming` above takes the click.
    if (u && !locked && u.side === b.pending && !b.activated.includes(u.id)) { pickUnit(u, false); return; }
    picker.aimAt({ kind: 'unit', id: e.id }, cell, u?.name ?? e.id);
  }
  // A wall has no cell of its own; its popup opens over the first of the two it divides. Only
  // an armed verb that can hit a wall makes one pickable at all, so the edge is always that
  // verb's own target.
  function onEdge(e: BoardEventOf<'edge'>) {
    if (picker.activityPick && picker.pickerService) {
      const targets = picker.pickerService.matches({ kind: 'edge', id: e.edge });
      if (targets.length === 1) picker.choosePickerTarget(targets[0].id);
      return;
    }
    const p = ring.arming;
    if (!p) { if (b.board.walls[e.edge]?.gate) { cancelAction(); gateOpen = true; } else stepBack(); return; }
    picker.aimAt({ kind: 'wall', id: e.edge }, edgeCells(e.edge)[0], wallName(e.edge), p.type);
  }

  /** `centre` is off when the pick came off the board: the piece is already under the pointer,
   * and moving the map out from under a click loses the ground the player was reading. */
  function pickUnit(u: Unit, centre = true) {
    if (locked && u.id !== b.active) return;
    if (u.status !== 'active' || u.side !== b.pending || b.activated.includes(u.id)) return;
    if (!requireTurn()) return;
    void run(deps.selectUnit(u.id));
    if (centre) deps.board()?.centerOn(notation(u.square));
  }

  const activeRouted = $derived(active ? unitOutcome(active) === 'routed' : false);
  // The conditions take the board's own short words; the effects strip carries their full text.
  const statusLine = $derived(active ? [
    activeRouted ? 'Routed' : '',
    ...positionNotes(b, active),
    ...statusEffectsOf(active, b).map((e) => e.label),
  ].filter(Boolean).join(' · ') : '');

  const spec = $derived(`${b.board.spec.base}${b.board.spec.feature && b.board.spec.feature !== 'none' ? ' · ' + b.board.spec.feature : ''}`);

  let ending = $state(false);

  const pickableEdges = $derived(picker.pickerService
    ? picker.pickerService.choices.filter((target) => target.kind === 'wall').map((target) => target.id)
    : ring.arming?.edges ?? nearbyGates.map(([key]) => key));

  const endTurn = () => void run(deps.endActivation());
  const undoLast = () => void run(deps.undo());

  return {
    /** For the component's `onMount`: the board starts playing commits, and the result stops it. */
    connect: () => deps.presentation.connect(hooks.sink),
    close: () => view.close(),
    endTurn,
    undoLast,
    drag,
    picker,
    ring,
    get focus() { return focus; },
    set focus(next) { focus = next; },
    get b() { return b; },
    get active() { return active; },
    get sheet() { return sheet; },
    get act() { return act; },
    get offers() { return offers; },
    get roster() { return roster; },
    get gateOpen() { return gateOpen; },
    get gateBusy() { return gateBusy; },
    set gateOpen(next) { gateOpen = next; },
    get nearbyGates() { return nearbyGates; },
    get gates() { return gates; },
    get operateGate() { return operateGate; },
    get siegeOpen() { return siegeOpen; },
    get siegeSelected() { return siegeSelected; },
    set siegeSelected(next) { siegeSelected = next; },
    get siegeBusy() { return siegeBusy; },
    get siegeEquipment() { return siegeEquipment; },
    get siegeEngine() { return siegeEngine; },
    get siegeOffer() { return siegeOffer; },
    get siegePanel() { return siegePanel; },
    get openSiege() { return openSiege; },
    get operateSiege() { return operateSiege; },
    get locked() { return locked; },
    get myTurn() { return myTurn; },
    get hoveredCard() { return hoveredCard; },
    set hoveredCard(next) { hoveredCard = next; },
    get hoveredPiece() { return hoveredPiece; },
    get cellOf() { return cellOf; },
    cancelAction,
    stepBack,
    get onKey() { return onKey; },
    get cost() { return cost; },
    get actionsLeft() { return actionsLeft; },
    get announced() { return announced; },
    onWindowPointerDown,
    get pickUnit() { return pickUnit; },
    get statusLine() { return statusLine; },
    get activeRouted() { return activeRouted; },
    get activeDc() { return active ? levelDc(active.level) : 0; },
    get spec() { return spec; },
    get ending() { return ending; },
    set ending(next) { ending = next; },
    get aiming() { return ring.arming !== null || picker.blastOpen || picker.pickerActivity !== null; },
    get board() {
        return {
          board: b.board, tokens, fallen, mode: 'battle' as const,
          terrainAppearance: deps.gameMap.terrainAppearance, inkMap: deps.gameMap.inkMap,
          frozen: ring.radial !== null || ring.castPick !== null,
          highlights, dragPath: drag.previewPath, barred: drag.blockedCell, anchored: drag.anchored, shot: picker.shot, selected: selectedHex,
          draggable: picker.blastOpen || picker.activityPick || !myTurn ? null : active?.id ?? null,
          pickableEdges,
          onhover: (e: BoardEventOf<'hover'>) => { hoveredCell = e.cell; hoveredEdge = e.edge ?? null; },
          oncell: active ? onCell : undefined, ontoken: onToken, onedge: active ? onEdge : undefined,
          ondrag: active ? drag.onBoardDrag : undefined, ondrop: active ? drag.onBoardDrop : undefined,
          onwaypoint: active ? drag.onBoardWaypoint : undefined,
        };
    },
  };
}

export type BattleController = ReturnType<typeof createBattleController>;

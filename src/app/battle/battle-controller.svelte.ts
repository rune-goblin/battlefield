import { fromStore } from 'svelte/store';
import { commandReporter, COMMAND_NOTICE } from '../command-notices.js';
import { createScope } from '../scope.js';
import { tick } from 'svelte';
import { activeUnit, activation, notation, siegeEngines, siegeAttackOffer, type SiegeAction, canFocus, type Unit, type EngineState, statusesOf, isRouted, isMountain, TERRAIN_NOTE, at, isOutflanked } from '../../engine/index.js';
import { withinApp } from '../app-root.js';
import type { HighlightStyle, TokenPick, TokenModel, UnitTokenModel, EngineTokenModel, FallenModel, BoardEventOf } from '../../board/index.js';
import { createDragController, DRAG_NOTICE } from './drag-controller.svelte.js';
import { createPickerController } from './picker-controller.svelte.js';
import { afterBoardSettles, presentationHooks } from './presentation-hooks.js';
import { createRingController } from './ring-controller.svelte.js';
import type { BoardView } from '../../board/index.js';
import type { deselectUnit, endActivation, game, presentation, selectUnit, tableUsers, takeAction, undo } from '../game.svelte.js';
import type { gameMap } from '../map-style.svelte.js';
import type { NotificationService } from '../notifications.js';
import type { offTurnNote, viewer } from '../viewer.svelte.js';

export type BattleBoard = Pick<BoardView, 'screenOf' | 'cellRadius' | 'centerOn' | 'setRoute' | 'burst' | 'popup' | 'remainingMs'>;

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

  // What the three controllers below share. State is read through getters; a controller
  // changes another's state through the verbs here and never by assignment. `focus` is the
  // one field any of them writes: the commitment belongs to whichever popup is open.
  const s = {
    ...deps,
    get notifications() { return notifications; },
    get notices() { return notices; },
    get run() { return run; },
    get requireTurn() { return requireTurn; },
    get turnScope() { return turnScope; },
    get b() { return b; },
    get active() { return active; },
    get act() { return act; },
    get offers() { return offers; },
    get nearbyGates() { return nearbyGates; },
    get siegeEquipment() { return siegeEquipment; },
    get siegeOffer() { return siegeOffer; },
    get siegeEngine() { return siegeEngine; },
    get hoveredCell() { return hoveredCell; },
    get hoveredEdge() { return hoveredEdge; },
    get focus() { return focus; },
    set focus(next) { focus = next; },
    cellOf: (id: string) => cellOf(id),
    clearHover: () => { hoveredCell = null; hoveredEdge = null; },
    openGates: () => { cancelAction(); gateOpen = true; },
    openSiege: (id?: string) => openSiege(id),

    get pending() { return dragging.pending; },
    get meleeOptions() { return dragging.meleeOptions; },
    get enemyAt() { return dragging.enemyAt; },
    get rowsAt() { return dragging.rowsAt; },
    get openMelee() { return dragging.openMelee; },
    get park() { return dragging.park; },
    get unpark() { return dragging.unpark; },

    get aim() { return picker.aim; },
    get blastOpen() { return picker.blastOpen; },
    get activityPick() { return picker.activityPick; },
    get targetCells() { return picker.targetCells; },
    get aimAt() { return picker.aimAt; },
    get openActivityPicker() { return picker.openActivityPicker; },
    get openBlast() { return picker.openBlast; },
    get closeAim() { return picker.closeAim; },
    get closePicker() { return picker.closePicker; },

    get arming() { return ring.arming; },
    get clearRing() { return ring.clear; },
    get disarm() { return ring.disarm; },
  };
  const dragging = createDragController(s);
  const picker = createPickerController(s);
  const ring = createRingController(s);

  const b = $derived(deps.game.battle!);
  // Only an army the player has actually chosen is active. The engine falls back to the first
  // one still to act, which would pick for them — the carousel exists so they pick.
  const active = $derived(b.active ? activeUnit(b) : null);
  // The whole engine surface for the active unit in one call: the menu, the movement pool,
  // and where it reaches — `moves`/`charges` drive the drag, `offers` drive the popups.
  const act = $derived(active ? activation(b, active.id) : null);
  const offers = $derived(act?.offers ?? []);
  const roster = $derived(b.units.filter((u) => u.side === b.pending && u.status === 'active'));
  let gateOpen = $state(false);
  const nearbyGates = $derived(active ? Object.entries(b.board.walls).filter(([key, w]) => w.gate && w.remaining > 0 && key.split('|').includes(notation(active.square))) : []);
  async function operateGate(edge: string) {
    if (!active || !requireTurn()) return;
    await run(deps.takeAction({ type: 'gate', unit: active.id, edge, open: !b.board.walls[edge].gate!.open }));
  }
  let siegeOpen = $state(false);
  let siegeSelected = $state<string | null>(null);
  let siegeBusy = $state(false);
  const siegeEquipment = $derived(active ? siegeEngines(b, active) : []);
  const siegeEngine = $derived(siegeSelected ? siegeEquipment.find(e => e.id === siegeSelected) ?? null : siegeEquipment[0] ?? null);
  const siegeOffer = $derived(active && siegeEngine ? siegeAttackOffer(b, active, siegeEngine) : null);

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
    dragging.clear(); dragging.resetBands();
    ring.clear();
    picker.clear();
  }

  /** Cancel the whole action so the next click on the acting unit opens its wheel. */
  function cancelAction() {
    siegeOpen = false; siegeSelected = null; gateOpen = false;
    focus = 0;
    dragging.clear(); notifications.dismiss(DRAG_NOTICE);
    ring.clear();
    picker.clear();
  }

  /** One step back up the chain the ring starts: popup, then the wash, then the tree picker
   * (Cast only), then the ring, then nothing. Nothing is committed until the last click, so
   * every stage can be walked out of. Each controller walks its own part; the order is here. */
  function stepBack() {
    if (dragging.blockedNotice) { notifications.dismiss(DRAG_NOTICE); return; }
    const reopen = picker.stepBack();
    if (reopen === 'siege') siegeOpen = true;
    else if (reopen === 'trees') ring.openTrees();
    else if (reopen === 'ring') ring.openRing();
    if (reopen) return;
    if (dragging.pending) { dragging.unpark(); return; }
    if (picker.aim) { picker.closeAim(); return; }
    if (dragging.meleeTarget) { dragging.closeMelee(); return; }
    if (ring.stepBack()) return;
    if (gateOpen) { gateOpen = false; return; }
    if (siegeOpen) siegeOpen = false;
  }

  function onWindowPointerDown(e: PointerEvent) {
    dragging.notePress();
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
    if (picker.blastOpen || picker.activityPick) return;
    if (dragging.pending) {
      if (e.key === 'Enter') { e.preventDefault(); void dragging.commit(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        dragging.stepRow(stepBy(e.key, dragging.pending.rows.length));
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
  const cost = $derived(dragging.picked ? dragging.dropCost(dragging.picked) : picker.aimed ? (picker.aimed.cost ?? 0) + (picker.aimGroup && canFocus(picker.aimGroup.offer.type, picker.aimGroup.offer.spell) ? focus : 0) : 0);
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
    ...dragging.bandHighlights,
    ...dragging.previewHighlights,
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
    ...b.units.filter((u) => u.status === 'active').map((u): UnitTokenModel => ({
      kind: 'unit',
      id: u.id,
      side: u.side,
      name: u.name,
      role: u.role,
      level: u.level,
      cell: notation(u.square),
      wounds: u.wounds,
      disorder: u.disorder,
      engine: engineOn(u)?.name ?? null,
      engineId: engineOn(u)?.id,
      verdict: dragging.dragTarget?.id === u.id ? (dragging.dragTarget.attack ? 'attack' : 'no') : null,
      statuses: statusesOf(u),
      pick: pickOn(u),
      ring: active?.id === u.id ? 'active' : flashSet.has(u.id) ? 'flash' : hot === u.id ? 'selected' : null,
    })),
    ...boardEngines.filter(e => !b.units.some(u => u.status === 'active' && notation(u.square) === notation(e.square)))
      .map((e): EngineTokenModel => ({ kind: 'engine', id: e.id, side: e.side, name: e.name, cell: notation(e.square), ring: null })),
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
    if (dragging.pending) {
      if (dragging.pending.cell === e.cell) {
        if (dragging.picked?.kind !== 'charge' && dragging.picked?.kind !== 'advance') void dragging.commit();
        return;
      }
      stepBack();
      return;
    }
    if (picker.aim) { stepBack(); return; }
    if (ring.castPick) { stepBack(); return; }
    if (dragging.meleeTarget) { dragging.closeMelee(); return; }
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
    if (dragging.pending) {
      if ((dragging.picked?.kind === 'charge' || dragging.picked?.kind === 'advance') && dragging.picked.enemy === e.id) return;
      stepBack();
      return;
    }
    if (picker.aim) { stepBack(); return; }
    if (ring.castPick) { stepBack(); return; }
    if (dragging.meleeTarget) { dragging.closeMelee(); return; }
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
    picker.aimAt({ kind: 'wall', id: e.edge }, e.edge.split('|')[0], e.edge.replace('|', ' / '), p.type);
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

  const status = (u: Unit) => [
    isRouted(u) ? 'routed' : '',
    isMountain(b.board, u.square) ? 'mountain +1 Defence' : '',
    TERRAIN_NOTE[at(b.board, u.square).terrain],
    u.engines.some(e => e.hauling) ? `hauling ${u.engines.find(e => e.hauling)!.name}` : '',
    at(b.board, u.square).elevation > 0 ? 'attacks +1 and shots +1 hex a level downhill' : '',
    u.guard ? `guarded +${u.guard.defence} Defence` : '',
    u.rooted ? 'rooted' : '',
    u.exposed ? 'exposed' : '',
    u.inspired ? 'inspired' : '',
    u.suppressedBy ? 'suppressed' : '',
    u.pinnedBy ? 'pinned' : '',
    u.frightened ? 'frightened' : '',
    u.stunned ? 'stunned' : '',
    u.persistent ? 'bleeding' : '',
    u.sureStrike ? 'sure strike' : '',
    u.wrath ? 'wrath' : '',
    u.haste ? 'hasted' : '',
    u.ward ? 'warded' : '',
    u.stoneskin ? 'stoneskin' : '',
    u.aegis ? 'aegis' : '',
    u.movementBonus ? `burst of speed +${u.movementBonus / 10} movement` : '',
    u.sureFooting ? 'sure footing' : '',
    u.flies ? 'flying' : '',
    b.phase === 'battle' && isOutflanked(b, u) ? 'outflanked' : '',
  ].filter(Boolean).join(' · ');

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
    get focus() { return focus; },
    set focus(next) { focus = next; },
    get b() { return b; },
    get active() { return active; },
    get act() { return act; },
    get offers() { return offers; },
    get meleeOptions() { return dragging.meleeOptions; },
    get meleeTarget() { return dragging.meleeTarget; },
    get meleeSelected() { return dragging.meleeSelected; },
    get roster() { return roster; },
    get gateOpen() { return gateOpen; },
    set gateOpen(next) { gateOpen = next; },
    get nearbyGates() { return nearbyGates; },
    get operateGate() { return operateGate; },
    get siegeOpen() { return siegeOpen; },
    get siegeSelected() { return siegeSelected; },
    set siegeSelected(next) { siegeSelected = next; },
    get siegeBusy() { return siegeBusy; },
    get siegeEquipment() { return siegeEquipment; },
    get siegeEngine() { return siegeEngine; },
    get siegeOffer() { return siegeOffer; },
    get openSiege() { return openSiege; },
    get operateSiege() { return operateSiege; },
    get locked() { return locked; },
    get myTurn() { return myTurn; },
    get hoveredBand() { return dragging.hoveredBand; },
    set hoveredBand(next) { dragging.hoveredBand = next; },
    get moveOpen() { return dragging.moveOpen; },
    set moveOpen(next) { dragging.moveOpen = next; },
    get hoveredCard() { return hoveredCard; },
    set hoveredCard(next) { hoveredCard = next; },
    get hoveredPiece() { return hoveredPiece; },
    get offerKey() { return picker.offerKey; },
    get drag() { return dragging.drag; },
    get blockedNotice() { return dragging.blockedNotice; },
    get dragTarget() { return dragging.dragTarget; },
    get pending() { return dragging.pending; },
    get picked() { return dragging.picked; },
    get meleeHover() { return dragging.meleeHover; },
    set meleeHover(next) { dragging.meleeHover = next; },
    get aim() { return picker.aim; },
    get aimGroup() { return picker.aimGroup; },
    get aimActivities() { return picker.aimActivities; },
    get aimed() { return picker.aimed; },
    get anchor() { return ring.anchor; },
    get anchorR() { return ring.anchorR; },
    get cellOf() { return cellOf; },
    get targetCells() { return picker.targetCells; },
    get castPick() { return ring.castPick; },
    get blastOpen() { return picker.blastOpen; },
    get blastLevel() { return picker.blastLevel; },
    get blastTarget() { return picker.blastTarget; },
    get blastCell() { return picker.blastCell; },
    get blastOffer() { return picker.blastOffer; },
    get blastActivity() { return picker.blastActivity; },
    get blastCandidates() { return picker.blastCandidates; },
    get blastPreview() { return picker.blastPreview; },
    get blastSelection() { return picker.blastSelection; },
    get activityPick() { return picker.activityPick; },
    get pickerOffer() { return picker.pickerOffer; },
    get pickerActivity() { return picker.pickerActivity; },
    get pickerService() { return picker.pickerService; },
    get pickerCandidates() { return picker.pickerCandidates; },
    get choosePickerActivity() { return picker.choosePickerActivity; },
    get choosePickerTarget() { return picker.choosePickerTarget; },
    get confirmPicker() { return picker.confirmPicker; },
    get chooseBlastLevel() { return picker.chooseBlastLevel; },
    get confirmBlast() { return picker.confirmBlast; },
    cancelAction,
    stepBack,
    get resetPickerTargets() { return picker.resetPickerTargets; },
    get chooseBlastTarget() { return picker.chooseBlastTarget; },
    get showAllBlastTargets() { return picker.showAllBlastTargets; },
    get chooseDropActivity() { return dragging.chooseDropActivity; },
    get radial() { return ring.radial; },
    get radialItems() { return ring.radialItems; },
    get pickProp() { return ring.pickProp; },
    get castRadialItems() { return ring.castRadialItems; },
    get pickCastTree() { return ring.pickCastTree; },
    get chooseMelee() { return dragging.chooseMelee; },
    get choose() { return dragging.choose; },
    get commit() { return dragging.commit; },
    get onKey() { return onKey; },
    get enemyName() { return dragging.enemyName; },
    get actions() { return dragging.actions; },
    get actionCost() { return dragging.actionCost; },
    get rowLabel() { return dragging.rowLabel; },
    get rowDetail() { return dragging.rowDetail; },
    get rowKey() { return dragging.rowKey; },
    get ACTIVITIES() { return dragging.ACTIVITIES; },
    get CHARGES() { return dragging.CHARGES; },
    get chargeActivity() { return dragging.chargeActivity; },
    get firstManeuverActivity() { return dragging.firstManeuverActivity; },
    get maneuverActivity() { return dragging.maneuverActivity; },
    get chargeCost() { return dragging.chargeCost; },
    get dropCost() { return dragging.dropCost; },
    get cost() { return cost; },
    get actionsLeft() { return actionsLeft; },
    get dragBand() { return dragging.dragBand; },
    get moveBands() { return dragging.moveBands; },
    get holders() { return dragging.holders; },
    get stuck() { return dragging.stuck; },
    get targetingService() { return picker.targetingService; },
    get targetingChoice() { return picker.targetingChoice; },
    get targetMarkers() { return picker.targetMarkers; },
    get announced() { return announced; },
    get resolvedMarkers() { return picker.resolvedMarkers; },
    get hoverTargetMarker() { return picker.hoverTargetMarker; },
    get chooseTargetMarker() { return picker.chooseTargetMarker; },
    get aimChoose() { return picker.aimChoose; },
    get aimVerb() { return picker.aimVerb; },
    get takeAim() { return picker.takeAim; },
    onWindowPointerDown,
    get onWindowClick() { return dragging.onWindowClick; },
    get pickUnit() { return pickUnit; },
    get status() { return status; },
    get spec() { return spec; },
    get ending() { return ending; },
    set ending(next) { ending = next; },
    get aiming() { return ring.arming !== null || picker.blastOpen || picker.pickerActivity !== null; },
    get board() {
        return {
          board: b.board, tokens, fallen, mode: 'battle' as const,
          terrainAppearance: deps.gameMap.terrainAppearance, inkMap: deps.gameMap.inkMap,
          frozen: ring.radial !== null || ring.castPick !== null,
          highlights, dragPath: dragging.previewPath, barred: dragging.blockedCell, anchored: dragging.anchored, shot: picker.shot, selected: selectedHex,
          draggable: picker.blastOpen || picker.activityPick || !myTurn ? null : active?.id ?? null,
          pickableEdges,
          onhover: (e: BoardEventOf<'hover'>) => { hoveredCell = e.cell; hoveredEdge = e.edge ?? null; },
          oncell: active ? onCell : undefined, ontoken: onToken, onedge: active ? onEdge : undefined,
          ondrag: active ? dragging.onBoardDrag : undefined, ondrop: active ? dragging.onBoardDrop : undefined,
        };
    },
  };
}

export type BattleController = ReturnType<typeof createBattleController>;

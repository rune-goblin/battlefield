import { activation, type MeleePlan, type FleePlan, type Unit, dragBlockReason, type ActivityIndex, type PathStep, notation, type ChargeOption, type MeleeFinish, meleeFinishes, chargePath, movePath, fleePlan, fleeBlockReason, parse, engagedEnemies } from '../../engine/index.js';
import type { BoardEventOf, HighlightStyle } from '../../board/index.js';
import type { BoardObject, Verb } from '../../engine/index.js';
import type { Aim } from './picker-controller.svelte.js';
import type { LocalScope } from '../scope.js';
import type { Notification } from '../notifications.js';
import type { Prop } from './ring-controller.svelte.js';
import type { BattleContext } from './battle-context.js';
import { signed } from '../presentation.js';

export const DRAG_NOTICE = 'battle-drag';



// Move's own row, hovered independently of the type row — Move is drag-driven and its bands
// stay visible without a click (Mark: "it shows status based on interaction").
export type MoveBand = 1 | 2 | 3;


// --- Drag to move: the primary verb. A path traces cell by cell as the pointer moves,
// clamped to what the engine's own `moves`/`charges` say is reachable — never recomputed
// here. Dragging past reach just stalls the preview at the last valid cell rather than
// drawing an illegal one (see `onBoardDrag`).
export interface MovePreview { kind: 'move'; cell: string; feet: number; actions: number; path: string[]; near: string[]; far: string[] }

export interface ChargePreview { kind: 'charge'; cell: string; enemy: string; feet: number; actions: number; runUp: boolean; path: string[] }

export interface AdvancePreview { kind: 'advance'; cell: string; enemy: string; feet: number; actions: number; path: string[]; plan: MeleePlan }

// A Step connects the starting hex to the one beside it.
export interface StepPreview { kind: 'step'; cell: string; path: string[] }

export interface FleePreview extends FleePlan { kind: 'flee' }

export type Preview = MovePreview | ChargePreview | StepPreview | AdvancePreview | FleePreview;

// A released drag, parked until the player picks one of its readings and confirms. One drop
// means more than one thing, and deciding by where the pointer landed decides for the player.
export interface Parked { cell: string; rows: Preview[]; index: number; activity: ActivityIndex | null; waypoints: string[] }

// Every other way a Stride can be closed. Contact at least draws enemies next to you; a root
// or a spent last action leaves the board looking exactly like ground you could walk onto,
// so the panel and a dragged token both have to say it out loud.
export interface Stuck { tag: string; why: string }

export interface DragPorts {
  readonly notices: { readonly current: readonly Notification[] };
  readonly turnScope: LocalScope;
  readonly picker: {
    readonly aim: Aim | null;
    readonly blastOpen: boolean;
    readonly activityPick: { key: string; index: ActivityIndex | null; selected: string[]; target?: string } | null;
    closeAim(): void;
    aimAt(target: BoardObject, cell: string, label: string, only?: Verb | null): void;
  };
  readonly ring: { readonly arming: Prop | null; disarm(): void };
}

export function createDragController(ctx: BattleContext, ports: DragPorts) {
  // Space drops a waypoint under a live drag; every reading of the drop routes through them.
  let waypoints = $state.raw<string[]>([]);
  // The waypoints the open melee choice was dropped with, kept after the drag that set them.
  let meleeVia = $state.raw<string[]>([]);
  const liveAct = $derived(ctx.active && waypoints.length ? activation(ctx.b, ctx.active.id, waypoints) : ctx.act);
  const viaAct = $derived(ctx.active && meleeVia.length ? activation(ctx.b, ctx.active.id, meleeVia) : ctx.act);
  const meleeOptions = $derived<Map<string, MeleePlan[]>>(viaAct?.melee ?? new Map());
  const plansFor = (id: string) => waypoints.length ? liveAct?.melee.get(id) ?? [] : meleeOptions.get(id) ?? [];
  const movesVia = $derived(liveAct?.moves ?? new Map());
  let meleeTarget = $state<string | null>(null);
  let meleeSelected = $state<'fight' | 'charge' | null>(null);
  let hoveredBand = $state<MoveBand | null>(null);
  let moveOpen = $state(true);
  let live = $state<Preview | null>(null);
  // The cell a drag has pulled to that the piece may not take — an X goes there, since the
  // refusal reads where the player is pulling rather than on the piece under their finger.
  let blockedCell = $state<string | null>(null);
  // A refusal survives release so the player has time to read it; the activation scope above
  // takes it away with everything else it opened.
  const blockedNotice = $derived(ports.notices.current.find(n => n.id === DRAG_NOTICE));

  function explainBlocked(cell: string, enemy?: Unit) {
    const reason = !ctx.active ? null : dragBlockReason(ctx.b, ctx.active, cell)
      ?? (waypoints.length ? 'No legal route through your waypoints reaches it. Release and drag again to clear them.' : null);
    if (reason) ctx.notifications.show({ id: DRAG_NOTICE, title: enemy ? `Cannot attack ${enemy.name}` : `Cannot enter ${cell}`, message: reason, tone: 'error' });
    else ctx.notifications.dismiss(DRAG_NOTICE);
  }
  // The enemy a live drag is pulling into, and whether the drop can reach a melee on it. The
  // mark rides the piece rather than the cell: the overlay's X would sit under the token.
  let dragTarget = $state<{ id: string; attack: boolean } | null>(null);
  let pending = $state<Parked | null>(null);
  const picked = $derived(pending?.rows[pending.index] ?? null);
  // The open melee choice keeps the route the drag drew, until a choice parks its own.
  const meleeRoute = $derived.by<Preview | null>(() => {
    if (!meleeTarget || !ctx.active) return null;
    const plan = [...(meleeOptions.get(meleeTarget) ?? [])].sort((x, y) => x.moveActions - y.moveActions)[0];
    if (plan?.via) return advanceRow(plan);
    const charge = viaAct?.charges.find((c) => c.unit === meleeTarget);
    return charge ? chargeRow(charge, meleeVia) : null;
  });
  let meleeHover = $state<'fight' | 'charge' | null>(null);
  const meleeHoverRoute = $derived.by<Preview | null>(() => {
    const plan = meleeTarget && meleeHover ? meleeOptions.get(meleeTarget)?.find(p => p.kind === meleeHover) : null;
    return plan && (plan.via || plan.kind === 'charge') ? advanceRow(plan) : null;
  });
  const preview = $derived(live ?? meleeHoverRoute ?? picked ?? meleeRoute);

  function classify(path: PathStep[]): { near: string[]; far: string[] } {
    const near: string[] = [];
    const far: string[] = [];
    for (const step of path.slice(1)) (step.actions > 1 ? far : near).push(step.cell);
    return { near, far };
  }

  function enemyAt(cell: string): Unit | undefined {
    const a = ctx.active;
    if (!a) return undefined;
    return ctx.b.units.find((u) => u.status === 'active' && u.side !== a.side && notation(u.square) === cell);
  }

  /** The Fight activities a melee row may end in, each priced whole. */
  const finishesOf = (kind: 'fight' | 'charge', moveActions: number): MeleeFinish[] =>
    ctx.active ? meleeFinishes(ctx.active, kind, moveActions) : [];
  const finishesFor = (row: ChargePreview | AdvancePreview): MeleeFinish[] =>
    row.kind === 'charge' ? finishesOf('charge', 0) : finishesOf(row.plan.kind, row.plan.moveActions);
  const cheapest = (finishes: MeleeFinish[]) => finishes[0]?.cost ?? 0;

  const chargeRow = (c: ChargeOption, via: string[] = waypoints): ChargePreview =>
    ({ kind: 'charge', cell: c.cell, enemy: c.unit, feet: c.feet, actions: cheapest(finishesOf('charge', 0)), runUp: c.runUp, path: chargePath(ctx.b, ctx.active!, c.unit, via) });

  const advanceRow = (plan: MeleePlan): AdvancePreview => ({ kind: 'advance', plan, cell: plan.cell,
    enemy: plan.target, feet: plan.feet, actions: cheapest(finishesOf(plan.kind, plan.moveActions)), path: [...plan.movePath, ...plan.attackPath.slice(1)] });

  function openMelee(id: string, via: string[] = []) {
    pending = null; ports.picker.closeAim(); ctx.focus = 0;
    meleeTarget = id; meleeSelected = null; meleeVia = via;
  }

  function chooseMelee(kind: 'fight' | 'charge') {
    const plan = meleeTarget ? meleeOptions.get(meleeTarget)?.find(p => p.kind === kind) : null;
    if (!plan) return;
    ctx.focus = 0; pending = null; ports.picker.closeAim(); meleeSelected = kind;
    if (plan.via) pending = { cell: plan.cell, rows: [advanceRow(plan)], index: 0, activity: null, waypoints: meleeVia };
    else if (kind === 'charge') {
      const charge = viaAct?.charges.find(c => c.unit === plan.target);
      if (charge) pending = { cell: charge.cell, rows: [chargeRow(charge, meleeVia)], index: 0, activity: null, waypoints: meleeVia };
    } else {
      const enemy = ctx.b.units.find(u => u.id === plan.target)!;
      ports.picker.aimAt({ kind: 'unit', id: enemy.id }, notation(enemy.square), enemy.name, 'fight');
    }
  }

  /** Every reading of a drop on `cell`, in the order the popup offers them. One drag chains as
   * many Move actions as the route costs — `MoveReach.actions` counts them, and a row quotes
   * the whole price rather than asking again per action. */
  function rowsAt(cell: string): Preview[] {
    if (!ctx.active || !ctx.act) return [];
    const rows: Preview[] = [];
    const m = movesVia.get(cell);
    if (m) {
      const path = movePath(ctx.b, ctx.active, cell, waypoints);
      rows.push({ kind: 'move', cell, feet: m.feet, actions: m.actions, path: path.map((s) => s.cell), ...classify(path) });
    }
    // Stopping here and fighting whoever this cell reaches — the same drop, read as a charge.
    for (const c of liveAct?.charges ?? []) if (c.cell === cell) rows.push(chargeRow(c));
    // proto: Step and Flee walk their own roads and ignore waypoints; with any set, only the
    // readings that honour them are offered.
    if (waypoints.length) return rows;
    // A free unit's Move to a neighbour costs the same action and banks the leftover movement,
    // so Step is offered only where it differs: out of a hold with no roll, or where Move can't go.
    if (ctx.act.steps.includes(cell) && (ctx.act.escape || !m)) rows.push({ kind: 'step', cell, path: [notation(ctx.active.square), cell] });
    const escape = fleePlan(ctx.b, ctx.active, cell);
    if (escape) rows.push({ kind: 'flee', ...escape });
    return rows;
  }

  // The cell the live drag is on, so a waypoint can redraw the trace without the pointer moving.
  let over: { cell: string; exit: boolean } | null = null;

  function onBoardDrag(e: BoardEventOf<'drag'>) {
    if (!ctx.active || !ctx.act || e.id !== ctx.active.id) return;
    if (e.cell === null) {
      // Interaction sends a final clear after drop. Preserve the popup or refusal it just set.
      if (live || dragTarget || blockedCell) ctx.notifications.dismiss(DRAG_NOTICE);
      live = null; dragTarget = null; blockedCell = null; over = null;
      if (e.end) waypoints = [];
      return;
    }
    over = { cell: e.cell, exit: !!e.exit };
    trace(over);
  }

  function trace(e: { cell: string; exit: boolean }) {
    if (!ctx.active || !ctx.act) return;
    pending = null; ports.picker.closeAim(); ctx.notifications.dismiss(DRAG_NOTICE);
    meleeTarget = null; meleeSelected = null; meleeVia = [];
    dragTarget = null;
    if (e.exit) {
      const escape = fleePlan(ctx.b, ctx.active, e.cell);
      if (escape) { live = { kind: 'flee', ...escape }; blockedCell = null; }
      else {
        live = null; blockedCell = e.cell;
        ctx.notifications.show({ id: DRAG_NOTICE, title: 'Cannot flee here', message: fleeBlockReason(ctx.b, ctx.active, e.cell), tone: 'error' });
      }
      return;
    }
    // Pulling into a piece is a melee and nothing else: the charge that closes on it, or the
    // fight already in contact. The swords go on the target the moment either one stands up.
    const enemy = enemyAt(e.cell);
    if (enemy) {
      const plans = plansFor(enemy.id);
      const plan = [...plans].sort((a, b) => a.moveActions - b.moveActions)[0];
      const charge = liveAct?.charges.find((c) => c.unit === enemy.id);
      dragTarget = { id: enemy.id, attack: plans.length > 0 };
      // A charge redraws the route to its approach cell; anything else leaves the trace where
      // it stalled, so the arrow still shows how far the drag did get.
      if (plan?.via) live = advanceRow(plan);
      else if (charge) live = chargeRow(charge);
      else if (dragTarget.attack) live = null;
      else explainBlocked(e.cell, enemy);
      blockedCell = null;
      return;
    }
    const next = rowsAt(e.cell)[0];
    // Dragging past reach stalls at the last legal cell rather than drawing an illegal one.
    if (next) { live = next; blockedCell = null; return; }
    // Nothing this cell can mean: past every action, walled off, impassable, or an ally is
    // standing on it. The X goes under the pointer while the arrow keeps the last legal cell
    // it traced, so the refusal names the ground refused rather than the whole gesture. The
    // piece's own square never takes it — an X there would cover the thing it is about.
    blockedCell = e.cell === notation(ctx.active.square) ? null : e.cell;
    if (blockedCell) explainBlocked(blockedCell);
  }

  /** Space over a cell the drag can reach pins the route there; space again on the last
   * waypoint lifts it. */
  function onBoardWaypoint(e: BoardEventOf<'waypoint'>) {
    if (!ctx.active || !ctx.act || e.id !== ctx.active.id) return;
    if (waypoints.at(-1) === e.cell) waypoints = waypoints.slice(0, -1);
    else if (movesVia.has(e.cell)) waypoints = [...waypoints, e.cell];
    else {
      ctx.notifications.show({ id: DRAG_NOTICE, title: `Cannot set a waypoint on ${e.cell}`, message: 'A waypoint goes on a hex this unit could stride to by the route drawn so far.', tone: 'error' });
      return;
    }
    if (over) trace(over);
  }

  function onBoardDrop(e: BoardEventOf<'drop'>) {
    ctx.focus = 0;
    live = null;
    blockedCell = null;
    ctx.notifications.dismiss(DRAG_NOTICE);
    dragTarget = null;
    if (!ctx.active || !ctx.act || e.id !== ctx.active.id) return;
    if (e.exit) {
      const escape = fleePlan(ctx.b, ctx.active, e.cell);
      pending = escape ? { cell: e.cell, rows: [{ kind: 'flee', ...escape }], index: 0, activity: null, waypoints: [] } : null;
      if (!escape) ctx.notifications.show({ id: DRAG_NOTICE, title: 'Cannot flee here', message: fleeBlockReason(ctx.b, ctx.active, e.cell), tone: 'error' });
      return;
    }
    // Dropped on a piece: the charge, or the fight it is already in. A shot is aimed by
    // touching a target, never by dragging into one — a drag is the unit going there.
    const enemy = enemyAt(e.cell);
    if (enemy) {
      if (plansFor(enemy.id).length) openMelee(enemy.id, waypoints);
      else { pending = null; ports.picker.closeAim(); explainBlocked(e.cell, enemy); }
      return;
    }
    // An illegal drop parks nothing: state never changes, so `tokens` never changes, so
    // `TokenLayer` just snaps the token back to where it actually is.
    const rows = rowsAt(e.cell);
    pending = rows.length ? { cell: e.cell, rows, index: 0, activity: null, waypoints } : null;
    if (!rows.length) explainBlocked(e.cell);
  }

  /** A plain move can confirm on its row. Melee always keeps its explicit confirmation. */
  function choose(i: number) {
    if (!pending) return;
    if (pending.index === i && (pending.rows[i].kind === 'move' || pending.rows[i].kind === 'step')) { void commit(); return; }
    ctx.focus = 0;
    pending = { ...pending, index: i, activity: null };
  }

  async function commit() {
    const p = pending;
    pending = null;
    ports.ring.disarm();
    const row = p?.rows[p.index];
    if (!p || !row || !ctx.active || !ctx.requireTurn()) return;
    const unit = ctx.active.id;
    const scope = ports.turnScope;
    const route = p.waypoints.length ? { waypoints: p.waypoints } : {};
    if (row.kind === 'flee') await ctx.run(ctx.takeAction({ type: 'flee', unit, to: row.cell }));
    else if (row.kind === 'advance') await ctx.run(ctx.takeAction({ type: 'advance', unit, target: row.enemy, via: row.plan.via!, finish: row.plan.kind, activity: p.activity ?? undefined, focus: ctx.focus, ...route }));
    else if (row.kind === 'charge') await ctx.run(ctx.takeAction({ type: 'charge', unit, target: row.enemy, activity: p.activity ?? undefined, focus: ctx.focus, ...route }));
    else if (row.kind === 'move') await ctx.run(ctx.takeAction({ type: 'move', unit, to: row.cell, ...route }));
    else if (row.kind === 'step') await ctx.run(ctx.takeAction({ type: 'step', unit, to: row.cell }));
    // The reply can land after this activation ended; the scope that opened the melee choice
    // has already taken it away, and the next one's is not ours to clear.
    if (!scope.closed) { meleeTarget = null; meleeSelected = null; }
  }

  const enemyName = (id: string) => ctx.b.units.find((u) => u.id === id)?.name ?? id;
  const actions = (n: number) => `${n} action${n === 1 ? '' : 's'}`;
  const actionCost = (n: number) => (n === 0 ? 'free, on banked movement' : actions(n));
  const rowLabel = (row: Preview) =>
    row.kind === 'flee' ? 'Flee'
      : row.kind === 'charge' ? `Charge ${enemyName(row.enemy)}`
      : row.kind === 'advance' ? `Move + ${row.plan.kind === 'charge' ? 'Charge' : 'Attack'} ${enemyName(row.enemy)}`
      : row.kind === 'step' ? 'Step here' : 'Move here';
  const rowDetail = (row: Preview) =>
    row.kind === 'flee' ? `${row.moveActions ? `${actions(row.moveActions)} to move + ` : ''}1 action to flee · morale DC ${row.dc}`
      : row.kind === 'charge' ? `${actions(row.actions)}, melee included`
      : row.kind === 'advance' ? `${actions(row.plan.moveActions)} to move + ${row.actions - row.plan.moveActions} to ${row.plan.kind === 'charge' ? 'charge' : 'attack'}`
      : row.kind === 'step' ? '1 action · no roll'
        : ctx.act?.escape ? `${actionCost(row.actions)} · Reflex ${signed(ctx.act.escape.modifier)} vs DC ${ctx.act.escape.dc} to get away`
          : actionCost(row.actions);
  const rowKey = (row: Preview) => `${row.kind}:${row.kind === 'charge' || row.kind === 'advance' ? row.enemy : row.cell}`;

  // A melee takes the Strike unless told otherwise.
  const chargeActivity = $derived(pending?.activity ?? 1);
  const chosenFinish = (row: ChargePreview | AdvancePreview): MeleeFinish | undefined => {
    const finishes = finishesFor(row);
    return finishes.find((f) => f.activity === chargeActivity) ?? finishes[0];
  };
  /** The chosen finish's own actions and the commitment, without the move before it. */
  const finishActions = (row: AdvancePreview) => (chosenFinish(row)?.cost ?? 0) - row.plan.moveActions + ctx.focus;

  /** What each reading of a drop actually costs. */
  const dropCost = (row: Preview): number =>
    row.kind === 'move' || row.kind === 'flee' ? row.actions
      : row.kind === 'charge' || row.kind === 'advance' ? (chosenFinish(row)?.cost ?? 0) + ctx.focus
        : 1;

  const shownWaypoints = $derived(waypoints.length ? waypoints : pending?.waypoints.length ? pending.waypoints : meleeTarget ? meleeVia : []);
  const previewHighlights = $derived.by<{ style: HighlightStyle; cells: string[] }[]>(() => {
    // proto: a waypoint borrows the deployment wash until the overlay has a marker of its own.
    const pins = shownWaypoints.length ? [{ style: 'deploy' as const, cells: shownWaypoints }] : [];
    return [...traceHighlights(), ...pins];
  });
  function traceHighlights(): { style: HighlightStyle; cells: string[] }[] {
    if (!preview) return [];
    if (preview.kind === 'flee') return [{ style: 'move', cells: preview.path.slice(1) }, { style: 'deploy', cells: [preview.cell] }];
    if (preview.kind === 'charge') return [{ style: 'attack', cells: preview.path.slice(1) }];
    if (preview.kind === 'advance') return [
      { style: 'move', cells: preview.plan.movePath.slice(1) },
      { style: 'attack', cells: preview.plan.attackPath.slice(1) },
    ];
    if (preview.kind === 'step') return [{ style: 'move', cells: [preview.cell] }];
    return [{ style: 'move', cells: preview.near }, { style: 'moveFar', cells: preview.far }];
  }
  const previewPath = $derived(preview?.path ?? []);
  // Banked movement can carry a unit to a cell for no further action at all, so a reach's
  // cost floors at the 1-action row rather than indexing a row that does not exist.
  const bandOf = (actions: number): MoveBand => Math.max(1, Math.min(3, actions)) as MoveBand;

  // Which Move row the preview's distance falls into, so the panel tracks the drag.
  const dragBand = $derived.by<MoveBand | null>(() => {
    if (!preview) return null;
    if (preview.kind === 'move') return bandOf(preview.actions);
    return null; // a charge and a step are not Move rows
  });

  // Move's three bands, grouped straight off the engine's own `moves` map — no pathing
  // recomputed here, just the `actions` each already carries.
  const moveBands = $derived.by<Record<MoveBand, string[]>>(() => {
    const bands: Record<MoveBand, string[]> = { 1: [], 2: [], 3: [] };
    if (ctx.act) for (const [cell, m] of ctx.act.moves) bands[bandOf(m.actions)].push(cell);
    return bands;
  });
  // With no Move left the card would otherwise sit there reading "0 cells reachable" three
  // times over with no reason given.
  const holders = $derived(ctx.active ? engagedEnemies(ctx.b, ctx.active) : []);
  const stuck = $derived.by<Stuck | null>(() => {
    if (!ctx.active || !ctx.act || ctx.act.moves.size) return null;
    if (ctx.active.rooted > 0) return {
      tag: 'rooted',
      why: 'Rooted where you stand: no Move, Step or Charge. Your remaining actions can still melee, shoot, rally and cast.',
    };
    if (ctx.active.speed === 0) return { tag: 'no speed', why: 'This piece has Speed 0. It holds the ground it was placed on.' };
    if (ctx.act.actions <= 0) return { tag: 'out of actions', why: 'No actions left to spend — end the activation.' };
    return { tag: 'boxed in', why: 'Nothing adjacent can be entered: the ground around you is blocked or occupied.' };
  });

  // The piece lifts only while some drop could still land. `stuck` already means no Stride, so
  // with no charge and nowhere to step to there is nothing to carry: lifting it to snap it
  // straight back mimes a move being considered, where the X alone is the answer.
  const anchored = $derived(
    stuck && !ctx.act?.charges.length && !ctx.act?.steps.length ? ctx.active?.id ?? null : null,
  );

  const bandStyle = (n: MoveBand): HighlightStyle => (n === 1 ? 'move' : n === 2 ? 'moveFar' : 'moveFar3');

  // Reach is shown on request, not on selection: selecting a unit used to wash three bands
  // across half the board, which buried the map it was drawn on. The drag arrow says where a
  // move goes; hovering a Move row is how you ask to see the band behind it.
  const bandHighlights = $derived.by<{ style: HighlightStyle; cells: string[] }[]>(() => {
    if (!ctx.active || !ctx.act || preview || ports.ring.arming || ports.picker.blastOpen || ports.picker.activityPick || !hoveredBand) return [];
    return [{ style: bandStyle(hoveredBand), cells: moveBands[hoveredBand] }];
  });

  // The board emits nothing for a click off the grid, so the melee choice closes here. A drop
  // that opened the choice also ends in a click; `meleeAtPress` tells that one apart.
  let meleeAtPress: string | null = null;
  function onWindowClick(e: MouseEvent) {
    if (!meleeTarget || meleeTarget !== meleeAtPress || pending || ports.picker.aim) return;
    if (e.target instanceof Element && e.target.closest('.melee-choices')) return;
    closeMelee();
  }

  /** Everything a drag holds open: the live preview, the parked drop and the melee choice. */
  function clear() {
    live = null; dragTarget = null; blockedCell = null; pending = null; waypoints = [];
    closeMelee();
  }
  function closeMelee() { meleeTarget = null; meleeSelected = null; meleeVia = []; }
  const unpark = () => { pending = null; };
  const park = (cell: string, rows: Preview[]) => { pending = { cell, rows, index: 0, activity: null, waypoints: [] }; };
  const resetBands = () => { hoveredBand = null; moveOpen = true; };
  /** The melee choice open at a press, so the click that ends the same press leaves it open. */
  const notePress = () => { meleeAtPress = meleeTarget; };
  function stepRow(by: number) {
    if (!pending) return;
    ctx.focus = 0;
    pending = { ...pending, index: (pending.index + by) % pending.rows.length, activity: null };
  }
  function chooseDropActivity(activity: ActivityIndex) {
    ctx.focus = 0;
    if (pending) pending = { ...pending, activity };
  }

  return {
    clear, closeMelee, unpark, park, resetBands, notePress, stepRow, chooseDropActivity,
    get live() { return live; },
    get dragTarget() { return dragTarget; },
    get pending() { return pending; },
    get hoveredBand() { return hoveredBand; },
    set hoveredBand(next) { hoveredBand = next; },
    get moveOpen() { return moveOpen; },
    set moveOpen(next) { moveOpen = next; },
    get blockedCell() { return blockedCell; },
    get meleeTarget() { return meleeTarget; },
    get meleeSelected() { return meleeSelected; },
    get meleeOptions() { return meleeOptions; },
    get blockedNotice() { return blockedNotice; },
    get enemyAt() { return enemyAt; },
    get openMelee() { return openMelee; },
    get rowsAt() { return rowsAt; },
    get commit() { return commit; },
    get picked() { return picked; },
    get dropCost() { return dropCost; },
    get bandHighlights() { return bandHighlights; },
    get previewHighlights() { return previewHighlights; },
    get meleeHover() { return meleeHover; },
    set meleeHover(next) { meleeHover = next; },
    get chooseMelee() { return chooseMelee; },
    get choose() { return choose; },
    get enemyName() { return enemyName; },
    get actions() { return actions; },
    get actionCost() { return actionCost; },
    get rowLabel() { return rowLabel; },
    get rowDetail() { return rowDetail; },
    get rowKey() { return rowKey; },
    get chargeActivity() { return chargeActivity; },
    get finishesFor() { return finishesFor; },
    get chosenFinish() { return chosenFinish; },
    get finishActions() { return finishActions; },
    get dragBand() { return dragBand; },
    get moveBands() { return moveBands; },
    get holders() { return holders; },
    get stuck() { return stuck; },
    get onWindowClick() { return onWindowClick; },
    get previewPath() { return previewPath; },
    get anchored() { return anchored; },
    get onBoardDrag() { return onBoardDrag; },
    get onBoardDrop() { return onBoardDrop; },
    get onBoardWaypoint() { return onBoardWaypoint; },
  };
}

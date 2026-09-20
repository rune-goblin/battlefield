import { meleePlans, type MeleePlan, type FleePlan, type Unit, dragBlockReason, type ActivityIndex, type PathStep, notation, type ChargeOption, chargePath, movePath, fleePlan, fleeBlockReason, maneuverOutcome, parse, engagedEnemies } from '../../engine/index.js';
import type { BoardEventOf, HighlightStyle } from '../../board/index.js';
import type { Activation, BattleState, TargetRef, Verb } from '../../engine/index.js';
import type { Aim } from './picker-controller.svelte.js';
import type { CommandResult } from '../../runtime/commands.js';
import type { LocalScope } from '../scope.js';
import type { Notification, NotificationService } from '../notifications.js';
import type { Prop } from './ring-controller.svelte.js';
import type { BattleDeps } from './battle-controller.svelte.js';

export const DRAG_NOTICE = 'battle-drag';



// Move's own row, hovered independently of the type row — Move is drag-driven and its bands
// stay visible without a click (Mark: "it shows status based on interaction").
export type MoveBand = 1 | 2 | 3;


// --- Drag to move: the primary verb. A path traces cell by cell as the pointer moves,
// clamped to what the engine's own `moves`/`charges` say is reachable — never recomputed
// here. Dragging past reach just stalls the preview at the last valid cell rather than
// drawing an illegal one (see `onBoardDrag`).
export interface MovePreview { kind: 'move'; cell: string; feet: number; actions: number; path: string[]; near: string[]; far: string[] }

export interface ChargePreview { kind: 'charge'; cell: string; enemy: string; feet: number; actions: number; path: string[] }

export interface AdvancePreview { kind: 'advance'; cell: string; enemy: string; feet: number; actions: number; path: string[]; plan: MeleePlan }

// Maneuver previews connect the starting hex to the chosen destination.
export interface ManeuverPreview { kind: 'maneuver'; cell: string; path: string[] }

export interface FleePreview extends FleePlan { kind: 'flee' }

export type Preview = MovePreview | ChargePreview | ManeuverPreview | AdvancePreview | FleePreview;

// A released drag, parked until the player picks one of its readings and confirms. One drop
// means more than one thing, and deciding by where the pointer landed decides for the player.
export interface Parked { cell: string; rows: Preview[]; index: number; activity: ActivityIndex | null }

// Every other way a Stride can be closed. Contact at least draws enemies next to you; a root
// or a spent last action leaves the board looking exactly like ground you could walk onto,
// so the panel and a dragged token both have to say it out loud.
export interface Stuck { tag: string; why: string }

export interface DragShared extends BattleDeps {
  readonly active: Unit | null;
  readonly b: BattleState;
  readonly notices: { readonly current: readonly Notification[]; };
  readonly notifications: NotificationService;
  readonly act: Activation | null;
  readonly aim: Aim | null;
  readonly closeAim: () => void;
  focus: number;
  readonly aimAt: (target: TargetRef, cell: string, label: string, only?: Verb | null) => void;
  readonly disarm: () => void;
  readonly requireTurn: () => boolean;
  readonly turnScope: LocalScope;
  readonly run: (pending: Promise<CommandResult>) => Promise<CommandResult>;
  readonly arming: Prop | null;
  readonly blastOpen: boolean;
  readonly activityPick: { key: string; index: ActivityIndex | null; selected: string[]; target?: string; } | null;
}

export function createDragController(s: DragShared) {
  const meleeOptions = $derived.by(() => {
    const active = s.active;
    return new Map(active ? s.b.units.filter(u => u.status === 'active' && u.side !== active.side)
      .map(u => [u.id, meleePlans(s.b, active, u.id)] as const) : []);
  });
  let meleeTarget = $state<string | null>(null);
  let meleeSelected = $state<'fight' | 'charge' | null>(null);
  let hoveredBand = $state<MoveBand | null>(null);
  let moveOpen = $state(true);
  let drag = $state<Preview | null>(null);
  // The cell a drag has pulled to that the piece may not take — an X goes there, since the
  // refusal reads where the player is pulling rather than on the piece under their finger.
  let blockedCell = $state<string | null>(null);
  // A refusal survives release so the player has time to read it; the activation scope above
  // takes it away with everything else it opened.
  const blockedNotice = $derived(s.notices.current.find(n => n.id === DRAG_NOTICE));

  function explainBlocked(cell: string, enemy?: Unit) {
    const reason = s.active ? dragBlockReason(s.b, s.active, cell) : null;
    if (reason) s.notifications.show({ id: DRAG_NOTICE, title: enemy ? `Cannot attack ${enemy.name}` : `Cannot enter ${cell}`, message: reason, tone: 'error' });
    else s.notifications.dismiss(DRAG_NOTICE);
  }
  // The enemy a live drag is pulling into, and whether the drop can reach a melee on it. The
  // mark rides the piece rather than the cell: the overlay's X would sit under the token.
  let dragTarget = $state<{ id: string; attack: boolean } | null>(null);
  let pending = $state<Parked | null>(null);
  const picked = $derived(pending?.rows[pending.index] ?? null);
  // The open melee choice keeps the route the drag drew, until a choice parks its own.
  const meleeRoute = $derived.by<Preview | null>(() => {
    if (!meleeTarget || !s.active) return null;
    const plan = [...(meleeOptions.get(meleeTarget) ?? [])].sort((x, y) => x.moveActions - y.moveActions)[0];
    if (plan?.via) return advanceRow(plan);
    const charge = s.act?.charges.find((c) => c.unit === meleeTarget);
    return charge ? chargeRow(charge) : null;
  });
  let meleeHover = $state<'fight' | 'charge' | null>(null);
  const meleeHoverRoute = $derived.by<Preview | null>(() => {
    const plan = meleeTarget && meleeHover ? meleeOptions.get(meleeTarget)?.find(p => p.kind === meleeHover) : null;
    return plan && (plan.via || plan.kind === 'charge') ? advanceRow(plan) : null;
  });
  const preview = $derived(drag ?? meleeHoverRoute ?? picked ?? meleeRoute);

  function classify(path: PathStep[]): { near: string[]; far: string[] } {
    const near: string[] = [];
    const far: string[] = [];
    for (const step of path.slice(1)) (step.actions > 1 ? far : near).push(step.cell);
    return { near, far };
  }

  function enemyAt(cell: string): Unit | undefined {
    const a = s.active;
    if (!a) return undefined;
    return s.b.units.find((u) => u.status === 'active' && u.side !== a.side && notation(u.square) === cell);
  }

  const chargeRow = (c: ChargeOption): ChargePreview =>
    ({ kind: 'charge', cell: c.cell, enemy: c.unit, feet: c.feet, actions: c.actions + 1, path: chargePath(s.b, s.active!, c.unit) });

  const advanceRow = (plan: MeleePlan): AdvancePreview => ({ kind: 'advance', plan, cell: plan.cell,
    enemy: plan.target, feet: plan.feet, actions: plan.moveActions + 1, path: [...plan.movePath, ...plan.attackPath.slice(1)] });

  function openMelee(id: string) {
    pending = null; s.closeAim(); s.focus = 0;
    meleeTarget = id; meleeSelected = null;
  }

  function chooseMelee(kind: 'fight' | 'charge') {
    const plan = meleeTarget ? meleeOptions.get(meleeTarget)?.find(p => p.kind === kind) : null;
    if (!plan) return;
    s.focus = 0; pending = null; s.closeAim(); meleeSelected = kind;
    if (plan.via) pending = { cell: plan.cell, rows: [advanceRow(plan)], index: 0, activity: null };
    else if (kind === 'charge') {
      const charge = s.act?.charges.find(c => c.unit === plan.target);
      if (charge) pending = { cell: charge.cell, rows: [chargeRow(charge)], index: 0, activity: null };
    } else {
      const enemy = s.b.units.find(u => u.id === plan.target)!;
      s.aimAt({ kind: 'unit', id: enemy.id }, notation(enemy.square), enemy.name, 'fight');
    }
  }

  /** Every reading of a drop on `cell`, in the order the popup offers them. One drag chains as
   * many Move actions as the route costs — `MoveReach.actions` counts them, and a row quotes
   * the whole price rather than asking again per action. */
  function rowsAt(cell: string): Preview[] {
    if (!s.active || !s.act) return [];
    const rows: Preview[] = [];
    const m = s.act.moves.get(cell);
    if (m) {
      const path = movePath(s.b, s.active, cell);
      rows.push({ kind: 'move', cell, feet: m.feet, actions: m.actions, path: path.map((s) => s.cell), ...classify(path) });
    }
    // Stopping here and fighting whoever this cell reaches — the same drop, read as a charge.
    for (const c of s.act.charges) if (c.cell === cell) rows.push(chargeRow(c));
    if (s.act.maneuver?.targets.some((t) => t.id === cell)) rows.push({ kind: 'maneuver', cell, path: [notation(s.active.square), cell] });
    const escape = fleePlan(s.b, s.active, cell);
    if (escape) rows.push({ kind: 'flee', ...escape });
    return rows;
  }

  function onBoardDrag(e: BoardEventOf<'drag'>) {
    if (!s.active || !s.act || e.id !== s.active.id) return;
    if (e.cell === null) {
      // Interaction sends a final clear after drop. Preserve the popup or refusal it just set.
      if (drag || dragTarget || blockedCell) s.notifications.dismiss(DRAG_NOTICE);
      drag = null; dragTarget = null; blockedCell = null;
      return;
    }
    pending = null; s.closeAim(); s.notifications.dismiss(DRAG_NOTICE);
    meleeTarget = null; meleeSelected = null;
    dragTarget = null;
    if (e.exit) {
      const escape = fleePlan(s.b, s.active, e.cell);
      if (escape) { drag = { kind: 'flee', ...escape }; blockedCell = null; }
      else {
        drag = null; blockedCell = e.cell;
        s.notifications.show({ id: DRAG_NOTICE, title: 'Cannot flee here', message: fleeBlockReason(s.b, s.active, e.cell), tone: 'error' });
      }
      return;
    }
    // Pulling into a piece is a melee and nothing else: the charge that closes on it, or the
    // fight already in contact. The swords go on the target the moment either one stands up.
    const enemy = enemyAt(e.cell);
    if (enemy) {
      const plans = meleeOptions.get(enemy.id) ?? [];
      const plan = [...plans].sort((a, b) => a.moveActions - b.moveActions)[0];
      const charge = s.act.charges.find((c) => c.unit === enemy.id);
      dragTarget = { id: enemy.id, attack: plans.length > 0 };
      // A charge redraws the route to its approach cell; anything else leaves the trace where
      // it stalled, so the arrow still shows how far the drag did get.
      if (plan?.via) drag = advanceRow(plan);
      else if (charge) drag = chargeRow(charge);
      else if (dragTarget.attack) drag = null;
      else explainBlocked(e.cell, enemy);
      blockedCell = null;
      return;
    }
    const next = rowsAt(e.cell)[0];
    // Dragging past reach stalls at the last legal cell rather than drawing an illegal one.
    if (next) { drag = next; blockedCell = null; return; }
    // Nothing this cell can mean: past every action, walled off, impassable, or an ally is
    // standing on it. The X goes under the pointer while the arrow keeps the last legal cell
    // it traced, so the refusal names the ground refused rather than the whole gesture. The
    // piece's own square never takes it — an X there would cover the thing it is about.
    blockedCell = e.cell === notation(s.active.square) ? null : e.cell;
    if (blockedCell) explainBlocked(blockedCell);
  }

  function onBoardDrop(e: BoardEventOf<'drop'>) {
    s.focus = 0;
    drag = null;
    blockedCell = null;
    s.notifications.dismiss(DRAG_NOTICE);
    dragTarget = null;
    if (!s.active || !s.act || e.id !== s.active.id) return;
    if (e.exit) {
      const escape = fleePlan(s.b, s.active, e.cell);
      pending = escape ? { cell: e.cell, rows: [{ kind: 'flee', ...escape }], index: 0, activity: null } : null;
      if (!escape) s.notifications.show({ id: DRAG_NOTICE, title: 'Cannot flee here', message: fleeBlockReason(s.b, s.active, e.cell), tone: 'error' });
      return;
    }
    // Dropped on a piece: the charge, or the fight it is already in. A shot is aimed by
    // touching a target, never by dragging into one — a drag is the unit going there.
    const enemy = enemyAt(e.cell);
    if (enemy) {
      if (meleeOptions.get(enemy.id)?.length) openMelee(enemy.id);
      else { pending = null; s.closeAim(); explainBlocked(e.cell, enemy); }
      return;
    }
    // An illegal drop parks nothing: state never changes, so `tokens` never changes, so
    // `TokenLayer` just snaps the token back to where it actually is.
    const rows = rowsAt(e.cell);
    pending = rows.length ? { cell: e.cell, rows, index: 0, activity: null } : null;
    if (!rows.length) explainBlocked(e.cell);
  }

  /** A plain move can confirm on its row. Melee always keeps its explicit confirmation. */
  function choose(i: number) {
    if (!pending) return;
    if (pending.index === i && pending.rows[i].kind === 'move') { void commit(); return; }
    s.focus = 0;
    pending = { ...pending, index: i, activity: null };
  }

  async function commit() {
    const p = pending;
    pending = null;
    s.disarm();
    const row = p?.rows[p.index];
    if (!p || !row || !s.active || !s.requireTurn()) return;
    const unit = s.active.id;
    const scope = s.turnScope;
    if (row.kind === 'flee') await s.run(s.takeAction({ type: 'flee', unit, to: row.cell }));
    else if (row.kind === 'advance') await s.run(s.takeAction({ type: 'advance', unit, target: row.enemy, via: row.plan.via!, finish: row.plan.kind, activity: p.activity ?? undefined, focus: s.focus }));
    else if (row.kind === 'charge') await s.run(s.takeAction({ type: 'charge', unit, target: row.enemy, activity: p.activity ?? undefined, focus: s.focus }));
    else if (row.kind === 'move') await s.run(s.takeAction({ type: 'move', unit, to: row.cell }));
    else if (s.act?.maneuver) await performManeuver(p.activity ?? firstManeuverActivity(row.cell), row.cell);
    // The reply can land after this activation ended; the scope that opened the melee choice
    // has already taken it away, and the next one's is not ours to clear.
    if (!scope.closed) { meleeTarget = null; meleeSelected = null; }
  }

  const enemyName = (id: string) => s.b.units.find((u) => u.id === id)?.name ?? id;
  const actions = (n: number) => `${n} action${n === 1 ? '' : 's'}`;
  const actionCost = (n: number) => (n === 0 ? 'free, on banked movement' : actions(n));
  const rowLabel = (row: Preview) =>
    row.kind === 'flee' ? 'Flee'
      : row.kind === 'charge' ? `Charge ${enemyName(row.enemy)}`
      : row.kind === 'advance' ? `Move + ${row.plan.kind === 'charge' ? 'Charge' : 'Attack'} ${enemyName(row.enemy)}`
      : row.kind === 'maneuver' ? (s.active && maneuverOutcome(s.b, s.active, parse(row.cell)) === 'reposition' ? 'Reposition here' : 'Withdraw here') : 'Move here';
  const rowDetail = (row: Preview) =>
    row.kind === 'flee' ? `${row.moveActions ? `${actions(row.moveActions)} to move + ` : ''}1 action to flee · morale DC ${row.dc}`
      : row.kind === 'charge' ? `${actions(row.actions)}, melee included`
      : row.kind === 'advance' ? `${actions(row.plan.moveActions)} to move + 1 to ${row.plan.kind === 'charge' ? 'charge' : 'attack'}`
      : row.kind === 'maneuver' ? maneuverDetail(row.cell)
        : actionCost(row.actions);
  function maneuverDetail(cell: string): string {
    if (!s.active) return 'Maneuver';
    return maneuverOutcome(s.b, s.active, parse(cell)) === 'reposition' ? 'Maneuver · stay in contact'
      : 'Maneuver · break contact';
  }
  const rowKey = (row: Preview) => `${row.kind}:${row.kind === 'charge' || row.kind === 'advance' ? row.enemy : row.cell}`;

  // A charge carries a Fight activity of its own; `doCharge` takes the Strike unless told.
  // Maneuver's own three ride the same picker.
  const ACTIVITIES: ActivityIndex[] = [1, 2, 3];
  // The three the rules name, since a charge's Fight is bought at the charge's own price.
  const CHARGES = ['Charge', 'Charge and Press', 'Charge and Overrun'];
  const chargeActivity = $derived(pending?.activity ?? 1);
  const firstManeuverActivity = (cell?: string): ActivityIndex => s.act?.maneuver?.activities.find(opt => opt.legal && (!cell || opt.targets.some(t => t.id === cell)))?.index ?? 1;
  const maneuverActivity = $derived(pending?.activity ?? firstManeuverActivity(pending?.cell));
  // `c.actions` already counts one action for the melee; the activity's own price replaces it.
  const chargeCost = (c: ChargePreview | AdvancePreview, activity: ActivityIndex) => c.actions - 1 + activity;

  /** What each reading of a drop actually costs. */
  const dropCost = (row: Preview): number =>
    row.kind === 'move' || row.kind === 'flee' ? row.actions
      : row.kind === 'charge' || row.kind === 'advance' ? chargeCost(row, chargeActivity) + s.focus
        : s.act?.maneuver?.activities[maneuverActivity - 1].cost ?? maneuverActivity;

  const previewHighlights = $derived.by<{ style: HighlightStyle; cells: string[] }[]>(() => {
    if (!preview) return [];
    if (preview.kind === 'flee') return [{ style: 'move', cells: preview.path.slice(1) }, { style: 'deploy', cells: [preview.cell] }];
    if (preview.kind === 'charge') return [{ style: 'attack', cells: preview.path.slice(1) }];
    if (preview.kind === 'advance') return [
      { style: 'move', cells: preview.plan.movePath.slice(1) },
      { style: 'attack', cells: preview.plan.attackPath.slice(1) },
    ];
    if (preview.kind === 'maneuver') return [{ style: 'move', cells: [preview.cell] }];
    return [{ style: 'move', cells: preview.near }, { style: 'moveFar', cells: preview.far }];
  });
  const previewPath = $derived(preview?.path ?? []);
  // Banked movement can carry a unit to a cell for no further action at all, so a reach's
  // cost floors at the 1-action row rather than indexing a row that does not exist.
  const bandOf = (actions: number): MoveBand => Math.max(1, Math.min(3, actions)) as MoveBand;

  // Which Move row the preview's distance falls into, so the panel tracks the drag.
  const dragBand = $derived.by<MoveBand | null>(() => {
    if (!preview) return null;
    if (preview.kind === 'move') return bandOf(preview.actions);
    return null; // a charge and a maneuver are not Move rows
  });

  // Move's three bands, grouped straight off the engine's own `moves` map — no pathing
  // recomputed here, just the `actions` each already carries.
  const moveBands = $derived.by<Record<MoveBand, string[]>>(() => {
    const bands: Record<MoveBand, string[]> = { 1: [], 2: [], 3: [] };
    if (s.act) for (const [cell, m] of s.act.moves) bands[bandOf(m.actions)].push(cell);
    return bands;
  });
  // Contact empties `moves` outright (see `moveReach`), so the Move card would otherwise sit
  // there reading "0 cells reachable" three times over with no reason given.
  const holders = $derived(s.active ? engagedEnemies(s.b, s.active) : []);
  const stuck = $derived.by<Stuck | null>(() => {
    if (!s.active || !s.act || s.act.moves.size) return null;
    // Contact keeps its own card in the panel; here it is one more reason a drag goes nowhere.
    if (holders.length) return {
      tag: 'held in contact',
      why: 'A Stride is closed while you are in contact. Maneuver is the only way off this square.',
    };
    if (s.active.rooted > 0) return {
      tag: 'rooted',
      why: 'Rooted where you stand: no Stride, no Charge and no Maneuver. Your remaining actions still fight, shoot, rally and cast.',
    };
    if (s.active.speed === 0) return { tag: 'no speed', why: 'This piece has Speed 0. It holds the ground it was placed on.' };
    if (s.act.actions <= 0) return { tag: 'out of actions', why: 'No actions left to spend — end the activation.' };
    return { tag: 'boxed in', why: 'Nothing adjacent can be entered: the ground around you is blocked or occupied.' };
  });

  // The piece lifts only while some drop could still land. `stuck` already means no Stride, so
  // with no charge and nowhere to maneuver to there is nothing to carry: lifting it to snap it
  // straight back mimes a move being considered, where the X alone is the answer.
  const anchored = $derived(
    stuck && !s.act?.charges.length && !s.act?.maneuver?.targets.length ? s.active?.id ?? null : null,
  );

  const bandStyle = (n: MoveBand): HighlightStyle => (n === 1 ? 'move' : n === 2 ? 'moveFar' : 'moveFar3');

  // Reach is shown on request, not on selection: selecting a unit used to wash three bands
  // across half the board, which buried the map it was drawn on. The drag arrow says where a
  // move goes; hovering a Move row is how you ask to see the band behind it.
  const bandHighlights = $derived.by<{ style: HighlightStyle; cells: string[] }[]>(() => {
    if (!s.active || !s.act || preview || s.arming || s.blastOpen || s.activityPick || !hoveredBand) return [];
    return [{ style: bandStyle(hoveredBand), cells: moveBands[hoveredBand] }];
  });

  async function performManeuver(activity: ActivityIndex, to?: string) {
    if (!s.active || !s.requireTurn()) return;
    await s.run(s.takeAction({ type: 'maneuver', unit: s.active.id, activity, to }));
  }

  // The board emits nothing for a click off the grid, so the melee choice closes here. A drop
  // that opened the choice also ends in a click; `meleeAtPress` tells that one apart.
  let meleeAtPress: string | null = null;
  function onWindowClick(e: MouseEvent) {
    if (!meleeTarget || meleeTarget !== meleeAtPress || pending || s.aim) return;
    if (e.target instanceof Element && e.target.closest('.melee-choices')) return;
    closeMelee();
  }

  /** Everything a drag holds open: the live preview, the parked drop and the melee choice. */
  function clear() {
    drag = null; dragTarget = null; blockedCell = null; pending = null;
    closeMelee();
  }
  function closeMelee() { meleeTarget = null; meleeSelected = null; }
  const unpark = () => { pending = null; };
  const park = (cell: string, rows: Preview[]) => { pending = { cell, rows, index: 0, activity: null }; };
  const resetBands = () => { hoveredBand = null; moveOpen = true; };
  /** The melee choice open at a press, so the click that ends the same press leaves it open. */
  const notePress = () => { meleeAtPress = meleeTarget; };
  function stepRow(by: number) {
    if (!pending) return;
    s.focus = 0;
    pending = { ...pending, index: (pending.index + by) % pending.rows.length, activity: null };
  }
  function chooseDropActivity(activity: ActivityIndex) {
    s.focus = 0;
    if (pending) pending = { ...pending, activity };
  }

  return {
    clear, closeMelee, unpark, park, resetBands, notePress, stepRow, chooseDropActivity,
    get drag() { return drag; },
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
    get ACTIVITIES() { return ACTIVITIES; },
    get CHARGES() { return CHARGES; },
    get chargeActivity() { return chargeActivity; },
    get firstManeuverActivity() { return firstManeuverActivity; },
    get maneuverActivity() { return maneuverActivity; },
    get chargeCost() { return chargeCost; },
    get dragBand() { return dragBand; },
    get moveBands() { return moveBands; },
    get holders() { return holders; },
    get stuck() { return stuck; },
    get onWindowClick() { return onWindowClick; },
    get previewPath() { return previewPath; },
    get anchored() { return anchored; },
    get onBoardDrag() { return onBoardDrag; },
    get onBoardDrop() { return onBoardDrop; },
  };
}

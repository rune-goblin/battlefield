import { offerReason, actionReason } from './action-menu.js';
import { type Verb, type ActionOffer, notation, type BoardObject } from '../../engine/index.js';
import { actionIconUrl, castIconUrl, engineArtUrl, type ActionIcon, type HighlightStyle } from '../../board/index.js';
import { DRAG_NOTICE } from './drag-controller.svelte.js';
import type { ActivityIndex, ActivityTarget, EngineState, MeleePlan, Unit, Wall } from '../../engine/index.js';
import type { Aim } from './picker-controller.svelte.js';
import type { Notification, NotificationService } from '../notifications.js';
import type { Parked, Preview } from './drag-controller.svelte.js';
import type { BattleContext } from './battle-context.js';
import type { BattleBoard } from './battle-controller.svelte.js';


// Always these six, always in this order. A ring is learned by direction, so a verb the
// situation forbids dims in place — letting it vanish would rotate every other verb onto a
// new angle and cost the player the muscle memory the ring exists to build.
export type Slot = 'melee' | 'shoot' | 'cast' | 'step' | 'rally' | 'guard';

export interface Prop {
  key: Slot;
  icon: ActionIcon;
  label: string;
  legal: boolean;
  reason?: string;
  /** The verb an aim off this slice narrows to. Charge and Step have none. */
  type: Verb | null;
  style: HighlightStyle;
  /** Everything this verb can touch right now. */
  cells: string[];
  /** The walls among them, by edge key: a wall has no cell of its own to light. */
  edges: string[];
}

export interface RingPorts {
  readonly board: () => BattleBoard | undefined;
  readonly cellOf: (id: string) => string | null;
  readonly gates: { readonly nearby: [string, Wall][]; open(): void };
  readonly siege: { readonly equipment: EngineState[]; open(id?: string): Promise<void> };
  readonly drag: {
    readonly pending: Parked | null;
    readonly meleeOptions: Map<string, MeleePlan[]>;
    enemyAt(cell: string): Unit | undefined;
    rowsAt(cell: string): Preview[];
    openMelee(id: string): void;
    park(cell: string, rows: Preview[]): void;
    unpark(): void;
  };
  readonly picker: {
    readonly aim: Aim | null;
    targetCells(target: ActivityTarget): string[];
    aimAt(target: BoardObject, cell: string, label: string, only?: Verb | null): void;
    openActivityPicker(offer: ActionOffer): void;
    openBlast(level?: ActivityIndex | null): void;
    closeAim(): void;
    closePicker(): void;
  };
}

export function createRingController(ctx: BattleContext, ports: RingPorts) {
  let anchor = $state<{ x: number; y: number } | null>(null);
  let anchorR = $state(0);

  // --- The ring. Touching your own piece blooms its verbs around it, so the menu arrives at
  // the piece rather than the player travelling to a menu. Choosing one either acts on your
  // own piece at once (Guard, Steady) or arms it against a target. It sets no mode a
  // player can be stranded in — a verb stays armed only until it is spent, Esc, or a touch
  // anywhere else.
  const ICON_FOR: Record<Verb, ActionIcon> = {
    fight: 'attack', shoot: 'shoot', guard: 'block', rally: 'rally', cast: 'cast',
  };
  const SLOTS: Slot[] = ['melee', 'shoot', 'cast', 'step', 'rally', 'guard'];
  const SLOT_LABEL: Record<Slot, string> = {
    melee: 'Melee', shoot: 'Shoot', cast: 'Cast', step: 'Step', rally: 'Rally', guard: 'Guard',
  };
  const SLOT_STYLE: Record<Slot, HighlightStyle> = {
    melee: 'attack', shoot: 'attack', cast: 'deploy', step: 'move', rally: 'deploy', guard: 'deploy',
  };

  const offerEdges = (offer: ActionOffer): string[] =>
    offer.activities.filter((r) => r.legal).flatMap((r) => r.targets).filter((t) => t.kind === 'wall').map((t) => t.edge);

  /** Where an offer can land, with the unit's own square first when an activity needs no target. */
  function offerCells(offer: ActionOffer): string[] {
    const legal = offer.activities.filter((r) => r.legal);
    const cells = legal.flatMap((r) => r.targets).flatMap(ports.picker.targetCells);
    // A activity that names no target acts on your own piece, which is where its popup opens.
    if (ctx.active && legal.some((r) => !r.needsTarget)) cells.unshift(notation(ctx.active.square));
    return [...new Set(cells)];
  }

  const props = $derived.by<Prop[]>(() => {
    if (!ctx.active || !ctx.act) return [];
    const { verbs, steps } = ctx.act;
    const byType = new Map<Verb, ActionOffer[]>();
    for (const offer of ctx.act.offers) {
      const list = byType.get(offer.type);
      if (list) list.push(offer);
      else byType.set(offer.type, [offer]);
    }
    // Charge shares the melee slice with Fight. Charging is how a unit out of contact reaches
    // the fight the slice already holds, so one direction means "hit them" either way.
    const charges = [...ports.drag.meleeOptions].filter(([, plans]) => plans.length).map(([id]) => ports.cellOf(id)).filter((x): x is string => x !== null);

    return SLOTS.map((key): Prop => {
      const verb = verbs[key === 'melee' ? 'fight' : key];
      const answer = { legal: verb.legal, reason: verb.reason ? actionReason(verb.reason) : undefined };
      if (key === 'step') {
        return { key, icon: 'step', label: 'Step', type: null, style: 'move', ...answer, cells: steps, edges: [] };
      }
      const type: Verb = key === 'melee' ? 'fight' : key;
      const offers = byType.get(type) ?? [];
      const cells = [...new Set([...offers.flatMap(offerCells), ...(key === 'melee' ? charges : [])])];
      if (key === 'melee' && !offers.length) {
        return { key, icon: 'attack', label: 'Melee', type: null, style: 'attack', ...answer, cells: charges, edges: [] };
      }
      // One slice per verb, so a caster's whole book sits behind Cast — the aim popup already
      // groups by verb and shows every spell that reaches whatever the player touches.
      const label = key === 'cast' ? (offers.some(o => o.ability) ? 'Abilities' : 'Cast') : offers[0]?.label ?? SLOT_LABEL[key];
      return {
        key, icon: ICON_FOR[type], label, type, style: SLOT_STYLE[key],
        reason: answer.reason,
        // Cast opens the tree ring, where a blocked tree shows its own reason.
        legal: key === 'cast' ? offers.length > 0 : answer.legal,
        cells,
        edges: [...new Set(offers.flatMap(offerEdges))],
      };
    });
  });

  let armed = $state<string | null>(null);
  // Cast branches through the tree ring, then shares the activity picker with Rally.
  let castPick = $state<ActionOffer[] | null>(null);
  const armedProp = $derived(props.find((p) => p.key === armed && p.legal) ?? null);
  // Stepping back from a popup retains the arm. Cancelling clears it. `arming` is the state
  // where the board is waiting to be touched.
  const arming = $derived(armedProp && !ports.picker.aim && !ports.drag.pending ? armedProp : null);
  // A new activation, or a verb that has run out of targets, drops the arm.
  $effect(() => { if (armed && !armedProp) armed = null; });

  /** The arm, the tree picker and the ring: everything this controller holds open. */
  function clear() { radial = null; castPick = null; armed = null; }
  const disarm = () => { armed = null; };
  const openRing = () => { if (ctx.active) radial = { cell: notation(ctx.active.square) }; };
  const openTrees = () => { castPick = castOffers(); };

  /** The ring's part of the walk out: the wash, then the tree picker (Cast only), then the
   * ring, then nothing. False says none of them was open. */
  function stepBack(): boolean {
    if (armed) {
      armed = null;
      openRing();
      return true;
    }
    if (castPick) { castPick = null; openRing(); return true; }
    if (radial) { radial = null; return true; }
    return false;
  }

  /** Every tree the active unit knows — a fresh read, not a stored list, so a spent
   * pool point is reflected the moment the picker reopens. */
  const castOffers = () => (ctx.act?.offers ?? []).filter((o) => o.type === 'cast');

  /** Rally opens its activities; Cast opens its trees and then activities. Other verbs
   * highlight their targets, opening the target popup directly when only one exists. */
  function takeProp(p: Prop) {
    ctx.focus = 0;
    if (!p.legal || !ctx.active) return;
    ports.drag.unpark();
    ports.picker.closeAim();
    radial = null;
    ports.picker.closePicker();
    if (p.key === 'rally') {
      const offer = ctx.offers.find((o) => o.type === 'rally');
      if (offer) ports.picker.openActivityPicker(offer);
      return;
    }
    if (p.key === 'cast') {
      if (castPick) { castPick = null; return; }
      const offers = castOffers();
      if (offers.length <= 1) {
        if (offers[0] && offerReason(offers[0])) { castPick = offers; return; }
        if (offers[0]?.spell === 'blast') { ports.picker.openBlast(); return; }
        if (offers[0]) ports.picker.openActivityPicker(offers[0]);
      } else {
        castPick = offers;
      }
      return;
    }
    if (armed === p.key) { armed = null; return; }
    armed = p.key;
    if (p.cells.length === 1) applyProp(p, p.cells[0]);
  }

  /** A tree opens its activity picker; Blast retains its shape picker. */
  function chooseTree(o: ActionOffer) {
    if (offerReason(o)) return;
    if (o.spell === 'blast') { ports.picker.openBlast(); return; }
    ports.picker.openActivityPicker(o);
  }

  /** Spend an armed prop on a board object. */
  function applyProp(p: Prop, cell: string) {
    ctx.focus = 0;
    // A charge is read off the cell rather than the slice: in contact the melee slice fights,
    // out of it the same slice closes.
    const enemy = p.key === 'melee' ? ports.drag.enemyAt(cell) : undefined;
    if (enemy && ports.drag.meleeOptions.get(enemy.id)?.length) {
      ports.drag.openMelee(enemy.id);
      return;
    }
    // A step is a destination, not a target, so it parks the same drop a drag there would.
    if (p.key === 'step') {
      const rows = ports.drag.rowsAt(cell).filter((r) => r.kind === 'step');
      if (rows.length) ports.drag.park(cell, rows);
      return;
    }
    const u = ctx.b.units.find((x) => x.status === 'active' && notation(x.square) === cell);
    const target: BoardObject = u ? { kind: 'unit', id: u.id } : { kind: 'cell', id: cell };
    ports.picker.aimAt(target, cell, u?.name ?? cell, p.type);
  }

  let radial = $state<{ cell: string } | null>(null);
  const radialItems = $derived([
    ...props.map((p) => ({ key: p.key, src: actionIconUrl(p.icon), label: p.label, legal: p.legal, reason: p.reason })),
    ...(ports.gates.nearby.length ? [{ key: 'gate', src: actionIconUrl('gate'), label: 'Gate', legal: true }] : []),
    ...(ports.siege.equipment.length ? [{ key: 'siege', src: engineArtUrl(ports.siege.equipment[0].name) ?? actionIconUrl('shoot'), label: 'Siege engine', legal: true }] : []),
  ]);
  const pickProp = (key: string) => {
    if (key === 'gate') { ports.gates.open(); return; }
    if (key === 'siege') { void ports.siege.open(); return; }
    const p = props.find((x) => x.key === key);
    if (p) takeProp(p);
  };

  // Cast's own second ring: the tree picker, on the same spot the first ring just vacated.
  const castRadialItems = $derived((castPick ? castOffers() : []).map((o) => ({
    key: o.ability ?? o.spell as string, src: o.spell ? castIconUrl(o.spell) : actionIconUrl('cast'), label: o.label, legal: !offerReason(o), reason: offerReason(o),
  })));
  const pickCastTree = (key: string) => {
    const o = castPick && castOffers().find((x) => (x.ability ?? x.spell) === key);
    if (o) chooseTree(o);
  };

  // proto: pan, zoom, a window resize and the board's own recentring each move the cell under
  // the open ring, and no one event covers all four — so the anchor is read every frame while
  // the ring is open, and never otherwise. The tree picker is a second ring on the same spot
  // Cast's own ring held — the caster's own square — so it shares this same tracker.
  let lastAnchor: { x: number; y: number } | null = null;
  $effect(() => {
    const cell = radial?.cell ?? (castPick && ctx.active ? notation(ctx.active.square) : null);
    if (!cell) { anchor = null; lastAnchor = null; return; }
    let frame = 0;
    const follow = () => {
      const p = ports.board()?.screenOf(cell);
      if (p && (!lastAnchor || Math.abs(p.x - lastAnchor.x) > 0.5 || Math.abs(p.y - lastAnchor.y) > 0.5)) {
        lastAnchor = { x: p.x, y: p.y };
        anchor = lastAnchor;
      }
      const r = ports.board()?.cellRadius(cell);
      if (r && Math.abs(r - anchorR) > 0.5) anchorR = r;
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  });

  // An armed prop lights everything it can touch, so picking the verb first still teaches
  // reach — the thing pure object-first hides until you happen to touch a distant enemy.
  const propCells = $derived(arming?.cells ?? []);
  // A step lights ground to go to, not a target to hit, so it washes like a move.
  const propStyle = $derived<HighlightStyle>(arming?.style ?? 'attack');

  /** The ring is the menu while it is open: the board answers nothing (`frozen`), and a press
   * anywhere off the ring closes it and does nothing else. */
  function onWindowPointerDown(e: PointerEvent) {
    if (!radial && !castPick) return;
    if (e.target instanceof Element && e.target.closest('.radial')) return;
    radial = null;
    castPick = null;
  }

  return {
    get armed() { return armed; },
    get castPick() { return castPick; },
    get radial() { return radial; },
    clear, disarm, openRing, openTrees, stepBack,
    get arming() { return arming; },
    get propStyle() { return propStyle; },
    get propCells() { return propCells; },
    get applyProp() { return applyProp; },
    get anchor() { return anchor; },
    get anchorR() { return anchorR; },
    get radialItems() { return radialItems; },
    get pickProp() { return pickProp; },
    get castRadialItems() { return castRadialItems; },
    get pickCastTree() { return pickCastTree; },
    get onWindowPointerDown() { return onWindowPointerDown; },
  };
}

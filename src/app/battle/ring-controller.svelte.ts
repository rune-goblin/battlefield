import { type Verb, type ActionOffer, notation, type TargetRef } from '../../engine/index.js';
import { actionIconUrl, castIconUrl, engineArtUrl, type ActionIcon } from '../../board/art.js';
import type { HighlightStyle } from '../../board/index.js';
import { stage } from '../stage-view.svelte.js';
import { DRAG_NOTICE } from './drag-controller.svelte.js';
import type { Activation, ActivityIndex, ActivityTarget, BattleState, EngineState, MeleePlan, Unit, Wall } from '../../engine/index.js';
import type { Aim } from './picker-controller.svelte.js';
import type { Notification, NotificationService } from '../notifications.js';
import type { Parked, Preview } from './drag-controller.svelte.js';
import type { BattleDeps } from './battle-controller.svelte.js';


// Always these six, always in this order. A ring is learned by direction, so a verb the
// situation forbids dims in place — letting it vanish would rotate every other verb onto a
// new angle and cost the player the muscle memory the ring exists to build.
export type Slot = 'melee' | 'shoot' | 'cast' | 'maneuver' | 'rally' | 'guard';

export interface Prop {
  key: Slot;
  icon: ActionIcon;
  label: string;
  legal: boolean;
  /** The verb an aim off this slice narrows to. Charge and Maneuver have none. */
  type: Verb | null;
  style: HighlightStyle;
  /** Everything this verb can touch right now. */
  cells: string[];
  /** The walls among them, by edge key: a wall has no cell of its own to light. */
  edges: string[];
}

export interface RingShared extends BattleDeps {
  readonly b: BattleState;
  readonly active: Unit | null;
  readonly act: Activation | null;
  readonly offers: ActionOffer[];
  readonly nearbyGates: [string, Wall][];
  readonly siegeEquipment: EngineState[];
  focus: number;
  readonly cellOf: (id: string) => string | null;
  readonly openGates: () => void;
  readonly openSiege: (id?: string) => Promise<void>;

  readonly pending: Parked | null;
  readonly meleeOptions: Map<string, MeleePlan[]>;
  readonly enemyAt: (cell: string) => Unit | undefined;
  readonly rowsAt: (cell: string) => Preview[];
  readonly openMelee: (id: string) => void;
  readonly park: (cell: string, rows: Preview[]) => void;
  readonly unpark: () => void;

  readonly aim: Aim | null;
  readonly targetCells: (target: ActivityTarget) => string[];
  readonly aimAt: (target: TargetRef, cell: string, label: string, only?: Verb | null) => void;
  readonly openActivityPicker: (offer: ActionOffer) => void;
  readonly openBlast: (level?: ActivityIndex | null) => void;
  readonly closeAim: () => void;
  readonly closePicker: () => void;
}

export function createRingController(s: RingShared) {
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
  const SLOTS: Slot[] = ['melee', 'shoot', 'cast', 'maneuver', 'rally', 'guard'];
  const SLOT_LABEL: Record<Slot, string> = {
    melee: 'Fight', shoot: 'Shoot', cast: 'Cast', maneuver: 'Maneuver', rally: 'Rally', guard: 'Guard',
  };
  const SLOT_STYLE: Record<Slot, HighlightStyle> = {
    melee: 'attack', shoot: 'attack', cast: 'deploy', maneuver: 'move', rally: 'deploy', guard: 'deploy',
  };

  const offerEdges = (offer: ActionOffer): string[] =>
    offer.activities.filter((r) => r.legal).flatMap((r) => r.targets).filter((t) => t.kind === 'wall').map((t) => t.id);

  /** Where an offer can land, with the unit's own square first when an activity needs no target. */
  function offerCells(offer: ActionOffer): string[] {
    const legal = offer.activities.filter((r) => r.legal);
    const cells = legal.flatMap((r) => r.targets).flatMap(s.targetCells);
    // A activity that names no target acts on your own piece, which is where its popup opens.
    if (s.active && legal.some((r) => !r.needsTarget)) cells.unshift(notation(s.active.square));
    return [...new Set(cells)];
  }

  const props = $derived.by<Prop[]>(() => {
    if (!s.active || !s.act) return [];
    const byType = new Map<Verb, ActionOffer[]>();
    for (const offer of s.act.offers) {
      const list = byType.get(offer.type);
      if (list) list.push(offer);
      else byType.set(offer.type, [offer]);
    }
    // Charge shares the melee slice with Fight. Charging is how a unit out of contact reaches
    // the fight the slice already holds, so one direction means "hit them" either way.
    const charges = [...s.meleeOptions].filter(([, plans]) => plans.length).map(([id]) => s.cellOf(id)).filter((x): x is string => x !== null);
    const w = s.act.maneuver;

    return SLOTS.map((key): Prop => {
      if (key === 'maneuver') {
        return {
          key, icon: 'maneuver', label: 'Maneuver', type: null, style: 'move',
          legal: !!w && w.targets.length > 0,
          cells: w ? w.targets.map((t) => t.id) : [],
          edges: [],
        };
      }
      const type: Verb = key === 'melee' ? 'fight' : key;
      const offers = byType.get(type) ?? [];
      const cells = [...new Set([...offers.flatMap(offerCells), ...(key === 'melee' ? charges : [])])];
      if (key === 'melee' && !offers.length) {
        return {
          key, icon: 'attack', label: 'Melee', type: null, style: 'attack',
          legal: charges.length > 0,
          cells: charges,
          edges: [],
        };
      }
      // One slice per verb, so a caster's whole book sits behind Cast — the aim popup already
      // groups by verb and shows every spell that reaches whatever the player touches.
      const label = key === 'cast' ? 'Cast' : offers[0]?.label ?? SLOT_LABEL[key];
      return {
        key, icon: ICON_FOR[type], label, type, style: SLOT_STYLE[key],
        legal: cells.length > 0,
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
  const arming = $derived(armedProp && !s.aim && !s.pending ? armedProp : null);
  // A new activation, or a verb that has run out of targets, drops the arm.
  $effect(() => { if (armed && !armedProp) armed = null; });

  /** The arm, the tree picker and the ring: everything this controller holds open. */
  function clear() { radial = null; castPick = null; armed = null; }
  const disarm = () => { armed = null; };
  const openRing = () => { if (s.active) radial = { cell: notation(s.active.square) }; };
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

  /** Every tree the active unit could still cast — a fresh read, not a stored list, so a spent
   * pool point is reflected the moment the picker reopens. */
  const castOffers = () => (s.act?.offers ?? []).filter((o) => o.type === 'cast' && o.activities.some((r) => r.legal));

  /** Rally opens its activities; Cast opens its trees and then activities. Other verbs
   * highlight their targets, opening the target popup directly when only one exists. */
  function takeProp(p: Prop) {
    s.focus = 0;
    if (!p.legal || !s.active) return;
    s.unpark();
    s.closeAim();
    radial = null;
    s.closePicker();
    if (p.key === 'rally') {
      const offer = s.offers.find((o) => o.type === 'rally');
      if (offer) s.openActivityPicker(offer);
      return;
    }
    if (p.key === 'cast') {
      if (castPick) { castPick = null; return; }
      const offers = castOffers();
      if (offers.length <= 1) {
        if (offers[0]?.spell === 'blast') { s.openBlast(); return; }
        if (offers[0]) s.openActivityPicker(offers[0]);
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
    if (o.spell === 'blast') { s.openBlast(); return; }
    s.openActivityPicker(o);
  }

  /** Spend an armed prop on a board object. */
  function applyProp(p: Prop, cell: string) {
    s.focus = 0;
    // A charge is read off the cell rather than the slice: in contact the melee slice fights,
    // out of it the same slice closes.
    const enemy = p.key === 'melee' ? s.enemyAt(cell) : undefined;
    if (enemy && s.meleeOptions.get(enemy.id)?.length) {
      s.openMelee(enemy.id);
      return;
    }
    // A maneuver is a destination, not a target, so it parks the same drop a drag there
    // would — and reads its escapes and distance in that popup.
    if (p.key === 'maneuver') {
      const rows = s.rowsAt(cell).filter((r) => r.kind === 'maneuver');
      if (rows.length) s.park(cell, rows);
      return;
    }
    const u = s.b.units.find((x) => x.status === 'active' && notation(x.square) === cell);
    const target: TargetRef = u ? { kind: 'unit', id: u.id } : { kind: 'cell', id: cell };
    s.aimAt(target, cell, u?.name ?? cell, p.type);
  }

  let radial = $state<{ cell: string } | null>(null);
  const radialItems = $derived([
    ...props.map((p) => ({ key: p.key, src: actionIconUrl(p.icon), label: p.label, legal: p.legal })),
    ...(s.nearbyGates.length ? [{ key: 'gate', src: actionIconUrl('block'), label: 'Gate', legal: true }] : []),
    ...(s.siegeEquipment.length ? [{ key: 'siege', src: engineArtUrl(s.siegeEquipment[0].name) ?? actionIconUrl('shoot'), label: 'Siege engine', legal: true }] : []),
  ]);
  const pickProp = (key: string) => {
    if (key === 'gate') { s.openGates(); return; }
    if (key === 'siege') { void s.openSiege(); return; }
    const p = props.find((x) => x.key === key);
    if (p) takeProp(p);
  };

  // Cast's own second ring: the tree picker, on the same spot the first ring just vacated.
  const castRadialItems = $derived((castPick ?? []).map((o) => ({
    key: o.spell as string, src: castIconUrl(o.spell!), label: o.label, legal: true,
  })));
  const pickCastTree = (key: string) => {
    const o = castPick?.find((x) => x.spell === key);
    if (o) chooseTree(o);
  };

  // proto: pan, zoom, a window resize and the board's own recentring each move the cell under
  // the open ring, and no one event covers all four — so the anchor is read every frame while
  // the ring is open, and never otherwise. The tree picker is a second ring on the same spot
  // Cast's own ring held — the caster's own square — so it shares this same tracker.
  let lastAnchor: { x: number; y: number } | null = null;
  $effect(() => {
    const cell = radial?.cell ?? (castPick && s.active ? notation(s.active.square) : null);
    if (!cell) { anchor = null; lastAnchor = null; return; }
    let frame = 0;
    const follow = () => {
      const p = s.board()?.screenOf(cell);
      if (p && (!lastAnchor || Math.abs(p.x - lastAnchor.x) > 0.5 || Math.abs(p.y - lastAnchor.y) > 0.5)) {
        lastAnchor = { x: p.x, y: p.y };
        anchor = lastAnchor;
      }
      const r = s.board()?.cellRadius(cell);
      if (r && Math.abs(r - anchorR) > 0.5) anchorR = r;
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  });

  // An armed prop lights everything it can touch, so picking the verb first still teaches
  // reach — the thing pure object-first hides until you happen to touch a distant enemy.
  const propCells = $derived(arming?.cells ?? []);
  // A maneuver lights ground to run to, not a target to hit, so it washes like a move.
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

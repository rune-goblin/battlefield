<script lang="ts">
  import {
    ACTIONS_PER_ACTIVATION, activation, activeUnit, chargePath, dragBlockReason, meleePlans, engagedEnemies, isOutflanked, isRouted, levelDc, MAX_WOUNDS, ROUTED_AT, movePath, notation,
    at, isMountain, shootCeiling, shootRangeLabel, offersAt, reachOf, targetMatches, canFocus, TREE_TARGET, maneuverOutcome, parse,
    type ActionOffer, type ChargeOption, type ActivityIndex, type Verb, type PathStep, type ActivityOption,
    type ActivityTarget, type TargetOffer, type TargetRef, type Tree, type Unit, type MeleePlan,
  } from '../engine/index.js';
  import { actionIconUrl, castIconUrl, targetIconUrl, type TargetArrow, type ActionIcon, type BoardEventOf, type EngineTokenModel, type HighlightStyle, type TokenModel, type TokenPick, type UnitTokenModel } from '../board/index.js';
  import ActionCost from './ActionCost.svelte';
  import { onDestroy } from 'svelte';
  import { useNotifications } from './notification-context.js';

  const notifications = useNotifications();
  const DRAG_NOTICE = 'battle-drag';
  onDestroy(() => notifications.dismiss(DRAG_NOTICE));
  import CommitmentPicker from './CommitmentPicker.svelte';

  let focus = $state(0);
  import BoardPopup from './BoardPopup.svelte';
  import BattleLog from './BattleLog.svelte';
  import BattleReport from './BattleReport.svelte';
  import PixiBoard from './PixiBoard.svelte';
  import { gameMap } from './map-style.svelte.js';
  import { AppShell, MapControls, TopBar } from './shell/index.js';
  import RadialMenu from './RadialMenu.svelte';
  import TargetMarkers from './TargetMarkers.svelte';
  import { cellsForTarget, targetingIcon, TargetingService, type TargetMarker } from './targeting.js';
  import ArmyReel from './ArmyReel.svelte';
  import MeleeChoices from './MeleeChoices.svelte';
  import { backToSetup, deselectUnit, endActivation, game, selectUnit, takeAction, undo } from './game.svelte.js';

  const b = $derived(game.battle!);
  // Only an army the player has actually chosen is active. The engine falls back to the first
  // one still to act, which would pick for them — the carousel exists so they pick.
  const active = $derived(b.active ? activeUnit(b) : null);
  // The whole engine surface for the active unit in one call: the menu, the movement pool,
  // and where it reaches — `moves`/`charges` drive the drag, `offers` drive the popups.
  const act = $derived(active ? activation(b, active.id) : null);
  const offers = $derived(act?.offers ?? []);
  const meleeOptions = $derived.by(() => new Map(active ? b.units.filter(u => u.status === 'active' && u.side !== active.side)
    .map(u => [u.id, meleePlans(b, active!, u.id)] as const) : []));
  let meleeTarget = $state<string | null>(null);
  let meleeSelected = $state<'fight' | 'charge' | null>(null);
  const roster = $derived(b.units.filter((u) => u.side === b.pending && u.status === 'active'));
  // Once an action is spent the choice is made: the engine refuses a second `select`.
  const locked = $derived(b.begun);

  let boardRef = $state<PixiBoard>();

  // Move's own row, hovered independently of the type row — Move is drag-driven and its bands
  // stay visible without a click (Mark: "it shows status based on interaction").
  type MoveBand = 1 | 2 | 3;
  let hoveredBand = $state<MoveBand | null>(null);
  let moveOpen = $state(true);

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

  // The only place `resolveStrike` is called with `free: true` (doManeuver's covering
  // strikes) — the sole channel to flag a free strike for the token pulse without a
  // dedicated field on the log entry.
  const FREE_STRIKE_RE = /strikes the maneuvering/;
  const FLASH_MS = 700;
  let flashing = $state<string[]>([]);
  let flashTimers: ReturnType<typeof setTimeout>[] = [];
  function flash(id: string) {
    flashing = [...flashing, id];
    flashTimers.push(setTimeout(() => { flashing = flashing.filter((x) => x !== id); }, FLASH_MS));
  }
  $effect(() => () => { for (const t of flashTimers) clearTimeout(t); });
  const flashSet = $derived(new Set(flashing));

  const offerKey = (offer: ActionOffer) => `${offer.type}:${offer.spell ?? ''}`;

  // A new unit drops every open popup and any in-flight drag preview — all of it is
  // per-activation UI state, not part of the engine's own state.
  $effect(() => { void active?.id; focus = 0; aim = null; drag = null; dragTarget = null; pending = null; armed = null; armedTree = null; castPick = null; radial = null; hoveredBand = null; moveOpen = true; blastOpen = false; blastLevel = null; blastTarget = null; blastHover = null; blastCell = null; activityPick = null; targetHover = null; });

  function styleFor(offer: ActionOffer): HighlightStyle {
    if (offer.spell) return TREE_TARGET[offer.spell] === 'enemy' ? 'attack' : 'deploy';
    if (offer.type === 'shoot' || offer.type === 'fight') return 'attack';
    return 'deploy';
  }

  // --- Drag to move: the primary verb. A path traces cell by cell as the pointer moves,
  // clamped to what the engine's own `moves`/`charges` say is reachable — never recomputed
  // here. Dragging past reach just stalls the preview at the last valid cell rather than
  // drawing an illegal one (see `onBoardDrag`).
  interface MovePreview { kind: 'move'; cell: string; feet: number; actions: number; path: string[]; near: string[]; far: string[] }
  interface ChargePreview { kind: 'charge'; cell: string; enemy: string; feet: number; actions: number; path: string[] }
  interface AdvancePreview { kind: 'advance'; cell: string; enemy: string; feet: number; actions: number; path: string[]; plan: MeleePlan }
  // Maneuver previews connect the starting hex to the chosen destination.
  interface ManeuverPreview { kind: 'maneuver'; cell: string; path: string[] }
  type Preview = MovePreview | ChargePreview | ManeuverPreview | AdvancePreview;
  let drag = $state<Preview | null>(null);
  // The cell a drag has pulled to that the piece may not take — an X goes there, since the
  // refusal reads where the player is pulling rather than on the piece under their finger.
  let blockedCell = $state<string | null>(null);
  const blockedNotice = $derived($notifications.find(n => n.id === DRAG_NOTICE));
  // A refusal survives release so the player has time to read it. A new activation clears it.
  $effect(() => { void active?.id; blockedCell = null; notifications.dismiss(DRAG_NOTICE); meleeTarget = null; meleeSelected = null; });

  function explainBlocked(cell: string, enemy?: Unit) {
    const reason = active ? dragBlockReason(b, active, cell) : null;
    if (reason) notifications.show({ id: DRAG_NOTICE, title: enemy ? `Cannot attack ${enemy.name}` : `Cannot enter ${cell}`, message: reason, tone: 'error' });
    else notifications.dismiss(DRAG_NOTICE);
  }
  // The enemy a live drag is pulling into, and whether the drop can reach a melee on it. The
  // mark rides the piece rather than the cell: the overlay's X would sit under the token.
  let dragTarget = $state<{ id: string; attack: boolean } | null>(null);
  // A released drag, parked until the player picks one of its readings and confirms. One drop
  // means more than one thing, and deciding by where the pointer landed decides for the player.
  interface Parked { cell: string; rows: Preview[]; index: number; activity: ActivityIndex | null }
  let pending = $state<Parked | null>(null);
  const picked = $derived(pending?.rows[pending.index] ?? null);
  const preview = $derived(drag ?? picked);
  // Touching a board object opens the other popup: every activity that can act on *that*, which
  // is `offersAt`'s whole job. Grouped by verb, because the props are what the eye lands on —
  // a tile row across the top, then the chosen verb's three activities beneath it.
  interface Aim { cell: string; target: TargetRef; label: string; groups: TargetOffer[]; group: number; index: number }
  let aim = $state<Aim | null>(null);
  const aimGroup = $derived(aim?.groups[aim.group] ?? null);
  /** Show activities for this target, including their unavailable levels. Blast exposes its
   * whole ladder because choosing a level starts a separate area selection. */
  const aimActivities = $derived.by<ActivityOption[]>(() => {
    if (!aim || !aimGroup || !active) return [];
    if (aimGroup.offer.spell === 'blast') return aimGroup.offer.activities;
    const t = aim.target;
    const own = t.kind === 'unit' && t.id === active.id;
    return aimGroup.offer.activities.filter((o) => o.cost !== null
      && (o.targets.some((x) => targetMatches(b, x, t)) || (own && !o.needsTarget)));
  });
  const aimed = $derived(aimActivities[aim?.index ?? -1] ?? null);
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

  // Always these six, always in this order. A ring is learned by direction, so a verb the
  // situation forbids dims in place — letting it vanish would rotate every other verb onto a
  // new angle and cost the player the muscle memory the ring exists to build.
  type Slot = 'melee' | 'shoot' | 'cast' | 'maneuver' | 'rally' | 'guard';
  const SLOTS: Slot[] = ['melee', 'shoot', 'cast', 'maneuver', 'rally', 'guard'];
  const SLOT_LABEL: Record<Slot, string> = {
    melee: 'Fight', shoot: 'Shoot', cast: 'Cast', maneuver: 'Maneuver', rally: 'Rally', guard: 'Guard',
  };
  const SLOT_STYLE: Record<Slot, HighlightStyle> = {
    melee: 'attack', shoot: 'attack', cast: 'deploy', maneuver: 'move', rally: 'deploy', guard: 'deploy',
  };
  interface Prop {
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

  const cellOf = (id: string) => {
    const u = b.units.find((x) => x.id === id);
    return u ? notation(u.square) : null;
  };
  // A Blast's Line and Burst, and a Heal or Restore's set, arrive as one target holding two or
  // three parts joined by '+' — a unit-kind id needs the same split a cell-kind id already gets.
  const targetCells = (target: ActivityTarget): string[] => cellsForTarget(b, target);

  const offerEdges = (offer: ActionOffer): string[] =>
    offer.activities.filter((r) => r.legal).flatMap((r) => r.targets).filter((t) => t.kind === 'wall').map((t) => t.id);

  /** Where an offer can land, with the unit's own square first when an activity needs no target. */
  function offerCells(offer: ActionOffer): string[] {
    const legal = offer.activities.filter((r) => r.legal);
    const cells = legal.flatMap((r) => r.targets).flatMap(targetCells);
    // A activity that names no target acts on your own piece, which is where its popup opens.
    if (active && legal.some((r) => !r.needsTarget)) cells.unshift(notation(active.square));
    return [...new Set(cells)];
  }

  const props = $derived.by<Prop[]>(() => {
    if (!active || !act) return [];
    const byType = new Map<Verb, ActionOffer[]>();
    for (const offer of act.offers) {
      const list = byType.get(offer.type);
      if (list) list.push(offer);
      else byType.set(offer.type, [offer]);
    }
    // Charge shares the melee slice with Fight. Charging is how a unit out of contact reaches
    // the fight the slice already holds, so one direction means "hit them" either way.
    const charges = [...meleeOptions].filter(([, plans]) => plans.length).map(([id]) => cellOf(id)).filter((x): x is string => x !== null);
    const w = act.maneuver;

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
  let armedTree = $state<Tree | null>(null);
  let blastOpen = $state(false);
  let blastLevel = $state<ActivityIndex | null>(null);
  let blastTarget = $state<string | null>(null);
  let blastHover = $state<string | null>(null);
  let blastCell = $state<string | null>(null);
  const blastOffer = $derived(offers.find((o) => o.spell === 'blast') ?? null);
  const blastActivity = $derived(blastOpen ? blastOffer?.activities.find((o) => o.index === blastLevel) ?? null : null);
  const blastService = $derived(active && blastOffer && blastActivity ? new TargetingService(b, active, blastOffer, blastActivity) : null);
  const blastTargets = $derived(blastService?.choices ?? []);
  const blastCandidates = $derived(blastTargets.filter((t) => !blastCell || targetCells(t).includes(blastCell)));
  const blastHoverMatches = $derived(hoveredCell ? blastService?.matches({ kind: 'hex', id: hoveredCell }) ?? [] : []);
  const blastPreview = $derived(blastTargets.find((t) => t.id === blastHover)
    ?? (blastHoverMatches.length === 1 ? blastHoverMatches[0] : null)
    ?? blastTargets.find((t) => t.id === blastTarget) ?? null);
  const blastSelection = $derived(blastTargets.find((t) => t.id === blastTarget) ?? null);


  // Cast and Rally show their activities before asking for a target.
  let activityPick = $state<{ key: string; index: ActivityIndex | null; selected: string[]; target?: string } | null>(null);
  let targetHover = $state<string | null>(null);
  const pickerOffer = $derived(offers.find((o) => offerKey(o) === activityPick?.key) ?? null);
  const pickerActivity = $derived(pickerOffer?.activities.find((o) => o.index === activityPick?.index) ?? null);
  const pickerService = $derived(active && pickerOffer && pickerActivity ? new TargetingService(b, active, pickerOffer, pickerActivity) : null);
  const pickerTargets = $derived(pickerService?.choices ?? []);
  const pickerCandidates = $derived(pickerService?.candidates(activityPick?.selected) ?? []);
  const pickerHoverMatches = $derived(hoveredCell ? pickerService?.matches({ kind: 'hex', id: hoveredCell }) ?? [] : []);
  const pickerPreview = $derived(pickerTargets.find((t) => t.id === targetHover)
    ?? (pickerHoverMatches.length === 1 ? pickerHoverMatches[0] : null)
    ?? pickerTargets.find((t) => t.id === activityPick?.target) ?? null);

  function openActivityPicker(offer: ActionOffer) {
    focus = 0;
    aim = null; pending = null; radial = null; castPick = null;
    armed = null; armedTree = null; targetHover = null;
    activityPick = { key: offerKey(offer), index: null, selected: [] };
  }

  function choosePickerActivity(index: ActivityIndex) {
    const offer = pickerOffer;
    const option = offer?.activities.find((o) => o.index === index);
    if (!offer || !option?.legal || !activityPick) return;
    targetHover = null;
    focus = 0;
    activityPick = { ...activityPick, index, selected: [], target: undefined };
  }

  function choosePickerTarget(id: string) {
    const offer = pickerOffer, option = pickerActivity;
    const target = pickerTargets.find((t) => t.id === id);
    if (!offer || !option?.legal || !target) return;
    if (activityPick) activityPick = { ...activityPick, target: target.id };
    targetHover = null;
  }

  function confirmPicker() {
    const offer = pickerOffer, option = pickerActivity, target = activityPick?.target;
    if (!offer || !option?.legal || (option.needsTarget && !target)) return;
    performActivity(offer, option, target);
    activityPick = null; targetHover = null;
  }

  function pickActivityCell(cell: string) {
    if (!activityPick || !pickerActivity?.legal) return;
    const pick = pickerService?.pickCell(cell, activityPick.selected);
    if (!pick) return;
    targetHover = null;
    if (pick.target) choosePickerTarget(pick.target.id);
    else activityPick = { ...activityPick, selected: pick.selected, target: undefined };
  }

  function openBlast(level: ActivityIndex | null = null) {
    aim = null; pending = null; radial = null; castPick = null;
    armed = null; armedTree = null;
    activityPick = null; targetHover = null;
    blastOpen = true;
    chooseBlastLevel(level);
  }

  function chooseBlastLevel(level: ActivityIndex | null) {
    focus = 0;
    blastLevel = level; blastTarget = null; blastHover = null; blastCell = null;
  }

  function pickBlastCell(cell: string) {
    if (!blastActivity?.legal) return;
    if (blastLevel === 1) {
      blastTarget = blastService?.matches({ kind: 'hex', id: cell })[0]?.id ?? null;
    } else {
      // A hex can belong to several shapes. Keep every match for an explicit choice.
      blastCell = cell; blastTarget = null;
    }
    blastHover = null;
  }

  function confirmBlast() {
    if (!blastOffer || !blastActivity?.legal || !blastSelection) return;
    performActivity(blastOffer, blastActivity, blastSelection.id);
    blastOpen = false; chooseBlastLevel(null);
  }
  const armedProp = $derived(props.find((p) => p.key === armed && p.legal) ?? null);
  const armedCastOffer = $derived(
    armed === 'cast' && armedTree ? (act?.offers.find((o) => o.type === 'cast' && o.spell === armedTree) ?? null) : null,
  );
  // Stepping back from a popup retains the arm. Cancelling clears it. `arming` is the state
  // where the board is waiting to be touched —
  // narrowed to the chosen tree's own targets once one is picked, not Cast's whole book.
  const arming = $derived(
    armedProp && !aim && !pending
      ? (armedCastOffer ? { ...armedProp, label: armedCastOffer.label, cells: offerCells(armedCastOffer) } : armedProp)
      : null,
  );
  // A new activation, or a verb that has run out of targets, drops the arm.
  $effect(() => { if (armed && !armedProp) { armed = null; armedTree = null; } });

  /** Cancel the whole action so the next click on the acting unit opens its wheel. */
  function cancelAction() {
    focus = 0;
    aim = null; pending = null; radial = null; castPick = null;
    armed = null; armedTree = null;
    activityPick = null; targetHover = null;
    blastOpen = false; chooseBlastLevel(null);
    drag = null; dragTarget = null; blockedCell = null; notifications.dismiss(DRAG_NOTICE);
    meleeTarget = null; meleeSelected = null;
  }

  /** One step back up the chain the ring starts: popup, then the wash, then the tree picker
   * (Cast only), then the ring, then nothing. Nothing is committed until the last click, so
   * every stage can be walked out of. */
  function stepBack() {
    if (blockedNotice) { notifications.dismiss(DRAG_NOTICE); return; }
    if (activityPick) {
      targetHover = null;
      if (activityPick.target) { activityPick = { ...activityPick, target: undefined }; return; }
      if (activityPick.selected.length) { activityPick = { ...activityPick, selected: activityPick.selected.slice(0, -1) }; return; }
      if (activityPick.index !== null) { focus = 0; activityPick = { ...activityPick, index: null }; return; }
      const wasCast = pickerOffer?.type === 'cast';
      activityPick = null;
      if (wasCast) castPick = castOffers();
      else if (active) radial = { cell: notation(active.square) };
      return;
    }
    if (blastOpen) {
      if (blastTarget || blastCell) { blastTarget = null; blastHover = null; blastCell = null; return; }
      if (blastLevel !== null) { chooseBlastLevel(null); return; }
      blastOpen = false;
      castPick = castOffers();
      return;
    }
    if (pending) { pending = null; return; }
    if (aim) { aim = null; return; }
    if (meleeTarget) { meleeTarget = null; meleeSelected = null; return; }
    if (armed) {
      armed = null;
      if (armedTree && active) { armedTree = null; castPick = castOffers(); return; }
      armedTree = null;
      if (active) radial = { cell: notation(active.square) };
      return;
    }
    if (castPick) {
      castPick = null;
      if (active) radial = { cell: notation(active.square) };
      return;
    }
    radial = null;
  }

  /** Every tree the active unit could still cast — a fresh read, not a stored list, so a spent
   * pool point is reflected the moment the picker reopens. */
  const castOffers = () => (act?.offers ?? []).filter((o) => o.type === 'cast' && o.activities.some((r) => r.legal));

  /** Rally opens its activities; Cast opens its trees and then activities. Other verbs
   * highlight their targets, opening the target popup directly when only one exists. */
  function takeProp(p: Prop) {
    focus = 0;
    if (!p.legal || !active) return;
    pending = null;
    aim = null;
    radial = null;
    activityPick = null; targetHover = null;
    if (p.key === 'rally') {
      const offer = offers.find((o) => o.type === 'rally');
      if (offer) openActivityPicker(offer);
      return;
    }
    if (p.key === 'cast') {
      if (armed === 'cast' || castPick) { armed = null; armedTree = null; castPick = null; return; }
      const offers = castOffers();
      if (offers.length <= 1) {
        if (offers[0]?.spell === 'blast') { openBlast(); return; }
        if (offers[0]) openActivityPicker(offers[0]);
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
    if (o.spell === 'blast') { openBlast(); return; }
    openActivityPicker(o);
  }

  /** Spend an armed prop on a board object. */
  function applyProp(p: Prop, cell: string) {
    focus = 0;
    // A charge is read off the cell rather than the slice: in contact the melee slice fights,
    // out of it the same slice closes.
    const enemy = p.key === 'melee' ? enemyAt(cell) : undefined;
    if (enemy && meleeOptions.get(enemy.id)?.length) {
      openMelee(enemy.id);
      return;
    }
    // A maneuver is a destination, not a target, so it parks the same drop a drag there
    // would — and reads its escapes and distance in that popup.
    if (p.key === 'maneuver') {
      const rows = rowsAt(cell).filter((r) => r.kind === 'maneuver');
      if (rows.length) pending = { cell, rows, index: 0, activity: null };
      return;
    }
    const u = b.units.find((x) => x.status === 'active' && notation(x.square) === cell);
    const target: TargetRef = u ? { kind: 'unit', id: u.id } : { kind: 'cell', id: cell };
    aimAt(target, cell, u?.name ?? cell, p.type);
  }

  let radial = $state<{ cell: string } | null>(null);
  const radialItems = $derived(props.map((p) => ({
    key: p.key, src: actionIconUrl(p.icon), label: p.label, legal: p.legal,
  })));
  const pickProp = (key: string) => {
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

  function classify(path: PathStep[]): { near: string[]; far: string[] } {
    const near: string[] = [];
    const far: string[] = [];
    for (const step of path.slice(1)) (step.actions > 1 ? far : near).push(step.cell);
    return { near, far };
  }

  function enemyAt(cell: string): Unit | undefined {
    const a = active;
    if (!a) return undefined;
    return b.units.find((u) => u.status === 'active' && u.side !== a.side && notation(u.square) === cell);
  }

  const chargeRow = (c: ChargeOption): ChargePreview =>
    ({ kind: 'charge', cell: c.cell, enemy: c.unit, feet: c.feet, actions: c.actions + 1, path: chargePath(b, active!, c.unit) });

  const advanceRow = (plan: MeleePlan): AdvancePreview => ({ kind: 'advance', plan, cell: plan.cell,
    enemy: plan.target, feet: plan.feet, actions: plan.moveActions + 1, path: [...plan.movePath, ...plan.attackPath.slice(1)] });

  function openMelee(id: string) {
    pending = null; aim = null; focus = 0;
    meleeTarget = id; meleeSelected = null;
  }

  function chooseMelee(kind: 'fight' | 'charge') {
    const plan = meleeTarget ? meleeOptions.get(meleeTarget)?.find(p => p.kind === kind) : null;
    if (!plan) return;
    focus = 0; pending = null; aim = null; meleeSelected = kind;
    if (plan.via) pending = { cell: plan.cell, rows: [advanceRow(plan)], index: 0, activity: null };
    else if (kind === 'charge') {
      const charge = act?.charges.find(c => c.unit === plan.target);
      if (charge) pending = { cell: charge.cell, rows: [chargeRow(charge)], index: 0, activity: null };
    } else {
      const enemy = b.units.find(u => u.id === plan.target)!;
      aimAt({ kind: 'unit', id: enemy.id }, notation(enemy.square), enemy.name, 'fight');
    }
  }

  /** Every reading of a drop on `cell`, in the order the popup offers them. One drag chains as
   * many Move actions as the route costs — `MoveReach.actions` counts them, and a row quotes
   * the whole price rather than asking again per action. */
  function rowsAt(cell: string): Preview[] {
    if (!active || !act) return [];
    const rows: Preview[] = [];
    const m = act.moves.get(cell);
    if (m) {
      const path = movePath(b, active, cell);
      rows.push({ kind: 'move', cell, feet: m.feet, actions: m.actions, path: path.map((s) => s.cell), ...classify(path) });
    }
    // Stopping here and fighting whoever this cell reaches — the same drop, read as a charge.
    for (const c of act.charges) if (c.cell === cell) rows.push(chargeRow(c));
    if (act.maneuver?.targets.some((t) => t.id === cell)) rows.push({ kind: 'maneuver', cell, path: [notation(active.square), cell] });
    return rows;
  }

  function onBoardDrag(e: BoardEventOf<'drag'>) {
    if (!active || !act || e.id !== active.id) return;
    if (e.cell === null) {
      // Interaction sends a final clear after drop. Preserve the popup or refusal it just set.
      if (drag || dragTarget || blockedCell) notifications.dismiss(DRAG_NOTICE);
      drag = null; dragTarget = null; blockedCell = null;
      return;
    }
    pending = null; aim = null; notifications.dismiss(DRAG_NOTICE);
    meleeTarget = null; meleeSelected = null;
    dragTarget = null;
    // Pulling into a piece is a melee and nothing else: the charge that closes on it, or the
    // fight already in contact. The swords go on the target the moment either one stands up.
    const enemy = enemyAt(e.cell);
    if (enemy) {
      const plans = meleeOptions.get(enemy.id) ?? [];
      const plan = [...plans].sort((a, b) => a.moveActions - b.moveActions)[0];
      const charge = act.charges.find((c) => c.unit === enemy.id);
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
    blockedCell = e.cell === notation(active.square) ? null : e.cell;
    if (blockedCell) explainBlocked(blockedCell);
  }

  function onBoardDrop(e: BoardEventOf<'drop'>) {
    focus = 0;
    drag = null;
    blockedCell = null;
    notifications.dismiss(DRAG_NOTICE);
    dragTarget = null;
    if (!active || !act || e.id !== active.id) return;
    // Dropped on a piece: the charge, or the fight it is already in. A shot is aimed by
    // touching a target, never by dragging into one — a drag is the unit going there.
    const enemy = enemyAt(e.cell);
    if (enemy) {
      if (meleeOptions.get(enemy.id)?.length) openMelee(enemy.id);
      else { pending = null; aim = null; explainBlocked(e.cell, enemy); }
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
    if (pending.index === i && pending.rows[i].kind === 'move') { commit(); return; }
    focus = 0;
    pending = { ...pending, index: i, activity: null };
  }

  function commit() {
    const p = pending;
    pending = null;
    armed = null;
    const row = p?.rows[p.index];
    if (!p || !row) return;
    // The piece walks the route the drag traced, not the straight line to where it ends.
    if (active) boardRef?.setRoute(active.id, row.path);
    try {
      if (row.kind === 'advance') takeAction({ type: 'advance', target: row.enemy, via: row.plan.via!, finish: row.plan.kind, activity: p.activity ?? undefined, focus });
      else if (row.kind === 'charge') takeAction({ type: 'charge', target: row.enemy, activity: p.activity ?? undefined, focus });
      else if (row.kind === 'move') takeAction({ type: 'move', to: row.cell });
      else if (act?.maneuver) performManeuver(p.activity ?? firstManeuverActivity(row.cell), row.cell);
      meleeTarget = null; meleeSelected = null;
    } catch (error) {
      notifications.show({ id: DRAG_NOTICE, title: 'Action unavailable', message: error instanceof Error ? error.message : String(error), tone: 'error' });
    }
  }

  const stepBy = (key: string, length: number) => (key === 'ArrowDown' ? 1 : length - 1);

  function onKey(e: KeyboardEvent) {
    // One Escape, one step back — the same walk out that a click off the target takes.
    if (e.key === 'Escape') { stepBack(); return; }
    if (blastOpen || activityPick) return;
    if (pending) {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        focus = 0;
        pending = { ...pending, index: (pending.index + stepBy(e.key, pending.rows.length)) % pending.rows.length, activity: null };
      }
      return;
    }
    if (!aim) return;
    if (e.key === 'Enter') { e.preventDefault(); takeAim(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focus = 0;
      const n = aimActivities.length;
      if (n) aim = { ...aim, index: (aim.index + stepBy(e.key, n)) % n };
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      focus = 0;
      const n = aim.groups.length;
      aim = { ...aim, group: (aim.group + (e.key === 'ArrowRight' ? 1 : n - 1)) % n, index: 0 };
    }
  }

  // proto: pan, zoom, a window resize and the board's own recentring each move the cell under
  // the open ring, and no one event covers all four — so the anchor is read every frame while
  // the ring is open, and never otherwise. The tree picker is a second ring on the same spot
  // Cast's own ring held — the caster's own square — so it shares this same tracker.
  let lastAnchor: { x: number; y: number } | null = null;
  $effect(() => {
    const cell = radial?.cell ?? (castPick && active ? notation(active.square) : null);
    if (!cell) { anchor = null; lastAnchor = null; return; }
    let frame = 0;
    const follow = () => {
      const p = boardRef?.screenOf(cell);
      if (p && (!lastAnchor || Math.abs(p.x - lastAnchor.x) > 0.5 || Math.abs(p.y - lastAnchor.y) > 0.5)) {
        lastAnchor = { x: p.x, y: p.y };
        anchor = lastAnchor;
      }
      const r = boardRef?.cellRadius(cell);
      if (r && Math.abs(r - anchorR) > 0.5) anchorR = r;
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  });

  const enemyName = (id: string) => b.units.find((u) => u.id === id)?.name ?? id;
  const actions = (n: number) => `${n} action${n === 1 ? '' : 's'}`;
  const actionCost = (n: number) => (n === 0 ? 'free, on banked movement' : actions(n));
  const rowLabel = (row: Preview) =>
    row.kind === 'charge' ? `Charge ${enemyName(row.enemy)}`
      : row.kind === 'advance' ? `Move + ${row.plan.kind === 'charge' ? 'Charge' : 'Attack'} ${enemyName(row.enemy)}`
      : row.kind === 'maneuver' ? (active && maneuverOutcome(b, active, parse(row.cell)) === 'reposition' ? 'Reposition here' : 'Withdraw here') : 'Move here';
  const rowDetail = (row: Preview) =>
    row.kind === 'charge' ? `${actions(row.actions)}, melee included`
      : row.kind === 'advance' ? `${actions(row.plan.moveActions)} to move + 1 to ${row.plan.kind === 'charge' ? 'charge' : 'attack'}`
      : row.kind === 'maneuver' ? maneuverDetail(row.cell)
        : actionCost(row.actions);
  function maneuverDetail(cell: string): string {
    if (!active) return 'Maneuver';
    return maneuverOutcome(b, active, parse(cell)) === 'reposition' ? 'Maneuver · stay in contact'
      : 'Maneuver · break contact';
  }
  const rowKey = (row: Preview) => `${row.kind}:${row.kind === 'charge' || row.kind === 'advance' ? row.enemy : row.cell}`;

  // A charge carries a Fight activity of its own; `doCharge` takes the Strike unless told.
  // Maneuver's own three ride the same picker.
  const ACTIVITIES: ActivityIndex[] = [1, 2, 3];
  // The three the rules name, since a charge's Fight is bought at the charge's own price.
  const CHARGES = ['Charge', 'Charge and Press', 'Charge and Overrun'];
  const chargeActivity = $derived(pending?.activity ?? 1);
  const firstManeuverActivity = (cell?: string): ActivityIndex => act?.maneuver?.activities.find(opt => opt.legal && (!cell || opt.targets.some(t => t.id === cell)))?.index ?? 1;
  const maneuverActivity = $derived(pending?.activity ?? firstManeuverActivity(pending?.cell));
  // `c.actions` already counts one action for the melee; the activity's own price replaces it.
  const chargeCost = (c: ChargePreview | AdvancePreview, activity: ActivityIndex) => c.actions - 1 + activity;

  /** What each reading of a drop actually costs. */
  const dropCost = (row: Preview): number =>
    row.kind === 'move' ? row.actions
      : row.kind === 'charge' || row.kind === 'advance' ? chargeCost(row, chargeActivity) + focus
        : act?.maneuver?.activities[maneuverActivity - 1].cost ?? maneuverActivity;
  const cost = $derived(picked ? dropCost(picked) : aimed ? (aimed.cost ?? 0) + (aimGroup && canFocus(aimGroup.offer.type, aimGroup.offer.spell) ? focus : 0) : 0);
  const actionsLeft = $derived(act?.actions ?? 0);

  const previewHighlights = $derived.by<{ style: HighlightStyle; cells: string[] }[]>(() => {
    if (!preview) return [];
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
    if (act) for (const [cell, m] of act.moves) bands[bandOf(m.actions)].push(cell);
    return bands;
  });
  // Contact empties `moves` outright (see `moveReach`), so the Move card would otherwise sit
  // there reading "0 cells reachable" three times over with no reason given.
  const holders = $derived(active ? engagedEnemies(b, active) : []);
  // Every other way a Stride can be closed. Contact at least draws enemies next to you; a root
  // or a spent last action leaves the board looking exactly like ground you could walk onto,
  // so the panel and a dragged token both have to say it out loud.
  interface Stuck { tag: string; why: string }
  const stuck = $derived.by<Stuck | null>(() => {
    if (!active || !act || act.moves.size) return null;
    // Contact keeps its own card in the panel; here it is one more reason a drag goes nowhere.
    if (holders.length) return {
      tag: 'held in contact',
      why: 'A Stride is closed while you are in contact. Maneuver is the only way off this square.',
    };
    if (active.rooted > 0) return {
      tag: 'rooted',
      why: 'Rooted where you stand: no Stride, no Charge and no Maneuver. Your remaining actions still fight, shoot, rally and cast.',
    };
    if (active.speed === 0) return { tag: 'no speed', why: 'This piece has Speed 0. It holds the ground it was placed on.' };
    if (act.actions <= 0) return { tag: 'out of actions', why: 'No actions left to spend — end the activation.' };
    return { tag: 'boxed in', why: 'Nothing adjacent can be entered: the ground around you is blocked or occupied.' };
  });

  // The piece lifts only while some drop could still land. `stuck` already means no Stride, so
  // with no charge and nowhere to maneuver to there is nothing to carry: lifting it to snap it
  // straight back mimes a move being considered, where the X alone is the answer.
  const anchored = $derived(
    stuck && !act?.charges.length && !act?.maneuver?.targets.length ? active?.id ?? null : null,
  );

  const bandStyle = (n: MoveBand): HighlightStyle => (n === 1 ? 'move' : n === 2 ? 'moveFar' : 'moveFar3');

  // Reach is shown on request, not on selection: selecting a unit used to wash three bands
  // across half the board, which buried the map it was drawn on. The drag arrow says where a
  // move goes; hovering a Move row is how you ask to see the band behind it.
  const bandHighlights = $derived.by<{ style: HighlightStyle; cells: string[] }[]>(() => {
    if (!active || !act || preview || arming || blastOpen || activityPick || !hoveredBand) return [];
    return [{ style: bandStyle(hoveredBand), cells: moveBands[hoveredBand] }];
  });

  const aimService = $derived(active && aimGroup && aimed ? new TargetingService(b, active, aimGroup.offer, aimed) : null);
  const aimChoices = $derived(aim && aimService ? aimService.forRef(aim.target) : []);
  const targetingService = $derived(pickerService ?? blastService ?? aimService);
  const targetingChoice = $derived(pickerPreview ?? blastPreview ?? (aimChoices.length === 1 ? aimChoices[0] : null));
  const targetingPreview = $derived(targetingService?.preview(targetingChoice?.id ?? null) ?? null);
  const targetMarkers = $derived.by<TargetMarker[]>(() => {
    const candidates = activityPick ? pickerCandidates : blastOpen ? blastCandidates : aimChoices;
    // A list hover identifies an exact group or placement when several choices share a point.
    if (activityPick && pickerService) return pickerService.surface(activityPick.selected);
    if (blastOpen) return blastCandidates;
    if (targetingChoice && targetingService) return targetingService.markersFor(targetingChoice);
    if (aim && aimService && aimChoices.length) return [{ id: `aim:${aim.cell}`, label: aimService.activity.label, cells: [aim.cell], anchorCells: [aim.cell], geometry: 'hex', icon: aimService.icon }];
    return candidates.filter((target) => target.geometry !== 'group'
      && candidates.filter((other) => other.anchorCells.join('+') === target.anchorCells.join('+')).length === 1);
  });
  const arrowContext = $derived(targetingService
    ? `${targetingService.actor.id}:${offerKey(targetingService.offer)}:${targetingService.activity.index}:${activityPick?.selected.join('+') ?? ''}`
    : arming && active ? `${active.id}:${arming.key}:${armedTree ?? ''}` : null);
  const liveArrows = $derived.by<TargetArrow[]>(() => {
    if (targetingService) {
      const selected = activityPick?.selected ?? [];
      const hovered = targetingService.arrows(selected, targetHover ?? blastHover, hoveredEdge ?? hoveredCell);
      if (targetHover || blastHover || hoveredCell || hoveredEdge) {
        if (hovered.length) return hovered;
      }
      return targetingService.arrows(selected, targetingChoice?.id ?? null, aim?.cell ?? null);
    }
    if (!arming || !active) return [];
    const cells = hoveredEdge && arming.edges.includes(hoveredEdge) ? hoveredEdge.split('|')
      : hoveredCell && arming.cells.includes(hoveredCell) ? [hoveredCell] : [];
    if (!cells.length) return [];
    return [{ from: notation(active.square), to: cells[0], toCells: cells,
      tone: arming.key === 'maneuver' ? 'movement' : arming.key === 'melee' ? 'fight'
        : arming.key === 'cast' ? armedTree ?? 'cast' : arming.key }];
  });
  let heldArrows = $state<{ context: string; arrows: TargetArrow[] } | null>(null);
  let resolvedArrows = $state<TargetArrow[]>([]);
  $effect(() => {
    if (arrowContext && liveArrows.length) heldArrows = { context: arrowContext, arrows: liveArrows };
    else if (!arrowContext) heldArrows = null;
  });
  // Keep the last valid aim while the pointer travels between the board and its picker.
  const shot = $derived(liveArrows.length ? liveArrows
    : arrowContext && heldArrows?.context === arrowContext ? heldArrows.arrows
      : arrowContext ? [] : resolvedArrows);
  const aimCells = $derived(aim ? targetingPreview?.cells ?? [] : []);
  let resolvedMarkers = $state<TargetMarker[]>([]);
  let resolutionTimer: ReturnType<typeof setTimeout> | null = null;
  $effect(() => () => { if (resolutionTimer) clearTimeout(resolutionTimer); });

  function hoverTargetMarker(id: string | null) {
    if (id) { hoveredCell = null; hoveredEdge = null; }
    if (blastOpen) blastHover = id;
    else if (activityPick) targetHover = id;
  }

  function chooseTargetMarker(id: string) {
    if (blastOpen) { blastTarget = id; blastHover = null; }
    else if (activityPick) {
      if (id.startsWith('hex:')) pickActivityCell(id.slice(4));
      else choosePickerTarget(id);
    }
    // Target-first actions keep their activity picker open until a row is chosen.
  }
  const aimStyle = $derived<HighlightStyle>(aimGroup ? styleFor(aimGroup.offer) : 'attack');

  // An armed prop lights everything it can touch, so picking the verb first still teaches
  // reach — the thing pure object-first hides until you happen to touch a distant enemy.
  const propCells = $derived(arming?.cells ?? []);
  // A maneuver lights ground to run to, not a target to hit, so it washes like a move.
  const propStyle = $derived<HighlightStyle>(arming?.style ?? 'attack');

  const highlights = $derived<{ style: HighlightStyle; cells: string[] }[]>([
    { style: propStyle, cells: propCells },
    { style: aimStyle, cells: aimCells },
    { style: pickerOffer ? styleFor(pickerOffer) : 'deploy', cells: activityPick ? (targetHover && pickerPreview ? targetCells(pickerPreview) : pickerService?.surface(activityPick.selected).flatMap((target) => target.cells) ?? []) : [] },
    { style: 'attack', cells: blastOpen ? (blastPreview ? targetCells(blastPreview) : blastCandidates.flatMap(targetCells)) : [] },
    ...bandHighlights,
    ...previewHighlights,
  ]);

  /** What rides on a piece: the verb being aimed at it right now, or the shield a guarding
   * unit keeps until it acts again. State the board can show is state the panel need not. */
  function propOn(u: Unit): ActionIcon | null {
    if (dragTarget?.id === u.id) return dragTarget.attack ? 'attack' : 'no';
    if ((picked?.kind === 'charge' || picked?.kind === 'advance') && picked.enemy === u.id) {
      return picked.kind === 'charge' || picked.plan.kind === 'charge' ? 'charge' : 'attack';
    }
    return u.guard ? 'block' : null;
  }

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
      engine: u.engines.find((e) => e.status === 'crewed')?.name ?? null,
      prop: propOn(u),
      pick: pickOn(u),
      ring: active?.id === u.id ? 'active' : flashSet.has(u.id) ? 'flash' : hot === u.id ? 'selected' : null,
    })),
    // Abandoned and captured engines stand alone on the square they were left.
    ...b.units.flatMap((u) => u.engines
      .filter((e) => e.status !== 'crewed')
      .map((e, i): EngineTokenModel => ({ kind: 'engine', id: `${u.id}:engine:${i}`, side: u.side, name: e.name, cell: notation(e.square), ring: null }))),
    // An emplacement is a board object in its own right, drawn whoever is working it.
    ...b.engines.map((e, i): EngineTokenModel =>
      ({ kind: 'engine', id: `engine:${i}`, side: e.side, name: e.name, cell: notation(e.square), ring: null })),
  ]);

  function performActivity(offer: ActionOffer, opt: ActivityOption, target?: string) {
    if (!active) return;
    const resolution = new TargetingService(b, active, offer, opt).resolve(target);
    if (!resolution) return;
    const before = game.battle!.log.length;
    takeAction({ ...resolution.action, focus: canFocus(offer.type, offer.spell) ? focus : 0 });
    for (const e of game.battle!.log.slice(before)) if (e.unit && FREE_STRIKE_RE.test(e.text)) flash(e.unit);
    resolvedMarkers = resolution.markers;
    resolvedArrows = resolution.arrows;
    if (resolutionTimer) clearTimeout(resolutionTimer);
    resolutionTimer = setTimeout(() => { resolvedMarkers = []; resolvedArrows = []; resolutionTimer = null; }, 800);
    for (const effect of resolution.effects) boardRef?.burst(effect.cell, effect.tree, effect.from);
  }

  function performManeuver(activity: ActivityIndex, to?: string) {
    const before = game.battle!.log.length;
    takeAction({ type: 'maneuver', activity, to });
    for (const e of game.battle!.log.slice(before)) if (e.unit && FREE_STRIKE_RE.test(e.text)) flash(e.unit);
  }

  /** Open the popup for a board object: everything this unit can do to it, verb by verb. A
   * prop taken off the tray narrows it to that one verb. */
  function aimAt(target: TargetRef, cell: string, label: string, only: Verb | null = null) {
    focus = 0;
    if (!active) return;
    const all = offersAt(b, target, active.id);
    let groups = only ? all.filter((g) => g.offer.type === only) : all;
    // The tree was already chosen at the picker; the popup here is one tree, not a
    // second choice of tree.
    if (only === 'cast' && armedTree) groups = groups.filter((g) => g.offer.spell === armedTree);
    aim = groups.length ? { cell, target, label, groups, group: 0, index: 0 } : null;
    // The cheapest legal row is the one to land on: it is the one the player most often wants.
    if (aim) {
      const i = aimActivities.findIndex((o) => o.legal);
      if (i >= 0) aim = { ...aim, index: i };
    }
  }

  /** Choose the effect first, then its commitment, and confirm the total. */
  function aimChoose(i: number) {
    if (!aim) return;
    focus = 0;
    aim = { ...aim, index: i };
  }

  const aimVerb = (i: number) => {
    focus = 0;
    if (!aim) return;
    aim = { ...aim, group: i, index: 0 };
    const legal = aimActivities.findIndex((option) => option.legal);
    if (legal >= 0) aim = { ...aim, index: legal };
  };

  function takeAim() {
    const a = aim;
    const row = aimed;
    const group = aimGroup;
    if (!a || !row || !group || !row.legal) return;
    if (group.offer.spell === 'blast') { openBlast(row.index); return; }
    aim = null;
    armed = null;
    armedTree = null;
    const service = new TargetingService(b, active!, group.offer, row);
    const matches = service.forRef(a.target);
    if (row.needsTarget && matches.length !== 1) {
      const committed = focus;
      openActivityPicker(group.offer);
      focus = committed;
      activityPick = { key: offerKey(group.offer), index: row.index, selected: service.pickCell(a.cell)?.selected ?? [] };
      return;
    }
    performActivity(group.offer, row, matches[0]?.id);
  }

  function onCell(e: BoardEventOf<'cell'>) {
    notifications.dismiss(DRAG_NOTICE);
    if (activityPick) { pickActivityCell(e.cell); return; }
    if (blastOpen) { pickBlastCell(e.cell); return; }
    // A click on the parked destination confirms the row it has chosen. Anywhere else is a
    // cancel: while something is open or armed, a stray click walks one step back rather than
    // meaning something new, so a verb picked by mistake costs one click to undo.
    if (pending) {
      if (pending.cell === e.cell) {
        if (picked?.kind !== 'charge' && picked?.kind !== 'advance') commit();
        return;
      }
      stepBack();
      return;
    }
    if (aim) { stepBack(); return; }
    if (castPick) { stepBack(); return; }
    if (meleeTarget) { meleeTarget = null; meleeSelected = null; return; }
    const p = arming;
    if (p) {
      if (p.cells.includes(e.cell)) applyProp(p, e.cell);
      else stepBack();
      return;
    }
    // Nothing open and bare ground under the click: the pick goes back and the side is
    // choosing again. A unit that has already spent an action keeps its turn — `deselect`
    // refuses — so the click reads as a miss rather than losing what was done.
    deselectUnit();
  }
  function onToken(e: BoardEventOf<'token'>) {
    notifications.dismiss(DRAG_NOTICE);
    if (activityPick) { const cell = cellOf(e.id); if (cell) pickActivityCell(cell); return; }
    if (blastOpen) { const cell = cellOf(e.id); if (cell) pickBlastCell(cell); return; }
    // Before an army is chosen the board is the second way into the army reel.
    if (!active) {
      const own = b.units.find((x) => x.id === e.id);
      if (own) pickUnit(own, false);
      return;
    }
    // Clicking the target preserves the melee review; its Confirm button executes it.
    if (pending) {
      if ((picked?.kind === 'charge' || picked?.kind === 'advance') && picked.enemy === e.id) return;
      stepBack();
      return;
    }
    if (aim) { stepBack(); return; }
    if (castPick) { stepBack(); return; }
    const u = b.units.find((x) => x.id === e.id);
    const cell = u ? notation(u.square) : '';
    const p = arming;
    if (p) {
      if (p.cells.includes(cell)) applyProp(p, cell);
      else stepBack();
      return;
    }
    // Your own piece is the verbs; anyone else's is what you can do to them.
    if (e.id === active?.id) { radial = { cell }; return; }
    // Until an action is spent, one of your own pieces still waiting to go is a change of
    // mind, not a target. Verb-first still aims at an ally: `arming` above takes the click.
    if (u && !locked && u.side === b.pending && !b.activated.includes(u.id)) { pickUnit(u, false); return; }
    aimAt({ kind: 'unit', id: e.id }, cell, u?.name ?? e.id);
  }
  // A wall has no cell of its own; its popup opens over the first of the two it divides. Only
  // an armed verb that can hit a wall makes one pickable at all, so the edge is always that
  // verb's own target.
  function onEdge(e: BoardEventOf<'edge'>) {
    if (activityPick && pickerService) {
      const targets = pickerService.matches({ kind: 'edge', id: e.edge });
      if (targets.length === 1) choosePickerTarget(targets[0].id);
      return;
    }
    const p = arming;
    if (!p) { stepBack(); return; }
    aimAt({ kind: 'wall', id: e.edge }, e.edge.split('|')[0], e.edge.replace('|', ' / '), p.type);
  }

  /** The ring is the menu while it is open: the board answers nothing (`frozen`), and a press
   * anywhere off the ring closes it and does nothing else. */
  function onWindowPointerDown(e: PointerEvent) {
    if (!radial && !castPick) return;
    if (e.target instanceof Element && e.target.closest('.radial')) return;
    radial = null;
    castPick = null;
  }

  /** `centre` is off when the pick came off the board: the piece is already under the pointer,
   * and moving the map out from under a click loses the ground the player was reading. */
  function pickUnit(u: Unit, centre = true) {
    if (locked && u.id !== b.active) return;
    if (u.status !== 'active' || u.side !== b.pending || b.activated.includes(u.id)) return;
    selectUnit(u.id);
    if (centre) boardRef?.centerOn(notation(u.square));
  }

  const status = (u: Unit) => [
    isRouted(u) ? 'routed' : '',
    isMountain(b.board, u.square) ? 'mountain +1 Defence' : '',
    at(b.board, u.square).terrain === 'forest' ? 'forest +1 ranged cover' : '',
    at(b.board, u.square).terrain === 'swamp' ? 'swamp −1 Defence' : '',
    at(b.board, u.square).elevation > 0 ? 'higher-ground attacks +1' : '',
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
    u.sureFooting ? 'sure footing' : '',
    u.flies ? 'flying' : '',
    b.phase === 'battle' && isOutflanked(b, u) ? 'outflanked' : '',
  ].filter(Boolean).join(' · ');

  const spec = $derived(`${b.board.spec.base}${b.board.spec.feature && b.board.spec.feature !== 'none' ? ' · ' + b.board.spec.feature : ''}`);
</script>

{#snippet popupHead(label: string)}
  <div class="popup-head">
    <span>{label}</span>
    <span class="popup-actions" title="Actions left this activation">
      {#if actionsLeft > 0}<ActionCost n={actionsLeft} size="1.05em" />{:else}<span class="muted">no actions left</span>{/if}
    </span>
  </div>
{/snippet}

{#snippet pickerHead(label: string, treatment: 'cast' | 'rally' | 'shoot', tree: Tree | null = null)}
  <div class="picker-heading" class:cast-heading={treatment === 'cast'} class:rally-heading={treatment === 'rally'} class:shoot-heading={treatment === 'shoot'}>
    <span class="picker-emblem" aria-hidden="true">
      <img src={tree ? castIconUrl(tree) : actionIconUrl(treatment)} alt="" />
    </span>
    <span class="picker-heading-text"><span class="picker-kicker">{treatment === 'cast' ? 'Cast' : treatment === 'rally' ? 'Command' : 'Ranged attack'}</span><strong>{label}</strong></span>
    <span class="picker-budget" title="Actions left this activation"><ActionCost n={actionsLeft} size="1em" /></span>
  </div>
{/snippet}

{#snippet activityRows(options: ActivityOption[], selected: ActivityIndex | null, chooseActivity: (index: ActivityIndex) => void, treatment: 'plain' | 'cast' | 'rally' | 'shoot' = 'plain')}
  {#each options as opt (opt.activity)}
    <button class="popup-row activity-row" class:cast-row={treatment === 'cast'} class:rally-row={treatment === 'rally'} class:shoot-row={treatment === 'shoot'} class:on={opt.index === selected} class:dim={!opt.legal} disabled={!opt.legal} onclick={() => chooseActivity(opt.index)}>
      <span class="popup-verb">
        <span class="row-cost" class:over={(opt.cost ?? 0) > (active?.actions ?? 0)}><ActionCost n={opt.cost ?? opt.index} size="1.15em" /></span>
        {opt.label}
        {#if !opt.legal && opt.reason}<span class="reason">{opt.reason}</span>{/if}
      </span>
      <span class="muted">{opt.detail}</span>
    </button>
  {/each}
{/snippet}

{#snippet popupFoot(confirm: () => void, label = 'Confirm')}
  <div class="popup-foot">
    <span class="muted">
      Spends {cost} of {actionsLeft}{cost >= actionsLeft ? ' — ends the turn' : ''}
    </span>
    <button onclick={cancelAction}>Cancel</button>
    <button class="primary" onclick={confirm}>{label}</button>
  </div>
{/snippet}

{#snippet result()}
  <BattleReport />
{/snippet}

<svelte:window onkeydown={onKey} onpointerdown={onWindowPointerDown} />

<AppShell leftTitle="Orders" leftWidth={24} rightTitle="Battle log" rightWidth={21} modal={b.phase === 'ended' ? result : undefined}>
  {#snippet top()}
    <TopBar>
      {#snippet status()}
        <strong>Day {b.day} · Round {b.round} / {b.roundsPerDay}</strong>
        <span class={b.pending === 'attacker' ? 'side-att' : 'side-def'}>{b.pending}</span>
        {#if active}<span class="muted">· {active.name}{locked ? ' is committed' : ''}</span>
        {:else}<span class="muted">· choose an army</span>{/if}
        <span class="muted">· {spec}</span>
      {/snippet}
      {#snippet tools()}
        <button onclick={undo} disabled={!game.history.length} title="Undo the last action">Undo</button>
        <button onclick={backToSetup}>New battle</button>
      {/snippet}
    </TopBar>
  {/snippet}

  {#snippet float()}
    <MapControls
      board={boardRef}
      army={() => b.units.filter((u) => u.side === (active?.side ?? b.pending) && u.status === 'active').map((u) => notation(u.square))}
      armyLabel="Frame the {active?.side ?? b.pending} force"
    />
    {#if b.phase === 'battle'}
      <ArmyReel
        units={roster}
        activated={b.activated}
        selected={active?.id ?? null}
        {locked}
        hovered={hoveredPiece}
        pick={pickUnit}
        hover={(id) => { hoveredCard = id; }}
      />
    {/if}
  {/snippet}

  {#snippet map()}
    <div class="mapwrap" class:aiming={arming !== null || blastOpen || pickerActivity !== null}>
    <PixiBoard
      bind:this={boardRef}
      board={b.board}
      {tokens}
      mode="battle"
      fill
      terrainAppearance={gameMap.terrainAppearance}
      inkMap={gameMap.inkMap}
      frozen={radial !== null || castPick !== null}
      {highlights}
      dragPath={previewPath}
      barred={blockedCell}
      {anchored}
      {shot}
      selected={selectedHex}
      draggable={blastOpen || activityPick ? null : active?.id ?? null}
      pickableEdges={pickerService ? pickerService.choices.filter((target) => target.kind === 'wall').map((target) => target.id) : arming?.edges ?? []}
      onhover={(e) => { hoveredCell = e.cell; hoveredEdge = e.edge ?? null; }}
      oncell={active ? onCell : undefined}
      ontoken={onToken}
      onedge={active ? onEdge : undefined}
      ondrag={active ? onBoardDrag : undefined}
      ondrop={active ? onBoardDrop : undefined}
    />
    </div>
  {/snippet}

  {#snippet pin()}
    {#if meleeTarget && cellOf(meleeTarget)}
      <MeleeChoices cell={cellOf(meleeTarget)!} plans={meleeOptions.get(meleeTarget) ?? []} selected={meleeSelected}
        screenOf={(cell) => boardRef?.screenOf(cell) ?? null} radiusOf={(cell) => boardRef?.cellRadius(cell) ?? null} choose={chooseMelee} />
    {/if}
    <TargetMarkers targets={targetMarkers} screenOf={(cell) => boardRef?.screenOf(cell) ?? null}
      cellRadius={(cell) => boardRef?.cellRadius(cell) ?? null} selected={targetingChoice?.id ?? null}
      hover={hoverTargetMarker} choose={chooseTargetMarker} />
    <TargetMarkers targets={resolvedMarkers} screenOf={(cell) => boardRef?.screenOf(cell) ?? null}
      cellRadius={(cell) => boardRef?.cellRadius(cell) ?? null} selected={null} resolved
      hover={() => {}} choose={() => {}} />
    {#if activityPick && pickerOffer && active}
      <BoardPopup cell={notation(active.square)} close={cancelAction} appearance={pickerOffer.type === 'cast' ? 'cast' : 'rally'}>
        {@render pickerHead(pickerOffer.label, pickerOffer.type === 'cast' ? 'cast' : 'rally', pickerOffer.spell)}
        {@render activityRows(pickerOffer.activities, pickerActivity?.index ?? null, choosePickerActivity, pickerOffer.type === 'cast' ? 'cast' : 'rally')}
        {#if pickerActivity}
          {#if canFocus(pickerOffer.type, pickerOffer.spell)}
            <CommitmentPicker base={pickerActivity.cost ?? pickerActivity.index} available={actionsLeft} bind:value={focus} effect={pickerOffer.spell === 'controlling' ? 'to spell DC' : 'on the roll'} />
          {/if}
          <p class="popup-escapes" aria-live="polite">
            {#if !pickerActivity.needsTarget}Choose your commitment, then confirm.
            {:else if pickerService?.placement}{activityPick.selected.length ? 'Choose a destination hex.' : 'Choose the unit to translocate.'}
            {:else if pickerOffer.spell === 'healing' && pickerActivity.index > 1}Choose {pickerActivity.index} units on the board. {activityPick.selected.length} selected.
            {:else}Choose a target icon on the board to {pickerActivity.label.toLowerCase()}.{/if}
          </p>
          {#if pickerActivity.needsTarget}
          <div class="activity-targets" aria-label="{pickerOffer.label} targets">
            {#each pickerCandidates as target (target.id)}
              <button class="popup-row" class:on={activityPick.target === target.id} aria-pressed={activityPick.target === target.id} onpointerenter={() => hoverTargetMarker(target.id)} onpointerleave={() => hoverTargetMarker(null)}
                onfocus={() => hoverTargetMarker(target.id)} onblur={() => hoverTargetMarker(null)} onclick={() => choosePickerTarget(target.id)}>
                <span class="popup-verb">{target.label}</span>
                <span class="muted">{targetCells(target).join(' + ')}</span>
              </button>
            {/each}
          </div>
          {/if}
          {#if activityPick.selected.length}<button onclick={() => { if (activityPick) activityPick = { ...activityPick, selected: [], target: undefined }; targetHover = null; }}>Reset targets</button>{/if}
        {:else}
          <p class="popup-escapes">Choose an activity.</p>
        {/if}
        <div class="popup-foot">
          {#if pickerActivity}<span class="muted">Spends {(pickerActivity.cost ?? 0) + focus} of {actionsLeft}</span>{/if}
          <button onclick={cancelAction}>Cancel</button>
          <button class="primary" disabled={!pickerActivity?.legal || (pickerActivity.needsTarget && !activityPick.target)} onclick={confirmPicker}>Confirm</button>
        </div>
      </BoardPopup>
    {/if}
    {#if blastOpen && blastOffer && active}
      <BoardPopup cell={notation(active.square)} close={cancelAction} appearance="cast">
        {@render pickerHead('Blast', 'cast', 'blast')}
        <div class="blast-levels">
          {#each blastOffer.activities as opt (opt.index)}
            <button class="popup-row activity-row cast-row" class:on={blastLevel === opt.index} class:dim={!opt.legal} disabled={!opt.legal} aria-pressed={blastLevel === opt.index} onclick={() => chooseBlastLevel(opt.index)}>
              <span class="popup-verb"><span class="row-cost"><ActionCost n={opt.index} /></span>{opt.label}</span>
              <span class="muted">{opt.reason ?? opt.detail}</span>
            </button>
          {/each}
        </div>
        {#if blastActivity}
          <CommitmentPicker base={blastActivity.cost ?? blastActivity.index} available={actionsLeft} bind:value={focus} effect="on the spell attack" />
          <p class="popup-escapes" aria-live="polite">
            {#if blastLevel === 1}Choose an enemy hex.
            {:else if blastLevel === 2}Choose a Blast icon on an edge for the two hexes in a line.
            {:else}Choose a Blast icon at a corner for the three hexes that meet there.{/if}
          </p>
          <div class="blast-targets" aria-label="Blast targets">
            {#each blastCandidates as target (target.id)}
              <button class="popup-row" class:on={blastTarget === target.id} aria-pressed={blastTarget === target.id}
                onpointerenter={() => hoverTargetMarker(target.id)} onpointerleave={() => hoverTargetMarker(null)}
                onfocus={() => hoverTargetMarker(target.id)} onblur={() => hoverTargetMarker(null)}
                onclick={() => { blastTarget = target.id; blastHover = null; }}>
                <span class="popup-verb">{targetCells(target).join(' + ')}</span>
                <span class="muted">{target.label}</span>
              </button>
            {/each}
          </div>
          {#if blastCell}<button onclick={() => { blastCell = null; }}>Show all targets</button>{/if}
          {#if blastPreview}<p class="popup-escapes" aria-live="polite">Affected hexes: {targetCells(blastPreview).join(', ')}. Enemies: {blastPreview.label}.</p>{/if}
          <div class="popup-foot">
            <button onclick={cancelAction}>Cancel</button>
            <button class="primary" disabled={!blastActivity.legal || !blastSelection} onclick={confirmBlast}>Cast {blastActivity.label} · {(blastActivity.cost ?? 0) + focus} action{(blastActivity.cost ?? 0) + focus === 1 ? '' : 's'}</button>
          </div>
        {:else}
          <p class="popup-escapes">Choose a blast level, then designate its target.</p>
        {/if}
      </BoardPopup>
    {/if}
    {#if radial && anchor && radialItems.length}
      <RadialMenu x={anchor.x} y={anchor.y} hole={anchorR} items={radialItems} pick={pickProp} />
    {/if}
    {#if castPick && anchor && castRadialItems.length}
      <RadialMenu x={anchor.x} y={anchor.y} hole={anchorR} items={castRadialItems} pick={pickCastTree} back={stepBack} />
    {/if}
    {#if drag && !blockedNotice}
      <div class="drag-hud">
        <strong>{rowLabel(drag)}</strong>
        <span class="muted">{drag.cell} — {rowDetail(drag)}</span>
      </div>
    {:else if dragTarget?.attack && !blockedNotice}
      <div class="drag-hud">
        <strong>Attack {enemyName(dragTarget.id)}</strong>
        <span class="muted">Release to choose a Fight activity · from 1 action</span>
      </div>
    {/if}
    {#if pending}
      <BoardPopup cell={pending.cell} close={cancelAction}>
        {@render popupHead(pending.cell)}
        {#each pending.rows as row, i (rowKey(row))}
          <button class="popup-row" class:on={i === pending.index} onclick={() => choose(i)}>
            <span class="popup-verb">
              {#if row.kind === 'charge' || row.kind === 'advance'}<img class="row-prop" src={actionIconUrl(row.kind === 'charge' || row.plan.kind === 'charge' ? 'charge' : 'attack')} alt="" />{/if}
              {rowLabel(row)}
              <span class="row-cost"><ActionCost n={i === pending.index ? dropCost(row) : row.kind === 'maneuver' ? firstManeuverActivity(row.cell) : row.actions} /></span>
            </span>
            <span class="muted">
              {#if i === pending.index && row.kind === 'advance'}{actionCost(row.plan.moveActions)} to move + {actions(chargeActivity + focus)} to {row.plan.kind === 'charge' ? 'charge' : 'attack'}
              {:else if i === pending.index && row.kind === 'charge'}{actions(dropCost(row))}, melee included
              {:else}{rowDetail(row)}{/if}
            </span>
          </button>
          {#if i === pending.index && row.kind === 'maneuver' && act?.maneuver && active}
            {@const w = act.maneuver}
            <div class="popup-escapes">
              {#each w.holders as h (h.unit)}
                <p class="escape">
                  <span class="escape-name">{h.name}</span>
                  <span class="muted">DC {h.dc}{h.pinning ? ' · pinning at range, no free strike' : ''}</span>
                  {#if h.follows}<span class="tag">gives no retreat — follows you</span>{/if}
                </p>
              {:else}
                <p class="muted">Nothing holds you.{isRouted(active) ? ' Run for your own edge.' : ' Choose your position.'}</p>
              {/each}
              {#if w.holders.length}
                <p class="muted activity-detail">
                  Break off is one roll, d20+{w.modifier} against DC {w.dc}, the highest of them,
                  read again for each. Above it they roll instead, against DC {levelDc(active.level)}.
                </p>
              {/if}
            </div>
            <div class="activity-chips">
              {#each ACTIVITIES as g (g)}
                {@const opt = w.activities[g - 1]}
                {@const reaches = opt.targets.some(t => t.id === row.cell)}
                <button
                  class="activity-chip"
                  class:on={maneuverActivity === g}
                  disabled={!opt.legal || !reaches}
                  title={opt.reason ?? (!reaches ? 'Terrain or distance needs a different Maneuver' : '')}
                  onclick={() => { focus = 0; if (pending) pending = { ...pending, activity: g }; }}
                >
                  {opt.label}
                  <ActionCost n={opt.cost ?? g} />
                </button>
              {/each}
            </div>
            <p class="muted activity-detail popup-escapes">{w.activities[maneuverActivity - 1].detail}</p>
          {/if}
          {#if i === pending.index && (row.kind === 'charge' || row.kind === 'advance') && active}
            {@const charging = row.kind === 'charge' || row.plan.kind === 'charge'}
            <p class="muted activity-detail popup-escapes">
              {#if row.kind === 'advance'}Move to {row.plan.via}, then {charging ? 'charge' : 'attack'} from there. {row.actions} actions total for the basic attack. {/if}
              {#if charging}
                {#if row.kind === 'advance'}{row.plan.bonus ? `+${row.plan.bonus} on the attack.` : 'Rough ground removes the charge bonus.'} {/if}
                Charge leaves this unit exposed: −2 Defence until it next acts.
              {:else}Attack uses the normal melee rules.{/if}
            </p>
            <div class="activity-chips">
              {#each ACTIVITIES as g (g)}
                {@const total = chargeCost(row, g)}
                {@const can = total <= active.actions}
                <button
                  class="activity-chip"
                  class:on={chargeActivity === g}
                  disabled={!can}
                  title={can ? '' : `needs ${total} actions`}
                  onclick={() => { focus = 0; if (pending) pending = { ...pending, activity: g }; }}
                >
                  {charging ? CHARGES[g - 1] : ['Strike', 'Press', 'Overrun'][g - 1]}
                  <ActionCost n={total} />
                </button>
              {/each}
            </div>
            <CommitmentPicker base={chargeCost(row, chargeActivity)} available={actionsLeft} bind:value={focus} effect={charging ? 'on the attack, in addition to the charge bonus' : 'on the attack'} />
          {/if}
        {/each}
        {@render popupFoot(commit, picked?.kind === 'charge' || (picked?.kind === 'advance' && picked.plan.kind === 'charge') ? 'Confirm charge' : picked?.kind === 'advance' ? 'Confirm attack' : 'Confirm')}
      </BoardPopup>
    {/if}
    {#if aim && aimGroup && active && !pending}
      <BoardPopup cell={aim.cell} close={cancelAction} appearance={aimGroup.offer.type === 'shoot' || aimGroup.offer.type === 'cast' || aimGroup.offer.type === 'rally' ? aimGroup.offer.type : 'default'}>
        {#if aimGroup.offer.type === 'shoot' || aimGroup.offer.type === 'cast' || aimGroup.offer.type === 'rally'}
          {@render pickerHead(aim.label, aimGroup.offer.type, aimGroup.offer.spell)}
        {:else}{@render popupHead(aim.label)}{/if}
        <div class="verb-row" class:solo={aim.groups.length === 1}>
          {#each aim.groups as g, gi (offerKey(g.offer))}
            {@const icon = targetingIcon(g.offer)}
            <button class="verb-tile" class:on={gi === aim.group} onclick={() => aimVerb(gi)}>
              {#if icon}<img src={targetIconUrl(icon)} alt="" />{/if}
              <span>{g.offer.label}</span>
            </button>
            {/each}
        </div>
        {@render activityRows(aimActivities, aimed?.index ?? null, (index) => aimChoose(aimActivities.findIndex((opt) => opt.index === index)), aimGroup.offer.type === 'shoot' || aimGroup.offer.type === 'cast' || aimGroup.offer.type === 'rally' ? aimGroup.offer.type : 'plain')}
        {#if aimed?.legal}
          {#if canFocus(aimGroup.offer.type, aimGroup.offer.spell) && aimGroup.offer.spell !== 'blast'}
            <CommitmentPicker base={aimed.cost ?? aimed.index} available={actionsLeft} bind:value={focus} effect={aimGroup.offer.spell === 'controlling' ? 'to spell DC' : 'on the roll'} />
          {/if}
          {@render popupFoot(takeAim, aimGroup.offer.type === 'fight' ? 'Confirm attack' : 'Confirm')}
        {/if}
      </BoardPopup>
    {/if}
  {/snippet}

  {#snippet left()}
    {#if active && act}
      <div class="orders-head">
        <h3 class={active.side === 'attacker' ? 'side-att' : 'side-def'}>{active.name}</h3>
        <span class="muted">{active.side} · {notation(active.square)}</span>
      </div>
      <div class="row action-pips">
        {#if active.actions > 0}<ActionCost n={active.actions} size="1.3em" />{/if}
        <span class="muted">{active.actions} of {ACTIONS_PER_ACTIVATION} left</span>
      </div>
      <p class="cost-key">
        Every activity costs the same for every unit: <ActionCost n={1} />, <ActionCost n={2} /> or
        <ActionCost n={3} />. Commit extra actions for +2 each on supported activities. One attack an activation.
      </p>

      <table class="stats"><tbody>
        <tr><td>Strike</td><td class="stat">{active.stats.strike === null ? '—' : '+' + active.stats.strike}</td><td>Volley</td><td class="stat">{active.stats.volley === null ? '—' : `+${active.stats.volley} · ${['—', 'short', 'medium', 'long', 'extreme'][Math.max(0, reachOf(b, active))]}`}</td></tr>
        {#if shootCeiling(b, active) > 0}<tr><td>Range</td><td colspan="3">{shootRangeLabel(b, active)}</td></tr>{/if}
        <tr><td>Defence</td><td class="stat">{active.stats.defence}</td><td>Will</td><td class="stat">+{active.stats.will}</td></tr>
        <tr><td>Disorder</td><td class="stat">{active.disorder}/{ROUTED_AT}</td><td>Level DC</td><td class="stat">{levelDc(active.level)}</td></tr>
        <tr><td>Move</td><td class="stat">{active.speed} ft{act.feet ? ` (+${act.feet} banked)` : ''}</td><td>Engaged</td><td>{engagedEnemies(b, active).length}</td></tr>
        {#if active.tactics.length}<tr><td>Tactics</td><td colspan="3">{active.tactics.join(', ')}</td></tr>{/if}
        {#if status(active)}<tr><td>Status</td><td colspan="3">{status(active)}</td></tr>{/if}
      </tbody></table>

      <!-- Move opens with the selection rather than staying pinned: its bands are the same
           ones the board washes, and the rows track a live drag both ways. -->
      <div class="move-card">
        <button
          class="move-head"
          aria-expanded={moveOpen}
          onclick={() => { moveOpen = !moveOpen; if (!moveOpen) hoveredBand = null; }}
        >
          <h3>Move</h3>
          <span class="muted">
            {#if holders.length}
              — held in contact
            {:else if stuck}
              — {stuck.tag}
            {:else if moveOpen}
              — drag the token, or read the bands
            {:else}
              — {moveBands[1].length + moveBands[2].length + moveBands[3].length} cells reachable
            {/if}
          </span>
        </button>
        {#if moveOpen}
        {#if holders.length}
          <p class="move-note">
            <strong>{holders.map((e) => e.name).join(' and ')}</strong>
            {holders.length === 1 ? 'holds' : 'hold'} you. A Stride is closed while you are in
            contact — <strong>Maneuver</strong> is the only way off this square. Break off rolls
            once against the highest of them; pay more and they roll instead.
            {#if act.maneuver}
              Drag to one of its {act.maneuver.targets.length} cell{act.maneuver.targets.length === 1 ? '' : 's'}.
            {/if}
          </p>
        {:else if stuck}
          <p class="move-note">
            <img class="row-prop" src={actionIconUrl('no')} alt="" />
            {stuck.why}
          </p>
        {:else}
        <div class="move-rows">
          {#each ([1, 2, 3] as const) as n (n)}
            <div
              class="move-row band-{n}"
              class:current={dragBand === n}
              role="group"
              onmouseenter={() => { hoveredBand = n; }}
              onmouseleave={() => { if (hoveredBand === n) hoveredBand = null; }}
            >
              <span class="move-row-label"><ActionCost n={n} size="1.1em" /></span>
              <span class="muted">{moveBands[n].length} cell{moveBands[n].length === 1 ? '' : 's'} reachable</span>
            </div>
          {/each}
        </div>
        {/if}
        {/if}
      </div>

      {#if isRouted(active)}
        <p class="muted">
          Routed at {active.disorder}/{ROUTED_AT} — it may Move or maneuver, nothing else, and
          it leaves the field at its own edge. An ally's Rally, Inspire or Healing can bring it back.
        </p>
      {:else if !offers.length}
        <p class="muted">Nothing else to do here — end the turn.</p>
      {:else}
        <p class="muted hint">Touch a piece for what you can do to it, or drag your own to move.</p>
      {/if}

      <button class="end-turn" onclick={() => endActivation()}>End turn</button>
    {:else}
      <p class="muted">Pick an army off the army reel above, or touch one of your own pieces on the board.</p>
    {/if}
  {/snippet}

  {#snippet right()}
    <BattleLog battle={b} />
  {/snippet}
</AppShell>

<style>
  .mapwrap { width: 100%; height: 100%; }
  .mapwrap.aiming { cursor: crosshair; }
  .blast-targets, .activity-targets { max-height: 10rem; overflow-y: auto; }

  .verb-row { display: flex; gap: .3rem; padding: .1rem .3rem .35rem; border-bottom: 1px solid var(--rule); margin-bottom: .3rem; }
  /* One verb is a heading, not a choice — the activities below no longer name it themselves. */
  .verb-row.solo .verb-tile { flex-direction: row; justify-content: center; gap: .45rem; cursor: default; }
  .verb-row.solo .verb-tile img { width: 2rem; height: 1.6rem; }
  .verb-tile {
    display: flex; flex-direction: column; align-items: center; gap: .1rem;
    flex: 1; padding: .2rem; border: 1px solid transparent; border-radius: 8px;
    background: transparent; color: var(--ink); font: inherit; font-size: .72rem; font-weight: 600; cursor: pointer;
  }
  .verb-tile img { width: 2.4rem; height: 1.9rem; object-fit: contain; }
  .verb-tile:hover { background: var(--band); }
  .verb-tile.on { border-color: var(--accent); background: var(--band); }

  .row-prop { width: 1.7rem; height: 1.3rem; object-fit: contain; }

  .drag-hud {
    position: absolute; z-index: 5; max-width: 26rem;
    bottom: calc(var(--inset-bottom, 0px) + .85rem);
    left: calc(var(--inset-left, 0px) + .85rem);
    display: flex; gap: .6rem; align-items: center;
    padding: .35rem .7rem; border-radius: 8px; font-size: .85rem;
    background: var(--card); border: 1px solid var(--rule); box-shadow: 0 2px 8px rgba(0, 0, 0, .25);
    pointer-events: none;
  }
  .popup-head { display: flex; justify-content: space-between; align-items: center; gap: .5rem; padding: .1rem 1.3rem .3rem .4rem; font-weight: 600; color: var(--muted); }
  .popup-actions { display: flex; align-items: center; color: var(--accent); }
  .popup-row {
    display: flex; flex-direction: column; gap: .1rem; width: 100%;
    padding: .35rem .5rem; border: 1px solid transparent; border-radius: 7px;
    background: transparent; color: var(--ink); font: inherit; text-align: left; cursor: pointer;
  }
  .popup-row:hover:not(:disabled) { background: var(--band); }
  .popup-row.on { border-color: var(--accent); background: var(--band); }
  .popup-row.dim { opacity: .5; cursor: default; }
  .popup-verb { display: flex; align-items: center; gap: .45rem; font-weight: 600; }
  /* The price sits first on an activity row, in the accent, so the verb reads as ◆ ◆◆ ◆◆◆ down
     the left edge before any word is read. */
  .row-cost { display: inline-flex; align-items: center; min-width: 2.4rem; color: var(--accent); }
  .row-cost.over { color: var(--muted); }
  .activity-row .popup-verb { gap: .3rem; }
  .reason { margin-left: auto; font-size: .7rem; font-weight: 400; color: var(--muted); }
  .picker-heading { display: flex; align-items: center; gap: .65rem; padding: .65rem .7rem .8rem; margin-bottom: .35rem; border-bottom: 1px solid var(--rule); }
  .picker-emblem { position: relative; flex: 0 0 3rem; height: 3rem; display: grid; place-items: center; }
  .picker-emblem img { width: 2.8rem; height: 2.8rem; object-fit: contain; filter: drop-shadow(0 2px 3px #0004); }
  .picker-heading-text { display: flex; flex-direction: column; min-width: 0; }
  .picker-heading-text strong { font-size: 1.15rem; line-height: 1.2; }
  .picker-kicker { color: var(--accent); text-transform: uppercase; font-size: .59rem; letter-spacing: .18em; font-weight: 700; margin-bottom: .25rem; }
  .picker-budget { margin-left: auto; align-self: end; color: var(--accent); flex-shrink: 0; }
  .cast-heading { border-bottom-color: color-mix(in srgb, var(--accent) 40%, transparent); }
  .cast-heading .picker-emblem { border: 1px solid var(--accent); border-radius: 50%; box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 10%, transparent); }
  .cast-heading .picker-emblem::before { content: ''; position: absolute; inset: -5px; border: 1px dashed color-mix(in srgb, var(--accent) 45%, transparent); border-radius: 50%; }
  .rally-heading { background: color-mix(in srgb, var(--accent) 9%, transparent); border-bottom: 3px double color-mix(in srgb, var(--accent) 50%, transparent); }
  .rally-heading .picker-emblem { background: color-mix(in srgb, var(--accent) 15%, transparent); height: 3.5rem; clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 84%, 0 100%); padding-bottom: .5rem; }
  .shoot-heading { padding-block: .3rem .6rem; }
  .shoot-heading .picker-emblem { border: 1px solid var(--accent); background: linear-gradient(90deg, transparent 49%, color-mix(in srgb, var(--accent) 25%, transparent) 49% 51%, transparent 51%), linear-gradient(transparent 49%, color-mix(in srgb, var(--accent) 25%, transparent) 49% 51%, transparent 51%); }
  .activity-row.cast-row, .activity-row.rally-row { position: relative; padding: .65rem .55rem .65rem 3.5rem; margin-bottom: .35rem; min-height: 3.4rem; }
  .activity-row.cast-row { border: 1px solid color-mix(in srgb, var(--accent) 23%, transparent); border-radius: 12px; background: color-mix(in srgb, var(--accent) 4%, transparent); }
  .cast-row .row-cost, .rally-row .row-cost { position: absolute; left: .55rem; top: .65rem; min-width: 0; width: 2.35rem; height: 2.35rem; display: flex; align-items: center; justify-content: center; }
  .cast-row .row-cost { border: 1px solid var(--accent); border-radius: 50%; background: color-mix(in srgb, var(--accent) 9%, var(--card)); box-shadow: inset 0 0 0 3px var(--card); }
  .activity-row.rally-row { border-radius: 2px; border-left: 2px solid color-mix(in srgb, var(--accent) 45%, transparent); border-bottom: 1px solid var(--rule); }
  .rally-row .row-cost { height: 2.7rem; padding-bottom: .35rem; color: var(--card); background: var(--accent); clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 83%, 0 100%); }
  .cast-row .popup-verb, .rally-row .popup-verb { flex-wrap: wrap; row-gap: .1rem; }
  .cast-row .reason, .rally-row .reason { margin-left: 0; width: 100%; }
  .activity-row.cast-row.on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, var(--card)); }
  .activity-row.rally-row.on { border-left: 4px solid var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--card)); }
  .activity-row.shoot-row { border-radius: 2px; border-bottom: 1px solid var(--rule); }
  .shoot-row .row-cost { border-right: 1px solid var(--rule); margin-right: .3rem; }
  .activity-row:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .activity-chips { display: flex; gap: .3rem; padding: .1rem .5rem .3rem 1rem; }
  .activity-chip {
    display: flex; gap: .3rem; align-items: center;
    padding: .1rem .45rem; border: 1px solid var(--rule); border-radius: 999px;
    background: transparent; color: var(--ink); font: inherit; font-size: .78rem; cursor: pointer;
  }
  .activity-chip.on { border-color: var(--accent); background: var(--band); }
  .activity-chip:disabled { opacity: .4; cursor: default; }
  .popup-foot { display: flex; gap: .5rem; align-items: center; padding: .3rem .5rem 0; border-top: 1px solid var(--rule); margin-top: .3rem; }
  .popup-foot .muted { margin-right: auto; }
  .popup-foot button { font-size: .8rem; padding: .15rem .5rem; }

  .orders-head { display: flex; align-items: baseline; gap: .5rem; }
  .orders-head h3 { margin: 0; }
  .orders-head .muted { font-size: .78rem; }

  .action-pips { align-items: center; gap: .45rem; margin: .3rem 0 .1rem; color: var(--accent); }
  .end-turn { width: 100%; margin-top: auto; }

  .cost-key { margin: .2rem 0 .5rem; font-size: .76rem; color: var(--muted); line-height: 1.7; }

  .move-card h3 { margin: 0; font-size: inherit; }
  .move-head {
    display: flex; align-items: baseline; gap: .4rem; width: 100%;
    margin: 0 0 .4rem; padding: 0; border: 0; background: none;
    color: inherit; font: inherit; text-align: left; cursor: pointer;
  }
  .move-rows { display: flex; flex-direction: column; gap: .25rem; }
  .move-row {
    display: flex; justify-content: space-between; align-items: center; gap: .5rem;
    padding: .3rem .55rem; border-radius: 6px; background: var(--band);
  }
  .move-note .row-prop { vertical-align: -.35rem; margin-right: .2rem; }
  .move-note { margin: 0; padding: .45rem .55rem; border-radius: 6px; border-left: 4px solid var(--bad); background: var(--band); line-height: 1.45; }
  .move-row.current { outline: 2px solid var(--accent); outline-offset: -1px; }
  .move-row-label { display: inline-flex; align-items: center; min-width: 3rem; color: var(--ink); }

  .hint { font-size: .8rem; }

  .activity-detail { margin: .1rem 0; }
  .popup-escapes { padding: .1rem .5rem .2rem 1rem; font-size: .8rem; }

  .escape { display: flex; flex-wrap: wrap; align-items: baseline; gap: .35rem; margin: .15rem 0; font-size: .82rem; }
  .escape-name { font-weight: 600; }
  .tag { padding: .02rem .35rem; border-radius: 999px; border: 1px solid var(--bad); color: var(--bad); font-size: .7rem; }
</style>

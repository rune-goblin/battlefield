import { reachableActivities, soleLegalActivity } from './action-menu.js';
import { type HealingChoice, type ActionOffer, TREE_TARGET, type TargetRef, type TargetOffer, type ActivityOption, targetMatches, type ActivityTarget, type ActivityIndex, notation, canFocus, type Verb, offersAt } from '../../engine/index.js';
import type { HighlightStyle, TargetArrow } from '../../board/index.js';
import { cellsForTarget, TargetingService, type TargetMarker } from '../targeting.js';
import type { BattleState, EngineState, Unit } from '../../engine/index.js';
import type { CommandResult } from '../../runtime/commands.js';
import type { Parked } from './drag-controller.svelte.js';
import type { Prop } from './ring-controller.svelte.js';
import type { BattleDeps } from './battle-controller.svelte.js';

// Touching a board object opens the other popup: every activity that can act on *that*, which
// is `offersAt`'s whole job. Grouped by verb, because the props are what the eye lands on —
// a tile row across the top, then the chosen verb's three activities beneath it.
export interface Aim { cell: string; target: TargetRef; label: string; groups: TargetOffer[]; group: number; index: number }

export interface PickerShared extends BattleDeps {
  readonly active: Unit | null;
  readonly b: BattleState;
  readonly offers: ActionOffer[];
  readonly hoveredCell: string | null;
  readonly siegeOffer: ActionOffer | null;
  focus: number;
  readonly unpark: () => void;
  readonly clearRing: () => void;
  readonly disarm: () => void;
  readonly arming: Prop | null;
  readonly hoveredEdge: string | null;
  readonly clearHover: () => void;
  readonly requireTurn: () => boolean;
  readonly siegeEngine: EngineState | null;
  readonly fireSiege: (activity: ActivityIndex, target: string, commitment: number) => Promise<void>;
  readonly run: (pending: Promise<CommandResult>) => Promise<CommandResult>;
}

export function createPickerController(s: PickerShared) {

  const offerKey = (offer: ActionOffer) => `${offer.type}:${offer.spell ?? ''}`;

  function styleFor(offer: ActionOffer): HighlightStyle {
    if (offer.spell) return TREE_TARGET[offer.spell] === 'enemy' ? 'attack' : 'deploy';
    if (offer.type === 'shoot' || offer.type === 'fight') return 'attack';
    return 'deploy';
  }
  let aim = $state<Aim | null>(null);
  const aimGroup = $derived(aim?.groups[aim.group] ?? null);
  /** Show activities for this target, including their unavailable levels. Blast exposes its
   * whole ladder because choosing a level starts a separate area selection. */
  const aimActivities = $derived.by<ActivityOption[]>(() => {
    if (!aim || !aimGroup || !s.active) return [];
    if (aimGroup.offer.spell === 'blast') return reachableActivities(aimGroup.offer.activities);
    const t = aim.target;
    const own = t.kind === 'unit' && t.id === s.active.id;
    return aimGroup.offer.activities.filter((o) => o.cost !== null
      && (o.targets.some((x) => targetMatches(s.b, x, t)) || (own && !o.needsTarget)));
  });
  const aimed = $derived(aimActivities[aim?.index ?? -1] ?? null);
  // A Blast's Line and Burst, and a Heal or Restore's set, arrive as one target holding two or
  // three parts joined by '+' — a unit-kind id needs the same split a cell-kind id already gets.
  const targetCells = (target: ActivityTarget): string[] => cellsForTarget(s.b, target);
  let blastOpen = $state(false);
  let blastLevel = $state<ActivityIndex | null>(null);
  let blastTarget = $state<string | null>(null);
  let blastHover = $state<string | null>(null);
  let blastCell = $state<string | null>(null);
  const blastOffer = $derived(s.offers.find((o) => o.spell === 'blast') ?? null);
  const blastActivity = $derived(blastOpen ? blastOffer?.activities.find((o) => o.index === blastLevel) ?? null : null);
  const blastService = $derived(s.active && blastOffer && blastActivity ? new TargetingService(s.b, s.active, blastOffer, blastActivity) : null);
  const blastTargets = $derived(blastService?.choices ?? []);
  const blastCandidates = $derived(blastTargets.filter((t) => !blastCell || targetCells(t).includes(blastCell)));
  const blastHoverMatches = $derived(s.hoveredCell ? blastService?.matches({ kind: 'hex', id: s.hoveredCell }) ?? [] : []);
  const blastPreview = $derived(blastTargets.find((t) => t.id === blastHover)
    ?? (blastHoverMatches.length === 1 ? blastHoverMatches[0] : null)
    ?? blastTargets.find((t) => t.id === blastTarget) ?? null);
  const blastSelection = $derived(blastTargets.find((t) => t.id === blastTarget) ?? null);


  // Cast and Rally show their activities before asking for a target.
  let activityPick = $state<{ key: string; index: ActivityIndex | null; selected: string[]; target?: string } | null>(null);
  let targetHover = $state<string | null>(null);
  let healingChoices = $state<Record<string, HealingChoice>>({});
  const pickerOffer = $derived(activityPick?.key === 'siege' ? s.siegeOffer : s.offers.find((o) => offerKey(o) === activityPick?.key) ?? null);
  const pickerActivity = $derived(pickerOffer?.activities.find((o) => o.index === activityPick?.index) ?? null);
  const pickerService = $derived(s.active && pickerOffer && pickerActivity ? new TargetingService(s.b, s.active, pickerOffer, pickerActivity) : null);
  const pickerTargets = $derived(pickerService?.choices ?? []);
  const pickerCandidates = $derived(pickerService?.candidates(activityPick?.selected) ?? []);
  const pickerHoverMatches = $derived(s.hoveredCell ? pickerService?.matches({ kind: 'hex', id: s.hoveredCell }) ?? [] : []);
  const pickerPreview = $derived(pickerTargets.find((t) => t.id === targetHover)
    ?? (pickerHoverMatches.length === 1 ? pickerHoverMatches[0] : null)
    ?? pickerTargets.find((t) => t.id === activityPick?.target) ?? null);

  /** `key` names the siege engine's picker, whose offer no verb on the ring holds. */
  function openActivityPicker(offer: ActionOffer, key = offerKey(offer)) {
    s.focus = 0;
    aim = null; s.unpark(); s.clearRing();
    targetHover = null;
    activityPick = { key, index: soleLegalActivity(offer.activities)?.index ?? null, selected: [] };
    healingChoices = {};
  }

  function choosePickerActivity(index: ActivityIndex) {
    const offer = pickerOffer;
    const option = offer?.activities.find((o) => o.index === index);
    if (!offer || !option?.legal || !activityPick) return;
    targetHover = null;
    s.focus = 0;
    activityPick = { ...activityPick, index, selected: [], target: undefined };
    healingChoices = {};
  }

  function choosePickerTarget(id: string) {
    const offer = pickerOffer, option = pickerActivity;
    const target = pickerTargets.find((t) => t.id === id);
    if (!offer || !option?.legal || !target) return;
    if (activityPick) activityPick = { ...activityPick, selected: target.cells, target: target.id };
    healingChoices = {};
    targetHover = null;
  }

  function confirmPicker() {
    const offer = pickerOffer, option = pickerActivity, target = activityPick?.target;
    if (!offer || !option?.legal || (option.needsTarget && !target)) return;
    const pending = performActivity(offer, option, target);
    activityPick = null; targetHover = null;
    return pending;
  }

  function pickActivityCell(cell: string) {
    if (!activityPick || !pickerActivity?.legal) return;
    if (activityPick.key === 'siege') {
      const matches = pickerService?.matches({ kind: 'hex', id: cell }) ?? [];
      if (matches.length === 1) { choosePickerTarget(matches[0].id); return; }
      if (matches.length > 1) {
        // Siege shapes are complete targets. Let the player choose among overlapping areas.
        activityPick = { ...activityPick, selected: [cell], target: undefined };
        targetHover = null;
      }
      return;
    }
    const pick = pickerService?.pickCell(cell, activityPick.selected);
    if (!pick) return;
    targetHover = null;
    activityPick = { ...activityPick, selected: pick.selected, target: pick.target?.id };
    healingChoices = {};
  }

  function openBlast(level: ActivityIndex | null = null) {
    aim = null; s.unpark(); s.clearRing();
    activityPick = null; targetHover = null;
    blastOpen = true;
    chooseBlastLevel(level ?? soleLegalActivity(blastOffer?.activities ?? [])?.index ?? null);
  }

  function chooseBlastLevel(level: ActivityIndex | null) {
    if (level !== null && !blastOffer?.activities.some(option => option.index === level && option.legal)) return;
    s.focus = 0;
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
    void performActivity(blastOffer, blastActivity, blastSelection.id);
    blastOpen = false; chooseBlastLevel(null);
  }

  const aimService = $derived(s.active && aimGroup && aimed ? new TargetingService(s.b, s.active, aimGroup.offer, aimed) : null);
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
    : s.arming && s.active ? `${s.active.id}:${s.arming.key}` : null);
  const liveArrows = $derived.by<TargetArrow[]>(() => {
    if (targetingService) {
      const selected = activityPick?.selected ?? [];
      const hovered = targetingService.arrows(selected, targetHover ?? blastHover, s.hoveredEdge ?? s.hoveredCell);
      if (targetHover || blastHover || s.hoveredCell || s.hoveredEdge) {
        if (hovered.length) return hovered;
      }
      return targetingService.arrows(selected, targetingChoice?.id ?? null, aim?.cell ?? null);
    }
    if (!s.arming || !s.active) return [];
    const cells = s.hoveredEdge && s.arming.edges.includes(s.hoveredEdge) ? s.hoveredEdge.split('|')
      : s.hoveredCell && s.arming.cells.includes(s.hoveredCell) ? [s.hoveredCell] : [];
    if (!cells.length) return [];
    return [{ from: notation(s.active.square), to: cells[0], toCells: cells,
      tone: s.arming.key === 'maneuver' ? 'movement' : s.arming.key === 'melee' ? 'fight' : s.arming.key }];
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

  function hoverTargetMarker(id: string | null) {
    if (id) s.clearHover();
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

  async function performActivity(offer: ActionOffer, opt: ActivityOption, target?: string) {
    if (!s.active || !s.requireTurn()) return;
    const resolution = new TargetingService(s.b, s.active, offer, opt).resolve(target);
    if (!resolution) return;
    const commitment = canFocus(offer.type, offer.spell) ? s.focus : 0;
    if (activityPick?.key === 'siege' && s.siegeEngine) {
      if (target) await s.fireSiege(opt.index, target, commitment);
    } else await s.run(s.takeAction({ ...resolution.action, focus: commitment, ...(offer.spell === 'healing' ? { healingChoices: structuredClone($state.snapshot(healingChoices)) } : {}) }));
  }

  /** Open the popup for a board object: everything this unit can do to it, verb by verb. A
   * prop taken off the tray narrows it to that one verb. */
  function aimAt(target: TargetRef, cell: string, label: string, only: Verb | null = null) {
    s.focus = 0;
    if (!s.active) return;
    const all = offersAt(s.b, target, s.active.id);
    const groups = only ? all.filter((g) => g.offer.type === only) : all;
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
    s.focus = 0;
    aim = { ...aim, index: i };
  }

  const aimVerb = (i: number) => {
    s.focus = 0;
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
    s.disarm();
    const service = new TargetingService(s.b, s.active!, group.offer, row);
    const matches = service.forRef(a.target);
    if (row.needsTarget && (matches.length !== 1 || group.offer.spell === 'healing')) {
      const committed = s.focus;
      openActivityPicker(group.offer);
      s.focus = committed;
      activityPick = { key: offerKey(group.offer), index: row.index, selected: service.pickCell(a.cell)?.selected ?? [], target: matches.length === 1 ? matches[0].id : undefined };
      return;
    }
    void performActivity(group.offer, row, matches[0]?.id);
  }

  /** Everything a picker holds open: the target popup, the activity picker and the Blast picker. */
  function clear() {
    aim = null; activityPick = null; targetHover = null;
    blastOpen = false; chooseBlastLevel(null);
  }
  const closeAim = () => { aim = null; };
  const closePicker = () => { activityPick = null; targetHover = null; };

  /** One step out of the activity picker or the Blast picker. `done` stayed inside; the other
   * answers name what reopens once the picker has shut. Null says neither was open. */
  function stepBack(): 'done' | 'trees' | 'ring' | 'siege' | null {
    if (activityPick) {
      targetHover = null;
      if (activityPick.target) { activityPick = { ...activityPick, target: undefined }; return 'done'; }
      if (activityPick.selected.length) { activityPick = { ...activityPick, selected: activityPick.selected.slice(0, -1) }; return 'done'; }
      if (activityPick.index !== null && !soleLegalActivity(pickerOffer?.activities ?? [])) {
        s.focus = 0; activityPick = { ...activityPick, index: null }; return 'done';
      }
      const next = activityPick.key === 'siege' ? 'siege' : pickerOffer?.type === 'cast' ? 'trees' : 'ring';
      activityPick = null;
      return next;
    }
    if (blastOpen) {
      if (blastTarget || blastCell) { blastTarget = null; blastHover = null; blastCell = null; return 'done'; }
      if (blastLevel !== null && !soleLegalActivity(blastOffer?.activities ?? [])) { chooseBlastLevel(null); return 'done'; }
      blastOpen = false;
      return 'trees';
    }
    return null;
  }

  function stepAimRow(by: number) {
    const n = aimActivities.length;
    if (!aim || !n) return;
    s.focus = 0;
    aim = { ...aim, index: (aim.index + by) % n };
  }
  function stepAimVerb(by: number) {
    if (!aim) return;
    s.focus = 0;
    aim = { ...aim, group: (aim.group + by) % aim.groups.length, index: 0 };
  }

  function resetPickerTargets() {
    if (activityPick) activityPick = { ...activityPick, selected: [], target: undefined };
    targetHover = null;
  }
  const chooseBlastTarget = (id: string) => { blastTarget = id; blastHover = null; };
  const showAllBlastTargets = () => { blastCell = null; };
  const showResolved = (markers: TargetMarker[], arrows: TargetArrow[]) => { resolvedMarkers = markers; resolvedArrows = arrows; };

  return {
    get healingChoices() { return healingChoices; },
    set healingChoices(value: Record<string, HealingChoice>) { healingChoices = value; },
    clear, closeAim, closePicker, stepBack, resetPickerTargets, chooseBlastTarget, showAllBlastTargets, showResolved, stepAimRow, stepAimVerb,
    get openActivityPicker() { return openActivityPicker; },
    get activityPick() { return activityPick; },
    get aim() { return aim; },
    get blastOpen() { return blastOpen; },
    get blastLevel() { return blastLevel; },
    get blastTarget() { return blastTarget; },
    get blastHover() { return blastHover; },
    get blastCell() { return blastCell; },
    get targetHover() { return targetHover; },
    get targetCells() { return targetCells; },
    get chooseBlastLevel() { return chooseBlastLevel; },
    get pickerOffer() { return pickerOffer; },
    get openBlast() { return openBlast; },
    get aimAt() { return aimAt; },
    get takeAim() { return takeAim; },
    get aimActivities() { return aimActivities; },
    get aimed() { return aimed; },
    get aimGroup() { return aimGroup; },
    get resolvedMarkers() { return resolvedMarkers; },
    get resolvedArrows() { return resolvedArrows; },
    get aimStyle() { return aimStyle; },
    get aimCells() { return aimCells; },
    get styleFor() { return styleFor; },
    get pickerPreview() { return pickerPreview; },
    get pickerService() { return pickerService; },
    get blastPreview() { return blastPreview; },
    get blastCandidates() { return blastCandidates; },
    get pickActivityCell() { return pickActivityCell; },
    get pickBlastCell() { return pickBlastCell; },
    get choosePickerTarget() { return choosePickerTarget; },
    get offerKey() { return offerKey; },
    get blastOffer() { return blastOffer; },
    get blastActivity() { return blastActivity; },
    get blastSelection() { return blastSelection; },
    get pickerActivity() { return pickerActivity; },
    get pickerCandidates() { return pickerCandidates; },
    get choosePickerActivity() { return choosePickerActivity; },
    get confirmPicker() { return confirmPicker; },
    get confirmBlast() { return confirmBlast; },
    get targetingService() { return targetingService; },
    get targetingChoice() { return targetingChoice; },
    get targetMarkers() { return targetMarkers; },
    get hoverTargetMarker() { return hoverTargetMarker; },
    get chooseTargetMarker() { return chooseTargetMarker; },
    get aimChoose() { return aimChoose; },
    get aimVerb() { return aimVerb; },
    get shot() { return shot; },
  };
}

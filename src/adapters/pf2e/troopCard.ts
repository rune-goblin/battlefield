import { importAbilities, sourceAttackTags } from './abilities.js';
import { MAX_WOUNDS, reachForFeet, type Reach, type Role, type Signal, type TroopSheet, type UnitCard } from '../../engine/index.js';
import type { ImportBaseline } from '../../runtime/session.js';
import { spellcastingOf } from './spellcasting.js';

/** The slice of a PF2e item this adapter reads. Structural, so a live embedded document, an
 * unprepared source object and a test fixture all satisfy it. */
export interface TroopItem {
  flags?: Record<string, unknown>;
  toObject?: () => TroopItem;
  name?: string;
  type?: string;
  statistic?: { check?: { mod?: number }; dc?: { value?: number } };
  system?: {
    actionType?: { value?: string | null } | null;
    actions?: { value?: number | null } | null;
    rules?: unknown[];
    slug?: string | null;
    tradition?: { value?: string | null } | null;
    spelldc?: { value?: number; dc?: number } | null;
    description?: { value?: string | null } | null;
    badge?: { value?: number | null } | null;
    value?: { value?: number | null } | null;
    traits?: { value?: string[] | null } | null;
  } | null;
}

/** The slice of a PF2e troop actor this adapter reads. No Foundry global appears here: the
 * caller hands over the actor, and a plain object of the same shape does as well. */
export interface TroopActor {
  /** Foundry prepares an in-memory actor clone without changing the campaign actor. */
  clone?: (changes: { items: TroopItem[] }, options: { keepId: boolean; save: false }) => TroopActor;
  name?: string;
  system?: {
    details?: { level?: { value?: number } };
    traits?: { value?: string[] };
    attributes?: {
      immunities?: { type: string }[];
      ac?: { value?: number };
      hp?: { max?: number; value?: number };
      speed?: { value?: number; otherSpeeds?: { type?: string; value?: number }[] | null };
      perception?: { value?: number };
    };
    perception?: { mod?: number };
    saves?: {
      fortitude?: { value?: number };
      reflex?: { value?: number };
      will?: { value?: number };
    };
  };
  items?: TroopItem[] | { values(): Iterable<TroopItem> };
}

/** Feet of the actor's Speed that carry a formation one square of the board. */
const SPEED_PER_SQUARE = 30;

// Structural signals, read off the recurring action names the way scripts/troop-signals.mjs
// reads them. Measured over the published troops, AC and attack DC are essentially f(level),
// so these names are what separates one statblock from another.
const SIGNALS: [Signal, RegExp][] = [
  ['mounted', /mounted troop|first-class charge/i],
  ['melee-drill', /clash of steel|wild swing|strike as one|trample|attack of opportunity|reactive strike/i],
  ['shielded', /raise shields|shield block/i],
  ['formation', /form up|drilled in formations/i],
  ['magic-ward', /status to all saves vs\.? magic/i],
  ['no-retreat', /no retreat/i],
];

const CASTING_ACTION = /troop spellcasting|constant spells/i;
// No published troop names one; the trait pair below is how Fey Host's Wild Gaze reads as fear.
const FEAR_ACTION = /frightful presence|fear aura|aura of fear/i;

const DEMORALIZED = 'demoralized';

const itemsOf = (actor: TroopActor): TroopItem[] => {
  const items = actor.items;
  if (!items) return [];
  return Array.isArray(items) ? items : [...items.values()];
};

const description = (item: TroopItem | undefined): string => item?.system?.description?.value ?? '';
const traitsOf = (item: TroopItem): string[] => item.system?.traits?.value ?? [];
const named = (items: TroopItem[], mark: string): TroopItem | undefined =>
  items.find((it) => (it.name ?? '').includes(mark));

const checkDc = (html: string): number | null => {
  const found = /dc:(\d+)/.exec(html);
  return found ? Number(found[1]) : null;
};

const withinFeet = (html: string): number | null => {
  const found = /within (\d+) feet/.exec(html);
  return found ? Number(found[1]) : null;
};

// Extreme is reserved for siege engines (BANDS in types.ts) — a troop's own Salvo never
// derives it, however far its range increment runs.

interface Attacks { battleDc: number; salvoDc: number | null; salvoFeet: number | null; battleName?: string; salvoName?: string }

/** Feet within which an attack still counts as the troop's own reach. */
const BATTLE_REACH = 10;

const SAVE_DC = /@Check\[(reflex|fortitude|will)\|dc:(\d+)/;
// Both spellings occur in the source: @Template[cone|distance:30] and @Template[type:cone|distance:30].
const TEMPLATE = /@Template\[(?:type:)?(\w+)\|distance:(\d+)/g;

/**
 * A published troop attacks through area actions that deal damage against a save. One that fills
 * an emanation round the troop, or reaches ten feet at most, is its Battle. One thrown as a
 * burst, breathed as a cone or loosed at a stated distance is a Salvo, and the longest is kept.
 */
function publishedAttacks(actions: TroopItem[]): Attacks | null {
  const battle: { dc: number; reflex: boolean; name?: string }[] = [];
  let salvo: { dc: number | null; feet: number; name?: string } | null = null;
  for (const action of actions) {
    const text = description(action).replace(/<[^>]+>/g, ' ');
    // proto: a once-a-day area is a special ability, and no card carries one yet.
    if (!text.includes('@Damage') || /once per (day|hour)/i.test(text)) continue;
    const save = SAVE_DC.exec(text);
    const dc = save ? Number(save[2]) : null;
    const templates = [...text.matchAll(TEMPLATE)].map((m) => ({ kind: m[1], feet: Number(m[2]) }));
    const thrown = templates.filter((t) => t.kind !== 'emanation').map((t) => t.feet);
    // A burst's own distance is its splash; the stated distance is how far it is thrown.
    const feet = thrown.length ? Math.max(withinFeet(text) ?? 0, ...thrown) : templates.length ? 0 : withinFeet(text) ?? 0;
    if (feet > BATTLE_REACH) {
      // A breath or volley that names no save of its own is resolved at the troop's Battle DC.
      if (!salvo || feet > salvo.feet) salvo = { dc, feet, name: action.name };
    } else if (dc !== null) battle.push({ dc, reflex: save![1] === 'reflex', name: action.name });
  }
  // A Fortitude DC at close reach is usually a poison riding on the attack, so Reflex leads.
  const close = battle.some((b) => b.reflex) ? battle.filter((b) => b.reflex) : battle;
  // proto: a troop with no close attack fights hand to hand at its Salvo's DC.
  const battleDc = close.length ? Math.min(...close.map((b) => b.dc)) : salvo?.dc ?? null;
  if (battleDc === null) return null;
  return { battleDc, salvoDc: salvo ? salvo.dc ?? battleDc : null, salvoFeet: salvo?.feet ?? null,
    battleName: close.find(b => b.dc === battleDc)?.name, salvoName: salvo?.name };
}

/** ReignMaker labels an army's two attacks `[Battle]` and `[Salvo]`; a published troop labels
 * neither, and its attacks are read off its actions. */
function attacksOf(items: TroopItem[]): { attacks: Attacks | null; problems: string[] } {
  items = items.filter(item => !item.system?.actionType?.value || item.system.actionType.value === 'action');
  const battle = named(items, '[Battle]');
  const salvo = named(items, '[Salvo]');
  if (!battle && !salvo) {
    const attacks = publishedAttacks(items.filter((it) => it.type === 'action'));
    return { attacks, problems: attacks ? [] : ['the actor has no [Battle] action'] };
  }
  const problems: string[] = [];
  const battleDc = battle ? checkDc(description(battle)) : null;
  if (!battle) problems.push('the actor has no [Battle] action');
  else if (battleDc === null) problems.push('the [Battle] action states no check DC');
  const salvoDc = salvo ? checkDc(description(salvo)) : null;
  const salvoFeet = salvo ? withinFeet(description(salvo)) : null;
  if (salvo && salvoDc === null) problems.push('the [Salvo] action states no check DC');
  if (salvo && salvoFeet === null) problems.push('the [Salvo] action states no distance');
  return { attacks: problems.length ? null : { battleDc: battleDc!, salvoDc, salvoFeet,
    battleName: battle?.name, salvoName: salvo?.name }, problems };
}

/** PF2e leaves `system.slug` null on hand-authored items and falls back to the sluggified
 * name, so slug matching has to do the same or it misses every item nobody baked a slug into. */
const slugOf = (item: TroopItem): string =>
  item.system?.slug || (item.name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const badgeOf = (item: TroopItem): number =>
  item.system?.badge?.value ?? item.system?.value?.value ?? 0;

/**
 * Demoralized stacks on the actor. The campaign keeps it as an Effect item with a badge that
 * flat-modifies every check and DC by −1 a point, so a prepared actor's AC, saves and
 * Perception already carry the penalty and `cardFromActor` hands back what it took.
 */
export function demoralizedOf(actor: TroopActor): number {
  const stacks = demoralizedItems(actor).map((it) => badgeOf(it));
  return stacks.length ? Math.max(0, ...stacks) : 0;
}

/** The effects the writeback rewrites at the end of a battle. */
export const demoralizedItems = (actor: TroopActor): TroopItem[] =>
  itemsOf(actor).filter((it) => slugOf(it) === DEMORALIZED);

/**
 * Wounds off the hit-point thresholds, the inverse of the writeback ladder in the adapter
 * contract: full, ⌊¾⌋, ⌊½⌋, ⌊¼⌋, 0. A unit written back at one wound imports at one wound.
 */
export function woundsOf(hitPoints: number, maxHitPoints: number): number {
  if (maxHitPoints <= 0) return 0;
  if (hitPoints <= 0) return MAX_WOUNDS;
  if (hitPoints <= Math.floor(maxHitPoints / 4)) return 3;
  if (hitPoints <= Math.floor(maxHitPoints / 2)) return 2;
  if (hitPoints <= Math.floor((maxHitPoints * 3) / 4)) return 1;
  return 0;
}

/** What the writeback compares an actor against before it touches it. */
export function importBaselineOf(actor: TroopActor): ImportBaseline {
  const hp = actor.system?.attributes?.hp;
  return {
    hitPoints: hp?.value ?? 0,
    maxHitPoints: hp?.max ?? 0,
    demoralized: demoralizedOf(actor),
  };
}

/** Every reason this actor cannot become a card. Empty means it can. These read to the module
 * that imported the actor, never to a player. */
export function troopActorProblems(actor: unknown): string[] {
  const a = actor as TroopActor | null;
  if (!a || typeof a !== 'object') return ['the actor is not an object'];
  const out: string[] = [];
  if (typeof a.name !== 'string' || !a.name) out.push('the actor has no name');
  const system = a.system;
  if (!system || typeof system !== 'object') return [...out, 'the actor carries no system data'];
  if (!Number.isInteger(system.details?.level?.value)) out.push('the actor states no level');
  if (!Number.isFinite(system.attributes?.ac?.value)) out.push('the actor states no AC');
  if (!Number.isFinite(system.attributes?.hp?.max)) out.push('the actor states no maximum hit points');
  if (!Number.isFinite(system.attributes?.speed?.value)) out.push('the actor states no Speed');
  for (const save of ['fortitude', 'reflex', 'will'] as const) {
    if (!Number.isFinite(system.saves?.[save]?.value)) out.push(`the actor states no ${save} save`);
  }
  return [...out, ...attacksOf(itemsOf(a)).problems];
}

/**
 * A PF2e troop actor as a `UnitCard`, mapped the way the adapter contract's table describes and
 * `scripts/import-troops.mjs` already maps the published troops. The Battle and Salvo DCs come
 * from the action text, which no condition modifies; AC, the saves and Perception come from the
 * prepared statistics, so Demoralized comes off them and rides on `disorder` instead. A
 * malformed actor throws, so nothing half-read reaches a battle.
 */
export function cardFromActor(actor: TroopActor): UnitCard {
  // Recompute on a temporary actor so suppressed circumstance modifiers can resume. Merely
  // subtracting the fort bonus would also remove cover/Guard that it previously superseded.
  const originalItems = itemsOf(actor);
  const originalAttacks = attacksOf(originalItems).attacks;
  const imported = importAbilities(originalItems, originalAttacks ?? {});
  if (actor.clone && (imported.matched.size || originalItems.some(item => item.type === 'effect' && item.system?.slug === 'fortification'))) {
    actor = actor.clone({ items: originalItems.map((item, index) => {
      const data = item.toObject?.() ?? item;
      if (!imported.matched.has(index) || !data.system?.rules) return data;
      return { ...data, system: { ...data.system, rules: data.system.rules.filter(r => !(r && typeof r === 'object' && 'key' in r && r.key === 'FlatModifier')) } };
    })
      .filter(item => !(item.type === 'effect' && item.system?.slug === 'fortification'))
      .map(item => item.toObject?.() ?? item) }, { keepId: true, save: false });
  }
  const problems = troopActorProblems(actor);
  if (problems.length) throw new Error(problems.join('; '));
  const system = actor.system!;
  const attributes = system.attributes!;
  const saves = system.saves!;
  const items = itemsOf(actor);
  const actions = items.filter((it) => it.type === 'action');
  const actionNames = actions.map((it) => it.name ?? '');

  const { battleDc, salvoDc, salvoFeet, battleName, salvoName } = attacksOf(items).attacks!;
  const reach = salvoFeet === null ? null : reachForFeet(salvoFeet);

  const speed = attributes.speed!.value!;
  const flySpeed = (attributes.speed!.otherSpeeds ?? []).find((o) => o.type === 'fly');

  // Demoralized's status penalty reaches every check and AC, and the engine subtracts disorder
  // itself; leaving it in the prepared numbers would take it twice.
  const demoralized = demoralizedOf(actor);
  const { tradition, ...spellStats } = spellcastingOf(items, demoralized);
  const sheet: TroopSheet = {
    ac: attributes.ac!.value! + demoralized,
    hp: attributes.hp!.max!,
    battleDc,
    salvoDc,
    salvoFeet,
    fortitude: saves.fortitude!.value! + demoralized,
    reflex: saves.reflex!.value! + demoralized,
    will: saves.will!.value! + demoralized,
    perception: (system.perception?.mod ?? attributes.perception?.value ?? 0) + demoralized,
    speed,
    otherSpeeds: (attributes.speed!.otherSpeeds ?? [])
      .filter((s): s is { type: string; value: number } => typeof s.type === 'string' && Number.isFinite(s.value) && s.value! >= 0)
      .map(s => ({ type: s.type, value: s.value })),
    ...(battleName ? { battleName } : {}),
    ...(salvoName ? { salvoName } : {}),
    ...spellStats,
  };

  const signals = SIGNALS.filter(([, re]) => actionNames.some((n) => re.test(n))).map(([s]) => s);
  const caster = items.some((it) => it.type === 'spellcastingEntry' || it.type === 'spell')
    || actionNames.some((n) => CASTING_ACTION.test(n));
  const fear = actions.some((it) => FEAR_ACTION.test(it.name ?? '')
    || (traitsOf(it).includes('aura') && traitsOf(it).includes('fear')));
  const wounds = woundsOf(attributes.hp!.value ?? sheet.hp, sheet.hp);

  return {
    name: actor.name!,
    abilities: imported.abilities, abilityReview: imported.abilityReview,
    traits: system.traits?.value ?? [],
    immuneFear: attributes.immunities?.some(i => ['fear', 'mental', 'emotion'].includes(i.type)) ?? false,
    attackTags: { melee: sourceAttackTags(originalItems, battleName), volley: sourceAttackTags(originalItems, salvoName) },
    level: system.details!.level!.value!,
    role: roleOf(speed, flySpeed?.value ?? 0, signals),
    salvo: reach,
    pace: (flySpeed?.value ?? 0) > 0 || speed >= SPEED_PER_SQUARE,
    fear,
    caster,
    ...(caster && tradition ? { tradition } : {}),
    signals,
    // proto: the contract keeps tactics a hand-authored list and the statblock states none, so
    // an import authors none, as scripts/import-troops.mjs does. This suppresses the role's
    // default tactic — imported cavalry carries no charge until somebody writes one in.
    tactics: [],
    sheet,
    ...(wounds ? { wounds } : {}),
    ...(demoralized ? { disorder: demoralized } : {}),
    overrides: {
      strike: battleDc - 10,
      volley: salvoDc === null ? null : salvoDc - 10,
      reach,
      defence: sheet.ac,
      will: sheet.will,
      perception: sheet.perception,
    },
  };
}

/**
 * Cavalry rides or runs: a mounted troop, or one whose fastest movement carries it further than
 * the thirty feet a square costs.
 */
// proto: the import script reads ReignMaker's `armyType` flag for this, which Battlefield does
// not read from any module. This reads the statblock instead and agrees with that flag on all
// 38 published troops.
function roleOf(speed: number, flySpeed: number, signals: Signal[]): Role {
  const fastest = Math.max(speed, flySpeed);
  return signals.includes('mounted') || fastest > SPEED_PER_SQUARE ? 'cavalry' : 'infantry';
}

import { MAX_WOUNDS, type Reach, type Role, type Signal, type TroopSheet, type UnitCard } from '../../engine/index.js';
import type { ImportBaseline } from '../../runtime/session.js';

/** The slice of a PF2e item this adapter reads. Structural, so a live embedded document, an
 * unprepared source object and a test fixture all satisfy it. */
export interface TroopItem {
  name?: string;
  type?: string;
  system?: {
    slug?: string | null;
    description?: { value?: string | null } | null;
    badge?: { value?: number | null } | null;
    value?: { value?: number | null } | null;
    traits?: { value?: string[] | null } | null;
  } | null;
}

/** The slice of a PF2e troop actor this adapter reads. No Foundry global appears here: the
 * caller hands over the actor, and a plain object of the same shape does as well. */
export interface TroopActor {
  name?: string;
  system?: {
    details?: { level?: { value?: number } };
    attributes?: {
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
const bandOf = (feet: number): Reach => (feet <= 60 ? 'short' : feet <= 120 ? 'medium' : 'long');

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
  const items = itemsOf(a);
  const battle = named(items, '[Battle]');
  if (!battle) out.push('the actor has no [Battle] action');
  else if (checkDc(description(battle)) === null) out.push('the [Battle] action states no check DC');
  const salvo = named(items, '[Salvo]');
  if (salvo) {
    if (checkDc(description(salvo)) === null) out.push('the [Salvo] action states no check DC');
    if (withinFeet(description(salvo)) === null) out.push('the [Salvo] action states no distance');
  }
  return out;
}

/**
 * A PF2e troop actor as a `UnitCard`, mapped the way the adapter contract's table describes and
 * `scripts/import-troops.mjs` already maps the published troops. The Battle and Salvo DCs come
 * from the action text, which no condition modifies; AC, the saves and Perception come from the
 * prepared statistics, so Demoralized comes off them and rides on `disorder` instead. A
 * malformed actor throws, so nothing half-read reaches a battle.
 */
export function cardFromActor(actor: TroopActor): UnitCard {
  const problems = troopActorProblems(actor);
  if (problems.length) throw new Error(problems.join('; '));
  const system = actor.system!;
  const attributes = system.attributes!;
  const saves = system.saves!;
  const items = itemsOf(actor);
  const actions = items.filter((it) => it.type === 'action');
  const actionNames = actions.map((it) => it.name ?? '');

  const battleDc = checkDc(description(named(items, '[Battle]')))!;
  const salvo = named(items, '[Salvo]');
  const salvoDc = salvo ? checkDc(description(salvo)) : null;
  const salvoFeet = salvo ? withinFeet(description(salvo)) : null;
  const reach = salvoFeet === null ? null : bandOf(salvoFeet);

  const speed = attributes.speed!.value!;
  const flySpeed = (attributes.speed!.otherSpeeds ?? []).find((o) => o.type === 'fly');

  // Demoralized's status penalty reaches every check and AC, and the engine subtracts disorder
  // itself; leaving it in the prepared numbers would take it twice.
  const demoralized = demoralizedOf(actor);
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
    fly: flySpeed !== undefined,
  };

  const signals = SIGNALS.filter(([, re]) => actionNames.some((n) => re.test(n))).map(([s]) => s);
  const caster = items.some((it) => it.type === 'spellcastingEntry' || it.type === 'spell')
    || actionNames.some((n) => CASTING_ACTION.test(n));
  const fear = actions.some((it) => FEAR_ACTION.test(it.name ?? '')
    || (traitsOf(it).includes('aura') && traitsOf(it).includes('fear')));
  const wounds = woundsOf(attributes.hp!.value ?? sheet.hp, sheet.hp);

  return {
    name: actor.name!,
    level: system.details!.level!.value!,
    role: roleOf(speed, flySpeed?.value ?? 0, signals),
    salvo: reach,
    pace: sheet.fly || speed >= SPEED_PER_SQUARE,
    fear,
    caster,
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

import { cardTraits, type Tactic, type UnitCard } from './cards.js';
import { treesForTradition, type Tree } from './magic.js';

// Two verbs have no table of their own. A Move action spends the troop's Speed in feet, and
// Maneuver rolls the escaping unit's Reflex against whoever is holding it — see `doManeuver`
// in `battle.ts`. Cast keeps its slot in `Verb` (the offer menu still groups by it) and
// its own six trees live in `magic.ts`.
export type Verb = 'shoot' | 'fight' | 'guard' | 'rally' | 'cast';
export const VERB_TYPES: Verb[] = ['shoot', 'fight', 'guard', 'rally', 'cast'];

/** Ordinary activities use 1–3; spells also have a fourth tier at a three-action cost. */
export type ActivityIndex = 1 | 2 | 3 | 4;

export type ActivityId =
  | 'fire' | 'suppress' | 'pin'
  | 'strike' | 'press' | 'overrun'
  | 'brace' | 'dig-in' | 'take-cover'
  | 'steady' | 'rally' | 'inspire';

/** Each activity includes everything below it. `press`: the target rolls its wound save twice and keeps the worse. `drive`: a
 * hit shoves the target one hex and the attacker takes its ground. */
export interface FightEffect { press: boolean; drive: boolean }
/** Each activity includes everything below it. `suppress` sets the target's `suppressedBy`, hit or
 * miss; `pin` also sets `pinnedBy`, which makes the shooter one of the target's holders (see
 * `holdersOf` in battle.ts). Both clear at the shooter's own `begin`, or its leaving play. */
export interface ShootEffect { suppress: boolean; pin: boolean }
/** Each activity includes everything below it. `cap` caps a hit at one wound, so a critical lands
 * as an ordinary one; `holds` refuses an Overrun's shove; `rooted` (Take cover only) ends the
 * unit's movement for the rest of this activation. */
export interface GuardEffect { defence: 2 | 4; cap: boolean; holds: boolean; rooted: boolean }
/** The activity carries scope, never amount — how much clears comes off the Rally check's
 * degree instead (see `perform`'s 'rally' case in `battle.ts`). */
export type RallyScope = 'self' | 'adjacent' | 'nearby';
export interface RallyEffect { scope: RallyScope }

export interface Activity {
  id: ActivityId;
  type: Verb;
  index: ActivityIndex;
  label: string;
  verb: string;
  detail: string;
  fight?: FightEffect;
  shoot?: ShootEffect;
  guard?: GuardEffect;
  rally?: RallyEffect;
}

export const VERBS: Record<Exclude<Verb, 'cast'>, [Activity, Activity, Activity]> = {
  // Fire, Suppress and Pin share the weapon's preferred band and one-hex flexibility.
  shoot: [
    { id: 'fire', verb: 'fires', type: 'shoot', index: 1, label: 'Fire', detail: 'A volley at preferred Reach, or one hex shorter or longer at −2. Mountains block intervening shots; forests grant cover.', shoot: { suppress: false, pin: false } },
    { id: 'suppress', verb: 'suppresses', type: 'shoot', index: 2, label: 'Suppress', detail: 'Fire, and hit or miss the target is suppressed: −2 to everything until your next activation.', shoot: { suppress: true, pin: false } },
    { id: 'pin', verb: 'pins', type: 'shoot', index: 3, label: 'Pin', detail: 'Suppress, and the target is pinned: you count as one of its holders, at Volley + 10, until your next activation.', shoot: { suppress: true, pin: true } },
  ],
  fight: [
    { id: 'strike', verb: 'strikes', type: 'fight', index: 1, label: 'Strike', detail: 'One roll against their Defence. A miss can cost you heart.', fight: { press: false, drive: false } },
    { id: 'press', verb: 'presses', type: 'fight', index: 2, label: 'Press', detail: 'On a hit, they roll Fortitude twice and keep the worse; failure costs them 1 Morale.', fight: { press: true, drive: false } },
    { id: 'overrun', verb: 'overruns', type: 'fight', index: 3, label: 'Overrun', detail: 'Press, and a hit drives them back a hex. You take their ground. A blocked retreat causes no extra Morale loss.', fight: { press: true, drive: true } },
  ],
  guard: [
    { id: 'brace', verb: 'braces', type: 'guard', index: 1, label: 'Brace', detail: '+2 Defence until you next act.', guard: { defence: 2, cap: false, holds: false, rooted: false } },
    { id: 'dig-in', verb: 'digs in', type: 'guard', index: 2, label: 'Dig in', detail: 'Brace, and every hit against you lands as an ordinary hit, a critical capped at 1 damage.', guard: { defence: 2, cap: true, holds: false, rooted: false } },
    { id: 'take-cover', verb: 'takes cover', type: 'guard', index: 3, label: 'Take cover', detail: 'Dig in, and +4 Defence in place of the +2; an Overrun cannot drive you back. You may not move again this activation.', guard: { defence: 4, cap: true, holds: true, rooted: true } },
  ],
  rally: [
    { id: 'steady', verb: 'steadies', type: 'rally', index: 1, label: 'Steady', detail: 'Roll. A success restores 1 Morale, or inspires you if your Morale is full.', rally: { scope: 'self' } },
    { id: 'rally', verb: 'rallies', type: 'rally', index: 2, label: 'Rally', detail: 'Steady, and the same result for one adjacent ally you name: it clears 1, or is inspired if it has none.', rally: { scope: 'adjacent' } },
    { id: 'inspire', verb: 'inspires', type: 'rally', index: 3, label: 'Inspire', detail: 'Rally, and the same result for every friendly unit within 2.', rally: { scope: 'nearby' } },
  ],
};

export const activityOf = (type: Exclude<Verb, 'cast'>, index: ActivityIndex): Activity => VERBS[type][index - 1];

// A tactic grants one tree's one-action activity to a troop with no magic of its own (section
// 11): battlefield medicine reaches Soothe, demoralize reaches Dread, both capped at index 1
// since a non-caster has no tradition to raise the cap (`castCostFor` in battle.ts). Each rolls
// off the troop's own Will or level DC there, not a spell number it doesn't have. Defend allies
// grants no tree — its Guard share is `auraOn`'s, not a cast.
export const TACTIC_TREE: Partial<Record<Tactic, Tree>> = {
  'battlefield-medicine': 'healing',
  'demoralize': 'controlling',
};

/** Every tree this card can cast at all: a caster's whole tradition, or the one tree a
 * non-caster's tactic grants. */
export function treesFor(card: UnitCard): Tree[] {
  const { tactics, caster, tradition } = cardTraits(card);
  if (caster) return treesForTradition(tradition, card.level);
  const out = new Set<Tree>();
  for (const t of tactics) { const tree = TACTIC_TREE[t]; if (tree) out.add(tree); }
  return [...out];
}

/** Commitment improves the activity's own roll or Controlling DC, never its scope. */
export function canFocus(type: Verb | 'charge', spell?: Tree | null): boolean {
  return type === 'charge' || type === 'fight' || type === 'shoot' || type === 'rally'
    || (type === 'cast' && (spell === 'blast' || spell === 'healing' || spell === 'controlling'));
}

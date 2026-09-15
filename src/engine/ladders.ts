import { cardTraits, deriveStats, type Tactic, type UnitCard } from './cards.js';
import { treesForTradition, type Tree } from './magic.js';
import { saveBonus, type Tier } from './tables.js';

// Two verbs have no table of their own. A Move action spends the troop's Speed in feet, and
// Maneuver rolls the escaping unit's Reflex against whoever is holding it — see `doManeuver`
// in `battle.ts`. Cast keeps its slot in `Verb` (the offer menu still groups by it) and
// its own six trees live in `magic.ts`.
export type Verb = 'shoot' | 'fight' | 'guard' | 'rally' | 'cast';
export const VERB_TYPES: Verb[] = ['shoot', 'fight', 'guard', 'rally', 'cast'];

/** Which of a verb's three activities: the index is also the price in actions. */
export type ActivityIndex = 1 | 2 | 3;

export type ActivityId =
  | 'fire' | 'suppress' | 'pin'
  | 'strike' | 'press' | 'overrun'
  | 'brace' | 'dig-in' | 'take-cover'
  | 'steady' | 'rally' | 'inspire';

/** Each activity includes everything below it. `press`: a hit's disorder needs no save. `drive`: a
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
/** The activity carries scope, never amount — how much clears comes off the Quality check's
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
  // A troop's effective range (its Reach) is `shootHome`, what Fire reaches for free; every
  // band beyond it costs −2 on the roll (`shootModifier`), the same whichever of the three a
  // unit buys. Suppress and Pin reach exactly as far as Fire does — they add an effect on the
  // hit, not more range. See `shootHome` and its callers in battle.ts.
  shoot: [
    { id: 'fire', verb: 'fires', type: 'shoot', index: 1, label: 'Fire', detail: 'A volley at any target you can see, −2 for every band beyond your effective range.', shoot: { suppress: false, pin: false } },
    { id: 'suppress', verb: 'suppresses', type: 'shoot', index: 2, label: 'Suppress', detail: 'Fire, and hit or miss the target is suppressed: −2 to everything until your next activation.', shoot: { suppress: true, pin: false } },
    { id: 'pin', verb: 'pins', type: 'shoot', index: 3, label: 'Pin', detail: 'Suppress, and the target is pinned: you count as one of its holders, at Volley + 10, until your next activation.', shoot: { suppress: true, pin: true } },
  ],
  fight: [
    { id: 'strike', verb: 'strikes', type: 'fight', index: 1, label: 'Strike', detail: 'One roll against their Defence. A miss can cost you heart.', fight: { press: false, drive: false } },
    { id: 'press', verb: 'presses', type: 'fight', index: 2, label: 'Press', detail: 'A hit disorders them with no save.', fight: { press: true, drive: false } },
    { id: 'overrun', verb: 'overruns', type: 'fight', index: 3, label: 'Overrun', detail: 'Press, and a hit drives them back a hex. You take their ground.', fight: { press: true, drive: true } },
  ],
  guard: [
    { id: 'brace', verb: 'braces', type: 'guard', index: 1, label: 'Brace', detail: '+2 Defence until you next act.', guard: { defence: 2, cap: false, holds: false, rooted: false } },
    { id: 'dig-in', verb: 'digs in', type: 'guard', index: 2, label: 'Dig in', detail: 'Brace, and every hit against you lands as an ordinary hit, a critical capped at one wound.', guard: { defence: 2, cap: true, holds: false, rooted: false } },
    { id: 'take-cover', verb: 'takes cover', type: 'guard', index: 3, label: 'Take cover', detail: 'Dig in, and +4 Defence in place of the +2; an Overrun cannot drive you back. You may not move again this activation.', guard: { defence: 4, cap: true, holds: true, rooted: true } },
  ],
  rally: [
    { id: 'steady', verb: 'steadies', type: 'rally', index: 1, label: 'Steady', detail: 'Roll. A success clears 1 of your own disorder, or inspires you if you have none.', rally: { scope: 'self' } },
    { id: 'rally', verb: 'rallies', type: 'rally', index: 2, label: 'Rally', detail: 'Steady, and the same result for one adjacent ally you name: it clears 1, or is inspired if it has none.', rally: { scope: 'adjacent' } },
    { id: 'inspire', verb: 'inspires', type: 'rally', index: 3, label: 'Inspire', detail: 'Rally, and the same result for every friendly unit within 2.', rally: { scope: 'nearby' } },
  ],
};

export const activityOf = (type: Exclude<Verb, 'cast'>, index: ActivityIndex): Activity => VERBS[type][index - 1];

// Quality comes off the statblock, never from a curated list: of everything an importer can
// read, the Will save is the one that spreads (5.1 points within a level, against AC's 3.2).
const TIERS: Tier[] = ['low', 'moderate', 'high', 'extreme'];

/** The disorder a unit absorbs before it is shaken, by Will band: 2 below low, 6 at extreme. */
const QUALITY = [2, 3, 4, 5, 6];

export function qualityFor(card: UnitCard): number {
  const will = deriveStats(card).will;
  let quality = QUALITY[0];
  TIERS.forEach((t, i) => { if (will >= saveBonus(card.level, t)) quality = QUALITY[i + 1]; });
  return quality;
}

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
  if (caster) return treesForTradition(tradition);
  const out = new Set<Tree>();
  for (const t of tactics) { const tree = TACTIC_TREE[t]; if (tree) out.add(tree); }
  return [...out];
}

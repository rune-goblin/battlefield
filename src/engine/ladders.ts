import { cardTraits, deriveStats, type Signal, type Tactic, type UnitCard, type UnitStats } from './cards.js';
import { treesForTradition, type Tree } from './magic.js';
import { saveBonus, type Tier } from './tables.js';

// Two types have no ladder. A Move action spends the troop's Speed in feet, and taking it
// twice or three times is what March and Charge used to name. A Withdraw rolls the escaping
// unit's Reflex against whoever is holding it, and the four degrees say what Scatter, Break
// off and Fighting retreat used to name — see `doWithdraw` in `battle.ts`. Cast keeps its slot
// in `LadderType` (the offer menu still groups by it) but carries no grade of its own: Tier 1
// of every tree a caster's tradition grants is free, and its own push pool decides how far a
// push reaches — see `magic.ts` and `doCast` in `battle.ts`.
export type LadderType = 'shoot' | 'fight' | 'guard' | 'rally' | 'cast';
export const LADDER_TYPES: LadderType[] = ['shoot', 'fight', 'guard', 'rally', 'cast'];

/**
 * How a ladder gets above its grade. The four ladders do not mean the same thing by "one rung
 * up", so they do not pay for it the same way.
 *
 * `roll` — the rung is a rider on an act that is happening anyway, so climbing is a free
 * gamble and the risk is the price (Fight's Press and Overrun; every Cast push).
 * `action` — the rung is its own outcome, bought outright with a further action and no roll.
 * Aim means taking time, and Rally's scope is too strong to hand over on a coin flip.
 * `none` — a posture the grade gates outright. Guard's currency is the Defence it sets, and
 * spare actions belong there rather than on a climb.
 */
export type ClimbMode = 'roll' | 'action' | 'none';
export const CLIMB: Record<LadderType, ClimbMode> = {
  fight: 'roll', cast: 'roll', shoot: 'action', rally: 'action', guard: 'none',
};

/** What the climb costs on an `action` ladder, over and above the act's own one. */
export const CLIMB_COST = 1;

export type Grade = 1 | 2 | 3;
export type Grades = Record<Exclude<LadderType, 'cast'>, Grade>;

export type RungId =
  | 'fire' | 'aim' | 'snipe'
  | 'strike' | 'press' | 'overrun'
  | 'brace' | 'dig-in' | 'shieldwall'
  | 'steady' | 'rally' | 'inspire';

export interface FightEffect { disorderOnLoss: number; takeGround: boolean }
/** A Guard's Defence comes from the actions committed to it, never from the rung. The rung
 * carries the effect: `blunt` caps a hit at one wound, so a critical lands as an ordinary one,
 * and `braces` gives adjacent allies what one action of Guard buys. */
export interface GuardEffect { blunt: boolean; braces: boolean; rooted: boolean }
/** The rung carries scope, never amount — how much clears comes off the Quality check's
 * degree instead (see `doRung`'s 'rally' case in `battle.ts`), which is what keeps the roll
 * dial live at every rung rather than only at Steady.
 *
 * `heart` is the second scope: who takes heart from the order, which is what gives Rally a use
 * on a unit with no disorder to clear. It reaches one rung further out than `scope` at the
 * bottom of the ladder on purpose — a levy's Steady is a poor self-rally but a real gift to the
 * troop beside it, which is the whole role a weak unit is meant to have in a fight. */
export type RallyScope = 'self' | 'adjacent' | 'nearby';
export interface RallyEffect { scope: RallyScope; heart: RallyScope }

export interface Rung {
  id: RungId;
  type: LadderType;
  index: Grade;
  label: string;
  verb: string;
  detail: string;
  /** Added to the level DC when a unit reaches for this rung. Rung 1 is never reached for. */
  reachDc: number;
  fight?: FightEffect;
  guard?: GuardEffect;
  rally?: RallyEffect;
}

export const LADDERS: Record<Exclude<LadderType, 'cast'>, [Rung, Rung, Rung]> = {
  // A troop's effective range (its Reach) is the band Fire reaches for free. Aim and Snipe do
  // not climb toward a fixed far band — they buy one, then two bands of swing away from that
  // effective range, in whichever direction the target actually is. See `shootHome` and its
  // callers in battle.ts.
  shoot: [
    { id: 'fire', verb: 'fires', type: 'shoot', index: 1, label: 'Fire', detail: 'Your effective range.', reachDc: 0 },
    { id: 'aim', verb: 'aims', type: 'shoot', index: 2, label: 'Aim', detail: 'One band off your effective range, either direction.', reachDc: 0 },
    { id: 'snipe', verb: 'snipes', type: 'shoot', index: 3, label: 'Snipe', detail: 'Two bands off your effective range, either direction.', reachDc: 2 },
  ],
  fight: [
    { id: 'strike', verb: 'strikes', type: 'fight', index: 1, label: 'Strike', detail: 'A plain melee exchange.', reachDc: 0, fight: { disorderOnLoss: 0, takeGround: false } },
    { id: 'press', verb: 'presses into', type: 'fight', index: 2, label: 'Press', detail: 'The loser of the exchange takes 1 more disorder.', reachDc: 0, fight: { disorderOnLoss: 1, takeGround: false } },
    { id: 'overrun', verb: 'overruns', type: 'fight', index: 3, label: 'Overrun', detail: 'Take their ground if they break.', reachDc: 2, fight: { disorderOnLoss: 0, takeGround: true } },
  ],
  guard: [
    { id: 'brace', verb: 'braces', type: 'guard', index: 1, label: 'Brace', detail: '+2 Defence, like raising shields.', reachDc: 0, guard: { blunt: false, braces: false, rooted: false } },
    { id: 'dig-in', verb: 'digs in', type: 'guard', index: 2, label: 'Dig in', detail: '+2 Defence, and critical hits against you land as ordinary ones. Rooted for the rest of the activation.', reachDc: 0, guard: { blunt: true, braces: false, rooted: true } },
    { id: 'shieldwall', verb: 'forms a shieldwall', type: 'guard', index: 3, label: 'Shieldwall', detail: '+2 Defence, and adjacent allies count as braced.', reachDc: 2, guard: { blunt: false, braces: true, rooted: false } },
  ],
  rally: [
    { id: 'steady', verb: 'steadies', type: 'rally', index: 1, label: 'Steady', detail: 'This unit, and one adjacent ally takes heart.', reachDc: 0, rally: { scope: 'self', heart: 'adjacent' } },
    { id: 'rally', verb: 'rallies', type: 'rally', index: 2, label: 'Rally', detail: 'This unit, and one adjacent ally clears 1 and takes heart.', reachDc: 0, rally: { scope: 'adjacent', heart: 'adjacent' } },
    { id: 'inspire', verb: 'inspires', type: 'rally', index: 3, label: 'Inspire', detail: 'This unit, and every friendly unit within 2 clears 1 and takes heart.', reachDc: 2, rally: { scope: 'nearby', heart: 'nearby' } },
  ],
};

export const rungOf = (type: Exclude<LadderType, 'cast'>, index: Grade): Rung => LADDERS[type][index - 1];

/** Which types have a roll of their own for a committed action to weight. Guard has none: a
 * committed action there feeds the push check or Defence instead. Cast always does — every
 * push is a roll — so it reads `true` here too, even though it shares no other machinery with
 * `rungOf`'s four ladders. */
export const OWN_ROLL: Record<LadderType, boolean> = {
  shoot: true, fight: true, guard: false, rally: true, cast: true,
};

// Grades come from the statblock, never from a curated list. Two measurements over all 162
// published troops decide which numbers may be trusted: AC spreads 3.2 points within a level
// and attack DC 2.6 (at level 12 every troop shares one attack DC), so both are f(level) and
// carry no grade information. Will spreads 5.1 and Speed spreads across seven bands, so those
// two are read numerically; the rest come from the recurring action names an importer can see
// on any troop ever published. Tactics, where a card carries them, only raise a grade.
const TIERS: Tier[] = ['low', 'moderate', 'high', 'extreme'];
type Band = 'below' | Tier;

export function tierOf(value: number, level: number, table: (l: number, t: Tier) => number): Band {
  let band: Band = 'below';
  for (const t of TIERS) if (value >= table(level, t)) band = t;
  return band;
}

const RANK: Record<Band, number> = { below: -1, low: 0, moderate: 1, high: 2, extreme: 3 };
const atLeast = (band: Band, t: Tier) => RANK[band] >= RANK[t];

export const willBand = (stats: UnitStats, level: number): Band => tierOf(stats.will, level, saveBonus);

/** How much disorder a unit absorbs before it routs. Discipline is its Will band. */
const QUALITY: Record<Band, number> = { below: 2, low: 3, moderate: 4, high: 5, extreme: 6 };

export function qualityFor(card: UnitCard): number {
  return QUALITY[willBand(deriveStats(card), card.level)];
}

const raise = (g: Grade, to: Grade): Grade => (to > g ? to : g);
const cap = (n: number): Grade => Math.max(1, Math.min(3, n)) as Grade;

// A tactic is a hand-authored hint that a statblock's numbers do not carry. Every grade below
// is already decided without one.
const TACTIC_GRADE: Partial<Record<Tactic, [Exclude<LadderType, 'cast'>, Grade]>> = {
  'covering-fire': ['shoot', 3],
  'reactive-attack': ['fight', 3],
  'dirty-fighting': ['fight', 3],
  'feint': ['fight', 3],
  'raise-shields': ['guard', 3],
  'shield-block': ['guard', 3],
  'defend-allies': ['rally', 3],
  'battlefield-medicine': ['rally', 3],
};

export function gradesFor(card: UnitCard): Grades {
  const stats = deriveStats(card);
  const { fear, tactics, signals } = cardTraits(card);
  const l = card.level;
  const has = (s: Signal) => signals.includes(s);
  const willB = willBand(stats, l);

  const grades: Grades = {
    // Reach only picks the effective range Fire is free at; every troop starts able to swing
    // one band off it before it needs a push check, same as an untrained shot at anything else.
    shoot: 1,
    fight: stats.strike === null ? 1 : has('melee-drill') || fear ? 3 : 2,
    guard: cap(1 + (has('formation') ? 1 : 0) + (has('shielded') || has('magic-ward') ? 1 : 0)),
    rally: atLeast(willB, 'high') ? 3 : atLeast(willB, 'moderate') ? 2 : 1,
  };

  for (const t of tactics) {
    const bump = TACTIC_GRADE[t];
    if (bump) grades[bump[0]] = raise(grades[bump[0]], bump[1]);
  }
  return grades;
}

// A tactic grants its tree's Tier 1 as a fixed, untiered effect to a troop with no magic of
// its own (section 11) — it never unlocks a push, so which tradition would have gated it is
// moot. See `resolveTree` in battle.ts for the fixed tier each one grants.
export const TACTIC_TREE: Partial<Record<Tactic, Tree>> = {
  'battlefield-medicine': 'healing',
  'defend-allies': 'defense',
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

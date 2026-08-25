import { cardTraits, deriveStats, speedOf, type Reach, type Signal, type Tactic, type UnitCard, type UnitStats } from './cards.js';
import { saveBonus, type Tier } from './tables.js';

// Movement has no ladder: a Move action spends the troop's Speed in feet, and taking it twice
// or three times is what March and Charge used to name.
export type LadderType = 'shoot' | 'fight' | 'guard' | 'withdraw' | 'rally' | 'cast';
export const LADDER_TYPES: LadderType[] = ['shoot', 'fight', 'guard', 'withdraw', 'rally', 'cast'];

export type Grade = 1 | 2 | 3;
export type Grades = Record<LadderType, Grade>;

export type RungId =
  | 'loose' | 'volley' | 'barrage'
  | 'strike' | 'press' | 'overrun'
  | 'brace' | 'dig-in' | 'shieldwall'
  | 'scatter' | 'break-off' | 'fighting-retreat'
  | 'steady' | 'rally' | 'inspire'
  | 'minor' | 'major' | 'grand';

export interface ShootEffect { band: 1 | 2 | 3; ignoresCover: boolean }
export interface FightEffect { bonus: number; disorderOnMiss: number; takeGround: boolean }
export interface GuardEffect { defence: number; rooted: boolean; aura: number }
export interface WithdrawEffect { freeStrikes: 'all' | 'one' | 'none'; disorder: number }
export interface RallyEffect { clear: number; ally: boolean }
export interface CastEffect { scope: number }

export interface Rung {
  id: RungId;
  type: LadderType;
  index: Grade;
  label: string;
  verb: string;
  detail: string;
  /** Added to the level DC when a unit reaches for this rung. Rung 1 is never reached for. */
  reachDc: number;
  shoot?: ShootEffect;
  fight?: FightEffect;
  guard?: GuardEffect;
  withdraw?: WithdrawEffect;
  rally?: RallyEffect;
  cast?: CastEffect;
}

const CLEAR_ALL = 99;

export const LADDERS: Record<LadderType, [Rung, Rung, Rung]> = {
  shoot: [
    { id: 'loose', verb: 'looses', type: 'shoot', index: 1, label: 'Loose', detail: 'Close band.', reachDc: 0, shoot: { band: 1, ignoresCover: false } },
    { id: 'volley', verb: 'volleys', type: 'shoot', index: 2, label: 'Volley', detail: 'Long band.', reachDc: 0, shoot: { band: 2, ignoresCover: false } },
    { id: 'barrage', verb: 'barrages', type: 'shoot', index: 3, label: 'Barrage', detail: 'Your full band, ignoring cover.', reachDc: 2, shoot: { band: 3, ignoresCover: true } },
  ],
  fight: [
    { id: 'strike', verb: 'strikes', type: 'fight', index: 1, label: 'Strike', detail: 'A melee exchange.', reachDc: 0, fight: { bonus: 0, disorderOnMiss: 0, takeGround: false } },
    { id: 'press', verb: 'presses into', type: 'fight', index: 2, label: 'Press', detail: '+2, and 1 disorder if you miss.', reachDc: 0, fight: { bonus: 2, disorderOnMiss: 1, takeGround: false } },
    { id: 'overrun', verb: 'overruns', type: 'fight', index: 3, label: 'Overrun', detail: '+2, and take their ground if they break.', reachDc: 2, fight: { bonus: 2, disorderOnMiss: 0, takeGround: true } },
  ],
  guard: [
    { id: 'brace', verb: 'braces', type: 'guard', index: 1, label: 'Brace', detail: '+2 Defence.', reachDc: 0, guard: { defence: 2, rooted: false, aura: 0 } },
    { id: 'dig-in', verb: 'digs in', type: 'guard', index: 2, label: 'Dig in', detail: '+3 Defence, rooted next activation.', reachDc: 0, guard: { defence: 3, rooted: true, aura: 0 } },
    { id: 'shieldwall', verb: 'forms a shieldwall', type: 'guard', index: 3, label: 'Shieldwall', detail: '+3 Defence, and +1 to adjacent allies.', reachDc: 2, guard: { defence: 3, rooted: false, aura: 1 } },
  ],
  withdraw: [
    { id: 'scatter', verb: 'scatters', type: 'withdraw', index: 1, label: 'Scatter', detail: 'Every enemy in contact strikes free, and you gain 1 disorder.', reachDc: 0, withdraw: { freeStrikes: 'all', disorder: 1 } },
    { id: 'break-off', verb: 'breaks off', type: 'withdraw', index: 2, label: 'Break off', detail: 'One enemy in contact strikes free.', reachDc: 0, withdraw: { freeStrikes: 'one', disorder: 0 } },
    { id: 'fighting-retreat', verb: 'retreats in good order', type: 'withdraw', index: 3, label: 'Fighting retreat', detail: 'You leave in good order.', reachDc: 2, withdraw: { freeStrikes: 'none', disorder: 0 } },
  ],
  rally: [
    { id: 'steady', verb: 'steadies', type: 'rally', index: 1, label: 'Steady', detail: 'Clear 1 disorder.', reachDc: 0, rally: { clear: 1, ally: false } },
    { id: 'rally', verb: 'rallies', type: 'rally', index: 2, label: 'Rally', detail: 'Clear all disorder.', reachDc: 0, rally: { clear: CLEAR_ALL, ally: false } },
    { id: 'inspire', verb: 'inspires', type: 'rally', index: 3, label: 'Inspire', detail: "Clear all disorder, and an adjacent ally's.", reachDc: 2, rally: { clear: CLEAR_ALL, ally: true } },
  ],
  cast: [
    { id: 'minor', verb: 'casts', type: 'cast', index: 1, label: 'Minor', detail: 'Yourself.', reachDc: 0, cast: { scope: 0 } },
    { id: 'major', verb: 'casts', type: 'cast', index: 2, label: 'Major', detail: 'Yourself or an adjacent unit.', reachDc: 0, cast: { scope: 1 } },
    { id: 'grand', verb: 'casts', type: 'cast', index: 3, label: 'Grand', detail: 'Anywhere in sight.', reachDc: 2, cast: { scope: Infinity } },
  ],
};

export const rungOf = (type: LadderType, index: Grade): Rung => LADDERS[type][index - 1];
export const clearsAll = (n: number) => n >= CLEAR_ALL;

export type SpellId = 'blast' | 'ward' | 'mend' | 'bless' | 'compel';

export interface Spell { id: SpellId; label: string; detail: string; at: 'enemy' | 'ally' }

export const SPELLS: Record<SpellId, Spell> = {
  blast: { id: 'blast', label: 'Blast', detail: 'A magical attack that ignores cover.', at: 'enemy' },
  ward: { id: 'ward', label: 'Ward', detail: '+2 Defence until the target acts.', at: 'ally' },
  mend: { id: 'mend', label: 'Mend', detail: 'Remove one wound.', at: 'ally' },
  bless: { id: 'bless', label: 'Bless', detail: "The target's next action climbs one rung free.", at: 'ally' },
  compel: { id: 'compel', label: 'Compel', detail: 'The target may not reach above its grade on its next activation.', at: 'enemy' },
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
export const perceptionBand = (stats: UnitStats, level: number): Band => tierOf(stats.perception, level, saveBonus);

/** How much disorder a unit absorbs before it routs. Discipline is its Will band. */
const QUALITY: Record<Band, number> = { below: 2, low: 3, moderate: 4, high: 5, extreme: 6 };

export function qualityFor(card: UnitCard): number {
  return QUALITY[willBand(deriveStats(card), card.level)];
}

/** Speed bands: 99 of 162 troops walk 25 ft, so the tails are where the grade lives. */
export function speedGrade(speed: number): Grade {
  return speed >= 40 ? 3 : speed >= 25 ? 2 : 1;
}

const REACH_GRADE: Record<Reach, Grade> = { close: 1, long: 2, extreme: 3 };

const raise = (g: Grade, to: Grade): Grade => (to > g ? to : g);
const cap = (n: number): Grade => Math.max(1, Math.min(3, n)) as Grade;

// A tactic is a hand-authored hint that a statblock's numbers do not carry. Every grade below
// is already decided without one.
const TACTIC_GRADE: Partial<Record<Tactic, [LadderType, Grade]>> = {
  'ambush': ['withdraw', 3],
  'false-retreat': ['withdraw', 3],
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
  const { fear, tactics, caster, signals } = cardTraits(card);
  const l = card.level;
  const has = (s: Signal) => signals.includes(s);
  const speed = speedOf(card);
  const pace = speedGrade(speed);
  const willB = willBand(stats, l);
  const alert = atLeast(perceptionBand(stats, l), 'high');

  const grades: Grades = {
    shoot: stats.reach === null ? 1 : REACH_GRADE[stats.reach],
    fight: stats.strike === null ? 1 : has('melee-drill') || fear ? 3 : 2,
    guard: cap(1 + (has('formation') ? 1 : 0) + (has('shielded') || has('magic-ward') ? 1 : 0)),
    withdraw: has('no-retreat') || speed === 0 ? 1 : cap(pace + (alert ? 1 : 0)),
    rally: atLeast(willB, 'high') ? 3 : atLeast(willB, 'moderate') ? 2 : 1,
    cast: caster ? (l >= 15 ? 3 : l >= 8 ? 2 : 1) : 1,
  };

  for (const t of tactics) {
    const bump = TACTIC_GRADE[t];
    if (bump) grades[bump[0]] = raise(grades[bump[0]], bump[1]);
  }
  return grades;
}

// proto: troop statblocks name a spellcasting entry but not what it casts, so a caster knows
// the whole menu and its Cast grade decides how far the spell carries. Three of the tactics are
// the same trick by another name, and grant their one spell to a troop with no magic at all.
const TACTIC_SPELL: Partial<Record<Tactic, SpellId>> = {
  'battlefield-medicine': 'mend',
  'defend-allies': 'ward',
  'demoralize': 'compel',
};

export function spellsFor(card: UnitCard): SpellId[] {
  const { tactics, caster } = cardTraits(card);
  if (caster) return Object.keys(SPELLS) as SpellId[];
  const out = new Set<SpellId>();
  for (const t of tactics) { const s = TACTIC_SPELL[t]; if (s) out.add(s); }
  return [...out];
}

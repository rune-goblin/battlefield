import { CELL_FEET } from './path.js';
import { armourClass, areaDc, perceptionBonus, saveBonus, type Tier } from './tables.js';

export type Role = 'infantry' | 'cavalry';

// Which of the four traditions a caster's magic belongs to (rules.html section 11). A
// tradition gates which trees a caster may reach at all, and how far.
export type Tradition = 'arcane' | 'divine' | 'occult' | 'primal';

// A troop's own Salvo attack never derives 'extreme' — that band belongs to siege engines.
export type Reach = 'short' | 'medium' | 'long' | 'extreme';

// Structural signals an importer reads straight off a statblock: recurring action names that
// differentiate troops where the level tables do not. The vocabulary is closed and the importer
// still writes all six, but the engine reads only `no-retreat` (section 2): every activity
// costs the same for every unit, so nothing else has anything left to change.
export type Signal = 'mounted' | 'melee-drill' | 'shielded' | 'formation' | 'magic-ward' | 'no-retreat';

// Five of these change anything the engine plays: cavalry-charge is a charge's impact
// (`melee`'s `impact` option, battle.ts), defend-allies shares a Guard's +2 with a neighbour
// (`auraOn`), battlefield-medicine and demoralize each grant a fixed Cast activity
// (`TACTIC_TREE`, ladders.ts), and ambush buys an extra deploy rank (`deployRanks`). Every
// other tactic here is inert.
export type Tactic =
  | 'cavalry-charge' | 'reactive-attack' | 'raise-shields' | 'shield-block' | 'defend-allies'
  | 'feint' | 'dirty-fighting' | 'demoralize' | 'covering-fire' | 'battlefield-medicine' | 'ambush';

export interface UnitStats {
  strike: number | null;
  volley: number | null;
  reach: Reach | null;
  defence: number;
  will: number;
  reflex: number;
  fortitude: number;
  perception: number;
  /** What a caster rolls to push a cast and attack with Blast. `null` for a non-caster. */
  spellAttack: number | null;
  /** What a target resists Controlling against. `null` for a non-caster. */
  spellDc: number | null;
}

export interface TroopSheet {
  ac: number;
  hp: number;
  battleDc: number;
  salvoDc: number | null;
  salvoFeet: number | null;
  fortitude: number;
  reflex: number;
  will: number;
  perception: number;
  speed: number;
  fly: boolean;
  // proto: no importer reads a spellcasting entry yet — these stay unset on every real troop, and
  // `deriveStats` falls back to the level tables. A hand-authored `overrides` can supply real
  // numbers meanwhile, the same way official.ts already overrides strike/volley/will today.
  spellAttack?: number;
  spellDc?: number;
}

export interface UnitCard {
  name: string;
  sheet?: TroopSheet;
  level: number;
  role: Role;
  salvo?: Reach | null;
  pace?: boolean;
  fear?: boolean;
  caster?: boolean;
  tradition?: Tradition;
  signals?: Signal[];
  tactics?: Tactic[];
  wounds?: number;
  /** Campaign Demoralized and tactical morale loss share this value. Imported stats
   * must exclude its penalty; Battlefield subtracts it once when resolving checks. */
  disorder?: number;
  overrides?: Partial<UnitStats>;
}

interface RoleProfile { defence: Tier; strike: Tier; volley: Tier; will: Tier; reflex: Tier; fortitude: Tier; spell: Tier; perception: Tier; pace: boolean; tactics: Tactic[]; }

// Fortitude has no published spread across the 162 troops the way Reflex does (section 2 of
// the rules) — both roles fall back to moderate until a wound-save tree gives it more to say.
// Spell attack/DC have no role-based spread published either — casting isn't a role, it's a
// signal a card either carries or doesn't — so both roles fall back to the same moderate tier.
export const ROLE_PROFILES: Record<Role, RoleProfile> = {
  infantry: { defence: 'high', strike: 'moderate', volley: 'moderate', will: 'high', reflex: 'moderate', fortitude: 'moderate', spell: 'moderate', perception: 'moderate', pace: false, tactics: ['raise-shields'] },
  cavalry: { defence: 'high', strike: 'high', volley: 'moderate', will: 'moderate', reflex: 'high', fortitude: 'moderate', spell: 'moderate', perception: 'high', pace: true, tactics: ['cavalry-charge'] },
};

export function deriveStats(card: UnitCard): UnitStats {
  const p = ROLE_PROFILES[card.role];
  const l = card.level;
  const salvo = card.salvo ?? null;
  const caster = card.caster ?? false;
  const base: UnitStats = {
    strike: areaDc(l, p.strike) - 10,
    volley: salvo ? areaDc(l, p.volley) - 10 : null,
    reach: salvo,
    defence: armourClass(l, p.defence),
    will: saveBonus(l, p.will),
    reflex: card.sheet?.reflex ?? saveBonus(l, p.reflex),
    fortitude: card.sheet?.fortitude ?? saveBonus(l, p.fortitude),
    spellAttack: caster ? (card.sheet?.spellAttack ?? areaDc(l, p.spell) - 10) : null,
    spellDc: caster ? (card.sheet?.spellDc ?? areaDc(l, p.spell)) : null,
    perception: perceptionBonus(l, p.perception),
  };
  return { ...base, ...card.overrides };
}

export function cardTraits(card: UnitCard) {
  const p = ROLE_PROFILES[card.role];
  return {
    pace: card.pace ?? p.pace,
    fear: card.fear ?? false,
    caster: card.caster ?? false,
    // proto: imports retain explicit spellcasting traditions; legacy or custom cards
    // without one retain their arcane default.
    tradition: card.tradition ?? 'arcane',
    signals: card.signals ?? [],
    tactics: card.tactics ?? p.tactics,
  };
}

/** Feet of Speed a square of the board asks for. A troop is not one creature: thirty feet of
 * the actor's Speed carries the formation one square. */
const SPEED_PER_SQUARE = 30;

/**
 * Squares one Move action buys, off the sheet's Speed: 30 ft and under walks one, 60 ft two,
 * 90 ft three. Flight buys no distance at all — it only changes what the ground costs, which
 * `Unit.flying` already handles. A card with no sheet falls back to its type: cavalry two,
 * infantry one.
 */
export function squaresPerAction(card: UnitCard): number {
  const sheet = card.sheet;
  if (!sheet) return cardTraits(card).pace ? 2 : 1;
  return Math.max(1, Math.ceil(sheet.speed / SPEED_PER_SQUARE));
}

export const paceOf = (card: UnitCard): boolean => squaresPerAction(card) > 1;

/** What one Move action buys, in feet — `CELL_FEET` a square. */
export const speedOf = (card: UnitCard): number => squaresPerAction(card) * CELL_FEET;

export type EngineKind = 'artillery' | 'ram';

export interface SiegeEngineCard {
  /** Feet per movement action; null means portable at the crew's speed, zero means fixed. */
  speed?: number | null;
  loadCost?: number;
  loadSteps?: number;
  name: string;
  level: number;
  kind: EngineKind;
  launch: number;
  reach: Reach | null;
  defence: number;
}

export interface Derivation { stat: keyof UnitStats; value: string; from: string; }

export function derivation(card: UnitCard): Derivation[] {
  const st = deriveStats(card);
  const sh = card.sheet;
  const sign = (n: number | null) => n === null ? '—' : `+${n}`;
  if (!sh) {
    const p = ROLE_PROFILES[card.role];
    return [
      { stat: 'strike', value: sign(st.strike), from: `level ${card.level} ${p.strike} DC − 10` },
      { stat: 'volley', value: st.volley === null ? '—' : `${sign(st.volley)} ${st.reach}`, from: card.salvo ? `level ${card.level} ${p.volley} DC − 10, salvo ${card.salvo}` : 'no salvo' },
      { stat: 'defence', value: String(st.defence), from: `level ${card.level} ${p.defence} AC` },
      { stat: 'will', value: sign(st.will), from: `level ${card.level} ${p.will} save` },
      { stat: 'reflex', value: sign(st.reflex), from: `level ${card.level} ${p.reflex} save` },
      { stat: 'perception', value: sign(st.perception), from: `level ${card.level} ${p.perception} perception` },
    ];
  }
  const band = sh.salvoFeet === null ? null : sh.salvoFeet <= 60 ? 'short' : sh.salvoFeet <= 120 ? 'medium' : 'long';
  return [
    { stat: 'strike', value: sign(st.strike), from: `Battle DC ${sh.battleDc} − 10` },
    { stat: 'volley', value: st.volley === null ? '—' : `${sign(st.volley)} ${st.reach}`, from: sh.salvoDc === null ? 'no Salvo' : `Salvo DC ${sh.salvoDc} − 10; ${sh.salvoFeet} ft → ${band}` },
    { stat: 'defence', value: String(st.defence), from: `AC ${sh.ac}` },
    { stat: 'will', value: sign(st.will), from: `Will save +${sh.will}` },
    { stat: 'reflex', value: sign(st.reflex), from: `Reflex save +${sh.reflex}` },
    { stat: 'perception', value: sign(st.perception), from: `Perception +${sh.perception}` },
  ];
}

const SQUARE_WORDS = ['no', 'one square', 'two squares', 'three squares'];

export function paceReason(card: UnitCard): string {
  const n = squaresPerAction(card);
  const squares = `${SQUARE_WORDS[n] ?? `${n} squares`} an Advance`;
  const flight = card.sheet?.fly ? ', over any ground' : '';
  return card.sheet ? `Speed ${card.sheet.speed} ft → ${squares}${flight}` : `${paceOf(card) ? 'Pace' : 'no Pace'}: ${squares}`;
}

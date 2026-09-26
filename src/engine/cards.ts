import type { TroopAbility, AbilityReview } from './abilities.js';
import { CELL_FEET } from './path.js';
import { armourClass, areaDc, perceptionBonus, saveBonus, type Tier } from './tables.js';

export type Role = 'infantry' | 'cavalry';

// Which of the four traditions a caster's magic belongs to (rules.html section 11). A
// tradition gates which trees a caster may reach at all, and how far.
export type Tradition = 'arcane' | 'divine' | 'occult' | 'primal';

// A troop's own Salvo attack never derives 'extreme' — that band belongs to siege engines.
export type Reach = 'short' | 'medium' | 'long' | 'extreme';

// Legacy structural metadata. New imports execute validated abilities. Old cards that carry
// only the no-retreat signal migrate to Resolve's hold-ground mode.
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
  battleName?: string;
  salvoName?: string;
  fortitude: number;
  reflex: number;
  will: number;
  perception: number;
  speed: number;
  fly: boolean;
  /** Original movement categories and speeds in feet. Omitted on legacy cards. */
  otherSpeeds?: { type: string; value: number }[];
  /** Source spellcasting statistics. Legacy/custom casters without these use level estimates. */
  spellAttack?: number;
  spellDc?: number;
}

export interface UnitCard {
  abilities?: TroopAbility[];
  abilityReview?: AbilityReview[];
  traits?: string[];
  immuneFear?: boolean;
  attackTags?: { melee: string[]; volley: string[]; spell?: string[] };
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
  const tactics: Tactic[] = card.tactics ?? p.tactics;
  return {
    pace: card.pace ?? p.pace,
    caster: card.caster ?? false,
    // proto: imports retain explicit spellcasting traditions; legacy or custom cards
    // without one retain their arcane default.
    tradition: card.tradition ?? 'arcane',
    signals: card.signals ?? [],
    // Every cavalry troop charges with impact, imported ones included, whose own tactic lists
    // come from the kingdom and never name it.
    tactics: card.role === 'cavalry' && !tactics.includes('cavalry-charge') ? [...tactics, 'cavalry-charge' as const] : tactics,
  };
}

/** Feet of Speed a square of the board asks for. A troop is not one creature: fifteen feet of
 * the actor's Speed carries the formation one square. */
const SPEED_PER_SQUARE = 15;

/** Maximum hexes per Move from the source's land, fly and swim speeds.
 * Legacy prototype cards without a sheet retain their Pace fallback. */
export function squaresPerAction(card: UnitCard): number {
  const sheet = card.sheet;
  if (!sheet) return cardTraits(card).pace ? 2 : 1;
  return Math.max(...Object.values(movementRates(card))) / CELL_FEET;
}

export interface MovementRates { land: number; fly: number; swim: number }

/** A troop's Salvo band from its source feet, at Speed's fifteen feet a hex: short reaches 3
 * hexes, medium 6, long 9. Extreme stays with siege engines. */
export const reachForFeet = (feet: number): Reach => (feet <= 50 ? 'short' : feet <= 90 ? 'medium' : 'long');

/** Convert each source mode independently. A zero speed grants no movement. */
export const convertSpeed = (feet: number): number =>
  Number.isFinite(feet) && feet > 0 ? Math.ceil(feet / SPEED_PER_SQUARE) * CELL_FEET : 0;

export function movementRates(card: UnitCard): MovementRates {
  const sheet = card.sheet;
  if (!sheet) return { land: (cardTraits(card).pace ? 2 : 1) * CELL_FEET, fly: 0, swim: 0 };
  const other = (type: string) => Math.max(0, ...(sheet.otherSpeeds ?? []).filter(s => s.type === type).map(s => s.value));
  return { land: convertSpeed(sheet.speed),
    fly: sheet.otherSpeeds === undefined && sheet.fly ? Math.max(CELL_FEET, convertSpeed(sheet.speed)) : convertSpeed(other('fly')),
    swim: convertSpeed(other('swim')) };
}

export function sourceSpeedLabel(sheet: Pick<TroopSheet, 'speed' | 'otherSpeeds'>): string {
  return [{ type: 'land', value: sheet.speed }, ...(sheet.otherSpeeds ?? [])]
    .map(s => `${s.type} ${s.value} ft`).join(' · ');
}

export function movementRateLabel(rates: MovementRates): string {
  return Object.entries(rates).filter(([, rate]) => rate > 0)
    .map(([mode, rate]) => `${mode} ${rate / CELL_FEET} ${rate === CELL_FEET ? 'hex' : 'hexes'}/Move`).join(' · ') || 'Speed 0';
}

/** What one Move action buys, in feet — `CELL_FEET` a square. */
export const speedOf = (card: UnitCard): number => squaresPerAction(card) * CELL_FEET;

export type EngineKind = 'artillery' | 'ram';

export interface SiegeEngineCard {
  /** Original engine Speed in source feet; null means portable at crew Speed. */
  sourceSpeed?: number | null;
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
  const band = sh.salvoFeet === null ? null : reachForFeet(sh.salvoFeet);
  return [
    { stat: 'strike', value: sign(st.strike), from: `Battle DC ${sh.battleDc} − 10` },
    { stat: 'volley', value: st.volley === null ? '—' : `${sign(st.volley)} ${st.reach}`, from: sh.salvoDc === null ? 'no Salvo' : `Salvo DC ${sh.salvoDc} − 10; ${sh.salvoFeet} ft → ${band}` },
    { stat: 'defence', value: String(st.defence), from: `AC ${sh.ac}` },
    { stat: 'will', value: sign(st.will), from: `Will save +${sh.will}` },
    { stat: 'reflex', value: sign(st.reflex), from: `Reflex save +${sh.reflex}` },
    { stat: 'perception', value: sign(st.perception), from: `Perception +${sh.perception}` },
  ];
}

export function paceReason(card: UnitCard): string {
  const rates = movementRateLabel(movementRates(card));
  return card.sheet ? `${sourceSpeedLabel(card.sheet)} → ${rates}` : rates;
}

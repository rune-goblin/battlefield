import { armourClass, areaDc, perceptionBonus, saveBonus, type Tier } from './tables.js';

export type Role = 'infantry' | 'cavalry';

export type Reach = 'close' | 'long' | 'extreme';

// Structural signals an importer reads straight off a statblock: recurring action names that
// differentiate troops where the level tables do not. AC and attack DC are essentially f(level)
// across all 162 published troops, so they carry no grade information; these do.
export type Signal = 'mounted' | 'melee-drill' | 'shielded' | 'formation' | 'magic-ward' | 'no-retreat';

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
  perception: number;
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
  signals?: Signal[];
  tactics?: Tactic[];
  wounds?: number;
  disorder?: number;
  overrides?: Partial<UnitStats>;
}

interface RoleProfile { defence: Tier; strike: Tier; volley: Tier; will: Tier; reflex: Tier; perception: Tier; pace: boolean; tactics: Tactic[]; }

export const ROLE_PROFILES: Record<Role, RoleProfile> = {
  infantry: { defence: 'high', strike: 'moderate', volley: 'moderate', will: 'high', reflex: 'moderate', perception: 'moderate', pace: false, tactics: ['raise-shields'] },
  cavalry: { defence: 'high', strike: 'high', volley: 'moderate', will: 'moderate', reflex: 'high', perception: 'high', pace: true, tactics: ['cavalry-charge'] },
};

export function deriveStats(card: UnitCard): UnitStats {
  const p = ROLE_PROFILES[card.role];
  const l = card.level;
  const salvo = card.salvo ?? null;
  const base: UnitStats = {
    strike: areaDc(l, p.strike) - 10,
    volley: salvo ? areaDc(l, p.volley) - 10 : null,
    reach: salvo,
    defence: armourClass(l, p.defence),
    will: saveBonus(l, p.will),
    reflex: card.sheet?.reflex ?? saveBonus(l, p.reflex),
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
    signals: card.signals ?? [],
    tactics: card.tactics ?? p.tactics,
  };
}

// A flying troop's land Speed says nothing about how far it moves; treat it as pace.
export function speedOf(card: UnitCard): number {
  const sh = card.sheet;
  if (!sh) return cardTraits(card).pace ? 35 : 25;
  return sh.fly ? Math.max(sh.speed, 30) : sh.speed;
}

export type EngineKind = 'artillery' | 'ram';

export interface SiegeEngineCard {
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
  const band = sh.salvoFeet === null ? null : sh.salvoFeet <= 60 ? 'close' : sh.salvoFeet <= 120 ? 'long' : 'extreme';
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
  const sh = card.sheet;
  if (!sh) return cardTraits(card).pace ? 'Pace' : 'no Pace';
  return sh.fly ? `Pace: fly speed` : sh.speed >= 30 ? `Pace: Speed ${sh.speed} ft` : `no Pace: Speed ${sh.speed} ft`;
}

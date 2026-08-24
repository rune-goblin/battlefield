import { armourClass, areaDc, perceptionBonus, saveBonus, type Tier } from './tables.js';

export type Role = 'infantry' | 'cavalry';
export const ROLES: Role[] = ['infantry', 'cavalry'];

export type Reach = 'close' | 'long' | 'extreme';
export const REACHES: Reach[] = ['close', 'long', 'extreme'];

export type Tactic =
  | 'cavalry-charge' | 'reactive-attack' | 'raise-shields' | 'shield-block' | 'defend-allies'
  | 'feint' | 'dirty-fighting' | 'demoralize' | 'covering-fire' | 'false-retreat' | 'battlefield-medicine' | 'ambush';
export const TACTICS: Tactic[] = [
  'cavalry-charge', 'reactive-attack', 'raise-shields', 'shield-block', 'defend-allies',
  'feint', 'dirty-fighting', 'demoralize', 'covering-fire', 'false-retreat', 'battlefield-medicine', 'ambush',
];

export interface UnitStats {
  strike: number | null;
  volley: number | null;
  reach: Reach | null;
  defence: number;
  will: number;
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
  tactics?: Tactic[];
  wounds?: number;
  shaken?: number;
  overrides?: Partial<UnitStats>;
}

interface RoleProfile { defence: Tier; strike: Tier; volley: Tier; will: Tier; perception: Tier; pace: boolean; tactics: Tactic[]; }

export const ROLE_PROFILES: Record<Role, RoleProfile> = {
  infantry: { defence: 'high', strike: 'moderate', volley: 'moderate', will: 'high', perception: 'moderate', pace: false, tactics: ['raise-shields'] },
  cavalry: { defence: 'high', strike: 'high', volley: 'moderate', will: 'moderate', perception: 'high', pace: true, tactics: ['cavalry-charge'] },
};

export const ROLE_BLURBS: Record<Role, string> = {
  infantry: 'Foot troops. Tough and steady; give it a Salvo reach to make archers or skirmishers.',
  cavalry: 'Mounted or fast-moving troops. Hits hard, has Pace, charges across open ground.',
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
    perception: perceptionBonus(l, p.perception),
  };
  return { ...base, ...card.overrides };
}

export function cardTraits(card: UnitCard) {
  const p = ROLE_PROFILES[card.role];
  return {
    pace: card.pace ?? p.pace,
    fear: card.fear ?? false,
    tactics: card.tactics ?? p.tactics,
  };
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
      { stat: 'perception', value: sign(st.perception), from: `level ${card.level} ${p.perception} perception` },
    ];
  }
  const band = sh.salvoFeet === null ? null : sh.salvoFeet <= 60 ? 'close' : sh.salvoFeet <= 120 ? 'long' : 'extreme';
  return [
    { stat: 'strike', value: sign(st.strike), from: `Battle DC ${sh.battleDc} − 10` },
    { stat: 'volley', value: st.volley === null ? '—' : `${sign(st.volley)} ${st.reach}`, from: sh.salvoDc === null ? 'no Salvo' : `Salvo DC ${sh.salvoDc} − 10; ${sh.salvoFeet} ft → ${band}` },
    { stat: 'defence', value: String(st.defence), from: `AC ${sh.ac}` },
    { stat: 'will', value: sign(st.will), from: `Will save +${sh.will}` },
    { stat: 'perception', value: sign(st.perception), from: `Perception +${sh.perception}` },
  ];
}

export function paceReason(card: UnitCard): string {
  const sh = card.sheet;
  if (!sh) return cardTraits(card).pace ? 'Pace' : 'no Pace';
  return sh.fly ? `Pace: fly speed` : sh.speed >= 30 ? `Pace: Speed ${sh.speed} ft` : `no Pace: Speed ${sh.speed} ft`;
}

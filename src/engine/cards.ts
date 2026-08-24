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

export interface UnitCard {
  name: string;
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

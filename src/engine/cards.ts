import { armourClass, areaDc, perceptionBonus, saveBonus, type Tier } from './tables.js';

export type Role = 'infantry' | 'cavalry' | 'skirmisher' | 'archers' | 'monster' | 'siege' | 'levy';
export const ROLES: Role[] = ['infantry', 'cavalry', 'skirmisher', 'archers', 'monster', 'siege', 'levy'];

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
  pace?: boolean;
  fear?: boolean;
  tactics?: Tactic[];
  wounds?: number;
  shaken?: number;
  overrides?: Partial<UnitStats>;
}

interface RoleProfile {
  defence: Tier; strike: Tier | null; volley: Tier | null; reach: Reach | null;
  will: Tier; perception: Tier; pace: boolean; fear: boolean; tactics: Tactic[];
}

export const ROLE_PROFILES: Record<Role, RoleProfile> = {
  infantry: { defence: 'high', strike: 'moderate', volley: null, reach: null, will: 'high', perception: 'moderate', pace: false, fear: false, tactics: ['raise-shields'] },
  cavalry: { defence: 'high', strike: 'high', volley: null, reach: null, will: 'moderate', perception: 'high', pace: true, fear: false, tactics: ['cavalry-charge'] },
  skirmisher: { defence: 'moderate', strike: 'moderate', volley: 'moderate', reach: 'close', will: 'moderate', perception: 'high', pace: true, fear: false, tactics: ['false-retreat'] },
  archers: { defence: 'moderate', strike: 'low', volley: 'high', reach: 'long', will: 'moderate', perception: 'high', pace: false, fear: false, tactics: ['covering-fire'] },
  monster: { defence: 'moderate', strike: 'high', volley: null, reach: null, will: 'low', perception: 'high', pace: true, fear: true, tactics: [] },
  siege: { defence: 'low', strike: null, volley: 'moderate', reach: 'extreme', will: 'low', perception: 'moderate', pace: false, fear: false, tactics: [] },
  levy: { defence: 'low', strike: 'low', volley: null, reach: null, will: 'low', perception: 'low', pace: false, fear: false, tactics: [] },
};

export const ROLE_BLURBS: Record<Role, string> = {
  infantry: 'Holds the line. Tough, steady, slow.',
  cavalry: 'Fast and hard-hitting; charges across open ground.',
  skirmisher: 'Quick troops with slings or javelins; fights at close range and slips away.',
  archers: 'Shoots at long range; weak in melee.',
  monster: 'A beast or giant. Strikes hard, frightens enemies, breaks easily.',
  siege: 'An engine and its crew. Reaches extreme range and can breach walls; cannot strike.',
  levy: 'Peasants with spears. Cheap, and it shows.',
};

export function deriveStats(card: UnitCard): UnitStats {
  const p = ROLE_PROFILES[card.role];
  const l = card.level;
  const base: UnitStats = {
    strike: p.strike ? areaDc(l, p.strike) - 10 : null,
    volley: p.volley ? areaDc(l, p.volley) - 10 : null,
    reach: p.reach,
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
    fear: card.fear ?? p.fear,
    engine: card.role === 'siege',
    tactics: card.tactics ?? p.tactics,
  };
}

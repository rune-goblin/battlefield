export type Tier = 'extreme' | 'high' | 'moderate' | 'low';

const AC: Record<Tier, number[]> = {
  extreme: [19, 19, 21, 22, 24, 25, 27, 28, 30, 31, 33, 34, 36, 37, 39, 40, 42, 43, 45, 46, 48],
  high: [16, 16, 18, 19, 21, 22, 24, 25, 27, 28, 30, 31, 33, 34, 36, 37, 39, 40, 42, 43, 45],
  moderate: [15, 15, 17, 18, 20, 21, 23, 24, 26, 27, 29, 30, 32, 33, 35, 36, 38, 39, 41, 42, 44],
  low: [13, 13, 15, 16, 18, 19, 21, 22, 24, 25, 27, 28, 30, 31, 33, 34, 36, 37, 39, 40, 42],
};

const SAVE: Record<Tier, number[]> = {
  extreme: [10, 11, 12, 14, 15, 17, 18, 20, 21, 23, 24, 26, 27, 29, 30, 32, 33, 35, 36, 38, 39],
  high: [9, 10, 11, 12, 14, 15, 17, 18, 19, 21, 22, 24, 25, 26, 28, 29, 30, 32, 33, 35, 36],
  moderate: [6, 7, 8, 9, 11, 12, 14, 15, 16, 18, 19, 21, 22, 23, 25, 26, 28, 29, 30, 32, 33],
  low: [3, 4, 5, 6, 8, 9, 11, 12, 13, 15, 16, 18, 19, 20, 22, 23, 25, 26, 27, 29, 30],
};

const SPELL_DC: Record<Tier, number[]> = {
  extreme: [19, 20, 22, 23, 25, 26, 27, 29, 30, 32, 33, 34, 36, 37, 39, 40, 41, 43, 44, 46, 47],
  high: [16, 17, 18, 20, 21, 22, 24, 25, 26, 28, 29, 30, 32, 33, 34, 36, 37, 38, 39, 41, 42],
  moderate: [13, 14, 15, 17, 18, 19, 21, 22, 23, 25, 26, 27, 29, 30, 31, 33, 34, 35, 37, 38, 39],
  low: [11, 12, 13, 15, 16, 17, 19, 20, 21, 23, 24, 25, 27, 28, 29, 31, 32, 33, 35, 36, 37],
};

const LEVEL_DC = [14, 15, 16, 18, 19, 20, 22, 23, 24, 26, 27, 28, 30, 31, 32, 34, 35, 36, 38, 39, 40];

export const MAX_LEVEL = 20;
const at = (table: number[], level: number) => table[Math.min(MAX_LEVEL, Math.max(0, level))];

export const armourClass = (level: number, tier: Tier) => at(AC[tier], level);
export const saveBonus = (level: number, tier: Tier) => at(SAVE[tier], level);
export const perceptionBonus = saveBonus;
export const areaDc = (level: number, tier: Tier) => at(SPELL_DC[tier], level);
export const levelDc = (level: number) => at(LEVEL_DC, level);

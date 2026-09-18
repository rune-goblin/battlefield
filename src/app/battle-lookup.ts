import type { BattleState } from '../engine/index.js';

export const unitOf = (battle: BattleState, id: string) => battle.units.find((u) => u.id === id) ?? null;

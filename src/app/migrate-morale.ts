import { ROUTED_AT, type BattleState, type Unit } from '../engine/index.js';

/** Apply the three-pip rule to an existing save while preserving battle progress. */
export function migrateMorale(battle: BattleState): BattleState {
  for (const u of battle.units) {
    delete (u as Unit & { quality?: number }).quality;
    u.disorder = Math.max(0, Math.min(ROUTED_AT, u.disorder));
    if (u.status === 'active' && u.disorder >= ROUTED_AT) {
      for (const engine of u.engines) if (engine.status === 'crewed') engine.status = 'abandoned';
    }
  }
  return battle;
}

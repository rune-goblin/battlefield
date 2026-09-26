export {
  homeRank, unit, isRouted, isStanding, isSurvivor, unitOutcome, unitStatusLabel, activatable, activeUnit, unitAt, isEngaged,
  engagedEnemies, rangeBetween, isOutflanked, garrisoned, GUARD_DEFENCE, rollBonus, roll, attackRoll,
  defenceOf, reachOf, willModifier, spellAttackModifier, spellDcFor, routDcFor, fortitudeModifier,
  escapeModifier,
} from './state.js';
export type { UnitOutcome } from './state.js';
export {
  crewOf, enginesOf, engineSpeed, isFixedEngine, engineLoadCost, engineLoadSteps, engineLoadProgress,
  engineLoaded, engineLoading, siegeEngines,
} from './emplacements.js';
export {
  movementSpeed, haulingSpeed, movementBudget, moveActionsFor, moveReach, movePath, stepTargets, escapeDcFor, holdersOf,
  isFleeEdge, escapeOffer,
} from './movement.js';
export { reduceWounds } from './wounds.js';
export {
  shootHome, canShoot, shootCeiling, shootFloor, shootRangeLabel, highGroundBonus, uphillPenalty,
  strikeModifier, shootModifier,
} from './combat.js';
export type { MeleeOpts } from './combat.js';
export { siegeReason, siegeAttackOffer, gateReason } from './siege.js';
export {
  CHARGE_ACTIVITIES, chargeImpact, chargePath, chargeTargets, meleeFinishes, meleePlans, dragBlockReason, fleePlan,
  fleeBlockReason,
} from './manoeuvres.js';
export type { MeleeFinish } from './manoeuvres.js';
export {
  castCeiling, availableActions, activation, offerRefusal, commitment, targetMatches, offersAt,
} from './targeting.js';
export { canDeploy, canEmplace, createBattle } from './setup.js';
export type { AttachedEngine, Deployment, Emplacement, BattleSetup } from './setup.js';
export { select, deselect, endActivation, act } from './turn.js';

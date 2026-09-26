import { abilityMemory, hasAbility } from '../ability-effects.js';
import { wallsFor } from '../walls.js';
import { at, notation, structuralDamage, fortification } from '../board.js';
import { CELL_FEET } from '../path.js';
import { MAGICAL_CONDITIONS, resetConditions } from '../conditions.js';
import { rollLine, succeeded } from '../check.js';
import type { ActivityIndex } from '../ladders.js';
import type { Rng } from '../rng.js';
import { siegeModes, siegeDetail, type SiegeMode } from '../siege-profiles.js';
import { siegeTargets } from '../siege-targets.js';
import { engineKind } from '../siege-engines.js';
import { levelDc } from '../tables.js';
import {
  ACTION_BONUS, type GateAction, type SiegeAction, type ActionOffer, type BattleState, type EngineState,
  type Unit,
} from '../types.js';
import {
  dist, unit, isStanding, canActNow, engagedEnemies, rollBonus, attackRoll, defenceOf, log, attackOn,
} from './state.js';
import {
  crewOf, refreshEmplacements, engineCard, engineSpeed, engineLoadSteps, engineLoadProgress, engineLoaded,
  siegeEngines,
} from './emplacements.js';
import { movementSpeed, forcedStep } from './movement.js';
import { applyWounds, addDisorder } from './wounds.js';
import { attackGate, wallDc } from './combat.js';

export function siegeReason(state: BattleState, u: Unit, e: EngineState, operation: SiegeAction['operation']): string | null {
  if (!canActNow(state, u)) return 'This unit cannot act now.';
  if (!siegeEngines(state, u).some(x => x.id === e.id)) return 'Stand in the siege engine’s hex to operate it.';
  if (operation === 'release') return e.hauling ? null : 'This unit is not hauling this engine.';
  if (u.actions < 1) return 'No actions remain.';
  if (operation === 'haul') {
    if (engineSpeed(e) === 0) return 'This engine cannot be moved during the battle.';
    if (e.hauling) return 'This unit is already hauling this engine.';
    if (u.engines.some(x => x.hauling)) return 'Release the other siege engine first.';
    if (engagedEnemies(state, u).length || u.pinnedBy || u.rooted) return 'Break contact and movement restrictions before hauling.';
  }
  if (operation === 'load') {
    if (engineLoadSteps(e) === 0) return 'This engine needs no reload.';
    if (engineLoaded(e)) return 'This engine is loaded.';
  }
  // The crew can operate its engine under attack. Contact restricts hauling, not loading or firing.
  if (operation === 'attack') {
    if (e.fired) return 'This engine has already attacked this round.';
    if (u.attacked) return 'This unit has already attacked this activation.';
    if (engineKind(e) === 'artillery' && !engineLoaded(e)) return 'Load this engine before attacking.';
  }
  return null;
}

/** The source actor determines the activities, shapes, and effects. */
export function siegeAttackOffer(state: BattleState, u: Unit, e: EngineState): ActionOffer | null {
  if (siegeReason(state, u, e, 'attack')) return null;
  return { type: engineKind(e) === 'ram' ? 'fight' : 'shoot', spell: null, label: e.name, detail: 'One attack per engine per round. Area attacks affect allies.',
    activities: siegeModes(e.name, engineKind(e)).map((mode, i) => {
      const targets = siegeTargets(state, e, mode);
      const reason = u.actions < mode.cost ? `Needs ${mode.cost} actions.` : !targets.length ? 'No enemy in range.' : null;
      return { activity: `siege-${i + 1}`, index: (i + 1) as ActivityIndex, label: mode.label, detail: siegeDetail(mode), cost: mode.cost,
        legal: !reason, reason, needsTarget: true, targets };
    }) };
}

export function gateReason(state: BattleState, u: Unit, key: string): string | null {
  const w = state.board.walls[key];
  if (!w?.gate || w.remaining <= 0) return 'This gate is breached or absent.';
  if (!canActNow(state, u)) return 'This unit cannot act now.';
  if (wallsFor(state.board).insideOf(key) !== notation(u.square)) return 'Operate the gate from its interior hex.';
  if (u.actions < 1) return 'The gate needs one action.';
  if (engagedEnemies(state, u).length) return 'Break contact before operating the gate.';
  return null;
}

export function doGate(state: BattleState, u: Unit, action: GateAction): number {
  if (typeof action.open !== 'boolean') throw new Error('Choose open or closed for the gate.');
  const reason = gateReason(state, u, action.edge);
  if (reason) throw new Error(reason);
  const wall = state.board.walls[action.edge];
  if (wall.gate!.open === action.open) throw new Error(`The gate is already ${action.open ? 'open' : 'closed'}.`);
  wall.gate!.open = action.open;
  log(state, u, `${u.name} ${action.open ? 'opens' : 'closes'} the gate at ${action.edge}.`);
  return 1;
}

function siegeEffect(state: BattleState, u: Unit, target: Unit, e: EngineState, mode: SiegeMode) {
  if (target.status !== 'active') return;
  switch (mode.effect) {
    case 'persistent': target.persistent = { dc: levelDc(engineCard(e)?.level ?? u.level) }; break;
    case 'snare': case 'web': target.rooted = Math.max(target.rooted, target.id === u.id ? 2 : 1); break;
    case 'stun': target.stunned = true; break;
    case 'expose': target.exposed = true; break;
    case 'sicken': addDisorder(state, target, 1, mode.label); break;
    case 'nullify': {
      // A temporary flier over water lands after reaching safe ground.
      const overWater = at(state.board, target.square).terrain === 'water';
      resetConditions(target, MAGICAL_CONDITIONS.filter((key) => !(key === 'flies' && overWater)));
      break;
    }
    case 'push': case 'pull':
      forcedStep(state, e.square, target, mode.effect);
      break;
  }
  if (mode.effect && mode.effect !== 'rough') log(state, target, `${target.name}: ${mode.label} applies ${mode.effect}.`);
}

function resolveSiege(state: BattleState, rng: Rng, u: Unit, e: EngineState, mode: SiegeMode, targetId: string, focus: number) {
  const crewBonus = hasAbility(u, 'siege-crew') && !u.abilityState?.crewUsed ? 1 : 0;
  const modifier = e.launch - u.disorder + rollBonus(u) + focus * ACTION_BONUS + crewBonus;
  abilityMemory(u).crewUsed = true;
  abilityMemory(u).attackUsed = true;
  e.fired = true;
  if (engineLoadSteps(e)) e.loaded = 0;
  u.attacked = true;
  if (mode.shape === 'wall') {
    const wall = state.board.walls[targetId];
    const c = attackRoll(state, rng, u, null, modifier, wallDc(state, wall));
    const damage = succeeded(c.degree) ? structuralDamage(wall, mode.damage + (c.degree === 'critical-success' ? 1 : 0), mode.penetration) : 0;
    wall.remaining = Math.max(0, wall.remaining - damage);
    log(state, u, `${rollLine(u.name, `${e.name} ${mode.label} against the wall ${targetId}`, c, 'attack')} ${damage} structural damage after hardness ${fortification(wall.tier).hardness}. ${wall.remaining ? `${wall.remaining}/${wall.boxes} remains.` : 'Breached.'}`, c);
    return;
  }
  const cells = mode.shape === 'single' ? [notation(unit(state, targetId).square)] : targetId.split('+');
  if (mode.effect === 'rough' || mode.effect === 'web') {
    state.board.siegeFields ??= [];
    state.board.siegeFields.push({ cells, kind: mode.effect, expires: state.round + 1 });
    log(state, u, `${mode.label} leaves ${mode.effect === 'web' ? 'webs' : 'difficult ground'} on ${cells.join(', ')} through round ${state.round + 1}.`);
  }
  if (mode.ignites) state.board.siegeFields = state.board.siegeFields?.map(f => f.kind === 'web' ? { ...f, cells: f.cells.filter(c => !cells.includes(c)) } : f).filter(f => f.cells.length > 0);
  const targets = state.units.filter(t => t.status === 'active' && cells.includes(notation(t.square))
    && (!mode.groundOnly || (!t.flying && !t.flies)) && (!mode.cavalryOnly || t.role === 'cavalry')
    && (!mode.waterOnly || ['water', 'shallows'].includes(at(state.board, t.square).terrain)));
  if (!targets.length) log(state, u, `${e.name}: ${mode.label} lands on ${cells.join(', ')}.`);
  for (const target of targets) {
    if (!attackGate(state, rng, u, target)) continue;
    const c = attackRoll(state, rng, u, target, modifier, defenceOf(state, target, u, true, mode.highAngle, e.square));
    log(state, u, rollLine(u.name, `${e.name} ${mode.label} against ${target.name}`, c, 'attack'), c, undefined, attackOn(target));
    if (!succeeded(c.degree)) continue;
    applyWounds(state, rng, target, mode.damage ? Math.min(4, mode.damage + (c.degree === 'critical-success' ? 1 : 0)) : 0, e.name, u, false, 0, engineCard(e)?.level, mode.ignites ? ['fire'] : []);
    siegeEffect(state, u, target, e, mode);
  }
}

export function doSiege(state: BattleState, rng: Rng, u: Unit, action: SiegeAction): number {
  const e = siegeEngines(state, u).find(e => e.id === action.engine);
  if (!e) throw new Error('This siege engine is not available in the unit’s hex.');
  const reason = siegeReason(state, u, e, action.operation);
  if (reason) throw new Error(reason);
  switch (action.operation) {
    case 'load': {
      const progress = engineLoadProgress(e);
      e.loadSteps = engineLoadSteps(e);
      e.loaded = progress + 1;
      log(state, u, `${u.name} loads ${e.name}: ${engineLoaded(e) ? 'loading complete' : `${e.loaded}/${e.loadSteps} actions`}.`);
      return 1;
    }
    case 'haul':
      state.engines = state.engines.filter(x => x.id !== e.id);
      if (!u.engines.some(x => x.id === e.id)) u.engines.push(e);
      e.emplaced = false;
      e.hauling = true;
      // A faster movement pool cannot be carried into a slower hauling rate.
      u.feet = 0;
      log(state, u, `${u.name} hauls ${e.name} at ${movementSpeed(u) / CELL_FEET} hexes per Move.`);
      return 1;
    case 'release':
      u.engines = u.engines.filter(x => x.id !== e.id);
      e.emplaced = true;
      e.hauling = false;
      e.square = { ...u.square };
      state.engines.push(e);
      log(state, u, `${u.name} releases ${e.name} on ${notation(e.square)}; movement returns to ${movementSpeed(u) / CELL_FEET} hexes per Move.`);
      return 0;
    case 'attack': {
      const offer = siegeAttackOffer(state, u, e);
      const activity = action.activity ?? 1;
      const option = offer?.activities.find(x => x.index === activity);
      if (!option?.legal || !option.targets.some(t => t.id === action.target)) throw new Error('Choose an available siege attack and target.');
      const mode = siegeModes(e.name, engineKind(e))[activity - 1];
      const focus = action.focus ?? 0;
      if (!Number.isInteger(focus) || focus < 0 || focus > 2) throw new Error('Commit zero, one, or two extra actions.');
      const cost = mode.cost + focus;
      if (cost > u.actions) throw new Error('Not enough actions for this siege attack.');
      resolveSiege(state, rng, u, e, mode, action.target!, focus);
      return cost;
    }
    default: throw new Error('Unknown siege action.');
  }
}

/**
 * An emplacement left with only the enemy beside it changes hands at the end of the round.
 * A friendly still standing by reserves an empty engine hex, however outnumbered. Entering
 * the hex takes it immediately. One that is nobody's goes to the army that
 * alone stands by it, and waits while both do.
 */
export function seizeEmplacements(state: BattleState) {
  refreshEmplacements(state);
  for (const e of state.engines) {
    if (crewOf(state, e)) continue;
    const near = state.units.filter((c) => c.side !== e.side && isStanding(c) && dist(state, c.square, e.square) <= 1);
    const captor = near[0];
    if (!captor || near.some((c) => c.side !== captor.side)) continue;
    e.side = captor.side;
    e.status = 'crewed';
    // Capture changes ownership. The engine keeps its load; endRound resets its shot limit.
    log(state, captor, `${captor.name} takes the ${e.name} on ${notation(e.square)}.`);
  }
}

export function captureEngines(state: BattleState) {
  for (const u of state.units) {
    for (const e of u.engines) {
      if (e.status !== 'abandoned') continue;
      const captor = state.units.find((c) => c.side !== u.side && isStanding(c) && dist(state, c.square, e.square) <= 1);
      if (captor) {
        e.status = 'captured';
        log(state, captor, `${captor.name} captures the ${e.name}.`);
      }
    }
  }
}

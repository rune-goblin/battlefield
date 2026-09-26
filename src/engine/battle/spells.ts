import { abilityMemory, exploitBonus, resolveBonus, suppressRegeneration, attackAbilities } from '../ability-effects.js';
import type { HealingChoice } from '../types.js';
import { notation, parse } from '../board.js';
import { CELL_FEET } from '../path.js';
import { possessive, readCheck, readTwice, rollLine, successes, type Degree } from '../check.js';
import type { ActivityIndex } from '../ladders.js';
import { castActivityOf, TREE_LABEL, type Tree } from '../magic.js';
import type { Rng } from '../rng.js';
import { levelDc } from '../tables.js';
import { ACTION_BONUS, type BattleState, type ActivityAction, type Unit, type LogTag } from '../types.js';
import {
  dist, unit, unitAt, engagedEnemies, roll, defenceOf, willModifier, spellAttackModifier, spellDcFor,
  healingModifier, controllingDc, log, attackOn,
} from './state.js';
import { moveTo } from './movement.js';
import { applyWounds, addDisorder, clearDisorder, endCondition, healWound } from './wounds.js';
import { heightBetween, abilityContext, attackGate } from './combat.js';
import { castCeiling, enemiesIn } from './targeting.js';

/** One cast: the tree is spent for this activation, and its own case resolves it. */
export function doCastAction(state: BattleState, rng: Rng, u: Unit, tree: Tree, index: ActivityIndex, action: ActivityAction) {
  u.castTrees.push(tree);
  resolveTree(state, rng, u, tree, index, action);
}

/** The one unit an ally tree or a Controlling cast lands on, or null when it is out of range. */
function castTarget(state: BattleState, u: Unit, tree: Tree, action: ActivityAction): Unit | null {
  const target = action.target ? unit(state, action.target) : u;
  if (target.id !== u.id && dist(state, target.square, u.square) > castCeiling(state, tree)) {
    log(state, u, `${u.name}'s ${TREE_LABEL[tree]} cannot carry to ${target.name}.`);
    return null;
  }
  return target;
}

/**
 * Blast, the activation's one attack: one spell attack, read against the Defence of the enemy
 * in each hex of the shape. A hit is 1 wound, a critical 2, and the wound asks the Fortitude
 * save as any other does.
 */
function blast(state: BattleState, rng: Rng, u: Unit, index: ActivityIndex, action: ActivityAction) {
  const activity = castActivityOf('blast', index);
  const shape = index === 1 ? [unit(state, action.target!).square] : action.target!.split('+').map(parse);
  const caught = enemiesIn(state, u, shape);
  u.attacked = true;
  for (const target of caught) attackAbilities(state, u, target, 'spell', 'use', null, 0, false, !!u.guard, abilityContext(state, rng, u));
  log(state, u, `${u.name} casts ${activity.label} on ${shape.map(notation).join(', ')}.`, undefined,
    { kind: 'spell', caster: u.id, tree: 'blast', activity: index, targets: caught.map((t) => t.id) });
  const modifier = spellAttackModifier(u) + ACTION_BONUS * (action.focus ?? 0);
  // Every aegis in the shape gates the cast, and one failure wastes the whole activity,
  // "actions and all" — the rule reads on the activity, not on the hex that carries it.
  for (const target of caught) if (!attackGate(state, rng, u, target)) return;
  const sureStrike = u.sureStrike;
  const warded = new Set(caught.filter((t) => t.ward).map((t) => t.id));
  u.sureStrike = false;
  for (const t of caught) t.ward = false;
  // The shape's one attack, thrown once, plus the second die Sure strike or a ward in the shape
  // asks for. Each unit reads the pair its own way against its own Defence: better under sure
  // strike, worse under a ward of its own, and the first die alone when the two cancel. Only the
  // die `roll` throws carries; the DC it takes goes nowhere, since each hex reads its own below.
  const first = roll(state, rng, u, modifier, defenceOf(state, caught[0], u, true)).roll;
  const second = sureStrike || warded.size ? rng.d20() : null;
  if (second !== null) {
    log(state, u, `${activity.label} is thrown twice, ${first} and ${second}: ${sureStrike
      ? 'sure strike keeps the better, and a warded hex reads the first alone'
      : 'a warded hex keeps the worse, and the rest read the first'}.`, undefined,
    { kind: 'secondDie', faces: [first, second] });
  }
  for (const target of caught) {
    const dc = defenceOf(state, target, u, true);
    const targetModifier = modifier + heightBetween(state, u.square, target.square) + exploitBonus(state, u, target, 'spell', true);
    const c = second !== null && sureStrike !== warded.has(target.id)
      ? readTwice([first, second], targetModifier, dc, sureStrike)
      : readCheck(first, targetModifier, dc);
    log(state, u, rollLine(u.name, `${activity.label} against ${target.name}`, c, 'attack'), c, undefined, attackOn(target));
    const wounds = successes(c.degree);
    // Blast uses its shared counter after Health loss, regardless of source damage tags.
    const damage = applyWounds(state, rng, target, wounds, `${u.name}'s ${activity.label}`, u);
    if (damage > 0) suppressRegeneration(target, 'Blast damage', (unit, text) => log(state, unit, text));
    attackAbilities(state, u, target, 'spell', 'result', c.degree, damage, false, false, abilityContext(state, rng, u));
  }
  abilityMemory(u).attackUsed = true;
}

/** One unit a Healing roll reaches, read against its own level DC. */
function healOne(state: BattleState, target: Unit, degree: Degree, choice?: HealingChoice) {
  if (degree === 'critical-failure') return;
  clearDisorder(state, target, 1, 'Healing');
  if (degree === 'failure') return;
  healWound(state, target);
  if (degree === 'success') return;
  if (choice?.extraHealth || !endCondition(state, target, choice?.conditions[0])) healWound(state, target);
}

function renewOne(state: BattleState, target: Unit, degree: Degree, choice?: HealingChoice) {
  const amount = { 'critical-success': 3, success: 2, failure: 1, 'critical-failure': 0 }[degree];
  clearDisorder(state, target, Math.max(1, amount), 'Renewal');
  for (let i = 0; i < amount; i++) healWound(state, target);
  const clears = successes(degree);
  for (let i = 0; i < clears; i++) {
    if (choice && !choice.conditions[i]) break;
    if (!endCondition(state, target, choice?.conditions[i])) break;
  }
}

/** Translocate, the one buff that happens at cast time: the ally is set down whatever lies
 * between, and the leap is none of its own actions. No check, and no free strike from anything
 * it was in contact with. */
function translocate(state: BattleState, u: Unit, label: string, index: ActivityIndex, action: ActivityAction) {
  const [home, landing] = (action.target ?? '').split('+');
  const ally = unitAt(state, parse(home));
  if (!ally || !landing) { log(state, u, `${u.name}'s ${label} finds nobody to move.`); return; }
  const held = engagedEnemies(state, ally).length > 0;
  log(state, u, `${u.name} casts ${label} on ${ally.name}.`, undefined,
    { kind: 'spell', caster: u.id, tree: 'movement', activity: index, targets: [ally.id] });
  const left = ally.engines.filter(e => e.hauling && e.status === 'crewed');
  moveTo(state, ally, parse(landing), false);
  log(state, ally, `${ally.name} is set down on ${landing}${held ? ', out of contact with nothing to strike it' : ''}${left.length ? `, leaving its ${left[0].name} behind` : ''}.`);

}

/** One target's Will save against a Controlling spell and its result. Terror runs this once per
 * target; its failure costs Morale alone, since only Stun and Hold carry a further effect. */
function controlOne(state: BattleState, rng: Rng, u: Unit, target: Unit, index: ActivityIndex, label: string, dcBonus: number, tag?: LogTag) {
  const c = roll(state, rng, target, willModifier(target) + resolveBonus(state, target), controllingDc(u) + dcBonus);
  log(state, target, rollLine(target.name, `Will save against ${possessive(u.name)} ${label}`, c), c, tag);
  if (c.degree === 'critical-success') return;
  if (c.degree === 'success') {
    if (target.immuneFear) return;
    target.frightened = true;
    log(state, target, `${target.name} is frightened: −1 to every roll and to Defence until the end of its next activation.`);
    return;
  }
  addDisorder(state, target, c.degree === 'critical-failure' ? 2 : 1, `${u.name}'s ${label}`);
  if (index === 2 || index === 3) {
    target.stunned = true;
    log(state, target, `${target.name} is stunned: one action fewer on its next activation.`);
  }
  if (index === 3) {
    target.rooted = 1;
    log(state, target, `${target.name} is held: rooted on its next activation.`);
  }
}

/**
 * What a cast does, tree by tree (section 11). Each tree owns its own targets, its own roll
 * and its own effect; `index` is the spell tier, independent of its action price.
 */
function resolveTree(state: BattleState, rng: Rng, u: Unit, tree: Tree, index: ActivityIndex, action: ActivityAction) {
  if (index === 4 && tree !== 'blast' && tree !== 'healing') {
    const label = castActivityOf(tree, index).label;
    if (tree === 'movement') {
      const parts = action.target!.split('+');
      const transfers = Array.from({ length: parts.length / 2 }, (_, i) => ({ ally: unitAt(state, parse(parts[i * 2]))!, landing: parse(parts[i * 2 + 1]) }));
      log(state, u, `${u.name} casts ${label}.`, undefined, { kind: 'spell', caster: u.id, tree, activity: index, targets: transfers.map(t => t.ally.id) });
      for (const { ally, landing } of transfers) { moveTo(state, ally, landing, false); log(state, ally, `${ally.name} is set down on ${notation(landing)}.`); }
      return;
    }
    const targets = action.target!.split('+').map(id => unit(state, id));
    log(state, u, `${u.name} casts ${label} on ${targets.map(t => t.name).join(', ')}.`, undefined, { kind: 'spell', caster: u.id, tree, activity: index, targets: targets.map(t => t.id) });
    for (const target of targets) {
      // A spell's total cost cannot exceed three actions, so the three-action Terror takes no focus.
      if (tree === 'controlling') controlOne(state, rng, u, target, index, label, 0);
      else if (tree === 'offense') target.sureStrike = true;
      else if (tree === 'defense') {
        target.stoneskin = true;
        if (target.id === u.id && !target.selfBuffs.includes('stoneskin')) target.selfBuffs.push('stoneskin');
      }
    }
    return;
  }
  switch (tree) {
    case 'blast':
      blast(state, rng, u, index, action);
      break;
    case 'healing': {
      const targets = action.target!.split('+').map((id) => unit(state, id));
      const activity = castActivityOf('healing', index);
      log(state, u, `${u.name} casts ${activity.label} on ${targets.map((t) => t.name).join(', ')}.`, undefined,
        { kind: 'spell', caster: u.id, tree, activity: index, targets: targets.map((t) => t.id) });
      const modifier = healingModifier(u) + ACTION_BONUS * (action.focus ?? 0);
      const cast = roll(state, rng, u, modifier, levelDc(targets[0].level));
      for (const target of targets) {
        const c = readCheck(cast.roll, modifier, levelDc(target.level));
        log(state, u, rollLine(u.name, `${activity.label} check for ${target.name}`, c), c, undefined, { unit: target.id, reads: 'check' });
        if (index === 4) renewOne(state, target, c.degree, action.healingChoices?.[target.id]);
        else healOne(state, target, c.degree, action.healingChoices?.[target.id]);
      }
      break;
    }
    case 'controlling': {
      const target = castTarget(state, u, tree, action);
      if (!target) break;
      // Controlling announces itself through the target's own save, so the tag rides there.
      controlOne(state, rng, u, target, index, castActivityOf('controlling', index).label, ACTION_BONUS * (action.focus ?? 0),
        { kind: 'spell', caster: u.id, tree, activity: index, targets: [target.id] });
      break;
    }
    case 'offense': {
      const target = castTarget(state, u, tree, action);
      if (!target) break;
      const activity = castActivityOf('offense', index);
      log(state, u, `${u.name} casts ${activity.label} on ${target.name}.`, undefined,
        { kind: 'spell', caster: u.id, tree, activity: index, targets: [target.id] });
      if (index === 1) {
        if (target.sureStrike) { log(state, target, `${target.name} is already rolling its next attack twice.`); break; }
        target.sureStrike = true;
        log(state, target, `${target.name} rolls its next attack twice and takes the better.`);
      } else if (index === 2) {
        target.wrath = true;
        log(state, target, `${target.name}'s next hit will leave persistent damage.`);
      } else {
        if (target.haste > 0) { log(state, target, `${target.name} is already hasted.`); break; }
        target.haste = 2;
        // `begin` is what deals the extra action, and on a self-cast it has already run, so the
        // first of the two is handed over here; this activation's `finish` spends it like any
        // other. A delta, never a total: a stun still subtracts from it.
        if (target.id === u.id) {
          u.actions += 1;
          log(state, target, `${target.name} is hasted: an extra action at once, and one on its next activation.`);
        } else {
          log(state, target, `${target.name} is hasted: an extra action on each of its next two activations.`);
        }
      }
      break;
    }
    case 'defense': {
      const target = castTarget(state, u, tree, action);
      if (!target) break;
      const activity = castActivityOf('defense', index);
      log(state, u, `${u.name} casts ${activity.label} on ${target.name}.`, undefined,
        { kind: 'spell', caster: u.id, tree, activity: index, targets: [target.id] });
      if (index === 1) {
        if (target.ward) { log(state, target, `${target.name} is already warded.`); break; }
        target.ward = true;
        if (target.id === u.id) target.selfBuffs.push('ward');
        log(state, target, `${target.name}'s next attack rolls twice and the attacker takes the worse.`);
      } else if (index === 2) {
        if (target.stoneskin) { log(state, target, `${target.name} already has stoneskin.`); break; }
        target.stoneskin = true;
        if (target.id === u.id) target.selfBuffs.push('stoneskin');
        log(state, target, `${target.name} has stoneskin: every hit caps at 1 damage and costs no Morale.`);
      } else {
        if (target.aegis) { log(state, target, `${target.name} is already under an aegis.`); break; }
        target.aegis = { dc: spellDcFor(u) };
        if (target.id === u.id) target.selfBuffs.push('aegis');
        log(state, target, `${target.name} is under an aegis: an attacker must beat Will DC ${target.aegis.dc} or waste the attempt.`);
      }
      break;
    }
    case 'movement': {
      const activity = castActivityOf('movement', index);
      if (index === 3) { translocate(state, u, activity.label, index, action); break; }
      const target = castTarget(state, u, tree, action);
      if (!target) break;
      log(state, u, `${u.name} casts ${activity.label} on ${target.name}.`, undefined,
        { kind: 'spell', caster: u.id, tree, activity: index, targets: [target.id] });
      if (index === 1) {
        const bonus = CELL_FEET;
        const extra = Math.max(0, bonus - (target.movementBonus ?? 0));
        target.movementBonus = Math.max(target.movementBonus ?? 0, bonus);
        target.feet += extra;
        if (extra) log(state, target, `${target.name} gains 1 extra hex of movement ${target.id === u.id ? 'this activation' : 'on its next activation'}; terrain costs still apply.`);
        else log(state, target, `${target.name} already has Burst of speed; the bonus does not stack.`);
      } else {
        target.sureFooting = true;
        log(state, target, `${target.name} has sure footing: every hex costs it 1 on its next activation, and its charge may cross any ground it can enter.`);
      }
      break;
    }
  }
}

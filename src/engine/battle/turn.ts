import { abilityMemory, unitAbilities, refreshAbilityAuras, startAbilities, performAbility } from '../ability-effects.js';
import { parse } from '../board.js';
import { rollLine } from '../check.js';
import { activityOf, CAST_COMMITMENT, type Activity } from '../ladders.js';
import type { Rng } from '../rng.js';
import { clone } from '../clone.js';
import { targetKey } from '../targets.js';
import {
  AFTER_ACTED_CONDITIONS, BEGIN_CONDITIONS, COUNTDOWN_CONDITIONS, FINISH_CONDITIONS, HEALING_CONDITIONS, resetConditions,
} from '../conditions.js';
import {
  ACTION_BONUS, ACTIONS_PER_ACTIVATION, BANDS, type Action, type BattleState, type ChargeAction,
  type AdvanceAction, type ActivityAction, type Side, type Unit,
} from '../types.js';
import {
  dist, unit, soleUnit, checkedTarget, isStanding, mayActivate, nextSide, activeUnit, isEngaged, rollBonus, roll, willModifier,
  routDcFor, log, clearAsShooter, validateFocus,
} from './state.js';
import { refreshEmplacements } from './emplacements.js';
import { addDisorder, clearDisorder, inspire, landPersistent } from './wounds.js';
import { canShootTarget, abilityContext, melee, shootAt, attackWall } from './combat.js';
import { doGate, doSiege, seizeEmplacements, captureEngines } from './siege.js';
import { meleeFinishes, meleePlans, doFlee, doStep, doStride, doCharge } from './manoeuvres.js';
import { specialOffers, availableActions } from './targeting.js';
import { doCastAction } from './spells.js';

/** Pick which of the pending side's units acts next. */
export function select(input: BattleState, id: string): BattleState {
  const state = clone(input);
  const u = unit(state, id);
  if (!mayActivate(state, u)) throw new Error(`${u.name} cannot activate now`);
  if (state.begun && state.active !== id) throw new Error('an activation is already under way');
  state.active = id;
  return state;
}

/** Put the pick back so the side is choosing again. Once the activation has begun the actions
 * are already spent on that unit, so the choice stands and this does nothing. */
export function deselect(input: BattleState): BattleState {
  if (input.begun || input.active === null) return input;
  const state = clone(input);
  state.active = null;
  return state;
}

function perform(state: BattleState, rng: Rng, u: Unit, activity: Activity, action: ActivityAction) {
  const focusBonus = ACTION_BONUS * (action.focus ?? 0);
  switch (activity.type) {
    case 'shoot': {
      const target = soleUnit(state, action.target);
      if (!canShootTarget(state, u, target)) { log(state, u, `${u.name}'s shot cannot reach ${target.name} from this range or sight line.`); break; }
      shootAt(state, rng, u, target, activity, focusBonus);
      break;
    }
    case 'fight': {
      if (action.target?.kind === 'wall') {
        u.attacked = true;
        const bonus = (u.stats.strike ?? 0) - u.disorder + rollBonus(u);
        attackWall(state, rng, u, action.target.edge, bonus + focusBonus, 'Strike');
        break;
      }
      const target = soleUnit(state, action.target);
      if (!isEngaged(state, u, target)) { log(state, u, `${u.name} is not in contact with ${target.name}.`); break; }
      melee(state, rng, u, target, activity, { bonus: focusBonus });
      break;
    }
    case 'guard': {
      const eff = activity.guard!;
      u.guard = { defence: eff.defence, cap: eff.cap, holds: eff.holds };
      // One: the rest of this activation, and no further. `finish` clears it. The Guard
      // bonus itself dies when the unit acts again, so a root outliving it would be a penalty
      // charged after the protection it paid for had already lapsed.
      if (eff.rooted) u.rooted = 1;
      const parts = [
        `+${eff.defence} Defence`,
        eff.cap ? 'criticals against it land as ordinary hits' : '',
        eff.holds ? 'holds its ground against an Overrun' : '',
        eff.rooted ? 'may not move again this activation' : '',
      ].filter(Boolean);
      log(state, u, `${u.name} ${activity.verb}: ${parts.join(', ')}.`);
      break;
    }
    case 'rally': {
      // One roll, d20 + Will vs the rallying unit's own rout DC, read for every unit reached:
      // Steady is u alone, Rally adds one adjacent ally, Inspire every ally within short range.
      const eff = activity.rally!;
      const reached: Unit[] = [u];
      if (eff.scope === 'adjacent') {
        reached.push(soleUnit(state, action.target));
      } else if (eff.scope === 'nearby') {
        reached.push(...alliesWithin(state, u, BANDS.short));
      }
      const c = roll(state, rng, u, willModifier(u) + focusBonus, routDcFor(state, u));
      log(state, u, rollLine(u.name, `Will check to ${activity.label}`, c), c);
      for (const a of reached) {
        // Critical success reads "if none is left" (after the 2-point clear); a plain success
        // reads "if it has none" (before the roll) — a unit sitting at exactly 1 disorder
        // clears to 0 on a success without being inspired, only on a critical.
        if (c.degree === 'critical-success') {
          clearDisorder(state, a, 2, activity.label.toLowerCase());
          if (a.disorder === 0) inspire(state, a);
        } else if (c.degree === 'success') {
          if (a.disorder > 0) clearDisorder(state, a, 1, activity.label.toLowerCase());
          else inspire(state, a);
        }
      }
      if (c.degree === 'critical-failure') addDisorder(state, u, 1, 'a rally gone wrong');
      break;
    }
  }
}

const alliesWithin = (state: BattleState, u: Unit, reach: number) => state.units.filter(
  (a) => a.side === u.side && a.id !== u.id && a.status === 'active' && dist(state, a.square, u.square) <= reach,
);

// Everything that lasted "until this unit acts again" ends when it starts acting: its own Guard
// and the exposure a critical miss left it with. A Defense buff lasts a beat longer, until the
// unit has acted, so `finish` clears those. A suppression or a pin ends on its shooter's
// activation instead, so those are cleared on whoever named this unit.
function begin(state: BattleState, u: Unit, rng: Rng) {
  if (state.begun && state.active === u.id) return;
  state.active = u.id;
  state.begun = true;
  state.log.push({ round: state.round, unit: u.id, turn: 'start', text: `${u.name} begins its turn.` });
  // The hasted total is set before the stun subtracts, so the two compose (4 − 1 = 3) instead
  // of a later write to `actions` silently overwriting the stun.
  u.actions = ACTIONS_PER_ACTIVATION + (u.haste > 0 ? 1 : 0);
  u.attacked = false;
  u.feet = u.movementBonus ?? 0;
  u.castTrees = [];
  abilityMemory(u).guardAtStart = !!u.guard;
  if (u.haste > 0) log(state, u, `${u.name} is hasted: one extra action this activation.`);
  if (u.stunned) {
    u.actions -= 1;
    log(state, u, `${u.name} is stunned: one fewer action this activation.`);
  }
  resetConditions(u, BEGIN_CONDITIONS);
  clearAsShooter(state, u.id);
  startAbilities(state, u, abilityContext(state, rng, u));
}

// What was laid on the unit's next activation is spent by this one and cleared at the end.
function finish(state: BattleState, rng: Rng, u: Unit) {
  u.actions = ACTIONS_PER_ACTIVATION;
  u.attacked = false;
  // Cleared here as well as in `begin`: the menu is read before the unit's first action, when
  // `begin` has not run, and a tree left standing from last time reads "already cast".
  u.castTrees = [];
  u.feet = 0;
  for (const key of COUNTDOWN_CONDITIONS) u[key] = Math.max(0, u[key] - 1);
  if (!u.rooted) abilityMemory(u).snare = false;
  // The persistent wound lands before the clears below: its Fortitude save is a roll of this
  // activation, so `inspired` bonuses it and is spent by it, and `frightened` still costs its −1.
  if (u.persistent) landPersistent(state, rng, u);
  // A Defense buff lasts until the unit it fell on has next acted (section 11), so it stands
  // through the whole of this activation and lapses here — which is what lets Stoneskin meet a
  // persistent wound above. One the unit cast on itself this activation is held over instead:
  // its own next act is the activation after this one.
  resetConditions(u, AFTER_ACTED_CONDITIONS.filter((key) => !u.selfBuffs.includes(key)));
  resetConditions(u, FINISH_CONDITIONS);
  state.activated.push(u.id);
  state.lastSide = u.side;
  state.log.push({ round: state.round, unit: u.id, turn: 'end', text: `${u.name} ends its turn.` });
  state.active = null;
  state.begun = false;
  const next = nextSide(state);
  if (next === null) endRound(state, rng);
  else state.pending = next;
}

/**
 * Stop here with actions unspent — also the pass, since a unit that has done nothing may end
 * too. Naming the unit guards against ending the next one's activation when an action has
 * already finished this one.
 */
export function endActivation(input: BattleState, rng: Rng, unitId?: string): BattleState {
  const state = clone(input);
  if (state.phase !== 'battle') throw new Error('battle is over');
  const u = activeUnit(state);
  if (!u) throw new Error('no unit is activating');
  if (unitId && u.id !== unitId) throw new Error(`${unitId} is not activating`);
  // A pass is an activation. `act` is the only other caller of `begin`, so without this a unit
  // that ends its turn having done nothing would carry its guard, its stun and every spell laid
  // on it into the activation it next acts in.
  if (!state.begun) begin(state, u, rng);
  finish(state, rng, u);
  refreshEmplacements(state);
  refreshAbilityAuras(state);
  return state;
}

function doActivity(state: BattleState, rng: Rng, u: Unit, action: ActivityAction): number {
  const ref = checkedTarget(action.target);
  const key = ref ? targetKey(ref) : null;
  if (action.ability) {
    if (action.type !== 'cast' || action.spell || action.activity !== 1 || action.focus) throw new Error('Invalid ability action');
    const option = specialOffers(state, u).find(o => o.ability === action.ability)?.activities[0];
    if (!option?.legal || (option.needsTarget && !option.targets.some(t => t.id === key))) throw new Error(option?.reason ?? 'Invalid ability target');
    const target = ref?.kind === 'unit' ? state.units.find(t => t.id === ref.ids[0]) ?? null : null;
    performAbility(state, u, action.ability, target, ref?.kind === 'cell' ? parse(ref.cells[0]) : null, abilityContext(state, rng, u));
    return option.cost!;
  }
  const offer = availableActions(state, u.id).find((o) => o.type === action.type && o.spell === (action.spell ?? null));
  if (!offer) throw new Error(`${action.type} is not available to ${u.name}`);
  const opt = offer.activities[action.activity - 1];
  if (!opt || !opt.legal) throw new Error(`${offer.label} ${action.activity} is not available to ${u.name}${opt?.reason ? ` — ${opt.reason}` : ''}`);
  if (opt.needsTarget && !opt.targets.some((t) => t.id === key)) {
    throw new Error(`${key ?? 'nothing'} is not a target for ${opt.label}`);
  }
  if (action.healingChoices) {
    if (action.type !== 'cast' || action.spell !== 'healing') throw new Error('recovery choices require Healing');
    const recipients = ref?.kind === 'unit' ? ref.ids : [];
    for (const [id, choice] of Object.entries(action.healingChoices)) {
      if (!recipients.includes(id) || !Array.isArray(choice.conditions) || choice.conditions.length > 2
        || new Set(choice.conditions).size !== choice.conditions.length
        || choice.conditions.some(c => !HEALING_CONDITIONS.includes(c))
        || (action.activity === 4 && choice.extraHealth)) throw new Error('invalid recovery choices');
    }
  }
  const focus = validateFocus(action);
  const price = opt.cost! + focus;
  if (price > u.actions || (action.type === 'cast' && price > CAST_COMMITMENT)) throw new Error(`${opt.label} needs ${price} actions; commitment is at most three`);
  if (price > 1) log(state, u, `${u.name} commits ${price} actions to ${opt.label}${focus ? ` (+${focus * ACTION_BONUS} ${action.spell === 'controlling' ? 'spell DC' : 'on the roll'})` : ''}.`);
  if (offer.type === 'cast') doCastAction(state, rng, u, offer.spell!, action.activity, action);
  else perform(state, rng, u, activityOf(offer.type, action.activity), action);
  return price;
}

function doAdvance(state: BattleState, rng: Rng, u: Unit, action: AdvanceAction): number {
  const waypoints = action.waypoints ?? [];
  const plan = meleePlans(state, u, action.target, waypoints).find(p => p.kind === action.finish && p.via === action.via);
  if (!plan || !plan.via) throw new Error('This move-and-attack route is no longer available. Choose the target again.');
  const activity = action.activity ?? 1;
  const run = waypoints.slice(plan.split);
  const attack: ChargeAction | ActivityAction = action.finish === 'charge'
    ? { type: 'charge', unit: u.id, target: action.target, activity, focus: action.focus, ...(run.length ? { waypoints: run } : {}) }
    : { type: 'fight', unit: u.id, target: { kind: 'unit', ids: [action.target] }, activity, focus: action.focus };
  const focus = validateFocus(attack);
  const finish = meleeFinishes(u, action.finish, plan.moveActions).find((f) => f.activity === activity);
  if (!finish && action.finish === 'charge') throw new Error('invalid charge activity');
  if (!finish || finish.cost + focus > u.actions) throw new Error('The move and chosen attack exceed the available actions.');
  const movement = doStride(state, rng, u, { type: 'move', unit: u.id, to: plan.via, waypoints: waypoints.slice(0, plan.split) });
  // Reserve the movement cost before validating the melee. The caller subtracts the total
  // once and ends the activation once; an exception discards this entire cloned state.
  u.actions -= movement;
  const cost = attack.type === 'charge' ? doCharge(state, rng, u, attack) : doActivity(state, rng, u, attack);
  u.actions += movement;
  return movement + cost;
}

export function act(input: BattleState, action: Action, rng: Rng): BattleState {
  const state = clone(input);
  if (state.phase !== 'battle') throw new Error('battle is over');
  const u = unit(state, action.unit);
  if (!mayActivate(state, u)) throw new Error(`${u.name} cannot activate now`);
  if (state.begun && state.active !== u.id) throw new Error('an activation is already under way');
  begin(state, u, rng);
  const cost = action.type === 'gate' ? doGate(state, u, action) : action.type === 'siege' ? doSiege(state, rng, u, action)
    : action.type === 'move' ? doStride(state, rng, u, action)
    : action.type === 'flee' ? doFlee(state, rng, u, action)
    : action.type === 'step' ? doStep(state, u, action)
      : action.type === 'charge' ? doCharge(state, rng, u, action)
        : action.type === 'advance' ? doAdvance(state, rng, u, action)
          : doActivity(state, rng, u, action);
  u.actions -= cost;
  if (!('ability' in action && unitAbilities(u).some(a => a.key === action.ability && a.kind === 'opening-move'))) abilityMemory(u).actionTaken = true;
  if (u.actions <= 0 || u.status !== 'active') finish(state, rng, u);
  refreshEmplacements(state);
  refreshAbilityAuras(state);
  return state;
}

const standing = (state: BattleState, side: Side) => state.units.filter((u) => u.side === side && isStanding(u));

function endRound(state: BattleState, rng: Rng) {
  log(state, null, `End of round ${state.round}.`);
  // Settle delayed wounds before dusk determines survivors and the day's result.
  if (state.round >= state.roundsPerDay) {
    for (const u of state.units) if (u.persistent) landPersistent(state, rng, u);
  }
  for (const u of state.units) for (const e of u.engines) e.fired = false;
  for (const e of state.engines) e.fired = false;
  seizeEmplacements(state);
  const a = standing(state, 'attacker').length;
  const d = standing(state, 'defender').length;
  if (a === 0 || d === 0) {
    state.phase = 'ended';
    state.endedBy = state.units.some(u => u.status === 'camp' && (u.side === 'attacker' ? a === 0 : d === 0)) ? 'withdrawal' : 'rout';
    state.winner = a === 0 && d === 0 ? 'draw' : a === 0 ? 'defender' : 'attacker';
    log(state, null, state.winner === 'draw' ? 'Both armies are spent. The field is empty.' : `The ${state.winner} holds the field.`);
    captureEngines(state);
    return;
  }
  if (state.round >= state.roundsPerDay) {
    state.phase = 'ended';
    state.endedBy = 'dusk';
    state.winner = 'draw';
    log(state, null, 'Dusk falls. Both armies withdraw and the ground stays contested.');
    return;
  }
  state.round += 1;
  state.board.siegeFields = state.board.siegeFields?.filter(f => f.expires >= state.round);
  state.activated = [];
  state.active = null;
  state.begun = false;
  state.pending = nextSide(state) ?? state.pending;
  log(state, null, `Round ${state.round} begins.`);
}

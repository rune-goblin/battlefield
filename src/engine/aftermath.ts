import { gridOf, notation, parse } from './board.js';
import { canDeploy, crewOf, isStanding, isSurvivor, unit } from './battle.js';
import { check, rollLine, successes } from './check.js';
import { clone } from './clone.js';
import type { Rng } from './rng.js';
import { levelDc } from './tables.js';
import { ACTIONS_PER_ACTIVATION, SIDES, opponent, type BattleState, type DayOrder, type NightRecovery, type RecoveryChoice, type Side, type Unit } from './types.js';

export function canContinueBattle(state: BattleState): boolean {
  return state.phase === 'ended' && state.endedBy === 'dusk'
    && SIDES.every((side) => state.units.some((u) => u.side === side && isStanding(u)));
}

/** Whether that army has rolled its recovery tonight. */
export const hasRecovered = (state: BattleState, side: Side): boolean => state.night?.[side] !== undefined;

/** Both armies have rolled; the day's decisions can follow. */
export const nightResolved = (state: BattleState): boolean => SIDES.every((side) => hasRecovered(state, side));

export function canPrepareNextDay(state: BattleState): boolean {
  return canContinueBattle(state) && nightResolved(state) && state.dayOrders?.confirmed === true
    && SIDES.every((side) => state.dayOrders?.choices[side] === 'hold');
}

function requireDayDecision(state: BattleState) {
  if (!canContinueBattle(state) || !nightResolved(state)) throw new Error('resolve recovery before choosing day decisions');
}

export function declareDayOrder(input: BattleState, side: Side, order: DayOrder): BattleState {
  requireDayDecision(input);
  if (!SIDES.includes(side) || !['surrender', 'withdraw', 'hold'].includes(order)) throw new Error('invalid day decision');
  const state = clone(input);
  state.dayOrders ??= { choices: {}, confirmed: false };
  state.dayOrders.choices[side] = order;
  state.dayOrders.confirmed = false;
  return state;
}

export function resolveDayOrders(input: BattleState): BattleState {
  requireDayDecision(input);
  const choices = input.dayOrders?.choices;
  if (!choices?.attacker || !choices.defender) throw new Error('both armies must choose a day decision');
  if (SIDES.some((s) => choices[s] === 'surrender')) throw new Error('the opponent must respond to the surrender proposal');
  if (input.dayOrders?.confirmed) throw new Error('day decisions are already confirmed');
  const state = clone(input);
  state.dayOrders!.confirmed = true;
  const withdrawing = SIDES.filter((s) => choices[s] === 'withdraw');
  if (withdrawing.length) {
    state.endedBy = 'withdrawal';
    state.winner = withdrawing.length === 2 ? 'draw' : opponent(withdrawing[0]);
    state.nextBoard = null;
    state.log.push({ round: state.round, text: withdrawing.length === 2 ? 'Both armies withdraw. The field remains contested.'
      : `The ${withdrawing[0]} withdraws with its surviving troops. The ${state.winner} holds the field.` });
  } else {
    state.log.push({ round: state.round, text: 'Both armies hold the field and prepare to fight another day.' });
  }
  return state;
}

/** Only the opposing side answers a proposal. Rejection returns the proposing army to
 * its decision; acceptance ends the battle without inventing casualties or treaty terms. */
export function answerSurrender(input: BattleState, responder: Side, accept: boolean): BattleState {
  requireDayDecision(input);
  if (!SIDES.includes(responder)) throw new Error('invalid responding side');
  const proposer = opponent(responder);
  if (input.dayOrders?.choices[proposer] !== 'surrender') throw new Error('the opposing army has not proposed surrender');
  const state = clone(input);
  if (accept) {
    state.dayOrders!.confirmed = true;
    state.endedBy = 'surrender';
    state.winner = responder;
    state.nextBoard = null;
    state.log.push({ round: state.round, text: `The ${responder} accepts the ${proposer}'s surrender. The players agree the terms; surviving units retain their Health and Morale.` });
  } else {
    delete state.dayOrders!.choices[proposer];
    state.dayOrders!.confirmed = false;
    state.log.push({ round: state.round, text: `The ${responder} rejects the ${proposer}'s surrender proposal. The ${proposer} must choose again.` });
  }
  return state;
}

export const recoveryPenalty = (count: number): number => 2 * Math.max(0, count - 1);

export function recoveryDc(state: BattleState, choice: RecoveryChoice): number {
  const u = unit(state, choice.unit);
  return levelDc(choice.activity === 'treat' ? u.level : Math.max(...state.units
    .filter((enemy) => enemy.side !== u.side && isStanding(enemy)).map((enemy) => enemy.level)));
}

/** One army declares and rolls at once; the other army rolls on its own, before or after.
 * Each unit gets one choice; both activities share the army's penalty. Stats exclude the
 * shared morale track. */
export function recoverAtNight(input: BattleState, side: Side, choices: RecoveryChoice[], rng: Rng): BattleState {
  if (!canContinueBattle(input)) throw new Error('overnight recovery requires a contested dusk');
  if (!SIDES.includes(side)) throw new Error('invalid side');
  if (hasRecovered(input, side)) throw new Error(`the ${side} has already recovered tonight`);
  const seen = new Set<string>();
  for (const choice of choices) {
    const u = unit(input, choice.unit);
    if (u.side !== side) throw new Error(`${u.name} does not recover for the ${side}`);
    if (!isSurvivor(u)) throw new Error('only standing units or survivors in camp can recover overnight');
    if (seen.has(u.id)) throw new Error('a unit may attempt recovery only once per night');
    if (choice.activity !== 'rally' && choice.activity !== 'treat') throw new Error('unknown recovery activity');
    if ((choice.activity === 'rally' ? u.disorder : u.wounds) <= 0) throw new Error('the unit has nothing to recover');
    seen.add(u.id);
  }
  const state = clone(input);
  const penalty = recoveryPenalty(choices.length);
  const results: NightRecovery[] = [];
  state.night = { ...(state.night ?? {}), [side]: results };
  // Earlier saves may contain decisions made before recovery. Choose again with the results.
  state.dayOrders = undefined;
  state.log.push({ round: state.round, text: `Night ${state.day}. The ${side} declares ${choices.length} ${choices.length === 1 ? 'recovery' : 'recoveries'} (${-penalty}).` });
  for (const u of state.units) {
    // Keep losses in the report and campaign handoff, but remove routed survivors from play.
    if (u.status === 'active' && !isStanding(u)) u.status = 'left';
    clearCombatEffects(u);
  }
  for (const choice of choices) {
    const u = unit(state, choice.unit);
    const modifier = (choice.activity === 'rally' ? u.stats.will : u.stats.fortitude) - u.disorder - penalty;
    const result = check(rng, modifier, recoveryDc(input, choice));
    const amount = successes(result.degree);
    const field = choice.activity === 'rally' ? 'disorder' : 'wounds';
    const recovered = Math.min(u[field], amount);
    u[field] -= recovered;
    results.push({ ...choice, check: result, penalty, recovered });
    state.log.push({ round: state.round, unit: u.id, check: result,
      text: `${rollLine(u.name, choice.activity === 'rally' ? 'night Rally check' : 'check to treat its wounded', result)} Restores ${recovered} ${choice.activity === 'rally' ? 'morale' : 'health'}.` });
  }
  return state;
}

function clearCombatEffects(u: Unit) {
  u.actions = ACTIONS_PER_ACTIVATION;
  u.attacked = false;
  u.feet = 0;
  u.castTrees = [];
  u.guard = null;
  u.rooted = 0;
  u.exposed = false;
  u.inspired = false;
  u.suppressedBy = null;
  u.pinnedBy = null;
  u.frightened = false;
  u.stunned = false;
  u.persistent = null;
  u.sureStrike = false;
  u.wrath = false;
  u.haste = 0;
  u.ward = false;
  u.stoneskin = false;
  u.aegis = null;
  u.selfBuffs = [];
  u.movementBonus = 0;
  u.sureFooting = false;
  u.flies = false;
}

/** Emplacements retain their position and owner; mobile survivors redeploy at home. */
export function deploymentCells(state: BattleState, u: Unit): string[] {
  const engines = new Set(state.engines.map((e) => notation(e.square)));
  return [...gridOf(state.board).cells()]
    .filter((sq) => canDeploy(state.board, u.side, u.tactics.includes('ambush'), sq)
      && !engines.has(notation(sq)))
    .sort((a, b) => (u.side === 'attacker' ? a.rank - b.rank : b.rank - a.rank)
      || Math.abs(a.file - (state.board.squares.length - 1) / 2) - Math.abs(b.file - (state.board.squares.length - 1) / 2))
    .map(notation);
}

export function suggestDeployment(state: BattleState): Record<string, string> {
  const positions: Record<string, string> = {};
  const occupied = new Set<string>();
  // Place units with the fewest legal cells first so ambushers leave room for the line.
  const survivors = state.units.filter(isSurvivor).sort((a, b) => deploymentCells(state, a).length - deploymentCells(state, b).length);
  for (const u of survivors) {
    const cell = deploymentCells(state, u).find((n) => !occupied.has(n));
    if (cell) { positions[u.id] = cell; occupied.add(cell); }
  }
  return positions;
}

/** Preview deployment without changing today's board or committing a move. Only mobile
 * engines still with a standing crew travel; fixed and abandoned equipment stays behind. */
export function nextDayBattlefield(input: BattleState): BattleState {
  const state = clone(input);
  if (!state.nextBoard) return state;
  state.board = clone(state.nextBoard);
  state.engines = [];
  for (const u of state.units) u.engines = u.engines.filter((e) => isSurvivor(u) && e.status === 'crewed');
  return state;
}

export function startNextDay(input: BattleState, positions: Record<string, string>): BattleState {
  if (!canPrepareNextDay(input)) throw new Error('resolve recovery and confirm both holds before starting another day');
  const state = nextDayBattlefield(input);
  if (input.nextBoard) {
    state.previousBattlefields = [...(state.previousBattlefields ?? []), {
      day: input.day, board: clone(input.board),
      engines: clone([...input.engines, ...input.units.flatMap((u) => u.engines.filter((e) => !isSurvivor(u) || e.status !== 'crewed'))]),
    }];
  }
  const taken = new Set<string>();
  for (const u of state.units.filter(isSurvivor)) {
    const cell = positions[u.id];
    if (!cell || !deploymentCells(state, u).includes(cell)) throw new Error(`${u.name} needs a legal deployment cell`);
    if (taken.has(cell)) throw new Error(`${cell} is already occupied`);
    taken.add(cell);
    u.status = 'active';
    u.square = parse(cell);
    for (const e of u.engines) if (e.status === 'crewed') { e.square = clone(u.square); e.fired = false; }
  }
  for (const e of state.engines) {
    e.fired = false;
    e.status = crewOf(state, e) ? 'crewed' : 'abandoned';
  }
  state.day++;
  const changedMap = !!state.nextBoard;
  state.nextBoard = null;
  state.round = 1;
  delete state.board.siegeFields;
  state.phase = 'battle';
  state.winner = null;
  state.endedBy = null;
  state.night = null;
  state.dayOrders = undefined;
  state.active = null;
  state.begun = false;
  state.activated = [];
  state.lastSide = null;
  state.order = state.units.filter(isStanding).map((u) => u.id);
  const survivors = state.units.filter(isStanding);
  const attackers = survivors.filter((u) => u.side === 'attacker').length;
  state.pending = attackers >= survivors.length - attackers ? 'attacker' : 'defender';
  state.log.push({ round: 1, text: `Day ${state.day}. ${changedMap ? 'The armies meet on a new battlefield. ' : ''}Round 1 begins.` });
  return state;
}

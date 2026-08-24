import {
  at, barrierBetween, deployRanks, edgeKey, gridOf, notation, parse, SIZE,
  type Board, type Square, type Wall,
} from './board.js';
import { cardTraits, deriveStats, type SiegeEngineCard, type UnitCard } from './cards.js';
import { check, succeeded, type CheckResult, type Degree } from './check.js';
import type { Rng } from './rng.js';
import {
  ACTIONS_PER_TURN, LAST_ROUND, MAP_STEP, MAX_WOUNDS, REACH_RANK, ROUTED_AT,
  type Action, type ActionKind, type ActionOption, type BattleState, type Range, type Side, type TargetKind, type Unit,
} from './types.js';
import { levelDc } from './tables.js';

export interface Deployment { card: UnitCard; side: Side; square: string; engines?: SiegeEngineCard[]; }

export interface BattleSetup { units: Deployment[]; board: Board; }

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const otherSide = (s: Side): Side => (s === 'attacker' ? 'defender' : 'attacker');
export const homeRank = (s: Side) => (s === 'attacker' ? 0 : SIZE - 1);

export const sameSquare = (a: Square, b: Square) => a.file === b.file && a.rank === b.rank;

const grid = (state: BattleState) => gridOf(state.board);
const dist = (state: BattleState, a: Square, b: Square) => grid(state).distance(a, b);

export function canDeploy(board: Board, side: Side, ambush: boolean, sq: Square): boolean {
  return gridOf(board).inBounds(sq) && deployRanks(side, ambush).includes(sq.rank) && at(board, sq).terrain !== 'water';
}

export function createBattle(setup: BattleSetup, rng: Rng): BattleState {
  const taken = new Set<string>();
  const units: Unit[] = setup.units.map((d, i) => {
    const traits = cardTraits(d.card);
    const sq = parse(d.square);
    if (!canDeploy(setup.board, d.side, traits.tactics.includes('ambush'), sq)) throw new Error(`${d.card.name} cannot deploy on ${d.square}`);
    if (taken.has(d.square)) throw new Error(`${d.square} is already occupied`);
    taken.add(d.square);
    const stats = deriveStats(d.card);
    return {
      id: `u${i}`, name: d.card.name, side: d.side, level: d.card.level, role: d.card.role, stats,
      pace: traits.pace, fear: traits.fear, tactics: traits.tactics,
      engines: (d.engines ?? []).map((e) => ({ name: e.name, kind: e.kind, launch: e.launch, reach: e.reach, fired: false, status: 'crewed', square: sq })),
      square: sq, wounds: d.card.wounds ?? 0, shaken: d.card.shaken ?? 0, status: 'active',
      initiative: 0, braced: false, exposed: false, reactionUsed: false, attacks: 0, shieldBlockUsed: false,
      routImmune: false, feinted: false, defendedBy: null, suppressed: false, medicineReceived: false,
      woundedThisRound: false,
    };
  });
  const state: BattleState = {
    units, order: [], round: 1, activeIndex: 0, actionsLeft: ACTIONS_PER_TURN,
    board: clone(setup.board),
    phase: 'battle', winner: null, endedBy: null,
    startingCount: { attacker: count(units, 'attacker'), defender: count(units, 'defender') },
    halfChecked: { attacker: false, defender: false },
    log: [],
  };
  for (const u of units) {
    const roll = rng.d20();
    u.initiative = roll + u.stats.perception;
    state.log.push({ round: 0, unit: u.id, text: `${u.name} rolls initiative ${u.initiative} (${roll} + ${u.stats.perception}).` });
  }
  state.order = [...units]
    .sort((a, b) => b.initiative - a.initiative || b.stats.perception - a.stats.perception || a.name.localeCompare(b.name))
    .map((u) => u.id);
  state.log.push({ round: 1, text: 'Round 1 begins.' });
  beginActivation(state, rng);
  return state;
}

const count = (units: Unit[], side: Side) => units.filter((u) => u.side === side).length;

export const unit = (state: BattleState, id: string): Unit => {
  const u = state.units.find((x) => x.id === id);
  if (!u) throw new Error(`no unit ${id}`);
  return u;
};

export const activeUnit = (state: BattleState): Unit | null =>
  state.phase === 'battle' ? unit(state, state.order[state.activeIndex]) : null;

export const isStanding = (u: Unit) => u.status === 'active' && u.shaken < ROUTED_AT;
export const isRouted = (u: Unit) => u.status === 'active' && u.shaken >= ROUTED_AT;
export const isWeakened = (u: Unit) => u.wounds >= 2;
export const isBroken = (u: Unit) => u.wounds >= 3;

export const unitAt = (state: BattleState, sq: Square): Unit | undefined =>
  state.units.find((u) => u.status === 'active' && sameSquare(u.square, sq));

const square = (state: BattleState, u: Unit) => at(state.board, u.square);
const elevation = (state: BattleState, u: Unit) => square(state, u).elevation;

export function isEngaged(state: BattleState, a: Unit, b: Unit): boolean {
  if (a.side === b.side || a.status !== 'active' || b.status !== 'active') return false;
  if (dist(state, a.square, b.square) !== 1) return false;
  return barrierBetween(state.board, a.square, b.square)?.kind !== 'cliff';
}

export const engagedEnemies = (state: BattleState, u: Unit) =>
  state.units.filter((e) => isEngaged(state, u, e));

export const wallBetween = (state: BattleState, a: Unit, b: Unit): Wall | null => {
  const barrier = barrierBetween(state.board, a.square, b.square);
  return barrier?.kind === 'wall' ? barrier.wall : null;
};

export function rangeBetween(state: BattleState, a: Unit, b: Unit): Range {
  if (isEngaged(state, a, b)) return 'engaged';
  const d = dist(state, a.square, b.square);
  return d <= 2 ? 'close' : d === 3 ? 'long' : 'extreme';
}

export function isOutflanked(state: BattleState, u: Unit): boolean {
  if (u.defendedBy && unit(state, u.defendedBy).status === 'active') return false;
  return u.feinted || engagedEnemies(state, u).length >= 2;
}

// Walls belong to the defender: a defender beside a standing segment is garrisoned.
export function standingWalls(state: BattleState, u: Unit): Wall[] {
  if (u.side !== 'defender') return [];
  return grid(state).neighbours(u.square)
    .map((n) => state.board.walls[edgeKey(u.square, n)])
    .filter((w): w is Wall => !!w && w.remaining > 0);
}

export const garrisoned = (state: BattleState, u: Unit) => standingWalls(state, u).length > 0;

export const holdsHighGround = (state: BattleState, u: Unit) => {
  const engaged = engagedEnemies(state, u);
  return engaged.length > 0 && engaged.every((e) => elevation(state, e) < elevation(state, u));
};

export function defenceOf(state: BattleState, target: Unit, attacker: Unit | null, vsVolley: boolean): number {
  let circumstance = 0;
  if (target.braced) circumstance = Math.max(circumstance, target.tactics.includes('raise-shields') ? 3 : 2);
  const downhill = attacker ? elevation(state, attacker) > elevation(state, target) : false;
  if (vsVolley && square(state, target).terrain === 'forest' && !downhill) circumstance = Math.max(circumstance, 1);
  let penalty = 0;
  if (isOutflanked(state, target)) penalty += 2;
  if (target.exposed) penalty += 2;
  return target.stats.defence + circumstance - penalty;
}

export function reachOf(state: BattleState, u: Unit): number {
  if (u.stats.volley === null || u.stats.reach === null) return 0;
  return REACH_RANK[u.stats.reach] - (isWeakened(u) ? 1 : 0);
}

const rangeRank = (r: Range) => (r === 'close' ? 1 : r === 'long' ? 2 : r === 'extreme' ? 3 : 0);

function volleyRank(state: BattleState, u: Unit, target: Unit): number {
  const d = dist(state, u.square, target.square);
  const rank = d <= 2 ? 1 : d === 3 ? 2 : 3;
  return elevation(state, u) > elevation(state, target) ? rank - 1 : rank;
}

export function strikeModifier(state: BattleState, u: Unit, target: Unit): number {
  let m = u.stats.strike ?? 0;
  if (isWeakened(u)) m -= 2;
  m -= u.shaken;
  if (u.suppressed) m -= 2;
  if (square(state, u).terrain === 'swamp' || square(state, u).terrain === 'shallows') m -= 1;
  m -= Math.max(0, elevation(state, target) - elevation(state, u));
  if (u.side === 'attacker' && wallBetween(state, u, target)) m -= 2;
  return m;
}

export function volleyModifier(state: BattleState, u: Unit, target: Unit): number {
  let m = u.stats.volley ?? 0;
  if (isWeakened(u)) m -= 2;
  m -= u.shaken;
  if (volleyRank(state, u, target) >= 3) m -= 2;
  m -= Math.max(0, elevation(state, target) - elevation(state, u));
  if (state.units.some((a) => a.side === u.side && a.id !== u.id && isEngaged(state, target, a))) m -= 4;
  if (garrisoned(state, u)) m += 1;
  return m;
}

export function routDc(state: BattleState, u: Unit): number {
  const enemies = state.units.filter((e) => e.side !== u.side && e.status === 'active');
  const near = enemies.filter((e) => rangeRank(rangeBetween(state, u, e)) <= 1);
  const pool = near.length ? near : enemies;
  const top = pool.reduce<Unit | null>((best, e) => (!best || e.level > best.level ? e : best), null);
  if (!top) return levelDc(0);
  const ground = garrisoned(state, u) || holdsHighGround(state, u) ? 2 : 0;
  return levelDc(top.level) + (top.fear ? 2 : 0) - ground;
}

const log = (state: BattleState, u: Unit | null, text: string, c?: CheckResult) =>
  state.log.push({ round: state.round, unit: u?.id, text, check: c });

const degreeWord: Record<Degree, string> = {
  'critical-failure': 'critical failure', failure: 'failure', success: 'success', 'critical-success': 'critical success',
};

function applyWounds(state: BattleState, target: Unit, n: number, source: string) {
  if (n > 0 && target.tactics.includes('shield-block') && !target.shieldBlockUsed && !target.reactionUsed) {
    target.shieldBlockUsed = true;
    target.reactionUsed = true;
    n -= 1;
    log(state, target, `${target.name} blocks with shields and takes one wound less.`);
  }
  if (n <= 0) return;
  target.wounds = Math.min(MAX_WOUNDS, target.wounds + n);
  target.woundedThisRound = true;
  const state_ = target.wounds >= MAX_WOUNDS ? 'destroyed' : isBroken(target) ? 'Broken' : isWeakened(target) ? 'Weakened' : '';
  log(state, target, `${target.name} takes ${n} wound${n > 1 ? 's' : ''} from ${source} (${target.wounds}/${MAX_WOUNDS})${state_ ? ` — ${state_}` : ''}.`);
  if (target.wounds >= MAX_WOUNDS) { target.status = 'destroyed'; abandonEngines(state, target); }
}

function abandonEngines(state: BattleState, u: Unit) {
  for (const e of u.engines) {
    if (e.status !== 'crewed') continue;
    e.status = 'abandoned';
    e.square = u.square;
    log(state, u, `${u.name} abandons its ${e.name} on ${notation(e.square)}.`);
  }
}

function addShaken(state: BattleState, u: Unit, n: number, why: string) {
  if (n === 0) return;
  u.shaken = Math.max(0, Math.min(ROUTED_AT, u.shaken + n));
  const routed = u.shaken >= ROUTED_AT ? ' — routed' : '';
  log(state, u, `${u.name} is shaken ${u.shaken} (${n > 0 ? '+' : ''}${n}, ${why})${routed}.`);
  if (u.shaken >= ROUTED_AT) abandonEngines(state, u);
}

function resolveStrike(state: BattleState, rng: Rng, u: Unit, target: Unit, opts: { bonus?: number; free?: boolean; label: string }) {
  const map = opts.free ? 0 : u.attacks * MAP_STEP;
  if (!opts.free) u.attacks += 1;
  const c = check(rng, strikeModifier(state, u, target) + (opts.bonus ?? 0) - map, defenceOf(state, target, u, false));
  log(state, u, `${u.name} ${opts.label} ${target.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
  if (c.degree === 'critical-success') applyWounds(state, target, opts.free ? 1 : 2, u.name);
  else if (c.degree === 'success') applyWounds(state, target, 1, u.name);
  else if (c.degree === 'critical-failure' && !opts.free) {
    u.exposed = true;
    log(state, u, `${u.name} is exposed (−2 Defence) until its next activation.`);
  }
  return c;
}

function resolveVolley(state: BattleState, rng: Rng, u: Unit, target: Unit, label: string) {
  const map = u.attacks * MAP_STEP;
  u.attacks += 1;
  const c = check(rng, volleyModifier(state, u, target) - map, defenceOf(state, target, u, true));
  log(state, u, `${u.name} ${label} ${target.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
  if (c.degree === 'critical-success') applyWounds(state, target, 2, `${u.name}'s volley`);
  else if (c.degree === 'success') applyWounds(state, target, 1, `${u.name}'s volley`);
  return c;
}

function reactionsOnEntry(state: BattleState, rng: Rng, mover: Unit) {
  for (const e of engagedEnemies(state, mover)) {
    if (e.reactionUsed || mover.status !== 'active') continue;
    if (e.tactics.includes('reactive-attack')) { e.reactionUsed = true; resolveStrike(state, rng, e, mover, { free: true, label: 'reacts and strikes' }); }
    else if (e.braced) { e.reactionUsed = true; resolveStrike(state, rng, e, mover, { free: true, label: 'strikes from its brace at' }); }
  }
}

function reactionsOnLeaving(state: BattleState, rng: Rng, mover: Unit) {
  for (const e of engagedEnemies(state, mover)) {
    if (e.reactionUsed || mover.status !== 'active') continue;
    e.reactionUsed = true;
    resolveStrike(state, rng, e, mover, { free: true, label: 'strikes the withdrawing' });
    if (mover.tactics.includes('false-retreat')) {
      e.feinted = true;
      log(state, mover, `${mover.name}'s false retreat leaves ${e.name} outflanked until end of round.`);
    }
  }
}

const enterable = (state: BattleState, from: Square, to: Square) =>
  grid(state).inBounds(to) && at(state.board, to).terrain !== 'water' && !unitAt(state, to) && barrierBetween(state.board, from, to) === null;

const slow = (state: BattleState, sq: Square) => ['swamp', 'shallows'].includes(at(state.board, sq).terrain);
const uphill = (state: BattleState, from: Square, to: Square) => at(state.board, to).elevation > at(state.board, from).elevation;
const fast = (state: BattleState, from: Square, to: Square) =>
  ['open', 'settlement'].includes(at(state.board, to).terrain) && !uphill(state, from, to);

const adjacentEnemy = (state: BattleState, u: Unit, sq: Square) =>
  state.units.some((e) => e.side !== u.side && e.status === 'active' && dist(state, e.square, sq) === 1 && barrierBetween(state.board, e.square, sq)?.kind !== 'cliff');

// Squares one Advance away: every enterable neighbour; for Pace units on fast, level ground,
// a second cell continuing in the same direction, as long as the first does not already
// engage an enemy.
export function advanceTargets(state: BattleState, u: Unit): { square: Square; cost: number }[] {
  const g = grid(state);
  const out: { square: Square; cost: number }[] = [];
  for (const n of g.neighbours(u.square)) {
    if (!enterable(state, u.square, n)) continue;
    out.push({ square: n, cost: slow(state, n) ? 2 : 1 });
    if (!u.pace || !fast(state, u.square, n) || adjacentEnemy(state, u, n)) continue;
    const beyond = g.beyond(u.square, n);
    if (beyond && enterable(state, n, beyond) && fast(state, n, beyond)) out.push({ square: beyond, cost: 1 });
  }
  return out;
}

export function withdrawTargets(state: BattleState, u: Unit): Square[] {
  const g = grid(state);
  const engaged = engagedEnemies(state, u);
  const options = engaged.length ? g.neighbours(u.square) : g.homeward(u.square, u.side);
  return options.filter((n) => enterable(state, u.square, n)
    && engaged.every((e) => g.distance(e.square, n) > 1));
}

const sq = (s: string) => parse(s);

function moveTo(state: BattleState, u: Unit, to: Square) {
  u.square = to;
  for (const e of u.engines) if (e.status === 'crewed') e.square = to;
}

function leaveField(state: BattleState, u: Unit) {
  u.status = 'left';
  log(state, u, `${u.name} leaves the field.`);
}

// A retreating unit steps homeward twice; from its home rank the second step leaves the field.
function retreat(state: BattleState, rng: Rng, u: Unit, chosen: Square | null) {
  if (engagedEnemies(state, u).length) reactionsOnLeaving(state, rng, u);
  if (u.status !== 'active') return;
  const first = chosen && !sameSquare(chosen, u.square) ? chosen : withdrawTargets(state, u)[0] ?? null;
  if (!first) {
    if (u.square.rank === homeRank(u.side)) leaveField(state, u);
    else log(state, u, `${u.name} has nowhere to retreat.`);
    return;
  }
  moveTo(state, u, first);
  if (u.square.rank === homeRank(u.side)) { leaveField(state, u); return; }
  const second = grid(state).homeward(u.square, u.side).find((n) => enterable(state, u.square, n) && !adjacentEnemy(state, u, n))
    ?? withdrawTargets(state, u).find((n) => !adjacentEnemy(state, u, n));
  if (second) moveTo(state, u, second);
  log(state, u, `${u.name} retreats to ${notation(u.square)}.`);
}

const wallKeys = (state: BattleState) => Object.entries(state.board.walls).filter(([, w]) => w.remaining > 0).map(([k]) => k);
const bordersWall = (u: Unit, key: string) => key.split('|').some((n) => sameSquare(parse(n), u.square));

export function availableActions(state: BattleState): ActionOption[] {
  const u = activeUnit(state);
  if (!u || u.status !== 'active') return [];
  const left = state.actionsLeft;
  const engaged = engagedEnemies(state, u);
  const enemies = state.units.filter((e) => e.side !== u.side && e.status === 'active');
  const adjacentAllies = state.units.filter((a) => a.side === u.side && a.id !== u.id && a.status === 'active' && dist(state, a.square, u.square) === 1);
  const opts: ActionOption[] = [];
  const add = (kind: ActionKind, cost: number, targetKind: TargetKind | null, targets: string[] | null, label: string, engine?: number) => {
    if (cost <= left && (targets === null || targets.length)) opts.push({ kind, cost, targetKind, targets, label, engine });
  };
  const inShallows = square(state, u).terrain === 'shallows';
  const pinned = engaged.length > 0 && inShallows;
  const withdraws = withdrawTargets(state, u).map(notation);
  if (isRouted(u)) {
    if (!pinned) add('retreat', 2, 'square', withdraws.length ? withdraws : [notation(u.square)], 'Retreat (routed)');
    add('pass', left, null, null, 'End activation');
    return opts;
  }
  const advances = engaged.length === 0 && !isBroken(u) ? advanceTargets(state, u) : [];
  for (const cost of [1, 2]) {
    const targets = advances.filter((a) => a.cost === cost).map((a) => notation(a.square));
    add('advance', cost, 'square', targets, cost === 2 ? 'Advance into slow ground' : 'Advance');
  }
  if (!pinned) add('withdraw', engaged.length ? 2 : 1, 'square', withdraws, engaged.length ? 'Withdraw from melee' : 'Withdraw');
  if (!pinned) add('retreat', 2, 'square', withdraws.length ? withdraws : [notation(u.square)], 'Retreat');
  if (u.stats.strike !== null) add('strike', 1, 'unit', engaged.map((e) => e.id), u.attacks ? `Strike (−${u.attacks * MAP_STEP})` : 'Strike');
  const volleyTargets = engaged.length || u.stats.volley === null ? [] : enemies.filter((e) => volleyRank(state, u, e) <= reachOf(state, u)).map((e) => e.id);
  add('volley', 1, 'unit', volleyTargets, u.attacks ? `Volley (−${u.attacks * MAP_STEP})` : 'Volley');
  add('brace', 1, null, null, 'Brace');
  if (u.shaken > 0) add('rally', 1, null, null, 'Rally');
  const has = (t: string) => u.tactics.includes(t as never);
  if (has('cavalry-charge') && u.pace && advances.length && u.attacks === 0) {
    const charges = advances
      .filter((a) => a.cost === 1 && fast(state, u.square, a.square) && dist(state, a.square, u.square) === 1)
      .flatMap((a) => enemies.filter((e) => dist(state, e.square, a.square) === 1 && barrierBetween(state.board, e.square, a.square) === null).map((e) => `${notation(a.square)}>${e.id}`));
    add('cavalry-charge', 2, 'unit', [...new Set(charges)], 'Cavalry charge');
  }
  if (has('feint')) add('feint', 1, 'unit', engaged.map((e) => e.id), 'Feint');
  if (has('dirty-fighting')) add('dirty-fighting', 1, 'unit', engaged.filter((e) => isOutflanked(state, e)).map((e) => e.id), 'Dirty fighting');
  if (has('demoralize')) add('demoralize', 1, 'unit', enemies.filter((e) => rangeRank(rangeBetween(state, u, e)) <= 1).map((e) => e.id), 'Demoralize');
  if (has('covering-fire')) add('covering-fire', 1, 'unit', volleyTargets, 'Covering fire');
  if (has('defend-allies')) add('defend-allies', 1, 'unit', adjacentAllies.map((a) => a.id), 'Defend an ally');
  if (has('battlefield-medicine')) add('battlefield-medicine', 2, 'unit', adjacentAllies.filter((a) => a.wounds > 0 && !a.medicineReceived).map((a) => a.id), 'Battlefield medicine');
  u.engines.forEach((e, i) => {
    if (e.status !== 'crewed' || e.fired) return;
    if (e.kind === 'artillery' && !engaged.length) {
      const targets = enemies.filter((t) => rangeRank(rangeBetween(state, u, t)) <= (e.reach ? REACH_RANK[e.reach] : 0)).map((t) => t.id);
      add('fire-engine', 1, 'unit', targets, `Fire ${e.name}`, i);
    }
    if (u.side === 'attacker') {
      const walls = wallKeys(state).filter((k) => e.kind === 'artillery' ? !engaged.length : bordersWall(u, k));
      add('engine-bombard', 1, 'wall', walls, `${e.kind === 'ram' ? 'Ram' : 'Bombard'} a wall with ${e.name}`, i);
    }
  });
  add('pass', left, null, null, 'End activation');
  return opts;
}

export function act(input: BattleState, action: Action, rng: Rng): BattleState {
  const state = clone(input);
  const u = activeUnit(state);
  if (!u) throw new Error('battle is over');
  const opt = availableActions(state).find((o) => o.kind === action.kind
    && (o.engine === undefined || o.engine === action.engine)
    && (!o.targets || (action.target !== undefined && o.targets.includes(action.target))));
  if (!opt) throw new Error(`${action.kind}${action.target ? ` on ${action.target}` : ''} is not available`);
  const target = opt.targetKind === 'unit' && action.target && !action.target.includes('>') ? unit(state, action.target) : null;

  switch (action.kind) {
    case 'advance': {
      moveTo(state, u, sq(action.target!));
      log(state, u, `${u.name} advances to ${action.target}.`);
      reactionsOnEntry(state, rng, u);
      break;
    }
    case 'withdraw': {
      if (engagedEnemies(state, u).length) reactionsOnLeaving(state, rng, u);
      if (u.status === 'active') {
        moveTo(state, u, sq(action.target!));
        log(state, u, `${u.name} withdraws to ${action.target}.`);
      }
      break;
    }
    case 'retreat':
      retreat(state, rng, u, action.target ? sq(action.target) : null);
      break;
    case 'strike':
      resolveStrike(state, rng, u, target!, { label: 'strikes' });
      break;
    case 'volley':
      resolveVolley(state, rng, u, target!, 'volleys');
      break;
    case 'covering-fire': {
      const c = resolveVolley(state, rng, u, target!, 'lays covering fire on');
      if (succeeded(c.degree) && target!.status === 'active') {
        target!.suppressed = true;
        log(state, u, `${target!.name} is suppressed (−2 to Strike) until its next activation.`);
      }
      break;
    }
    case 'fire-engine': {
      const e = u.engines[action.engine!];
      e.fired = true;
      const c = check(rng, e.launch - u.shaken - (isWeakened(u) ? 2 : 0), defenceOf(state, target!, u, true));
      log(state, u, `${u.name} fires its ${e.name} at ${target!.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
      if (c.degree === 'critical-success') applyWounds(state, target!, 2, e.name);
      else if (c.degree === 'success') applyWounds(state, target!, 1, e.name);
      break;
    }
    case 'engine-bombard': {
      const e = u.engines[action.engine!];
      e.fired = true;
      const wall = state.board.walls[action.target!];
      const dc = 10 + wall.tier + Math.max(0, ...state.units.filter((d) => d.side === 'defender' && d.status === 'active').map((d) => d.level));
      const c = check(rng, e.launch + (e.kind === 'ram' ? 2 : 0) - u.shaken - (isWeakened(u) ? 2 : 0), dc);
      log(state, u, `${u.name} ${e.kind === 'ram' ? 'rams' : 'bombards'} the wall ${action.target} with its ${e.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
      const hits = c.degree === 'critical-success' ? 2 : c.degree === 'success' ? 1 : 0;
      if (hits) {
        wall.remaining = Math.max(0, wall.remaining - hits);
        log(state, u, wall.remaining ? `The wall holds ${wall.remaining}/${wall.boxes}.` : `The wall at ${action.target} is breached.`);
      }
      break;
    }
    case 'brace':
      u.braced = true;
      log(state, u, `${u.name} braces.`);
      break;
    case 'rally': {
      const c = check(rng, u.stats.will - u.shaken, routDc(state, u));
      log(state, u, `${u.name} rallies: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
      const delta = c.degree === 'critical-success' ? -2 : c.degree === 'success' ? -1 : c.degree === 'critical-failure' ? 1 : 0;
      addShaken(state, u, delta, 'rally');
      break;
    }
    case 'cavalry-charge': {
      const [to, enemyId] = action.target!.split('>');
      const enemy = unit(state, enemyId);
      const from = u.square;
      moveTo(state, u, sq(to));
      log(state, u, `${u.name} charges to ${to}.`);
      reactionsOnEntry(state, rng, u);
      const downhill = at(state.board, from).elevation > elevation(state, enemy);
      if (u.status === 'active' && enemy.status === 'active') resolveStrike(state, rng, u, enemy, { bonus: downhill ? 3 : 2, label: 'charges into' });
      break;
    }
    case 'feint': {
      const c = check(rng, strikeModifier(state, u, target!), 10 + target!.stats.will);
      log(state, u, `${u.name} feints at ${target!.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
      if (succeeded(c.degree)) { target!.feinted = true; log(state, u, `${target!.name} is outflanked until end of round.`); }
      else if (c.degree === 'critical-failure') { u.feinted = true; log(state, u, `${u.name} is outflanked until end of round.`); }
      break;
    }
    case 'dirty-fighting': {
      const c = resolveStrike(state, rng, u, target!, { label: 'fights dirty against' });
      if (succeeded(c.degree) && target!.status === 'active') {
        const flat = rng.d20();
        log(state, u, `${target!.name} flat check DC 11: ${flat}.`);
        if (flat < 11) addShaken(state, target!, 1, 'dirty fighting');
      }
      break;
    }
    case 'demoralize': {
      const c = check(rng, u.level + u.stats.will - u.shaken, 10 + target!.stats.will);
      log(state, u, `${u.name} demoralizes ${target!.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
      if (c.degree === 'critical-success') addShaken(state, target!, 2, 'demoralized');
      else if (c.degree === 'success') addShaken(state, target!, 1, 'demoralized');
      else if (c.degree === 'critical-failure') addShaken(state, u, 1, 'failed demoralize');
      break;
    }
    case 'defend-allies':
      target!.defendedBy = u.id;
      log(state, u, `${u.name} covers ${target!.name}'s flank until its next activation.`);
      break;
    case 'battlefield-medicine':
      target!.wounds -= 1;
      target!.medicineReceived = true;
      log(state, u, `${u.name} tends ${target!.name}: wounds ${target!.wounds}/${MAX_WOUNDS}.`);
      break;
    case 'pass':
      log(state, u, `${u.name} ends its activation.`);
      break;
  }

  state.actionsLeft -= opt.cost;
  if (state.actionsLeft <= 0 || u.status !== 'active') nextActivation(state, rng);
  return state;
}

function beginActivation(state: BattleState, rng: Rng) {
  const u = activeUnit(state);
  if (!u) return;
  if (u.status !== 'active') { nextActivation(state, rng); return; }
  u.braced = false;
  u.exposed = false;
  u.suppressed = false;
  u.reactionUsed = false;
  u.attacks = 0;
  for (const a of state.units) if (a.defendedBy === u.id) a.defendedBy = null;
  state.actionsLeft = ACTIONS_PER_TURN;
  if (isRouted(u)) {
    log(state, u, `${u.name} is routed and must retreat.`);
    if (engagedEnemies(state, u).length && square(state, u).terrain === 'shallows') log(state, u, `${u.name} is pinned in the shallows.`);
    else retreat(state, rng, u, null);
    nextActivation(state, rng);
  }
}

function nextActivation(state: BattleState, rng: Rng) {
  if (state.phase !== 'battle') return;
  let i = state.activeIndex + 1;
  while (i < state.order.length && unit(state, state.order[i]).status !== 'active') i++;
  if (i >= state.order.length) { endRound(state, rng); return; }
  state.activeIndex = i;
  beginActivation(state, rng);
}

function routCheck(state: BattleState, rng: Rng, u: Unit, why: string) {
  const dc = routDc(state, u);
  const c = check(rng, u.stats.will - u.shaken, dc);
  log(state, u, `${u.name} rout check (${why}): ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
  if (c.degree === 'critical-success') { u.routImmune = true; log(state, u, `${u.name} will not check again this battle.`); }
  else if (c.degree === 'failure') addShaken(state, u, 1, 'rout check');
  else if (c.degree === 'critical-failure') addShaken(state, u, 2, 'rout check');
}

const standing = (state: BattleState, side: Side) => state.units.filter((u) => u.side === side && isStanding(u));

function endRound(state: BattleState, rng: Rng) {
  log(state, null, `End of round ${state.round}.`);
  for (const side of ['attacker', 'defender'] as Side[]) {
    if (state.halfChecked[side]) continue;
    const lost = state.units.filter((u) => u.side === side && !isStanding(u)).length;
    if (lost * 2 >= state.startingCount[side]) {
      state.halfChecked[side] = true;
      for (const u of standing(state, side)) u.woundedThisRound = true;
      log(state, null, `Half of the ${side}'s army is gone; every ${side} unit checks morale.`);
    }
  }
  for (const id of state.order) {
    const u = unit(state, id);
    if (!isStanding(u) || u.routImmune) continue;
    const why = u.woundedThisRound ? (isBroken(u) ? 'wounded and broken' : 'wounded') : isBroken(u) ? 'broken' : null;
    if (why) routCheck(state, rng, u, why);
  }
  for (const u of state.units) {
    u.woundedThisRound = false;
    u.feinted = false;
    u.shieldBlockUsed = false;
    for (const e of u.engines) e.fired = false;
  }
  const a = standing(state, 'attacker').length;
  const d = standing(state, 'defender').length;
  if (a === 0 || d === 0) {
    state.phase = 'ended';
    state.endedBy = 'rout';
    state.winner = a === 0 && d === 0 ? 'draw' : a === 0 ? 'defender' : 'attacker';
    log(state, null, state.winner === 'draw' ? 'Both armies are spent. The field is empty.' : `The ${state.winner} holds the field.`);
    captureEngines(state);
    return;
  }
  if (state.round >= LAST_ROUND) {
    state.phase = 'ended';
    state.endedBy = 'dusk';
    state.winner = 'draw';
    log(state, null, 'Dusk falls. Both armies withdraw and the ground stays contested.');
    return;
  }
  state.round += 1;
  state.activeIndex = -1;
  log(state, null, `Round ${state.round} begins.`);
  nextActivation(state, rng);
}

function captureEngines(state: BattleState) {
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

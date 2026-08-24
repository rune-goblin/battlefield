import { cardTraits, deriveStats, type SiegeEngineCard, type UnitCard } from './cards.js';
import { check, succeeded, type CheckResult, type Degree } from './check.js';
import type { Rng } from './rng.js';
import {
  LAST_ROUND, MAX_WOUNDS, REACH_RANK, ROUTED_AT, STEPS,
  type Action, type ActionKind, type ActionOption, type BattleState, type Range, type Side, type Terrain, type Unit,
} from './types.js';
import { levelDc } from './tables.js';

export interface Deployment { card: UnitCard; side: Side; step: number; engines?: SiegeEngineCard[]; }

export interface BattleSetup { units: Deployment[]; terrain: Terrain; wallsTier?: number; }

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const WALL_DEFENCE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 2 };

export const otherSide = (s: Side): Side => (s === 'attacker' ? 'defender' : 'attacker');
export const edgeOf = (s: Side) => (s === 'attacker' ? 0 : STEPS - 1);
const forward = (s: Side) => (s === 'attacker' ? 1 : -1);

export function deployZone(side: Side, terrain: Terrain, ambush: boolean): number[] {
  if (side === 'attacker') return terrain.river ? [0] : ambush ? [0, 1, 2] : [0, 1];
  return ambush ? [4, 5, 6] : [5, 6];
}

export function createBattle(setup: BattleSetup, rng: Rng): BattleState {
  const units: Unit[] = setup.units.map((d, i) => {
    const traits = cardTraits(d.card);
    const zone = deployZone(d.side, setup.terrain, traits.tactics.includes('ambush'));
    if (!zone.includes(d.step)) throw new Error(`${d.card.name} cannot deploy on step ${d.step}`);
    const stats = deriveStats(d.card);
    return {
      id: `u${i}`, name: d.card.name, side: d.side, level: d.card.level, role: d.card.role, stats,
      pace: traits.pace, fear: traits.fear, tactics: traits.tactics,
      engines: (d.engines ?? []).map((e) => ({ name: e.name, kind: e.kind, launch: e.launch, reach: e.reach, fired: false, status: 'crewed', step: d.step })),
      step: d.step, wounds: d.card.wounds ?? 0, shaken: d.card.shaken ?? 0, status: 'active',
      initiative: 0, braced: false, exposed: false, strikeUsed: false, shieldBlockUsed: false,
      routImmune: false, feinted: false, defendedBy: null, suppressed: false, medicineReceived: false,
      woundedThisRound: false,
    };
  });
  const state: BattleState = {
    units, order: [], round: 1, activeIndex: 0, actionsLeft: 2,
    terrain: setup.terrain,
    walls: setup.wallsTier ? { tier: setup.wallsTier, boxes: setup.wallsTier + 1, remaining: setup.wallsTier + 1 } : null,
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
export const wallsStand = (state: BattleState) => !!state.walls && state.walls.remaining > 0;

export function isEngaged(state: BattleState, a: Unit, b: Unit): boolean {
  if (a.side === b.side || a.status !== 'active' || b.status !== 'active') return false;
  if (a.step === b.step) return true;
  if (!wallsStand(state)) return false;
  const [att, def] = a.side === 'attacker' ? [a, b] : [b, a];
  return att.step === STEPS - 2 && def.step === STEPS - 1;
}

export const engagedEnemies = (state: BattleState, u: Unit) =>
  state.units.filter((e) => isEngaged(state, u, e));

export function rangeBetween(state: BattleState, a: Unit, b: Unit): Range {
  if (isEngaged(state, a, b)) return 'engaged';
  const d = Math.abs(a.step - b.step);
  return d <= 1 ? 'close' : d === 2 ? 'long' : 'extreme';
}

export function isOutflanked(state: BattleState, u: Unit): boolean {
  if (u.defendedBy && unit(state, u.defendedBy).status === 'active') return false;
  return u.feinted || engagedEnemies(state, u).length >= 2;
}

const garrisoned = (state: BattleState, u: Unit) =>
  u.side === 'defender' && u.step === STEPS - 1 && wallsStand(state);

export function defenceOf(state: BattleState, target: Unit, vsVolley: boolean): number {
  let circumstance = 0;
  if (target.braced) circumstance = Math.max(circumstance, target.tactics.includes('raise-shields') ? 3 : 2);
  if (vsVolley && state.terrain.cover && target.side === 'defender') circumstance = Math.max(circumstance, 1);
  if (garrisoned(state, target)) circumstance = Math.max(circumstance, WALL_DEFENCE[state.walls!.tier] ?? 2);
  let penalty = 0;
  if (isOutflanked(state, target)) penalty += 2;
  if (target.exposed) penalty += 2;
  return target.stats.defence + circumstance - penalty;
}

export function reachOf(u: Unit): number {
  if (u.stats.volley === null || u.stats.reach === null) return 0;
  return REACH_RANK[u.stats.reach] - (isWeakened(u) ? 1 : 0);
}

const rangeRank = (r: Range) => (r === 'close' ? 1 : r === 'long' ? 2 : r === 'extreme' ? 3 : 0);

export function strikeModifier(state: BattleState, u: Unit, target: Unit): number {
  let m = u.stats.strike ?? 0;
  if (isWeakened(u)) m -= 2;
  m -= u.shaken;
  if (u.suppressed) m -= 2;
  if (u.side === 'attacker' && garrisoned(state, target)) m -= 2;
  return m;
}

export function volleyModifier(state: BattleState, u: Unit, target: Unit): number {
  let m = u.stats.volley ?? 0;
  if (isWeakened(u)) m -= 2;
  m -= u.shaken;
  if (rangeBetween(state, u, target) === 'extreme') m -= 2;
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
  return levelDc(top.level) + (top.fear ? 2 : 0) - (garrisoned(state, u) ? 2 : 0);
}

const log = (state: BattleState, u: Unit | null, text: string, c?: CheckResult) =>
  state.log.push({ round: state.round, unit: u?.id, text, check: c });

const degreeWord: Record<Degree, string> = {
  'critical-failure': 'critical failure', failure: 'failure', success: 'success', 'critical-success': 'critical success',
};

function applyWounds(state: BattleState, target: Unit, n: number, source: string) {
  if (n > 0 && target.tactics.includes('shield-block') && !target.shieldBlockUsed) {
    target.shieldBlockUsed = true;
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
    e.step = u.step;
    log(state, u, `${u.name} abandons its ${e.name} on step ${e.step}.`);
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
  u.strikeUsed = true;
  const c = check(rng, strikeModifier(state, u, target) + (opts.bonus ?? 0), defenceOf(state, target, false));
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
  const c = check(rng, volleyModifier(state, u, target), defenceOf(state, target, true));
  log(state, u, `${u.name} ${label} ${target.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
  if (c.degree === 'critical-success') applyWounds(state, target, 2, `${u.name}'s volley`);
  else if (c.degree === 'success') applyWounds(state, target, 1, `${u.name}'s volley`);
  return c;
}

function freeStrikesOnEntry(state: BattleState, rng: Rng, mover: Unit) {
  for (const e of engagedEnemies(state, mover)) {
    if (e.strikeUsed || mover.status !== 'active') continue;
    if (e.tactics.includes('reactive-attack')) resolveStrike(state, rng, e, mover, { label: 'reacts and strikes' });
    else if (e.braced) resolveStrike(state, rng, e, mover, { free: true, label: 'strikes from its brace at' });
  }
}

function freeStrikesOnLeaving(state: BattleState, rng: Rng, mover: Unit) {
  for (const e of engagedEnemies(state, mover)) {
    if (e.strikeUsed || mover.status !== 'active') continue;
    resolveStrike(state, rng, e, mover, { free: true, label: 'strikes the withdrawing' });
    if (mover.tactics.includes('false-retreat')) {
      e.feinted = true;
      log(state, mover, `${mover.name}'s false retreat leaves ${e.name} outflanked until end of round.`);
    }
  }
}

function moveTo(state: BattleState, u: Unit, step: number) {
  if (step < 0 || step >= STEPS) {
    u.status = 'left';
    log(state, u, `${u.name} leaves the field.`);
    return;
  }
  u.step = step;
}

const standingOn = (state: BattleState, step: number, side: Side) =>
  state.units.filter((x) => x.status === 'active' && x.side === side && x.step === step);

export function availableActions(state: BattleState): ActionOption[] {
  const u = activeUnit(state);
  if (!u || u.status !== 'active') return [];
  const left = state.actionsLeft;
  const engaged = engagedEnemies(state, u);
  const enemies = state.units.filter((e) => e.side !== u.side && e.status === 'active');
  const allies = state.units.filter((a) => a.side === u.side && a.id !== u.id && a.status === 'active' && a.step === u.step);
  const opts: ActionOption[] = [];
  const add = (kind: ActionKind, cost: number, targets: string[] | null, label: string) => {
    if (cost <= left && (targets === null || targets.length)) opts.push({ kind, cost, targets, label });
  };
  if (isRouted(u)) {
    add('retreat', 2, null, 'Retreat (routed)');
    return opts;
  }
  const dir = forward(u.side);
  const next = u.step + dir;
  const blockedByWalls = u.side === 'attacker' && wallsStand(state) && u.step === STEPS - 2;
  const canAdvance = !isBroken(u) && engaged.length === 0 && next >= 0 && next < STEPS && !blockedByWalls;
  if (canAdvance) add('advance', 1, null, 'Advance');
  if (canAdvance && u.pace && !state.terrain.rough && next + dir >= 0 && next + dir < STEPS && standingOn(state, next, otherSide(u.side)).length === 0)
    add('double-advance', 2, null, 'Advance two steps');
  const riverBound = state.terrain.river && u.side === 'attacker' && engaged.length > 0;
  if (!riverBound) add('withdraw', engaged.length ? 2 : 1, null, engaged.length ? 'Withdraw from melee' : 'Withdraw');
  if (!riverBound) add('retreat', 2, null, 'Retreat');
  if (u.stats.strike !== null && !u.strikeUsed) add('strike', 1, engaged.map((e) => e.id), 'Strike');
  const volleyTargets = engaged.length || u.stats.volley === null ? [] : enemies.filter((e) => rangeRank(rangeBetween(state, u, e)) <= reachOf(u)).map((e) => e.id);
  add('volley', 1, volleyTargets, 'Volley');
  add('brace', 1, null, 'Brace');
  if (u.shaken > 0) add('rally', 1, null, 'Rally');
  const has = (t: string) => u.tactics.includes(t as never);
  if (has('cavalry-charge') && canAdvance && u.pace && !state.terrain.rough && !u.strikeUsed)
    add('cavalry-charge', 2, standingOn(state, next, otherSide(u.side)).map((e) => e.id), 'Cavalry charge');
  if (has('feint')) add('feint', 1, engaged.map((e) => e.id), 'Feint');
  if (has('dirty-fighting') && !u.strikeUsed) add('dirty-fighting', 1, engaged.filter((e) => isOutflanked(state, e)).map((e) => e.id), 'Dirty fighting');
  if (has('demoralize')) add('demoralize', 1, enemies.filter((e) => rangeRank(rangeBetween(state, u, e)) <= 1).map((e) => e.id), 'Demoralize');
  if (has('covering-fire')) add('covering-fire', 1, volleyTargets, 'Covering fire');
  if (has('defend-allies')) add('defend-allies', 1, allies.map((a) => a.id), 'Defend an ally');
  if (has('battlefield-medicine')) add('battlefield-medicine', 2, allies.filter((a) => a.wounds > 0 && !a.medicineReceived).map((a) => a.id), 'Battlefield medicine');
  u.engines.forEach((e, i) => {
    if (e.status !== 'crewed' || e.fired) return;
    if (e.kind === 'artillery' && !engaged.length) {
      const reachRank = e.reach ? REACH_RANK[e.reach] : 0;
      const targets = enemies.filter((t) => rangeRank(rangeBetween(state, u, t)) <= reachRank).map((t) => t.id);
      if (targets.length && left >= 1) opts.push({ kind: 'fire-engine', cost: 1, targets, label: `Fire ${e.name}`, engine: i });
    }
    if (wallsStand(state) && u.side === 'attacker' && left >= 1) {
      const canBombard = e.kind === 'artillery' ? !engaged.length : u.step === STEPS - 2;
      if (canBombard) opts.push({ kind: 'engine-bombard', cost: 1, targets: null, label: `${e.kind === 'ram' ? 'Ram' : 'Bombard'} the walls with ${e.name}`, engine: i });
    }
  });
  add('pass', left, null, 'End activation');
  return opts;
}

export function act(input: BattleState, action: Action, rng: Rng): BattleState {
  const state = clone(input);
  const u = activeUnit(state);
  if (!u) throw new Error('battle is over');
  const opt = availableActions(state).find((o) => o.kind === action.kind && (o.engine === undefined || o.engine === action.engine));
  if (!opt) throw new Error(`${action.kind} is not available`);
  if (opt.targets && (!action.target || !opt.targets.includes(action.target))) throw new Error(`${action.kind} needs a valid target`);
  const target = action.target ? unit(state, action.target) : null;
  const dir = forward(u.side);

  switch (action.kind) {
    case 'advance': {
      moveTo(state, u, u.step + dir);
      log(state, u, `${u.name} advances to step ${u.step}.`);
      freeStrikesOnEntry(state, rng, u);
      break;
    }
    case 'double-advance': {
      moveTo(state, u, u.step + dir);
      moveTo(state, u, u.step + dir);
      log(state, u, `${u.name} advances two steps to step ${u.step}.`);
      freeStrikesOnEntry(state, rng, u);
      break;
    }
    case 'withdraw': {
      if (engagedEnemies(state, u).length) freeStrikesOnLeaving(state, rng, u);
      if (u.status === 'active') {
        moveTo(state, u, u.step - dir);
        if (u.status === 'active') log(state, u, `${u.name} withdraws to step ${u.step}.`);
      }
      break;
    }
    case 'retreat': {
      if (engagedEnemies(state, u).length) freeStrikesOnLeaving(state, rng, u);
      if (u.status === 'active') moveTo(state, u, u.step - dir);
      if (u.status === 'active') moveTo(state, u, u.step - dir);
      if (u.status === 'active') log(state, u, `${u.name} retreats to step ${u.step}.`);
      break;
    }
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
      const c = check(rng, e.launch - u.shaken - (isWeakened(u) ? 2 : 0), defenceOf(state, target!, true));
      log(state, u, `${u.name} fires its ${e.name} at ${target!.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
      if (c.degree === 'critical-success') applyWounds(state, target!, 2, e.name);
      else if (c.degree === 'success') applyWounds(state, target!, 1, e.name);
      break;
    }
    case 'engine-bombard': {
      const e = u.engines[action.engine!];
      e.fired = true;
      const walls = state.walls!;
      const dc = 10 + walls.tier + Math.max(0, ...state.units.filter((d) => d.side === 'defender' && d.status === 'active').map((d) => d.level));
      const c = check(rng, e.launch + (e.kind === 'ram' ? 2 : 0) - u.shaken - (isWeakened(u) ? 2 : 0), dc);
      log(state, u, `${u.name} ${e.kind === 'ram' ? 'rams' : 'bombards'} the walls with its ${e.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
      const hits = c.degree === 'critical-success' ? 2 : c.degree === 'success' ? 1 : 0;
      if (hits) {
        walls.remaining = Math.max(0, walls.remaining - hits);
        log(state, u, walls.remaining ? `The walls hold ${walls.remaining}/${walls.boxes}.` : 'The walls are breached.');
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
      moveTo(state, u, u.step + dir);
      log(state, u, `${u.name} charges to step ${u.step}.`);
      freeStrikesOnEntry(state, rng, u);
      if (u.status === 'active' && target!.status === 'active') resolveStrike(state, rng, u, target!, { bonus: 2, label: 'charges into' });
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
  for (const a of state.units) if (a.defendedBy === u.id) a.defendedBy = null;
  state.actionsLeft = 2;
  if (isRouted(u)) {
    log(state, u, `${u.name} is routed and must retreat.`);
    if (engagedEnemies(state, u).length) freeStrikesOnLeaving(state, rng, u);
    const dir = forward(u.side);
    if (u.status === 'active') moveTo(state, u, u.step - dir);
    if (u.status === 'active') moveTo(state, u, u.step - dir);
    if (u.status === 'active') log(state, u, `${u.name} retreats to step ${u.step}.`);
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
    u.strikeUsed = false;
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
      const captor = state.units.find((c) => c.side !== u.side && isStanding(c) && c.step === e.step);
      if (captor) {
        e.status = 'captured';
        log(state, captor, `${captor.name} captures the ${e.name}.`);
      }
    }
  }
}

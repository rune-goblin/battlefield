import {
  at, barrierBetween, deployRanks, edgeKey, gridOf, notation, parse, SIZE,
  type Board, type Square, type Wall,
} from './board.js';
import { cardTraits, deriveStats, speedOf, type SiegeEngineCard, type UnitCard } from './cards.js';
import { pathTo, reachable, stepFeet } from './path.js';
import { check, type CheckResult, type Degree } from './check.js';
import {
  clearsAll, gradesFor, LADDERS, qualityFor, rungOf, spellsFor, SPELLS,
  type Grade, type LadderType, type Rung, type SpellId,
} from './ladders.js';
import type { Rng } from './rng.js';
import { levelDc } from './tables.js';
import {
  ACTIONS_PER_ACTIVATION, BANDS, LAST_ROUND, MAX_WOUNDS, REACH_RANK,
  type Action, type ActionOffer, type Activation, type BattleState, type ChargeAction,
  type ChargeOption, type EngineState, type MoveAction, type MoveReach, type PushAction,
  type PushReach, type Range, type RungAction, type RungOption, type RungTarget, type Side, type Unit,
} from './types.js';

export interface Deployment { card: UnitCard; side: Side; square: string; engines?: SiegeEngineCard[]; }

export interface BattleSetup { units: Deployment[]; board: Board; }

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const homeRank = (s: Side) => (s === 'attacker' ? 0 : SIZE - 1);

export const sameSquare = (a: Square, b: Square) => a.file === b.file && a.rank === b.rank;

const grid = (state: BattleState) => gridOf(state.board);
const dist = (state: BattleState, a: Square, b: Square) => grid(state).distance(a, b);

export function canDeploy(board: Board, side: Side, ambush: boolean, sq: Square): boolean {
  return gridOf(board).inBounds(sq) && deployRanks(side, ambush).includes(sq.rank) && at(board, sq).terrain !== 'water';
}

// The rng is unused now that there is no initiative roll; callers still pass one.
export function createBattle(setup: BattleSetup, _rng?: Rng): BattleState {
  const taken = new Set<string>();
  const units: Unit[] = setup.units.map((d, i) => {
    const traits = cardTraits(d.card);
    const sq = parse(d.square);
    if (!canDeploy(setup.board, d.side, traits.tactics.includes('ambush'), sq)) throw new Error(`${d.card.name} cannot deploy on ${d.square}`);
    if (taken.has(d.square)) throw new Error(`${d.square} is already occupied`);
    taken.add(d.square);
    return {
      id: `u${i}`, name: d.card.name, side: d.side, level: d.card.level, role: d.card.role,
      stats: deriveStats(d.card), pace: traits.pace, fear: traits.fear, tactics: traits.tactics,
      grades: gradesFor(d.card), spells: spellsFor(d.card), quality: qualityFor(d.card),
      speed: speedOf(d.card), flying: d.card.sheet?.fly ?? false, mounted: traits.signals.includes('mounted'),
      actions: ACTIONS_PER_ACTIVATION, feet: 0,
      engines: (d.engines ?? []).map((e) => ({ name: e.name, kind: e.kind, launch: e.launch, reach: e.reach, fired: false, status: 'crewed' as const, square: sq })),
      square: sq, wounds: d.card.wounds ?? 0, disorder: d.card.disorder ?? 0, status: 'active' as const,
      guard: null, rooted: 0, exposed: false, warded: false, blessed: false, compelled: false,
    };
  });
  const state: BattleState = {
    units, order: units.map((u) => u.id), round: 1,
    pending: 'attacker', active: null, begun: false, activated: [], lastSide: null,
    board: clone(setup.board),
    phase: 'battle', winner: null, endedBy: null,
    startingCount: { attacker: count(units, 'attacker'), defender: count(units, 'defender') },
    halfChecked: { attacker: false, defender: false },
    log: [{ round: 1, text: 'Round 1 begins.' }],
  };
  state.pending = nextSide(state) ?? 'attacker';
  return state;
}

const count = (units: Unit[], side: Side) => units.filter((u) => u.side === side).length;

export const unit = (state: BattleState, id: string): Unit => {
  const u = state.units.find((x) => x.id === id);
  if (!u) throw new Error(`no unit ${id}`);
  return u;
};

export const isStanding = (u: Unit) => u.status === 'active' && u.disorder < u.quality;
export const isRouted = (u: Unit) => u.status === 'active' && u.disorder >= u.quality;
export const isWeakened = (u: Unit) => u.wounds >= 2;
export const isBroken = (u: Unit) => u.wounds >= 3;

/** Units of `side` that may still act this round. */
export function activatable(state: BattleState, side: Side): Unit[] {
  return state.order.map((id) => unit(state, id))
    .filter((u) => u.side === side && u.status === 'active' && !state.activated.includes(u.id));
}

// The side with more un-activated units goes next; a tie goes to the side that did not act last.
function nextSide(state: BattleState): Side | null {
  const a = activatable(state, 'attacker').length;
  const d = activatable(state, 'defender').length;
  if (!a && !d) return null;
  if (!a) return 'defender';
  if (!d) return 'attacker';
  if (a !== d) return a > d ? 'attacker' : 'defender';
  return state.lastSide === 'attacker' ? 'defender' : 'attacker';
}

export const activeUnit = (state: BattleState): Unit | null => {
  if (state.phase !== 'battle') return null;
  if (state.active) {
    const u = unit(state, state.active);
    if (u.side === state.pending && u.status === 'active' && !state.activated.includes(u.id)) return u;
  }
  return activatable(state, state.pending)[0] ?? null;
};

/** Pick which of the pending side's units acts next. */
export function select(input: BattleState, id: string): BattleState {
  const state = clone(input);
  const u = unit(state, id);
  if (u.side !== state.pending || state.activated.includes(id) || u.status !== 'active') {
    throw new Error(`${u.name} cannot activate now`);
  }
  if (state.begun && state.active !== id) throw new Error('an activation is already under way');
  state.active = id;
  return state;
}

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

/** Which shooting band a distance falls in. Rank 4 is out of range altogether. */
function bandRank(state: BattleState, d: number): number {
  const b = BANDS[state.board.grid];
  return d <= b.close ? 1 : d <= b.long ? 2 : d <= b.extreme ? 3 : 4;
}

export function rangeBetween(state: BattleState, a: Unit, b: Unit): Range {
  if (isEngaged(state, a, b)) return 'engaged';
  return (['close', 'long', 'extreme', 'beyond'] as const)[bandRank(state, dist(state, a.square, b.square)) - 1];
}

export const isOutflanked = (state: BattleState, u: Unit) => engagedEnemies(state, u).length >= 2;

// Walls belong to the defender: a defender beside a standing segment is garrisoned.
export function garrisoned(state: BattleState, u: Unit): boolean {
  if (u.side !== 'defender') return false;
  return grid(state).neighbours(u.square)
    .some((n) => (state.board.walls[edgeKey(u.square, n)]?.remaining ?? 0) > 0);
}

const auraOn = (state: BattleState, u: Unit) => Math.max(0, ...state.units
  .filter((a) => a.side === u.side && a.id !== u.id && a.status === 'active' && a.guard && dist(state, a.square, u.square) === 1)
  .map((a) => a.guard!.aura));

export function defenceOf(state: BattleState, target: Unit, attacker: Unit | null, vsVolley: boolean, ignoresCover = false): number {
  // Circumstance bonuses never stack; the highest applies.
  let circumstance = Math.max(target.guard?.defence ?? 0, auraOn(state, target), target.warded ? 2 : 0);
  const downhill = attacker ? elevation(state, attacker) > elevation(state, target) : false;
  if (vsVolley && !ignoresCover && square(state, target).terrain === 'forest' && !downhill) circumstance = Math.max(circumstance, 1);
  let penalty = target.disorder;
  if (isOutflanked(state, target)) penalty += 2;
  if (target.exposed) penalty += 2;
  return target.stats.defence + circumstance - penalty;
}

export function reachOf(state: BattleState, u: Unit): number {
  if (u.stats.volley === null || u.stats.reach === null) return 0;
  return REACH_RANK[u.stats.reach] - (isWeakened(u) ? 1 : 0);
}

const crewedArtillery = (u: Unit): EngineState | null =>
  u.engines.find((e) => e.status === 'crewed' && !e.fired && e.kind === 'artillery') ?? null;
const crewedRam = (u: Unit): EngineState | null =>
  u.engines.find((e) => e.status === 'crewed' && !e.fired && e.kind === 'ram') ?? null;

/** A crewed engine replaces the unit's own shooting profile, grade and all, while it is loaded. */
export function shootGrade(u: Unit): Grade {
  const e = crewedArtillery(u);
  if (!e) return u.grades.shoot;
  return (e.reach ? REACH_RANK[e.reach] : 1) as Grade;
}

export const canShoot = (u: Unit) => u.stats.volley !== null || crewedArtillery(u) !== null;

const rangeRank = (r: Range) => (r === 'close' ? 1 : r === 'long' ? 2 : r === 'extreme' ? 3 : r === 'beyond' ? 4 : 0);

function volleyRank(state: BattleState, u: Unit, target: Unit): number {
  const rank = Math.min(3, bandRank(state, dist(state, u.square, target.square)));
  return elevation(state, u) > elevation(state, target) ? rank - 1 : rank;
}

export function strikeModifier(state: BattleState, u: Unit, target: Unit): number {
  let m = u.stats.strike ?? 0;
  if (isWeakened(u)) m -= 2;
  m -= u.disorder;
  if (square(state, u).terrain === 'swamp' || square(state, u).terrain === 'shallows') m -= 1;
  m -= Math.max(0, elevation(state, target) - elevation(state, u));
  if (u.side === 'attacker' && wallBetween(state, u, target)) m -= 2;
  return m;
}

export function shootModifier(state: BattleState, u: Unit, target: Unit): number {
  const e = crewedArtillery(u);
  let m = e ? e.launch : (u.stats.volley ?? 0);
  if (isWeakened(u)) m -= 2;
  m -= u.disorder;
  if (!e && volleyRank(state, u, target) >= 3) m -= 2;
  m -= Math.max(0, elevation(state, target) - elevation(state, u));
  if (state.units.some((a) => a.side === u.side && a.id !== u.id && isEngaged(state, target, a))) m -= 4;
  if (garrisoned(state, u)) m += 1;
  return m;
}

/** The DC a unit rolls against to reach one rung above its grade. */
export function reachDcFor(u: Unit, type: LadderType, rung: Grade): number {
  return levelDc(u.level) + rungOf(type, rung).reachDc;
}

export const reachModifier = (u: Unit) => u.stats.will - u.disorder;

/** Cavalry gamble on a long move more reliably than infantry. Tunable: matches the +2 this
 * system already uses for a rung's hardest step (Press, Overrun, Barrage's cover ignore...). */
export const PUSH_BONUS = 2;

/** A push is a Quality check against the level DC, same as every other reach — no rung to add
 * a modifier, so the DC is the level DC alone. */
export const pushDcFor = (u: Unit) => levelDc(u.level);

export const pushModifierFor = (u: Unit) =>
  reachModifier(u) + (u.mounted || u.tactics.includes('cavalry-charge') ? PUSH_BONUS : 0);

const log = (state: BattleState, u: Unit | null, text: string, c?: CheckResult) =>
  state.log.push({ round: state.round, unit: u?.id, text, check: c });

const degreeWord: Record<Degree, string> = {
  'critical-failure': 'critical failure', failure: 'failure', success: 'success', 'critical-success': 'critical success',
};

function applyWounds(state: BattleState, target: Unit, n: number, source: string, disorders = true) {
  if (n <= 0) return;
  target.wounds = Math.min(MAX_WOUNDS, target.wounds + n);
  const mark = target.wounds >= MAX_WOUNDS ? 'destroyed' : isBroken(target) ? 'Broken' : isWeakened(target) ? 'Weakened' : '';
  log(state, target, `${target.name} takes ${n} wound${n > 1 ? 's' : ''} from ${source} (${target.wounds}/${MAX_WOUNDS})${mark ? ` — ${mark}` : ''}.`);
  if (target.wounds >= MAX_WOUNDS) { target.status = 'destroyed'; abandonEngines(state, target); return; }
  if (disorders) addDisorder(state, target, 1, 'wounds');
}

function abandonEngines(state: BattleState, u: Unit) {
  for (const e of u.engines) {
    if (e.status !== 'crewed') continue;
    e.status = 'abandoned';
    e.square = u.square;
    log(state, u, `${u.name} abandons its ${e.name} on ${notation(e.square)}.`);
  }
}

function addDisorder(state: BattleState, u: Unit, n: number, why: string) {
  if (n === 0 || u.status !== 'active') return;
  const was = isRouted(u);
  u.disorder = Math.max(0, Math.min(u.quality, u.disorder + n));
  const routed = !was && isRouted(u) ? ' — routed' : '';
  log(state, u, `${u.name} is disordered ${u.disorder}/${u.quality} (${n > 0 ? '+' : ''}${n}, ${why})${routed}.`);
  if (routed) abandonEngines(state, u);
}

function clearDisorder(state: BattleState, u: Unit, n: number, why: string) {
  if (u.disorder === 0) return;
  u.disorder = Math.max(0, u.disorder - n);
  log(state, u, `${u.name} clears to disorder ${u.disorder}/${u.quality} (${why}).`);
}

interface StrikeOpts { bonus?: number; free?: boolean; disorders?: boolean; label: string }

function resolveStrike(state: BattleState, rng: Rng, u: Unit, target: Unit, opts: StrikeOpts): number {
  const c = check(rng, strikeModifier(state, u, target) + (opts.bonus ?? 0), defenceOf(state, target, u, false));
  log(state, u, `${u.name} ${opts.label} ${target.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
  const wounds = c.degree === 'critical-success' ? (opts.free ? 1 : 2) : c.degree === 'success' ? 1 : 0;
  applyWounds(state, target, wounds, u.name, opts.disorders ?? true);
  if (c.degree === 'critical-failure' && !opts.free) {
    u.exposed = true;
    log(state, u, `${u.name} is exposed (−2 Defence) until it acts again.`);
  }
  return wounds;
}

// One exchange: the attacker rolls, the defender rolls back, and the side that took more
// wounds gains a point of disorder. The wounds themselves do not also disorder — the
// exchange is the morale event.
function melee(state: BattleState, rng: Rng, u: Unit, target: Unit, rung: Rung) {
  const eff = rung.fight!;
  const dealt = resolveStrike(state, rng, u, target, { bonus: eff.bonus, disorders: false, label: rung.verb });
  if (dealt === 0 && eff.disorderOnMiss) addDisorder(state, u, eff.disorderOnMiss, 'a press that missed');
  let taken = 0;
  if (target.status === 'active' && target.stats.strike !== null && isEngaged(state, u, target)) {
    taken = resolveStrike(state, rng, target, u, { disorders: false, label: 'strikes back at' });
  }
  if (dealt > taken) addDisorder(state, target, 1, 'losing the exchange');
  else if (taken > dealt) addDisorder(state, u, 1, 'losing the exchange');
  if (eff.takeGround && u.status === 'active' && (target.status !== 'active' || isRouted(target))) {
    const ground = target.square;
    if (target.status !== 'active' || !sameSquare(ground, u.square)) {
      if (!unitAt(state, ground)) {
        moveTo(state, u, ground);
        log(state, u, `${u.name} overruns and takes ${notation(ground)}.`);
      }
    }
  }
}

function shootAt(state: BattleState, rng: Rng, u: Unit, target: Unit, rung: Rung) {
  const e = crewedArtillery(u);
  const source = e ? `${u.name}'s ${e.name}` : `${u.name}'s volley`;
  const c = check(rng, shootModifier(state, u, target), defenceOf(state, target, u, true, rung.shoot!.ignoresCover));
  if (e) e.fired = true;
  log(state, u, `${u.name} ${rung.verb} at ${target.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
  applyWounds(state, target, c.degree === 'critical-success' ? 2 : c.degree === 'success' ? 1 : 0, source);
}

const wallDc = (state: BattleState, wall: Wall) =>
  10 + wall.tier + Math.max(0, ...state.units.filter((d) => d.side === 'defender' && d.status === 'active').map((d) => d.level));

function attackWall(state: BattleState, rng: Rng, u: Unit, key: string, modifier: number, verb: string) {
  const wall = state.board.walls[key];
  if (!wall || wall.remaining <= 0) return;
  const c = check(rng, modifier, wallDc(state, wall));
  log(state, u, `${u.name} ${verb} the wall ${key}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
  const hits = c.degree === 'critical-success' ? 2 : c.degree === 'success' ? 1 : 0;
  if (!hits) return;
  wall.remaining = Math.max(0, wall.remaining - hits);
  log(state, u, wall.remaining ? `The wall holds ${wall.remaining}/${wall.boxes}.` : `The wall at ${key} is breached.`);
}

const enterable = (state: BattleState, u: Unit, from: Square, to: Square) =>
  !unitAt(state, to) && Number.isFinite(stepFeet(state.board, from, to, u.flying));

const occupiedBy = (state: BattleState, u: Unit) =>
  new Set(state.units.filter((o) => o.status === 'active' && o.id !== u.id).map((o) => notation(o.square)));

/** Feet the unit may still spend: what earlier Move actions banked, plus what the rest buy. */
export const movementBudget = (u: Unit) => u.feet + u.actions * u.speed;

// Movement pools across the activation rather than being lost at the end of each Stride, so a
// swamp cell at 30 ft stays enterable by a 25 ft troop over two actions.
export const moveActionsFor = (u: Unit, feet: number) =>
  feet <= u.feet ? 0 : Math.ceil((feet - u.feet) / u.speed);

/** Every cell the unit can still Stride to, what it costs in feet, and in Move actions. */
export function moveReach(state: BattleState, u: Unit): Map<string, MoveReach> {
  const out = new Map<string, MoveReach>();
  if (u.speed === 0 || u.rooted > 0 || u.actions <= 0 || u.status !== 'active') return out;
  // A unit in contact leaves by withdrawing, which is its own ladder and its own price.
  if (engagedEnemies(state, u).length) return out;
  const reach = reachable(state.board, u.square, {
    budget: movementBudget(u), flying: u.flying, occupied: occupiedBy(state, u),
  });
  const home = notation(u.square);
  for (const [key, entry] of reach) {
    if (key === home) continue;
    out.set(key, { feet: entry.feet, actions: moveActionsFor(u, entry.feet), from: entry.from });
  }
  return out;
}

/** The route to `to`, the unit's own cell first. Empty when `to` is out of reach. */
export function movePath(moves: Map<string, MoveReach>, to: string): string[] {
  if (!moves.has(to)) return [];
  const out: string[] = [];
  let key: string | null = to;
  while (key !== null && moves.has(key)) { out.unshift(key); key = moves.get(key)!.from; }
  if (key !== null) out.unshift(key);
  return out;
}

/**
 * Beyond every affordable cell: one further action's worth of movement, bounded so a drag can
 * never propose an unbounded gamble. A second `reachable` pass at the larger budget, with
 * whatever `moveReach` already covers subtracted out — two Dijkstra passes over 64 cells is
 * cheap, and it keeps `moveReach` as the one place "affordable" is decided.
 */
export function pushReach(state: BattleState, u: Unit): Map<string, PushReach> {
  const out = new Map<string, PushReach>();
  if (u.speed === 0 || u.rooted > 0 || u.actions <= 0 || u.status !== 'active') return out;
  if (engagedEnemies(state, u).length) return out;
  const affordable = moveReach(state, u);
  const reach = reachable(state.board, u.square, {
    budget: movementBudget(u) + u.speed, flying: u.flying, occupied: occupiedBy(state, u),
  });
  const home = notation(u.square);
  for (const [key, entry] of reach) {
    if (key === home || affordable.has(key)) continue;
    // A failed reach stops at the furthest cell along this same route the unit could actually
    // afford — the last affordable cell on the path back to the start.
    let fallback = home;
    for (const cell of pathTo(reach, key)) if (affordable.has(cell)) fallback = cell;
    out.set(key, { feet: entry.feet, from: entry.from, fallback });
  }
  return out;
}

/** The route to a push destination, the unit's own cell first — the push band's `from` chain,
 * finished off with `movePath` once it crosses back into affordable ground. */
export function pushPath(moves: Map<string, MoveReach>, push: Map<string, PushReach>, to: string): string[] {
  if (!push.has(to)) return movePath(moves, to);
  const out: string[] = [];
  let key: string | null = to;
  while (key !== null && push.has(key)) { out.unshift(key); key = push.get(key)!.from; }
  if (key === null) return out;
  return moves.has(key) ? [...movePath(moves, key), ...out] : [key, ...out];
}

const touching = (state: BattleState, sq: Square, e: Unit) =>
  dist(state, sq, e.square) === 1 && barrierBetween(state.board, sq, e.square)?.kind !== 'cliff';

/** The cheapest cell within reach from which `u` can fight `e`. */
function approach(state: BattleState, u: Unit, e: Unit, moves: Map<string, MoveReach>): ChargeOption | null {
  let best: ChargeOption | null = null;
  for (const [cell, m] of moves) {
    if (!touching(state, parse(cell), e)) continue;
    if (!best || m.feet < best.feet || (m.feet === best.feet && cell < best.cell)) {
      best = { unit: e.id, cell, feet: m.feet, actions: m.actions };
    }
  }
  return best;
}

/** Enemies this unit can both reach and afford the melee against. */
export function chargeTargets(state: BattleState, u: Unit): ChargeOption[] {
  if (u.stats.strike === null) return [];
  const moves = moveReach(state, u);
  const out: ChargeOption[] = [];
  for (const e of state.units.filter((x) => x.side !== u.side && x.status === 'active')) {
    const option = approach(state, u, e, moves);
    if (option && option.actions + 1 <= u.actions) out.push(option);
  }
  return out;
}

export function withdrawTargets(state: BattleState, u: Unit, clean: boolean): Square[] {
  const g = grid(state);
  const engaged = engagedEnemies(state, u);
  const options = isRouted(u) && !engaged.length ? g.homeward(u.square, u.side) : g.neighbours(u.square);
  const open = options.filter((n) => enterable(state, u, u.square, n));
  return clean ? open.filter((n) => engaged.every((e) => g.distance(e.square, n) > 1)) : open;
}

function moveTo(state: BattleState, u: Unit, to: Square) {
  u.square = to;
  for (const e of u.engines) if (e.status === 'crewed') e.square = to;
}

function leaveField(state: BattleState, u: Unit) {
  u.status = 'left';
  log(state, u, `${u.name} leaves the field.`);
}

// A troop that comes to grips with something terrible loses order for it.
function fearOnContact(state: BattleState, mover: Unit) {
  for (const e of engagedEnemies(state, mover)) {
    if (e.fear && !mover.fear) addDisorder(state, mover, 1, `fear of ${e.name}`);
    if (mover.fear && !e.fear) addDisorder(state, e, 1, `fear of ${mover.name}`);
  }
}

const wallKeys = (state: BattleState) => Object.entries(state.board.walls).filter(([, w]) => w.remaining > 0).map(([k]) => k);
const wallCells = (key: string) => key.split('|').map(parse);
const bordersWall = (u: Unit, key: string) => wallCells(key).some((c) => sameSquare(c, u.square));
const wallRank = (state: BattleState, u: Unit, key: string) =>
  bandRank(state, Math.min(...wallCells(key).map((c) => dist(state, u.square, c))));

const cellTarget = (id: string): RungTarget => ({ kind: 'cell', id, label: id });
const unitTarget = (u: Unit): RungTarget => ({ kind: 'unit', id: u.id, label: u.name });
const wallTarget = (key: string): RungTarget => ({ kind: 'wall', id: key, label: key.replace('|', ' / ') });

interface TargetSet { needsTarget: boolean; targets: RungTarget[] }

function targetsFor(state: BattleState, u: Unit, rung: Rung, spell: SpellId | null): TargetSet {
  const enemies = state.units.filter((e) => e.side !== u.side && e.status === 'active');
  switch (rung.type) {
    case 'shoot': {
      const band = rung.shoot!.band;
      const inBand = (e: Unit) => { const r = rangeRank(rangeBetween(state, u, e)); return r > 0 && r <= band; };
      const targets: RungTarget[] = enemies.filter(inBand).map(unitTarget);
      if (u.side === 'attacker' && crewedArtillery(u)) {
        targets.push(...wallKeys(state).filter((k) => wallRank(state, u, k) <= band).map(wallTarget));
      }
      return { needsTarget: true, targets };
    }
    case 'fight': {
      const targets: RungTarget[] = engagedEnemies(state, u).map(unitTarget);
      if (u.side === 'attacker') targets.push(...wallKeys(state).filter((k) => bordersWall(u, k)).map(wallTarget));
      return { needsTarget: true, targets };
    }
    case 'guard':
      return { needsTarget: false, targets: [] };
    case 'withdraw':
      return { needsTarget: false, targets: withdrawTargets(state, u, rung.withdraw!.freeStrikes !== 'all').map((s) => cellTarget(notation(s))) };
    case 'rally': {
      if (!rung.rally!.ally) return { needsTarget: false, targets: [] };
      const allies = state.units.filter((a) => a.side === u.side && a.id !== u.id && a.status === 'active'
        && a.disorder > 0 && dist(state, a.square, u.square) === 1);
      return { needsTarget: false, targets: allies.map(unitTarget) };
    }
    case 'cast': {
      const scope = rung.cast!.scope;
      const wants = spell ? SPELLS[spell].at : 'ally';
      const pool = wants === 'enemy' ? enemies : state.units.filter((a) => a.side === u.side && a.status === 'active');
      const inScope = pool.filter((t) => (t.id === u.id ? scope >= 0 : dist(state, t.square, u.square) <= scope));
      return { needsTarget: true, targets: (wants === 'enemy' ? inScope.filter((t) => t.id !== u.id) : inScope).map(unitTarget) };
    }
  }
}

const gradeOf = (u: Unit, type: LadderType): Grade => (type === 'shoot' ? shootGrade(u) : u.grades[type]);

function rungOption(state: BattleState, u: Unit, type: LadderType, index: Grade, spell: SpellId | null, granted: Grade): RungOption {
  const rung = rungOf(type, index);
  const access: RungOption['access'] = index <= granted ? 'free'
    : index === granted + 1 ? (u.compelled ? 'locked' : u.blessed ? 'free' : 'reach')
      : 'locked';
  const { needsTarget, targets } = targetsFor(state, u, rung, spell);
  let reason: string | null = access === 'locked'
    ? (u.compelled && index === granted + 1 ? 'compelled' : 'above your grade')
    : null;
  if (!reason && needsTarget && !targets.length) reason = 'no target';
  return { rung: rung.id, index, label: rung.label, detail: rung.detail, access, legal: reason === null, reason, needsTarget, targets };
}

function offerFor(state: BattleState, u: Unit, type: LadderType, spell: SpellId | null): ActionOffer {
  const granted = gradeOf(u, type);
  const reachable: Grade | null = granted < 3 && !u.compelled ? (granted + 1) as Grade : null;
  const rolls = reachable !== null && !u.blessed;
  const rungs = [1, 2, 3].map((i) => rungOption(state, u, type, i as Grade, spell, granted)) as [RungOption, RungOption, RungOption];
  const s = spell ? SPELLS[spell] : null;
  return {
    type, spell, cost: 1,
    label: s ? s.label : type[0].toUpperCase() + type.slice(1),
    detail: s ? s.detail : LADDERS[type][granted - 1].detail,
    granted, reachable,
    reachDc: rolls ? reachDcFor(u, type, reachable!) : null,
    reachModifier: reachModifier(u),
    rungs,
  };
}

// The menu is filtered by situation, so it is never long.
export function availableActions(state: BattleState, unitId?: string): ActionOffer[] {
  const u = unitId ? unit(state, unitId) : activeUnit(state);
  if (!u || state.phase !== 'battle' || u.status !== 'active') return [];
  if (isRouted(u)) return [offerFor(state, u, 'withdraw', null)];
  const contact = engagedEnemies(state, u).length > 0;
  const types: LadderType[] = contact ? ['fight', 'guard', 'withdraw'] : ['shoot', 'guard'];
  // A wall is a thing to fight even when nobody defends it.
  if (!contact && u.side === 'attacker' && wallKeys(state).some((k) => bordersWall(u, k))) types.push('fight');
  if (u.disorder > 0) types.push('rally');
  const offers = types
    .filter((t) => (t === 'shoot' ? canShoot(u) : t === 'fight' ? u.stats.strike !== null : true))
    .map((t) => offerFor(state, u, t, null));
  for (const s of u.spells) offers.push(offerFor(state, u, 'cast', s));
  return offers;
}

function reachFor(state: BattleState, rng: Rng, u: Unit, type: LadderType, wanted: Grade, blessed: boolean): Grade {
  const granted = gradeOf(u, type);
  if (wanted <= granted) return wanted;
  const rung = rungOf(type, wanted);
  if (blessed) {
    log(state, u, `${u.name} rides the blessing up to ${rung.label}.`);
    return wanted;
  }
  const c = check(rng, reachModifier(u), reachDcFor(u, type, wanted));
  log(state, u, `${u.name} reaches for ${rung.label}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
  if (c.degree === 'critical-success') return Math.min(3, wanted + 1) as Grade;
  if (c.degree === 'success') return wanted;
  log(state, u, `${u.name} falls back to ${rungOf(type, granted).label}.`);
  if (c.degree === 'critical-failure') addDisorder(state, u, 1, 'a botched order');
  return granted;
}

function doWithdraw(state: BattleState, rng: Rng, u: Unit, rung: Rung, action: RungAction) {
  const eff = rung.withdraw!;
  const engaged = engagedEnemies(state, u);
  const strikers = eff.freeStrikes === 'all' ? engaged
    : eff.freeStrikes === 'one' ? engaged.slice().sort((a, b) => b.level - a.level || a.id.localeCompare(b.id)).slice(0, 1)
      : [];
  for (const e of strikers) {
    if (u.status !== 'active') break;
    resolveStrike(state, rng, e, u, { free: true, label: 'strikes the withdrawing' });
  }
  if (eff.disorder) addDisorder(state, u, eff.disorder, rung.label.toLowerCase());
  if (u.status !== 'active') return;
  const clean = eff.freeStrikes !== 'all';
  const options = withdrawTargets(state, u, clean);
  const chosen = action.target ? options.find((s) => notation(s) === action.target) ?? null : options[0] ?? null;
  if (chosen) {
    moveTo(state, u, chosen);
    log(state, u, `${u.name} ${rung.verb} to ${notation(chosen)}.`);
  } else log(state, u, `${u.name} has nowhere to go and holds where it stands.`);
  if (isRouted(u) && u.square.rank === homeRank(u.side)) leaveField(state, u);
}

function doCast(state: BattleState, rng: Rng, u: Unit, rung: Rung, spell: SpellId, action: RungAction) {
  const scope = rung.cast!.scope;
  const target = action.target ? unit(state, action.target) : u;
  if (target.id !== u.id && dist(state, target.square, u.square) > scope) {
    log(state, u, `${u.name}'s ${SPELLS[spell].label} cannot carry to ${target.name}.`);
    return;
  }
  switch (spell) {
    case 'blast': {
      const c = check(rng, reachModifier(u), defenceOf(state, target, u, true, true));
      log(state, u, `${u.name} blasts ${target.name}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
      applyWounds(state, target, c.degree === 'critical-success' ? 2 : c.degree === 'success' ? 1 : 0, `${u.name}'s magic`);
      break;
    }
    case 'ward':
      target.warded = true;
      log(state, u, `${u.name} wards ${target.name} (+2 Defence until it acts).`);
      break;
    case 'mend':
      if (target.wounds === 0) { log(state, u, `${target.name} has no wound to mend.`); break; }
      target.wounds -= 1;
      log(state, u, `${u.name} mends ${target.name}: wounds ${target.wounds}/${MAX_WOUNDS}.`);
      break;
    case 'bless':
      target.blessed = true;
      log(state, u, `${u.name} blesses ${target.name}: its next action climbs a rung free.`);
      break;
    case 'compel':
      target.compelled = true;
      log(state, u, `${u.name} compels ${target.name}: it may not reach above its grade.`);
      break;
  }
}

function perform(state: BattleState, rng: Rng, u: Unit, offer: ActionOffer, rung: Rung, action: RungAction) {
  switch (rung.type) {
    case 'shoot': {
      const band = rung.shoot!.band;
      if (action.target && action.target.includes('|')) {
        const e = crewedArtillery(u);
        if (!e) { log(state, u, `${u.name} has nothing that can batter a wall from here.`); break; }
        if (wallRank(state, u, action.target) > band) { log(state, u, `${u.name}'s shot falls short of the wall.`); break; }
        e.fired = true;
        attackWall(state, rng, u, action.target, e.launch - u.disorder - (isWeakened(u) ? 2 : 0), 'bombards');
        break;
      }
      const target = unit(state, action.target!);
      if (rangeRank(rangeBetween(state, u, target)) > band) { log(state, u, `${u.name}'s shot falls short of ${target.name}.`); break; }
      shootAt(state, rng, u, target, rung);
      break;
    }
    case 'fight': {
      if (action.target && action.target.includes('|')) {
        const ram = crewedRam(u);
        if (ram) ram.fired = true;
        const bonus = (u.stats.strike ?? 0) - u.disorder - (isWeakened(u) ? 2 : 0) + rung.fight!.bonus + (ram ? 2 : 0);
        attackWall(state, rng, u, action.target, bonus, ram ? 'rams' : 'hacks at');
        break;
      }
      const target = unit(state, action.target!);
      if (!isEngaged(state, u, target)) { log(state, u, `${u.name} is not in contact with ${target.name}.`); break; }
      melee(state, rng, u, target, rung);
      break;
    }
    case 'guard': {
      const eff = rung.guard!;
      u.guard = { defence: eff.defence, aura: eff.aura };
      // Two: this activation, which digging in has already spent, and the next one.
      if (eff.rooted) u.rooted = 2;
      log(state, u, `${u.name} ${rung.verb}: +${eff.defence} Defence${eff.aura ? `, +${eff.aura} to adjacent allies` : ''}${eff.rooted ? ', rooted next activation' : ''}.`);
      break;
    }
    case 'withdraw':
      doWithdraw(state, rng, u, rung, action);
      break;
    case 'rally': {
      const eff = rung.rally!;
      const n = clearsAll(eff.clear) ? u.quality : eff.clear;
      clearDisorder(state, u, n, rung.label.toLowerCase());  // the rung names the effort
      if (eff.ally && action.target) {
        const ally = unit(state, action.target);
        if (dist(state, ally.square, u.square) === 1) clearDisorder(state, ally, ally.quality, `${u.name}'s example`);
      }
      break;
    }
    case 'cast':
      doCast(state, rng, u, rung, offer.spell!, action);
      break;
  }
}

/** Everything a unit's activation offers: the menu, what movement is left, and where it reaches. */
export function activation(state: BattleState, unitId?: string): Activation | null {
  const u = unitId ? unit(state, unitId) : activeUnit(state);
  if (!u || state.phase !== 'battle' || u.status !== 'active') return null;
  return {
    unit: u.id, actions: u.actions, feet: u.feet, speed: u.speed,
    offers: availableActions(state, u.id),
    moves: moveReach(state, u),
    push: pushReach(state, u),
    charges: chargeTargets(state, u),
  };
}

// What lasted "until this unit acts again" ends when it starts acting. What was laid on its
// next activation — rooted, compelled, a blessing — is spent by this one and cleared at the end.
function begin(state: BattleState, u: Unit) {
  if (state.begun && state.active === u.id) return;
  state.active = u.id;
  state.begun = true;
  u.actions = ACTIONS_PER_ACTIVATION;
  u.feet = 0;
  u.guard = null;
  u.exposed = false;
  u.warded = false;
}

function finish(state: BattleState, u: Unit) {
  u.actions = ACTIONS_PER_ACTIVATION;
  u.feet = 0;
  u.rooted = Math.max(0, u.rooted - 1);
  u.blessed = false;
  u.compelled = false;
  state.activated.push(u.id);
  state.lastSide = u.side;
  state.active = null;
  state.begun = false;
  const next = nextSide(state);
  if (next === null) endRound(state);
  else state.pending = next;
}

/**
 * Stop here with actions unspent — also the pass, since a unit that has done nothing may end
 * too. Naming the unit guards against ending the next one's activation when an action has
 * already finished this one.
 */
export function endActivation(input: BattleState, unitId?: string): BattleState {
  const state = clone(input);
  if (state.phase !== 'battle') throw new Error('battle is over');
  const u = activeUnit(state);
  if (!u) throw new Error('no unit is activating');
  if (unitId && u.id !== unitId) throw new Error(`${unitId} is not activating`);
  finish(state, u);
  return state;
}

function doRung(state: BattleState, rng: Rng, u: Unit, action: RungAction): number {
  const offer = availableActions(state, u.id).find((o) => o.type === action.type && o.spell === (action.spell ?? null));
  if (!offer) throw new Error(`${action.type} is not available to ${u.name}`);
  const opt = offer.rungs[action.rung - 1];
  if (!opt || !opt.legal) throw new Error(`${offer.label} ${action.rung} is not available to ${u.name}`);
  if (opt.needsTarget && !opt.targets.some((t) => t.id === action.target)) {
    throw new Error(`${action.target ?? 'nothing'} is not a target for ${opt.label}`);
  }
  const blessed = u.blessed;
  u.blessed = false;
  const reached = reachFor(state, rng, u, offer.type, action.rung, blessed);
  perform(state, rng, u, offer, rungOf(offer.type, reached), action);
  return offer.cost;
}

const spendMovement = (u: Unit, m: { feet: number; actions: number }) => {
  u.feet += m.actions * u.speed - m.feet;
};

function doStride(state: BattleState, u: Unit, action: MoveAction): number {
  const m = moveReach(state, u).get(action.to);
  if (!m) throw new Error(`${u.name} cannot reach ${action.to}`);
  spendMovement(u, m);
  moveTo(state, u, parse(action.to));
  log(state, u, `${u.name} strides to ${action.to} — ${m.feet} ft, ${m.actions} action${m.actions === 1 ? '' : 's'}.`);
  fearOnContact(state, u);
  return m.actions;
}

// A Charge is not a rung: it is the movement it takes, plus one action for the melee.
function doCharge(state: BattleState, rng: Rng, u: Unit, action: ChargeAction): number {
  const foe = unit(state, action.target);
  if (u.stats.strike === null) throw new Error(`${u.name} has no melee`);
  const option = approach(state, u, foe, moveReach(state, u));
  if (!option) throw new Error(`${u.name} cannot reach ${foe.name}`);
  if (option.actions + 1 > u.actions) throw new Error(`${u.name} has too few actions to charge ${foe.name}`);
  spendMovement(u, option);
  moveTo(state, u, parse(option.cell));
  log(state, u, `${u.name} charges ${foe.name} — ${option.feet} ft to ${option.cell}.`);
  fearOnContact(state, u);
  if (u.status !== 'active' || !isEngaged(state, u, foe)) {
    log(state, u, `${u.name}'s charge finds nobody.`);
    return option.actions;
  }
  const wanted = action.rung ?? gradeOf(u, 'fight');
  const blessed = u.blessed;
  u.blessed = false;
  const reached = reachFor(state, rng, u, 'fight', wanted, blessed);
  melee(state, rng, u, foe, rungOf('fight', reached));
  return option.actions + 1;
}

// Reaching beyond every action the unit has: the same four degrees as `reachFor`, applied to a
// destination instead of a rung. Always spends every action left — that is what "beyond every
// action the unit has" means as a cost, win or lose — so the activation always ends here.
function doPush(state: BattleState, rng: Rng, u: Unit, action: PushAction): number {
  const push = pushReach(state, u).get(action.to);
  if (!push) throw new Error(`${u.name} cannot push to ${action.to}`);
  const spent = u.actions;
  const c = check(rng, pushModifierFor(u), pushDcFor(u));
  log(state, u, `${u.name} pushes for ${action.to}: ${c.roll} + ${c.modifier} = ${c.total} vs ${c.dc}, ${degreeWord[c.degree]}.`, c);
  const reached = c.degree === 'success' || c.degree === 'critical-success';
  const dest = reached ? action.to : push.fallback;
  if (dest !== notation(u.square)) {
    moveTo(state, u, parse(dest));
    log(state, u, `${u.name} ${reached ? 'forces the ground and reaches' : 'falls short and stops at'} ${dest}.`);
    fearOnContact(state, u);
  } else {
    log(state, u, `${u.name} cannot force the ground and holds.`);
  }
  if (c.degree === 'critical-failure') addDisorder(state, u, 1, 'a botched push');
  return spent;
}

export function act(input: BattleState, action: Action, rng: Rng): BattleState {
  const state = clone(input);
  if (state.phase !== 'battle') throw new Error('battle is over');
  const u = action.unit ? unit(state, action.unit) : activeUnit(state);
  if (!u) throw new Error('no unit can act');
  if (u.side !== state.pending || state.activated.includes(u.id) || u.status !== 'active') {
    throw new Error(`${u.name} cannot activate now`);
  }
  if (state.begun && state.active !== u.id) throw new Error('an activation is already under way');
  begin(state, u);
  const spent = action.type === 'move' ? doStride(state, u, action)
    : action.type === 'push' ? doPush(state, rng, u, action)
      : action.type === 'charge' ? doCharge(state, rng, u, action)
        : doRung(state, rng, u, action);
  u.actions -= spent;
  if (u.actions <= 0 || u.status !== 'active') finish(state, u);
  return state;
}

const standing = (state: BattleState, side: Side) => state.units.filter((u) => u.side === side && isStanding(u));

function endRound(state: BattleState) {
  log(state, null, `End of round ${state.round}.`);
  for (const side of ['attacker', 'defender'] as Side[]) {
    if (state.halfChecked[side]) continue;
    const lost = state.units.filter((u) => u.side === side && !isStanding(u)).length;
    if (lost * 2 >= state.startingCount[side]) {
      state.halfChecked[side] = true;
      log(state, null, `Half of the ${side}'s army is gone; the line wavers.`);
      for (const u of standing(state, side)) addDisorder(state, u, 1, 'half the army gone');
    }
  }
  for (const u of state.units) for (const e of u.engines) e.fired = false;
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
  state.activated = [];
  state.active = null;
  state.begun = false;
  state.pending = nextSide(state) ?? state.pending;
  log(state, null, `Round ${state.round} begins.`);
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

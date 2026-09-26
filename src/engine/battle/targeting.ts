import { abilityOffers } from '../ability-effects.js';
import { cellTarget, groupTarget, moveTarget, pairTarget, targetCells, unitTarget, wallTarget } from '../targets.js';
import { hasSight } from '../sight.js';
import { TERRAIN } from '../terrain.js';
import { edgeCells, notation, parse, sameCell, type Square } from '../board.js';
import { VERBS, activityOf, type ActivityIndex, type Verb } from '../ladders.js';
import {
  castActivityOf, spellCeiling, spellCost, treesForTradition, TREE_LABEL, TREE_RANGE, TREE_TARGET, type Tree,
} from '../magic.js';
import {
  BANDS, type ActionOffer, type Activation, type BattleState, type ActivityOption, type ActivityTarget,
  type TargetOffer, type BoardObject, type Unit,
} from '../types.js';
import { grid, dist, unit, isRouted, activeUnit, square, engagedEnemies } from './state.js';
import { movementSpeed, moveReach, touching, stepTargets, standable, escapeOffer } from './movement.js';
import { canShoot, canShootTarget } from './combat.js';
import { chargeTargets } from './manoeuvres.js';

export function specialOffers(state: BattleState, u: Unit): ActionOffer[] {
  return abilityOffers(state, u, () => {
    if (engagedEnemies(state, u).length || u.rooted || u.pinnedBy) return [];
    return [...moveReach(state, { ...u, actions: 1, feet: 0 }).keys()].filter(key => key !== notation(u.square)
      && !state.units.some(t => t.side !== u.side && t.status === 'active' && touching(state, parse(key), t)));
  }, target => hasSight(state.board, u.square, target.square));
}

const wallKeys = (state: BattleState) => Object.entries(state.board.walls).filter(([, w]) => w.remaining > 0).map(([k]) => k);
const wallCells = (key: string) => edgeCells(key).map(parse);
const bordersWall = (u: Unit, key: string) => wallCells(key).some((c) => sameCell(c, u.square));

interface TargetSet { needsTarget: boolean; targets: ActivityTarget[] }

/** How far a tree's own range carries, in hexes: the same thresholds Shooting's bands use. A
 * spell's range is a ceiling — anything from the caster's own hex out to the band counts, the
 * way "range: 30 feet" reads on any other statblock. */
export function castCeiling(state: BattleState, tree: Tree): number {
  const band = TREE_RANGE[tree];
  return band === 'engaged' ? 1 : BANDS[band];
}

const shapeCells = (shape: Square[]) => shape.map(notation).sort();
const shapeKey = (shape: Square[]) => shapeCells(shape).join('+');

export const enemiesIn = (state: BattleState, u: Unit, shape: Square[]) => state.units.filter(
  (e) => e.side !== u.side && e.status === 'active' && shape.some((c) => sameCell(c, e.square)),
);

/** Every pair of hexes a Line may cover: two adjacent hexes on one straight line out from the
 * caster, the further of them second, both in range. */
function lineShapes(state: BattleState, u: Unit, ceiling: number): Square[][] {
  const g = grid(state);
  const out: Square[][] = [];
  for (const a of g.cells()) {
    const near = dist(state, u.square, a);
    if (near < 1 || near > ceiling) continue;
    for (const b of g.neighbours(a)) {
      const far = dist(state, u.square, b);
      if (far !== near + 1 || far > ceiling) continue;
      if (g.collinear(u.square, a, b)) out.push([a, b]);
    }
  }
  return out;
}

/** Every trio of hexes a Burst may cover: the three that meet at one corner of the grid, all
 * of them in range. */
function burstShapes(state: BattleState, u: Unit, ceiling: number): Square[][] {
  const g = grid(state);
  const seen = new Set<string>();
  const out: Square[][] = [];
  for (const c of g.cells()) {
    if (dist(state, u.square, c) > ceiling) continue;
    for (const shape of g.corners(c)) {
      if (shape.some((x) => dist(state, u.square, x) > ceiling)) continue;
      const key = shapeKey(shape);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(shape);
    }
  }
  return out;
}

function stormShapes(state: BattleState, u: Unit, ceiling: number): Square[][] {
  const g = grid(state);
  const allowed = new Set(g.cells().filter(c => dist(state, u.square, c) <= ceiling && hasSight(state.board, u.square, c)).map(notation));
  let frontier = state.units.filter(e => e.side !== u.side && e.status === 'active' && allowed.has(notation(e.square))).map(e => [e.square]);
  const seen = new Set<string>();
  const effects = new Map<string, Square[]>();
  for (let size = 1; size <= 4; size++) {
    const next: Square[][] = [];
    for (const shape of frontier) {
      const key = shapeKey(shape);
      if (seen.has(key)) continue;
      seen.add(key);
      const hit = enemiesIn(state, u, shape).map(e => e.id).sort().join('+');
      if (!effects.has(hit)) effects.set(hit, shape);
      if (size < 4) for (const cell of shape) for (const neighbour of g.neighbours(cell)) {
        if (allowed.has(notation(neighbour)) && !shape.some(c => sameCell(c, neighbour))) next.push([...shape, neighbour]);
      }
    }
    frontier = next;
  }
  return [...effects.values()];
}

/** Missile names the enemy itself, as every other attack does; Line and Burst name a shape. */
function blastTargets(state: BattleState, u: Unit, index: ActivityIndex, ceiling: number): ActivityTarget[] {
  if (index === 1) {
    return state.units
      .filter((e) => e.side !== u.side && e.status === 'active' && dist(state, e.square, u.square) <= ceiling && hasSight(state.board, u.square, e.square))
      .map(unitTarget);
  }
  const shapes = index === 2 ? lineShapes(state, u, ceiling) : index === 3 ? burstShapes(state, u, ceiling) : stormShapes(state, u, ceiling);
  return shapes
    .filter(shape => shape.every(cell => hasSight(state.board, u.square, cell)))
    .map((shape) => ({ shape, caught: enemiesIn(state, u, shape) }))
    .filter(({ caught }) => caught.length > 0)
    .map(({ shape, caught }) => cellTarget(shapeCells(shape), caught.map((e) => e.name).join(', ')));
}

const healPool = (state: BattleState, u: Unit): Unit[] => [
  u, ...state.units.filter((a) => a.side === u.side && a.id !== u.id && a.status === 'active' && dist(state, a.square, u.square) === 1),
];

function combinations<T>(pool: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (pool.length < size) return [];
  const [head, ...rest] = pool;
  return [...combinations(rest, size - 1).map((c) => [head, ...c]), ...combinations(rest, size)];
}

function groupsUpTo<T>(pool: T[], maximum: number): T[][] {
  return Array.from({ length: Math.min(maximum, pool.length) }, (_, i) => combinations(pool, i + 1)).flat();
}
function connected(state: BattleState, cells: Square[]): boolean {
  const reached = new Set([0]);
  for (let changed = true; changed;) {
    changed = false;
    cells.forEach((cell, i) => {
      if (!reached.has(i) && [...reached].some(j => dist(state, cell, cells[j]) === 1)) { reached.add(i); changed = true; }
    });
  }
  return reached.size === cells.length;
}

/** Every group Soothe, Heal or Restore may reach: the caster and its adjacent allies, `index`
 * at a time. Heaviest need first, so the cheapest legal row (`activityOption`'s own pick) lands on
 * the group that most wants it. */
function healTargets(state: BattleState, u: Unit, index: ActivityIndex): ActivityTarget[] {
  const need = (t: Unit) => t.disorder + t.wounds;
  return groupsUpTo(healPool(state, u).filter(t => hasSight(state.board, u.square, t.square)), index === 4 ? 1 : index)
    .sort((a, b) => b.reduce((n, t) => n + need(t), 0) - a.reduce((n, t) => n + need(t), 0))
    .map(groupTarget);
}

/** Translocate offers empty destinations up to four hexes from each ally. */
function translocateTargets(state: BattleState, allies: Unit[]): ActivityTarget[] {
  const g = grid(state);
  const out: ActivityTarget[] = [];
  for (const a of allies) {
    const hexes = 4;
    for (const sq of g.cells()) {
      const away = dist(state, a.square, sq);
      if (away < 1 || away > hexes || !standable(state, a, sq)) continue;
      out.push(moveTarget(a, sq));
    }
  }
  return out;
}

function gateTargets(state: BattleState, allies: Unit[]): ActivityTarget[] {
  const cells = grid(state).cells();
  const choices = allies.map(ally => ({ ally, destinations: cells.filter(cell => dist(state, ally.square, cell) <= 3 && standable(state, ally, cell)) }));
  const out: ActivityTarget[] = [];
  for (let i = 0; i < choices.length; i++) {
    const first = choices[i];
    for (const dest of first.destinations) {
      const move = moveTarget(first.ally, dest);
      out.push(move);
      for (let j = i + 1; j < choices.length; j++) for (const other of choices[j].destinations) {
        if (!sameCell(dest, other)) out.push(pairTarget(move, moveTarget(choices[j].ally, other)));
      }
    }
  }
  return out;
}

function targetsFor(state: BattleState, u: Unit, type: Verb, index: ActivityIndex, spell: Tree | null): TargetSet {
  const enemies = state.units.filter((e) => e.side !== u.side && e.status === 'active');
  switch (type) {
    case 'shoot': {
      const targets: ActivityTarget[] = enemies.filter((e) => canShootTarget(state, u, e)).map(unitTarget);
      return { needsTarget: true, targets };
    }
    case 'fight': {
      const targets: ActivityTarget[] = engagedEnemies(state, u).map(unitTarget);
      if (u.side === 'attacker') targets.push(...wallKeys(state).filter((k) => bordersWall(u, k)).map(k => wallTarget(k)));
      return { needsTarget: true, targets };
    }
    case 'guard':
      return { needsTarget: false, targets: [] };
    case 'rally': {
      if (activityOf('rally', index).rally!.scope !== 'adjacent') return { needsTarget: false, targets: [] };
      const allies = state.units.filter((a) => a.side === u.side && a.id !== u.id && a.status === 'active'
        && dist(state, a.square, u.square) === 1);
      return { needsTarget: true, targets: allies.map(unitTarget) };
    }
    case 'cast': {
      const tree = spell!;
      const ceiling = castCeiling(state, tree);
      if (tree === 'blast') return { needsTarget: true, targets: blastTargets(state, u, index, ceiling) };
      if (tree === 'healing') return { needsTarget: true, targets: healTargets(state, u, index) };
      const pool = TREE_TARGET[tree] === 'enemy' ? enemies
        : state.units.filter((a) => a.side === u.side && a.status === 'active');
      const inReach = pool.filter((t) => dist(state, t.square, u.square) <= ceiling && hasSight(state.board, u.square, t.square));
      if (tree === 'movement' && index === 4) return { needsTarget: true, targets: gateTargets(state, inReach) };
      if (index === 4) {
        const groups = groupsUpTo(inReach, tree === 'defense' ? 2 : 3);
        return { needsTarget: true, targets: (tree === 'controlling' ? groups.filter(group => connected(state, group.map(t => t.square))) : groups).map(groupTarget) };
      }
      if (tree === 'movement' && index === 3) return { needsTarget: true, targets: translocateTargets(state, inReach) };
      return { needsTarget: true, targets: inReach.map(unitTarget) };
    }
  }
}

/** Fight, Shoot and a Blast are the one attack an activation gets. Everything else may be
 * repeated; a second attack was the thing that broke the pacing. */
const isAttack = (type: Verb, spell: Tree | null) =>
  type === 'fight' || type === 'shoot' || (type === 'cast' && spell === 'blast');

/**
 * Access depends on level and tradition. Spell tiers I–III cost their tier; IV costs three.
 * A tactic-granted tree with no tradition stops at its first spell.
 */
function castCostFor(u: Unit, tree: Tree, index: ActivityIndex): number | null {
  const cap = u.tradition ? spellCeiling(u.tradition, u.level, tree) : 1;
  return index <= cap ? spellCost(index) : null;
}

function activityOption(state: BattleState, u: Unit, type: Verb, index: ActivityIndex, spell: Tree | null, blocked: string | null): ActivityOption {
  const activity = type === 'cast' ? castActivityOf(spell!, index) : activityOf(type, index);
  const cost = type === 'cast' ? castCostFor(u, spell!, index) : index;
  const { needsTarget, targets } = cost === null ? { needsTarget: true, targets: [] } : targetsFor(state, u, type, index, spell);
  let reason: string | null = blocked ?? (cost === null ? "above your level or tradition’s reach" : null);
  if (!reason && type === 'guard' && index > 1 && TERRAIN[square(state, u).terrain].braceOnly) reason = 'wet ground allows Brace alone';
  if (!reason && cost !== null && cost > u.actions) reason = `needs ${cost} actions`;
  if (!reason && needsTarget && !targets.length) reason = 'no target';
  return { activity: activity.id, index, label: activity.label, detail: activity.detail, cost, legal: reason === null, reason, needsTarget, targets };
}

function offerFor(state: BattleState, u: Unit, type: Verb, spell: Tree | null): ActionOffer {
  // Before `begin`, flags on the unit belong to its last activation — and a battle saved before
  // `finish` cleared `castTrees` still carries them.
  const current = state.begun && state.active === u.id;
  const blocked = current && isAttack(type, spell) && u.attacked ? 'already attacked this activation'
    : current && spell && u.castTrees.includes(spell) ? 'already cast this activation' : null;
  const activities = (type === 'cast' ? [1, 2, 3, 4] : [1, 2, 3]).map((i) => activityOption(state, u, type, i as ActivityIndex, spell, blocked));
  return {
    type, spell,
    label: spell ? TREE_LABEL[spell] : type[0].toUpperCase() + type.slice(1),
    detail: type === 'cast' ? castActivityOf(spell!, 1).detail : VERBS[type][0].detail,
    activities,
  };
}

// The menu is filtered by situation, so it is never long.
export function availableActions(state: BattleState, unitId?: string): ActionOffer[] {
  const u = unitId ? unit(state, unitId) : activeUnit(state);
  if (!u || state.phase !== 'battle' || u.status !== 'active') return [];
  // Only zero Morale restricts activities to Move and Step.
  if (isRouted(u)) return specialOffers(state, u).filter(o => o.ability === 'release-snare');
  const contact = engagedEnemies(state, u).length > 0;
  const types: Verb[] = contact ? ['fight', 'guard'] : ['shoot', 'guard'];
  // A wall is a thing to fight even when nobody defends it.
  if (!contact && u.side === 'attacker' && wallKeys(state).some((k) => bordersWall(u, k))) types.push('fight');
  // Rally is offered whether or not there is disorder to clear: with none, it is the order
  // that lifts the troop beside you.
  types.push('rally');
  const offers = types
    .filter((t) => (t === 'shoot' ? canShoot(state, u) : t === 'fight' ? u.stats.strike !== null : true))
    .map((t) => offerFor(state, u, t, null));
  for (const t of u.tradition ? treesForTradition(u.tradition, u.level) : u.trees) offers.push(offerFor(state, u, 'cast', t));
  offers.push(...specialOffers(state, u));
  return offers;
}

/** Everything a unit's activation offers: the menu, what movement is left, and where it reaches. */
export function activation(state: BattleState, unitId?: string): Activation | null {
  const u = unitId ? unit(state, unitId) : activeUnit(state);
  if (!u || state.phase !== 'battle' || u.status !== 'active') return null;
  return {
    unit: u.id, actions: u.actions, attacked: u.attacked, feet: u.feet, speed: movementSpeed(u),
    offers: availableActions(state, u.id),
    escape: escapeOffer(state, u),
    steps: stepTargets(state, u),
    moves: moveReach(state, u),
    charges: chargeTargets(state, u),
  };
}

/**
 * Every activity that can act on one board object, grouped by its offer — the one answer to
 * "what can this unit do to *that*", and the only thing the popups read. A activity that names no
 * target of its own (Guard, and Rally's own unit) belongs to the acting unit's own piece,
 * which is where its popup opens.
 */
// A touch on a cell resolves to `{kind:'unit'}` when something stands there (`applyProp`), so a
// shape or a transfer is found by the touched unit's own square as well as by a bare cell;
// touching any one part finds the whole target.
export function targetMatches(state: BattleState, t: ActivityTarget, obj: BoardObject): boolean {
  if (t.kind === 'wall' || obj.kind === 'wall') return t.kind === 'wall' && obj.kind === 'wall' && t.edge === obj.id;
  if (t.kind === 'unit') return obj.kind === 'unit' && t.ids.includes(obj.id);
  const cells = targetCells(state, t);
  if (obj.kind === 'cell') return cells.includes(obj.id);
  const found = state.units.find((x) => x.id === obj.id);
  return found !== undefined && cells.includes(notation(found.square));
}

export function offersAt(state: BattleState, target: BoardObject, unitId?: string): TargetOffer[] {
  const u = unitId ? state.units.find((x) => x.id === unitId) : activeUnit(state);
  if (!u) return [];
  const own = target.kind === 'unit' && target.id === u.id;
  const out: TargetOffer[] = [];
  for (const offer of availableActions(state, u.id)) {
    const activities = offer.activities.filter((o) => o.legal
      && (o.targets.some((t) => targetMatches(state, t, target)) || (own && !o.needsTarget)));
    if (activities.length) out.push({ offer, activities });
  }
  return out;
}

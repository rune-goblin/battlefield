import {
  act, deselect, endActivation, isRouted, meleePlans, movePath, notation, select, ROUTED_AT,
  type BattleState, type Unit,
} from '../engine/index.js';
import type { TacticalAction } from '../runtime/commands.js';
import type { BattleEventBody, Condition } from '../runtime/events.js';
import type { DicePort } from '../runtime/ports.js';
import type { BattleSession } from '../runtime/session.js';

/**
 * Selection, resolution, and the explicit end of an activation. One module sees the whole
 * transition, so nothing advances an activation twice. It holds no battle of its own: every
 * call reads the executor's working session and returns the next one.
 */
export interface ActionResolutionService {
  select(session: BattleSession, unitId: string): BattleSession;
  deselect(session: BattleSession): BattleSession;
  act(session: BattleSession, action: TacticalAction): BattleSession;
  endActivation(session: BattleSession, unitId: string): BattleSession;
  /** What the transition did, in the order it happened, for the commit to carry. */
  events(previous: BattleSession, next: BattleSession, action?: TacticalAction): BattleEventBody[];
}

function battleOf(session: BattleSession): BattleState {
  if (!session.battle) throw new Error('no battle is under way');
  return session.battle;
}

const withBattle = (session: BattleSession, battle: BattleState): BattleSession => ({ ...session, battle });

const moved = (unit: string, route: string[]): BattleEventBody =>
  ({ type: 'unitMoved', unit, from: route[0], to: route[route.length - 1], route });

/** The road the unit walked, read off the state it started from. A hex it was shoved or set
 * down on has no route of its own, so the two ends stand for it. */
function routeOf(before: BattleState, u: Unit, to: string): string[] {
  const path = movePath(before, u, to).map((step) => step.cell);
  return path.length ? path : [notation(u.square), to];
}

/** An advance is a move and a melee in one commit, so its legs come from the plan the action
 * named rather than from a route read back afterwards. */
function actorLegs(before: BattleState, after: Unit, action: TacticalAction): string[][] | null {
  if (action.type !== 'advance') return null;
  const actor = before.units.find((u) => u.id === action.unit);
  if (!actor) return null;
  const plan = meleePlans(before, actor, action.target)
    .find((p) => p.kind === action.finish && p.via === action.via);
  if (!plan) return null;
  const legs = [plan.movePath, plan.attackPath].filter((leg) => leg.length > 1);
  const standing = notation(after.square);
  const end = legs.at(-1)?.at(-1) ?? notation(actor.square);
  // An Overrun takes the ground it shoved the target off, which no leg of the plan covers.
  if (end !== standing) legs.push([end, standing]);
  return legs;
}

function movementEvents(before: BattleState, after: BattleState, action?: TacticalAction): BattleEventBody[] {
  const events: BattleEventBody[] = [];
  const planned = action && after.units.find((u) => u.id === action.unit);
  const legs = planned ? actorLegs(before, planned, action) : null;
  if (legs && action) for (const leg of legs) events.push(moved(action.unit, leg));
  for (const u of after.units) {
    if (legs && u.id === action?.unit) continue;
    const was = before.units.find((p) => p.id === u.id);
    const to = notation(u.square);
    if (!was || notation(was.square) === to) continue;
    events.push(moved(u.id, routeOf(before, was, to)));
  }
  return events;
}

/** The lines a comparison cannot read: a free strike, a cast, and every ordinary check. */
function logEvents(before: BattleState, after: BattleState): BattleEventBody[] {
  const events: BattleEventBody[] = [];
  for (const entry of after.log.slice(before.log.length)) {
    const tag = entry.tag;
    if (tag?.kind === 'freeStrike') {
      events.push({ type: 'freeStrikeResolved', unit: tag.attacker, target: tag.target, check: entry.check ?? null, text: entry.text });
    } else if (tag?.kind === 'spell') {
      events.push({ type: 'spellResolved', unit: tag.caster, tree: tag.tree, activity: tag.activity, targets: tag.targets, check: entry.check ?? null });
    } else if (entry.check) {
      const lands = entry.lands ?? (entry.unit ? { unit: entry.unit, reads: 'check' as const } : null);
      events.push({ type: 'checkResolved', unit: entry.unit ?? null, check: entry.check, text: entry.text, lands });
    }
  }
  return events;
}

// Each reads the value that holds the condition, so a second shooter's pin on a piece already
// pinned is news as well.
const CONDITIONS: [Condition, (u: Unit) => unknown][] = [
  ['frightened', (u) => u.frightened],
  ['stunned', (u) => u.stunned],
  ['rooted', (u) => u.rooted > 0],
  ['suppressed', (u) => u.suppressedBy],
  ['pinned', (u) => u.pinnedBy],
  ['exposed', (u) => u.exposed],
  ['persistent', (u) => u.persistent !== null],
];

function stateEvents(before: BattleState, after: BattleState, action?: TacticalAction): BattleEventBody[] {
  const events: BattleEventBody[] = [];
  for (const u of after.units) {
    const was = before.units.find((p) => p.id === u.id);
    if (!was) continue;
    if (u.wounds !== was.wounds) events.push({ type: 'woundsChanged', unit: u.id, from: was.wounds, to: u.wounds });
    if (u.disorder !== was.disorder) events.push({ type: 'disorderChanged', unit: u.id, from: was.disorder, to: u.disorder });
    for (const [condition, read] of CONDITIONS) {
      // A Guard roots the unit that chose it, which is a price paid and no news to anyone.
      if (condition === 'rooted' && u.id === action?.unit) continue;
      if (u.status === 'active' && read(u) && read(u) !== read(was)) events.push({ type: 'conditionGained', unit: u.id, condition });
    }
    if ((isRouted(u) || u.status === 'left' && u.disorder >= ROUTED_AT)
      && was.disorder < ROUTED_AT) events.push({ type: 'unitRouted', unit: u.id });
  }
  return events;
}

/** An activation ends where the log marks the turn's end; a round ends when the next one opens
 * or when the round that was running took the battle with it. */
function endEvents(before: BattleState, after: BattleState): BattleEventBody[] {
  const events: BattleEventBody[] = [];
  for (const entry of after.log.slice(before.log.length)) {
    if (entry.turn === 'end' && entry.unit) events.push({ type: 'activationEnded', unit: entry.unit });
  }
  const over = before.phase === 'battle' && after.phase === 'ended';
  if (after.round > before.round || over) events.push({ type: 'roundEnded', round: before.round });
  if (over) events.push({ type: 'battleEnded', winner: after.winner, endedBy: after.endedBy });
  return events;
}

export function createActionResolutionService({ dice }: { dice: DicePort }): ActionResolutionService {
  return {
    select: (session, unitId) => withBattle(session, select(battleOf(session), unitId)),
    deselect: (session) => withBattle(session, deselect(battleOf(session))),
    act: (session, action) => withBattle(session, act(battleOf(session), action, dice)),
    endActivation: (session, unitId) => withBattle(session, endActivation(battleOf(session), dice, unitId)),
    events(previous, next, action) {
      const before = previous.battle;
      const after = next.battle;
      if (!before || !after) return [];
      return [
        ...movementEvents(before, after, action),
        ...logEvents(before, after),
        ...stateEvents(before, after, action),
        ...endEvents(before, after),
      ];
    },
  };
}

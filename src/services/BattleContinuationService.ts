import {
  answerSurrender as answerSurrenderProposal, canContinueBattle, declareDayOrder as declareOrder,
  generateBoard, nextDayBattlefield, recoverAtNight, resolveDayOrders, SIDES, startNextDay as beginNextDay,
  type BattleState, type BoardSpec, type DayOrder, type RecoveryChoice, type Side,
} from '../engine/index.js';
import type { DicePort } from '../runtime/ports.js';
import { randomSeed, type BattleSession } from '../runtime/session.js';
import { deploymentProblem } from './ArmyPreparationService.js';

/**
 * The night between two days and the day that follows it. Recovery and deployment arrive one
 * side at a time and wait in the record: the night rolls when the second side declares, and
 * the next day starts when both deployments are legal.
 */
export interface BattleContinuationService {
  declareRecovery(session: BattleSession, side: Side, choices: RecoveryChoice[]): BattleSession;
  declareDayOrder(session: BattleSession, side: Side, order: DayOrder): BattleSession;
  confirmDayOrders(session: BattleSession): BattleSession;
  answerSurrender(session: BattleSession, side: Side, accept: boolean): BattleSession;
  /** A partial spec generates tomorrow's field over today's; null keeps the ground as it is. */
  chooseBattlefield(session: BattleSession, spec: Partial<BoardSpec> | null): BattleSession;
  declareDeployment(session: BattleSession, side: Side, positions: Record<string, string>): BattleSession;
  startNextDay(session: BattleSession): BattleSession;
}

function battleOf(session: BattleSession): BattleState {
  if (!session.battle) throw new Error('no battle is under way');
  return session.battle;
}

const withBattle = (session: BattleSession, battle: BattleState): BattleSession => ({ ...session, battle });

function requireSide(side: Side): Side {
  if (!SIDES.includes(side)) throw new Error('invalid side');
  return side;
}

/** Tomorrow's ground keeps today's grid and size; a fresh field drops today's fortification
 * and draws its own seed, and each later edit works over the field already chosen. */
function nextSpec(battle: BattleState, changes: Partial<BoardSpec>): BoardSpec {
  const base = battle.nextBoard?.spec ?? { ...battle.board.spec, construction: null, seed: randomSeed() };
  return {
    ...base, grid: battle.board.grid, size: battle.board.squares.length as 9 | 11, ...changes,
  };
}

/** The night is the wall between the deployment and the field it was chosen on. */
function requireNight(battle: BattleState): BattleState {
  if (!canContinueBattle(battle) || battle.night === null) {
    throw new Error('resolve recovery before deploying for the next day');
  }
  return battle;
}

export function createBattleContinuationService({ dice }: { dice: DicePort }): BattleContinuationService {
  return {
    declareRecovery: (session, side, choices) => {
      const battle = battleOf(session);
      if (!canContinueBattle(battle)) throw new Error('overnight recovery requires a contested dusk');
      if (battle.night !== null) throw new Error('this night has already been resolved');
      for (const choice of choices) {
        if (battle.units.find((u) => u.id === choice.unit)?.side !== requireSide(side)) {
          throw new Error(`${choice.unit} does not recover for the ${side}`);
        }
      }
      const declarations = { ...session.nightDeclarations, [side]: choices.map((c) => ({ ...c })) };
      if (!SIDES.every((s) => declarations[s])) return { ...session, nightDeclarations: declarations };
      // Both armies' declarations reach the engine together, in side order, so one night rolls
      // once and the dice fall in the same sequence whichever side declared first.
      return {
        ...session,
        battle: recoverAtNight(battle, SIDES.flatMap((s) => declarations[s]!), dice),
        nightDeclarations: {},
      };
    },

    declareDayOrder: (session, side, order) =>
      withBattle(session, declareOrder(battleOf(session), requireSide(side), order)),

    confirmDayOrders: (session) => withBattle(session, resolveDayOrders(battleOf(session))),

    answerSurrender: (session, side, accept) =>
      withBattle(session, answerSurrenderProposal(battleOf(session), requireSide(side), accept)),

    chooseBattlefield: (session, spec) => {
      const battle = battleOf(session);
      if (battle.phase !== 'ended' || battle.endedBy !== 'dusk') throw new Error('the day is not over');
      const nextBoard = spec === null ? null : generateBoard(nextSpec(battle, spec));
      return { ...withBattle(session, { ...battle, nextBoard }), nextDeployment: {} };
    },

    declareDeployment: (session, side, positions) => {
      const field = nextDayBattlefield(requireNight(battleOf(session)));
      const problem = deploymentProblem(field, requireSide(side), positions);
      if (problem) throw new Error(problem);
      return { ...session, nextDeployment: { ...session.nextDeployment, [side]: { ...positions } } };
    },

    startNextDay: (session) => {
      const battle = battleOf(session);
      const field = nextDayBattlefield(battle);
      const positions: Record<string, string> = {};
      for (const side of SIDES) {
        const problem = deploymentProblem(field, side, session.nextDeployment[side], true);
        if (problem) throw new Error(problem);
        Object.assign(positions, session.nextDeployment[side]);
      }
      return {
        ...withBattle(session, beginNextDay(battle, positions)),
        nightDeclarations: {},
        nextDeployment: {},
      };
    },
  };
}

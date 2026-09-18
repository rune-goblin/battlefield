import {
  answerSurrender as answerSurrenderProposal, canContinueBattle, declareDayOrder as declareOrder,
  generateBoard, nextDayBattlefield, recoverAtNight, resolveDayOrders, SIDES,
  type BattleState, type BoardSpec, type DayOrder, type RecoveryChoice, type Side,
} from '../engine/index.js';
import { allSubmitted, closeInteraction, dropInteraction, submissionOf, submitTo } from '../runtime/interactions.js';
import type { DicePort } from '../runtime/ports.js';
import { randomSeed, type BattleSession } from '../runtime/session.js';
import { deploymentProblem } from './ArmyPreparationService.js';

/**
 * The night between two days and the ground the next one is fought on. Recovery and deployment
 * arrive one side at a time and wait in the record: the night rolls when the second side
 * declares, and `BattleManager` starts the day once both deployments are legal.
 */
export interface BattleContinuationService {
  declareRecovery(session: BattleSession, side: Side, choices: RecoveryChoice[], userId: string): BattleSession;
  declareDayOrder(session: BattleSession, side: Side, order: DayOrder): BattleSession;
  confirmDayOrders(session: BattleSession): BattleSession;
  answerSurrender(session: BattleSession, side: Side, accept: boolean, userId: string): BattleSession;
  /** A partial spec generates tomorrow's field over today's; null keeps the ground as it is. */
  chooseBattlefield(session: BattleSession, spec: Partial<BoardSpec> | null): BattleSession;
  declareDeployment(session: BattleSession, side: Side, positions: Record<string, string>, userId: string): BattleSession;
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
    declareRecovery: (session, side, choices, userId) => {
      const battle = battleOf(session);
      if (!canContinueBattle(battle)) throw new Error('overnight recovery requires a contested dusk');
      if (battle.night !== null) throw new Error('this night has already been resolved');
      for (const choice of choices) {
        if (battle.units.find((u) => u.id === choice.unit)?.side !== requireSide(side)) {
          throw new Error(`${choice.unit} does not recover for the ${side}`);
        }
      }
      const declared = submitTo(session, 'night.recovery', side, choices.map((c) => ({ ...c })), userId);
      if (!allSubmitted(declared.interactions, 'night.recovery')) return declared;
      // Both armies' declarations reach the engine together, in side order, so one night rolls
      // once and the dice fall in the same sequence whichever side declared first.
      const together = SIDES.flatMap((s) => submissionOf(declared.interactions, 'night.recovery', s)!);
      return {
        ...closeInteraction(declared, 'night.recovery'),
        battle: recoverAtNight(battle, together, dice),
      };
    },

    declareDayOrder: (session, side, order) =>
      withBattle(session, declareOrder(battleOf(session), requireSide(side), order)),

    confirmDayOrders: (session) => withBattle(session, resolveDayOrders(battleOf(session))),

    answerSurrender: (session, side, accept, userId) => {
      const answered = answerSurrenderProposal(battleOf(session), requireSide(side), accept);
      return withBattle(closeInteraction(submitTo(session, 'day.surrender', side, accept, userId), 'day.surrender'), answered);
    },

    chooseBattlefield: (session, spec) => {
      const battle = battleOf(session);
      if (battle.phase !== 'ended' || battle.endedBy !== 'dusk') throw new Error('the day is not over');
      const nextBoard = spec === null ? null : generateBoard(nextSpec(battle, spec));
      // The cells were chosen against a field this choice may have replaced.
      return dropInteraction(withBattle(session, { ...battle, nextBoard }), 'nextDay.deployment');
    },

    declareDeployment: (session, side, positions, userId) => {
      const field = nextDayBattlefield(requireNight(battleOf(session)));
      const problem = deploymentProblem(field, requireSide(side), positions);
      if (problem) throw new Error(problem);
      return submitTo(session, 'nextDay.deployment', side, { ...positions }, userId);
    },
  };
}

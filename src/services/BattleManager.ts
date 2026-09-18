import {
  canContinueBattle, createBattle, ENGINES, nextDayBattlefield, SIDES,
  startNextDay as beginNextDay,
  type BattleState,
} from '../engine/index.js';
import type { PaintStroke } from '../runtime/commands.js';
import { defaultSetup, type BattleSession, type BattleSetupDraft } from '../runtime/session.js';
import { clearWaterPlacements, deploymentProblem, sideReady } from './ArmyPreparationService.js';
import { applyStroke } from './MapPreparationService.js';

/**
 * The lifecycle transitions. Each one either moves the session from one stage to the next or
 * draws on more than one service, and each commits once, so undo restores all of its parts
 * together.
 */
export interface BattleManager {
  /** Deploy the prepared setup and open the first day. */
  start(session: BattleSession): BattleSession;
  /** Drop the battle under way and reopen the setup draft that made it. */
  returnToSetup(session: BattleSession): BattleSession;
  /** Throw the draft away and start from the example force. */
  reset(session: BattleSession): BattleSession;
  /** Both sides' collected placements, validated against the coming field, then the engine's
   * next-day transition. */
  startNextDay(session: BattleSession): BattleSession;
  /** Close a battle that has ended for good. The campaign outcome is prepared from here. */
  finalize(session: BattleSession): BattleSession;
  /** A terrain edit and the placements it invalidates, as one change. */
  paint(session: BattleSession, stroke: PaintStroke): BattleSession;
}

function battleOf(session: BattleSession): BattleState {
  if (!session.battle) throw new Error('no battle is under way');
  return session.battle;
}

/** The night and the coming day belong to the battle that was under way; every transition
 * that ends one drops them. */
const cleared = () => ({ nightDeclarations: {}, nextDeployment: {} });

function battleFrom(setup: BattleSetupDraft): BattleState {
  const board = setup.board;
  if (!board) throw new Error('generate a board first');
  for (const side of SIDES) {
    if (!sideReady(setup, side)) throw new Error(`the ${side} has a piece still off the board`);
  }
  return createBattle({
    board,
    roundsPerDay: setup.roundsPerDay,
    units: setup.units.map((u) => ({
      id: u.id,
      card: u.card,
      side: u.side,
      square: u.square!,
      engines: u.engines
        .map((e) => ({ id: e.id, card: ENGINES.find((x) => x.name === e.name)! }))
        .filter((e) => e.card),
    })),
    engines: setup.emplacements
      .filter((e) => e.square)
      .map((e) => ({ id: e.id, card: ENGINES.find((x) => x.name === e.name)!, side: e.side, square: e.square! }))
      .filter((e) => e.card),
  });
}

export function createBattleManager(): BattleManager {
  return {
    start: (session) => ({
      ...session, ...cleared(), stage: 'battle', battle: battleFrom(session.setup),
    }),

    returnToSetup: (session) => ({ ...session, ...cleared(), stage: 'setup', battle: null }),

    reset: (session) => ({
      ...session, ...cleared(), stage: 'setup', setup: defaultSetup(), battle: null,
    }),

    startNextDay: (session) => {
      const battle = battleOf(session);
      const field = nextDayBattlefield(battle);
      const positions: Record<string, string> = {};
      for (const side of SIDES) {
        const problem = deploymentProblem(field, side, session.nextDeployment[side], true);
        if (problem) throw new Error(problem);
        Object.assign(positions, session.nextDeployment[side]);
      }
      return { ...session, ...cleared(), battle: beginNextDay(battle, positions) };
    },

    finalize: (session) => {
      const battle = battleOf(session);
      if (battle.phase !== 'ended') throw new Error('the battle is still being fought');
      if (canContinueBattle(battle)) throw new Error('the day ended at dusk and the battle can go on');
      return { ...session, ...cleared(), stage: 'finalized' };
    },

    paint: (session, stroke) => {
      const board = session.setup.board;
      if (!board) throw new Error('no board to paint');
      return { ...session, setup: clearWaterPlacements(applyStroke(board, stroke), session.setup) };
    },
  };
}

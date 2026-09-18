import { act, deselect, endActivation, select, type BattleState } from '../engine/index.js';
import type { TacticalAction } from '../runtime/commands.js';
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
}

function battleOf(session: BattleSession): BattleState {
  if (!session.battle) throw new Error('no battle is under way');
  return session.battle;
}

const withBattle = (session: BattleSession, battle: BattleState): BattleSession => ({ ...session, battle });

export function createActionResolutionService({ dice }: { dice: DicePort }): ActionResolutionService {
  return {
    select: (session, unitId) => withBattle(session, select(battleOf(session), unitId)),
    deselect: (session) => withBattle(session, deselect(battleOf(session))),
    act: (session, action) => withBattle(session, act(battleOf(session), action, dice)),
    endActivation: (session, unitId) => withBattle(session, endActivation(battleOf(session), dice, unitId)),
  };
}

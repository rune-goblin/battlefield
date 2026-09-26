import type { BattleState } from '../engine/index.js';
import { dropInteraction } from '../runtime/interactions.js';
import type { BattleSession, BattleSetupDraft, SetupEngine } from '../runtime/session.js';

export function battleOf(session: BattleSession): BattleState {
  if (!session.battle) throw new Error('no battle is under way');
  return session.battle;
}

export const withBattle = (session: BattleSession, battle: BattleState): BattleSession => ({ ...session, battle });

/** The unit standing on an engine claims it for its army, and hauling lasts only while one does. */
export function settleHauling(setup: BattleSetupDraft): BattleSetupDraft {
  const crew = (e: SetupEngine) => (e.square === null ? undefined : setup.units.find((u) => u.square === e.square));
  const settled = (e: SetupEngine): SetupEngine => {
    const unit = crew(e);
    if (!unit) return e.hauled ? { ...e, hauled: false } : e;
    return unit.side === e.side ? e : { ...e, side: unit.side };
  };
  const emplacements = setup.emplacements.map(settled);
  return emplacements.every((e, i) => e === setup.emplacements[i]) ? setup : { ...setup, emplacements };
}

/** Every setup edit passes through here, and each one takes back both armies' readiness: the
 * other army agreed to the table as it stood, so a changed board or force needs that word again. */
export const withSetup = (session: BattleSession, setup: BattleSetupDraft): BattleSession =>
  dropInteraction({ ...session, setup: settleHauling(setup) }, 'army.readiness');

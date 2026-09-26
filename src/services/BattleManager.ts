import {
  canContinueBattle, createBattle, engineNamed, nextDayBattlefield, SIDES,
  startNextDay as beginNextDay,
  type BattleState,
} from '../engine/index.js';
import { sessionAtSite, sessionFromRequest, type BattleRequest } from '../runtime/campaign.js';
import type { BattleCommand, PaintStroke } from '../runtime/commands.js';
import { seatUsers } from '../runtime/control.js';
import { submissionOf } from '../runtime/interactions.js';
import { migrateSession } from '../runtime/migrate.js';
import type { PresencePort } from '../runtime/ports.js';
import { defaultSetup, writebackComplete, type BattleSession } from '../runtime/session.js';
import { clearWaterPlacements, deploymentProblem, sideReady } from './ArmyPreparationService.js';
import { applyStroke } from './MapPreparationService.js';
import { battleOf, withSetup } from './session-helpers.js';

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
  /** The saved record `raw` in place of this one. A foreign or corrupt slot throws, so it
   * rejects through the same commit path as any refused command. */
  load(session: BattleSession, raw: unknown, slot: string, presence: PresencePort): BattleSession;
  installRefusal(session: BattleSession): string | null;
  /** The battle a campaign asked for. A malformed request throws. */
  install(session: BattleSession, battleId: string, request: BattleRequest, presence: PresencePort): BattleSession;
  moveToRefusal(session: BattleSession, site: string): string | null;
  /** What becomes of the record the table leaves for another site. A resolved battle leaves the
   * map, and any other is kept for the GM to come back to. */
  departure(session: BattleSession): 'park' | 'remove' | null;
  /** Open the battle parked at the command's site, or a new one there when `parked` is null. */
  moveTo(session: BattleSession, parked: unknown | null, command: MoveTo, presence: PresencePort): BattleSession;
}

type MoveTo = Extract<BattleCommand, { type: 'session.moveTo' }>;

/** The decisions belong to the stage and the day that asked for them; a transition that ends
 * one drops them all, rather than leaving the next stage an answer to an older question. */
const cleared = () => ({ interactions: [] });

function battleFrom(session: BattleSession): BattleState {
  const setup = session.setup;
  const board = setup.board;
  if (!board) throw new Error('generate a board first');
  for (const side of SIDES) {
    if (!sideReady(setup, side)) throw new Error(`the ${side} has a piece still off the board`);
    // proto: the wording is reserved for review with the rest of the player-facing text.
    if (submissionOf(session.interactions, 'army.readiness', side) !== true) {
      throw new Error(`the ${side} has not called itself ready`);
    }
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
        .map((e) => ({ id: e.id, card: engineNamed(e.name)! }))
        .filter((e) => e.card),
    })),
    engines: setup.emplacements
      .filter((e) => e.square)
      .map((e) => ({ id: e.id, card: engineNamed(e.name)!, side: e.side, square: e.square!, hauled: e.hauled, loaded: e.loaded }))
      .filter((e) => e.card),
  });
}

export function createBattleManager(): BattleManager {
  return {
    start: (session) => ({
      ...session, ...cleared(), stage: 'battle', battle: battleFrom(session),
    }),

    // The writeback belongs to the battle that was fought; a battle left behind takes it along,
    // so the next one cannot resume into another battle's operation.
    returnToSetup: (session) => ({ ...session, ...cleared(), stage: 'setup', battle: null, writeback: null }),

    // The example force is no campaign's battle, so it leaves the site it was reset on.
    reset: (session) => ({
      ...session, ...cleared(), stage: 'setup', setup: defaultSetup(), battle: null, writeback: null, site: null,
    }),

    startNextDay: (session) => {
      const battle = battleOf(session);
      const field = nextDayBattlefield(battle);
      const positions: Record<string, string> = {};
      for (const side of SIDES) {
        const declared = submissionOf(session.interactions, 'nextDay.deployment', side);
        const problem = deploymentProblem(field, side, declared, true);
        if (problem) throw new Error(problem);
        Object.assign(positions, declared);
      }
      return { ...session, ...cleared(), battle: beginNextDay(battle, positions) };
    },

    finalize: (session) => {
      const battle = battleOf(session);
      if (battle.phase !== 'ended') throw new Error('the battle is still being fought');
      if (canContinueBattle(battle)) throw new Error('the day ended at dusk and the battle can go on');
      // An imported battle reaches `finalized` through its writeback and no other way: the
      // campaign holds the result before the record closes on it.
      if ((session.sources.length > 0 || session.writeback) && !writebackComplete(session)) {
        throw new Error('the campaign outcome has not been applied');
      }
      return { ...session, ...cleared(), stage: 'finalized' };
    },

    paint: (session, stroke) => {
      const board = session.setup.board;
      if (!board) throw new Error('no board to paint');
      return withSetup(session, clearWaterPlacements(applyStroke(board, stroke), session.setup));
    },

    load: (session, raw, slot, presence) => {
      const migrated = migrateSession(raw);
      if (!migrated) throw new Error(`${slot} is not a battlefield save`);
      return {
        ...migrated, revision: session.revision, interactions: [], recentCommandIds: [],
        // A save carried from another table names users this one may not have; the seating
        // is refitted here and the turn opens again under it.
        control: seatUsers(migrated.control, presence), turn: null,
      };
    },

    // proto: a battle under way is never overwritten — one battle at a time, and the GM leaves
    // this one before the next import lands. Reserved with the rest of the import defaults.
    installRefusal: (session) => (session.battle && session.stage !== 'finalized' ? 'a battle is already under way' : null),

    install: (session, battleId, request, presence) => {
      const built = sessionFromRequest(request, battleId);
      // The imported seating knows no users; the table's own seats it, as a load does.
      return { ...built, revision: session.revision, control: seatUsers(built.control, presence) };
    },

    moveToRefusal: (session, site) => {
      if (session.site === site) return 'that battle is already open';
      if (session.site === null && session.battle && session.stage !== 'finalized') {
        return 'a battle on no site is under way; save or end it first';
      }
      return null;
    },

    departure: (session) => {
      if (session.site === null) return null;
      return session.stage === 'finalized' ? 'remove' : 'park';
    },

    moveTo: (session, raw, { site, battleId, opening }, presence) => {
      const parked = raw === null ? null : migrateSession(raw);
      if (raw !== null && !parked) throw new Error(`the battle parked at ${site} cannot be read`);
      const opened = parked ?? sessionAtSite(site, opening, battleId);
      return {
        // The same table comes back to it, so the answers it was waiting on still stand.
        ...opened, site, revision: session.revision, recentCommandIds: [],
        control: seatUsers(opened.control, presence), turn: null,
      };
    },
  };
}

import {
  createBattleThrough, moveToSiteThrough, type BattleRequest, type CreateBattleResult, type MoveToSiteResult,
  type SiteOpening,
} from '../../runtime/campaign.js';
import type { BattleCommand, CommandResult } from '../../runtime/commands.js';
import { siteEntryOf } from '../../runtime/memorySites.js';
import type { BattleSites, SiteEntry } from '../../runtime/ports.js';
import type { BattleSession } from '../../runtime/session.js';

/** What `game.modules.get('battlefield').api` offers another module. */
export interface BattlefieldModuleApi {
  /** Raise the battle window, or bring the open one forward. */
  open(): Promise<void>;
  close(): Promise<void>;
  /** The GM opens the battle window on every player's client, for a macro to call. Each
   * player keeps a floating panel to reopen it until `dismissTable`. */
  callTable(): Promise<void>;
  dismissTable(): Promise<void>;
  /**
   * Start a battle from a campaign's own data: unit cards, sides, source bindings, equipment,
   * and a board spec. Answers with the battle ID the campaign record stores, so the outcome can
   * be matched back to it. Nothing here reads another module's flags.
   */
  createBattle(request: BattleRequest): Promise<CreateBattleResult>;
  /** Every unresolved battle standing on campaign ground, the open one among them. */
  battles(): Promise<SiteEntry[]>;
  /** Open the battle at a site, parking the open one at its own. `opening` starts a battle
   * where none stands; a site that has one ignores it. */
  openBattleAt(site: string, opening: SiteOpening): Promise<MoveToSiteResult>;
  /** Take a parked battle off the map. The open battle stays; false says it was the one named. */
  removeBattle(site: string): Promise<boolean>;
  /** A cell's centre on the open board, in viewport pixels, for a macro or a test that points
   * at the map. Null while no board is mounted. */
  screenOf(cell: string): { x: number; y: number } | null;
}

export interface ModuleApiOptions {
  /** Read at call time: the host is built later in the same hook, and the authority moves. */
  submit: () => ((command: BattleCommand) => Promise<CommandResult>) | null;
  session: () => BattleSession;
  sites: BattleSites;
  open: () => Promise<unknown>;
  close: () => Promise<unknown>;
  callTable: () => Promise<void>;
  dismissTable: () => Promise<void>;
  screenOf?: (cell: string) => { x: number; y: number } | null;
}

const LOADING: Extract<CreateBattleResult, { ok: false }> = {
  ok: false, reason: 'battle', message: 'the battle module is still loading', problems: [],
};

export function createModuleApi(
  { submit, session, sites, open, close, callTable, dismissTable, screenOf }: ModuleApiOptions,
): BattlefieldModuleApi {
  return {
    open: async () => { await open(); },
    close: async () => { await close(); },
    callTable,
    dismissTable,
    screenOf: (cell) => screenOf?.(cell) ?? null,

    createBattle(request) {
      const send = submit();
      if (!send) {
        return Promise.resolve(LOADING);
      }
      return createBattleThrough(send, request);
    },

    async battles() {
      const open = session();
      const parked = (await sites.list()).filter((e) => e.site !== open.site && e.stage !== 'finalized');
      return open.site !== null && open.stage !== 'finalized'
        ? [...parked, siteEntryOf(open as BattleSession & { site: string }, Date.now())] : parked;
    },

    async openBattleAt(site, opening) {
      const open = session();
      if (open.site === site) return { ok: true, revision: open.revision };
      const send = submit();
      return send ? moveToSiteThrough(send, site, opening) : LOADING;
    },

    async removeBattle(site) {
      if (session().site === site) return false;
      await sites.remove(site);
      return true;
    },
  };
}

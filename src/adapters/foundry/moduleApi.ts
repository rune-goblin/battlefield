import {
  createBattleThrough, moveToSiteThrough, type BattleRequest, type CreateBattleResult, type MoveToSiteResult,
  type SiteOpening,
} from '../../runtime/campaign.js';
import type { BattleCommand, CommandResult } from '../../runtime/commands.js';
import { siteEntryOf } from '../../runtime/memorySites.js';
import type { BattleSites, SiteEntry } from '../../runtime/ports.js';
import type { BattleSession } from '../../runtime/session.js';
import type { LifecycleResult, Ruling, SiteLifecycle } from '../../services/SiteLifecycleService.js';

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
  /** The site of the battle the table holds, or null for none. */
  activeSite(): string | null;
  /** Every unresolved battle standing on campaign ground, the open one among them. */
  battles(): Promise<SiteEntry[]>;
  /** Open the battle at a site, parking the open one at its own. `opening` starts a battle
   * where none stands; a site that has one ignores it and opens on the GM's briefing. */
  openBattleAt(site: string, opening: SiteOpening): Promise<MoveToSiteResult>;
  /** Take a stored battle off the map. The open battle stays; false says it was the one named. */
  removeBattle(site: string): Promise<boolean>;
  /** Whether the open battle differs from the copy stored at its site. */
  battleUnsaved(): Promise<boolean>;
  /** Write the open battle to its site's stored copy. */
  saveBattle(): Promise<void>;
  /** End the table's session: the call drops, every window shuts, and the site keeps its
   * stored copy. Unsaved changes are dropped; a caller asks first. */
  closeBattle(): Promise<LifecycleResult>;
  /** Resolve the open battle: the rules' winner, or the ruling for one they have not settled. */
  endBattle(ruling?: Ruling): Promise<LifecycleResult>;
  /** A cell's centre on the open board, in viewport pixels, for a macro or a test that points
   * at the map. Null while no board is mounted. */
  screenOf(cell: string): { x: number; y: number } | null;
  /** Scroll the open board to put a cell at its centre, for a macro or a test to reach it clear
   * of the chrome. Does nothing while no board is mounted. */
  centerOn(cell: string): void;
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
  centerOn?: (cell: string) => void;
  lifecycle: SiteLifecycle;
  /** The GM opened the battle already standing at this site. */
  brief?: (site: string) => void;
  tableCalled?: () => boolean;
}

const LOADING: Extract<CreateBattleResult, { ok: false }> = {
  ok: false, reason: 'battle', message: 'the battle module is still loading', problems: [],
};

export function createModuleApi(
  {
    submit, session, sites, lifecycle, open, close, callTable, dismissTable, screenOf, centerOn, brief, tableCalled,
  }: ModuleApiOptions,
): BattlefieldModuleApi {
  return {
    open: async () => { await open(); },
    close: async () => { await close(); },
    callTable,
    dismissTable,
    screenOf: (cell) => screenOf?.(cell) ?? null,
    centerOn: (cell) => { centerOn?.(cell); },

    createBattle(request) {
      const send = submit();
      if (!send) {
        return Promise.resolve(LOADING);
      }
      return createBattleThrough(send, request);
    },

    activeSite() {
      const open = session();
      return open.stage === 'finalized' ? null : open.site;
    },

    async battles() {
      const open = session();
      const parked = (await sites.list()).filter((e) => e.site !== open.site && e.stage !== 'finalized');
      return open.site !== null && open.stage !== 'finalized'
        ? [...parked, siteEntryOf(open as BattleSession & { site: string }, Date.now())] : parked;
    },

    async openBattleAt(site, opening) {
      const open = session();
      if (open.site === site && open.stage !== 'finalized') {
        // The table already called to this battle needs no briefing.
        if (!tableCalled?.()) brief?.(site);
        return { ok: true, revision: open.revision };
      }
      const send = submit();
      if (!send) return LOADING;
      const standing = (await sites.list()).some((e) => e.site === site && e.stage !== 'finalized');
      const result = await moveToSiteThrough(send, site, opening);
      if (result.ok && standing) brief?.(site);
      return result;
    },

    async removeBattle(site) {
      if (session().site === site) return false;
      await sites.remove(site);
      return true;
    },

    battleUnsaved: () => lifecycle.unsaved(),
    saveBattle: () => lifecycle.save(),

    async closeBattle() {
      const result = await lifecycle.close();
      if (!result.ok) return { ok: false, message: result.message };
      await close();
      return { ok: true };
    },

    endBattle: (ruling) => lifecycle.end(ruling),
  };
}

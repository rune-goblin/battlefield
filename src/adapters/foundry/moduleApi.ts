import { createBattleThrough, type BattleRequest, type CreateBattleResult } from '../../runtime/campaign.js';
import type { BattleCommand, CommandResult } from '../../runtime/commands.js';

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
}

export interface ModuleApiOptions {
  /** Read at call time: the host is built later in the same hook, and the authority moves. */
  submit: () => ((command: BattleCommand) => Promise<CommandResult>) | null;
  open: () => Promise<unknown>;
  close: () => Promise<unknown>;
  callTable: () => Promise<void>;
  dismissTable: () => Promise<void>;
}

export function createModuleApi({ submit, open, close, callTable, dismissTable }: ModuleApiOptions): BattlefieldModuleApi {
  return {
    open: async () => { await open(); },
    close: async () => { await close(); },
    callTable,
    dismissTable,

    createBattle(request) {
      const send = submit();
      if (!send) {
        return Promise.resolve({
          ok: false, reason: 'battle', message: 'the battle module is still loading', problems: [],
        } satisfies CreateBattleResult);
      }
      return createBattleThrough(send, request);
    },
  };
}

import type { Ruling, SiteLifecycle } from '../services/SiteLifecycleService.js';
import { quitGame, siteLifecycle } from './game.svelte.js';
import type { NotificationService } from './notifications.js';

export type SitePrompt = 'close' | 'end' | null;

export interface SiteMenuDeps {
  lifecycle(): SiteLifecycle | null;
  notify(tone: 'success' | 'error', title: string, message?: string): void;
  /** Shut this client's window once the table's session has ended. */
  leave(): void;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** The GM's Save, Close and End battle, and the prompt each may raise. */
export function createSiteMenu({ lifecycle, notify, leave }: SiteMenuDeps) {
  let prompt = $state<SitePrompt>(null);
  let busy = $state(false);
  let asksRuling = $state(false);

  async function guarded(title: string, work: (lc: SiteLifecycle) => Promise<void>): Promise<void> {
    const lc = lifecycle();
    if (!lc || busy) return;
    busy = true;
    try {
      await work(lc);
    } catch (error) {
      notify('error', title, messageOf(error));
    } finally {
      busy = false;
    }
  }

  async function close(lc: SiteLifecycle): Promise<void> {
    const result = await lc.close();
    if (!result.ok) throw new Error(result.message);
    prompt = null;
    leave();
  }

  return {
    get prompt() { return prompt; },
    get busy() { return busy; },
    /** The End prompt asks who won, since the rules have not said. */
    get asksRuling() { return asksRuling; },
    save: () => guarded('The battle was not saved', async (lc) => {
      await lc.save();
      notify('success', 'Battle saved');
    }),
    requestClose: () => guarded('The battle was not closed', async (lc) => {
      if (await lc.unsaved()) prompt = 'close';
      else await close(lc);
    }),
    closeWith: (save: boolean) => guarded(save ? 'The battle was not saved' : 'The battle was not closed', async (lc) => {
      if (save) await lc.save();
      await close(lc);
    }),
    requestEnd() {
      asksRuling = lifecycle()?.awaitsRuling() ?? false;
      prompt = 'end';
    },
    endWith: (ruling?: Ruling) => guarded('The battle did not end', async (lc) => {
      const result = await lc.end(ruling);
      if (!result.ok) throw new Error(result.message);
      prompt = null;
    }),
    dismiss() { if (!busy) prompt = null; },
  };
}

export type SiteMenu = ReturnType<typeof createSiteMenu>;

/** The menu over the table's own lifecycle, shared by the top bar and the dusk report. */
export const createTableSiteMenu = (notifications: NotificationService): SiteMenu => createSiteMenu({
  lifecycle: siteLifecycle,
  notify: (tone, title, message = '') => notifications.show({ id: 'site-menu', title, message, tone }),
  leave: quitGame,
});

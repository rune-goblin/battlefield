import { awaitsRuling, type Side } from '../engine/index.js';
import type { BattleCommand, CommandResult } from '../runtime/commands.js';
import type { BattleSites } from '../runtime/ports.js';
import type { BattleSession } from '../runtime/session.js';
import { unsavedAgainst } from '../runtime/storedCopy.js';
import { prepareOutcome, type BattleOutcome, type WritebackReport } from './OutcomeApplicationService.js';

export type Ruling = Side | 'draw';
export type LifecycleResult = { ok: true } | { ok: false; message: string };

/** The GM's Save, Close and End battle over the battle the table holds. */
export interface SiteLifecycle {
  /** Whether the live battle differs from the copy stored at its site. */
  unsaved(): Promise<boolean>;
  /** Write the live battle to its site's stored copy. The battle stays active. */
  save(): Promise<void>;
  /** Leave the battle. Its site keeps the stored copy, and a battle never saved leaves the map. */
  close(): Promise<CommandResult>;
  /** Whether End battle asks the GM who won. A battle the rules ended carries its own winner. */
  awaitsRuling(): boolean;
  /** Rule the battle if the rules have not, then hand the result to the campaign. */
  end(ruling?: Ruling): Promise<LifecycleResult>;
}

export interface SiteLifecycleDependencies {
  /** The authority's record where this client holds it, so a read after a submit sees the commit. */
  session(): BattleSession;
  submit(command: BattleCommand): Promise<CommandResult>;
  sites: BattleSites;
  /** Read at call time, since the authority moves. Null on a client that holds no executor:
   * only the authority writes the campaign. */
  applyOutcome(): ((outcome: BattleOutcome, revision: number) => Promise<WritebackReport>) | null;
}

const fail = (message: string): LifecycleResult => ({ ok: false, message });

export function createSiteLifecycle(
  { session, submit, sites, applyOutcome }: SiteLifecycleDependencies,
): SiteLifecycle {
  return {
    async unsaved() {
      const live = session();
      // A resolved battle has left the map, so there is nothing to save it to.
      if (live.site === null || live.stage === 'finalized') return false;
      return unsavedAgainst(live, await sites.load(live.site));
    },

    async save() {
      const live = session();
      if (live.site === null) throw new Error('this battle stands on no site');
      await sites.park(live);
    },

    close: () => submit({ type: 'session.close' }),

    awaitsRuling() {
      const battle = session().battle;
      return battle !== null && awaitsRuling(battle);
    },

    async end(ruling) {
      const battle = session().battle;
      if (!battle) return fail('no battle is under way');
      const apply = applyOutcome();
      // proto: wording.
      if (!apply) return fail('only the GM who holds the table can end the battle');
      if (awaitsRuling(battle)) {
        if (!ruling) return fail('the battle needs a ruling');
        const ruled = await submit({ type: 'battle.rule', winner: ruling });
        if (!ruled.ok) return fail(ruled.message);
      }
      const ended = session();
      const report = await apply(prepareOutcome(ended), ended.revision);
      if (report.ok) return { ok: true };
      return fail(report.message ?? report.conflicts.map((c) => c.message).join('; '));
    },
  };
}

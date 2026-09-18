import type {
  BattleOutcome, CampaignApplyResult, CampaignOutcomePort,
} from '../../services/OutcomeApplicationService.js';

export const REIGNMAKER_MODULE_ID = 'pf2e-reignmaker';

/** What the host's module registry answers. Foundry's own `game.modules` satisfies it, and the
 * global stays in the Foundry adapter. */
export type ModuleLookup = (id: string) => { api?: unknown } | undefined;

type ApplyBattleOutcome = (outcome: BattleOutcome, operationId: string) => Promise<unknown>;

/** Resolved on every call: a module enabled, reloaded, or disabled after this client started
 * is found, or missed, as it stands now rather than as it stood at startup. */
function applyOf(modules: ModuleLookup): ApplyBattleOutcome | null {
  const api = modules(REIGNMAKER_MODULE_ID)?.api as { applyBattleOutcome?: unknown } | undefined;
  return typeof api?.applyBattleOutcome === 'function' ? api.applyBattleOutcome as ApplyBattleOutcome : null;
}

/**
 * ReignMaker's half of the campaign seam. It owns kingdom consequences and runs the write under
 * its own actor lock, idempotent on the operation ID. Without it the outcome falls to the PF2e
 * adapter, which writes the troop actors directly.
 */
export function createReignMakerPort(modules: ModuleLookup): CampaignOutcomePort {
  return {
    available: () => applyOf(modules) !== null,

    async apply(outcome, operationId): Promise<CampaignApplyResult> {
      const apply = applyOf(modules);
      if (!apply) return { ok: false, message: `${REIGNMAKER_MODULE_ID} is not installed` };
      try {
        const answer = await apply(outcome, operationId) as { ok?: boolean; message?: string } | undefined;
        // The API is specified to throw on failure; a refusal object is read as one too, so a
        // campaign that reports rather than throws still stops the run.
        if (answer && answer.ok === false) {
          return { ok: false, message: answer.message ?? `${REIGNMAKER_MODULE_ID} refused the outcome` };
        }
        return { ok: true };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

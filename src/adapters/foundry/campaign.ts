import { createTroopWriteback, type WritableTroopActor } from '../pf2e/troopWriteback.js';
import { createReignMakerPort } from '../reignmaker/outcomePort.js';
import type { ActorWritebackPort, CampaignOutcomePort } from '../../services/OutcomeApplicationService.js';

/** ReignMaker through the world's module registry, read at call time so a module enabled after
 * this client started still answers. */
export const foundryCampaignPort = (): CampaignOutcomePort =>
  createReignMakerPort((id) => game.modules.get(id));

/** Troop actors by UUID. Only the primary GM builds a runtime, so only that client writes. */
export const foundryTroopWriteback = (): ActorWritebackPort => createTroopWriteback({
  actor: async (uuid) => (await fromUuid(uuid)) as WritableTroopActor | null,
});

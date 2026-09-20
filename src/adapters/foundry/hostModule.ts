/** A module as the registry holds it. `api` is a convention between modules and Foundry's
 * `Module` type has no such field, so every read and the one write go through this shape. */
export interface HostModule { api?: unknown; active?: boolean }

export const hostModule = (id: string): HostModule | undefined =>
  game.modules.get(id) as HostModule | undefined;

import { SIDES, type BattleState, type Side } from '../engine/index.js';
import type { SideControl } from '../runtime/control.js';
import type { BattleSetupDraft, LifecycleStage } from '../runtime/session.js';
import type { TableUser } from '../runtime/ports.js';

// proto: the wording for a unit nobody imported, shared in spirit with Sides.svelte's.
export const UNBANNERED = 'Added by hand';

export interface BriefingUnit { id: string; name: string; meta: string; state: string | null }
export interface BriefingArmy {
  side: Side;
  seats: string;
  line: string;
  factions: { name: string; units: BriefingUnit[] }[];
}
export interface Briefing { site: string | null; standing: string; armies: BriefingArmy[] }

export interface BriefingSource {
  site: string | null;
  stage: LifecycleStage;
  setup: BattleSetupDraft;
  battle: BattleState | null;
  control: SideControl;
}

const UNIT_STATE = { destroyed: 'destroyed', left: 'left the field', camp: 'in camp' } as const;

function standingOf({ stage, setup, battle }: BriefingSource): string {
  if (!battle) {
    const deployed = SIDES.every((side) => setup.units.some((u) => u.side === side) && setup.units.every((u) => u.side !== side || u.square !== null));
    return deployed ? 'Both armies are deployed. The battle has not begun.' : 'The armies are still forming up.';
  }
  if (stage === 'deployment') return `Day ${battle.day}: the armies redeploy.`;
  if (battle.phase === 'ended') {
    return battle.endedBy === 'dusk' ? `Day ${battle.day} ended at dusk. Recovery comes next.` : 'The battle is over.';
  }
  return `Day ${battle.day}, round ${battle.round} of ${battle.roundsPerDay}.`;
}

/** What the GM reads before calling the table to a standing battle. */
export function briefingOf(source: BriefingSource, users: TableUser[]): Briefing {
  const userName = (id: string) => users.find((u) => u.id === id)?.name ?? id;
  const inBattle = new Map(source.battle?.units.map((u) => [u.id, u]) ?? []);
  const armies = SIDES.map((side): BriefingArmy => {
    const units = source.setup.units.filter((u) => u.side === side);
    const names = [...new Set(units.map((u) => u.faction ?? UNBANNERED))];
    const levels = units.reduce((sum, u) => sum + u.card.level, 0);
    const standing = units.filter((u) => (inBattle.get(u.id)?.status ?? 'active') === 'active').length;
    return {
      side,
      seats: source.control.seats[side].map(userName).join(', ') || 'the GM',
      line: `${units.length} ${units.length === 1 ? 'unit' : 'units'} · ${levels} levels${source.battle ? ` · ${standing} standing` : ''}`,
      factions: names.map((name) => ({
        name,
        units: units.filter((u) => (u.faction ?? UNBANNERED) === name).map((u) => {
          const status = inBattle.get(u.id)?.status;
          return {
            id: u.id, name: u.card.name, meta: `L${u.card.level} ${u.card.role}`,
            state: status && status !== 'active' ? UNIT_STATE[status] : null,
          };
        }),
      })),
    };
  });
  return { site: source.site, standing: standingOf(source), armies };
}

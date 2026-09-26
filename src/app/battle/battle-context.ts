import type { ActionOffer, Activation, BattleState, Unit } from '../../engine/index.js';
import type { CommandResult } from '../../runtime/commands.js';
import type { takeAction } from '../game.svelte.js';
import type { NotificationService } from '../notifications.js';

// `focus` is the one field every controller writes: the commitment belongs to whichever popup is open.
export interface BattleContext {
  readonly b: BattleState;
  readonly active: Unit | null;
  readonly act: Activation | null;
  readonly offers: ActionOffer[];
  focus: number;
  readonly run: (p: Promise<CommandResult>) => Promise<CommandResult>;
  readonly requireTurn: () => boolean;
  readonly takeAction: typeof takeAction;
  readonly notifications: NotificationService;
}

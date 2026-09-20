import type { BattleCommand, CommandResult } from '../runtime/commands.js';
import type { HistorySnapshot } from '../runtime/executeCommand.js';
import type { BattleArchive, TableUser } from '../runtime/ports.js';
import type { BattleSession } from '../runtime/session.js';

/** What the store needs from whoever runs the battle: the browser's own runtime, or a Foundry
 * client's line to the primary GM. */
export interface StoreClient {
  readonly session: BattleSession;
  readonly history: readonly HistorySnapshot[];
  readonly userId: string;
  gmUserId(): string;
  tableUsers(): TableUser[];
  submit(command: BattleCommand): Promise<CommandResult>;
  subscribe(listener: (session: BattleSession) => void): () => void;
  archive: BattleArchive;
  /** The GM's call that brings every player's window up. A host with one table of clients
   * supplies it; the browser has none. */
  table?: TableSummons;
}

export interface TableSummons {
  readonly called: boolean;
  call(): Promise<void>;
  dismiss(): Promise<void>;
}

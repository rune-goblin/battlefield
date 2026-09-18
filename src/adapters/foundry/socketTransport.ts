import type { CommandResult } from '../../runtime/commands.js';
import type { TransportPort } from '../../runtime/ports.js';
import type { BattleSession } from '../../runtime/session.js';
import { newRequestId, requestOf, type CommandReplyMessage, type SocketChannel } from './socket.js';

/** How long a client waits for the primary GM's reply. */
export const REPLY_TIMEOUT_MS = 10_000;

/** Records reach a client through the session setting's `onChange`, never through the socket. */
export type RecordFeed = (listener: (session: BattleSession) => void) => () => void;

export interface SocketTransportOptions {
  channel: SocketChannel;
  /** This client's user, which a reply is addressed to. */
  userId: string;
  records: RecordFeed;
  timeoutMs?: number;
}

export interface SocketTransport extends TransportPort {
  /** A correlated reply off the channel. The host routes requests; this settles replies. */
  handleReply(message: CommandReplyMessage): void;
  /** Requests still waiting for an answer. */
  readonly pending: number;
}

/**
 * One client's line to the primary GM. `request` emits the command and waits for the reply
 * that names its `requestId`. Past the timeout the result is unknown rather than refused: the
 * command may have committed with the reply lost on the way back, so the caller waits for the
 * next record or calls `request` again with the same envelope, whose command ID the executor
 * recognizes and answers with the revision that already holds it.
 */
export function createSocketTransport({
  channel, userId, records, timeoutMs = REPLY_TIMEOUT_MS,
}: SocketTransportOptions): SocketTransport {
  interface Waiting { settle: (result: CommandResult) => void; timer: ReturnType<typeof setTimeout> }
  const waiting = new Map<string, Waiting>();

  return {
    get pending() { return waiting.size; },

    request(envelope) {
      return new Promise<CommandResult>((resolve) => {
        const requestId = newRequestId();
        const timer = setTimeout(() => {
          if (!waiting.delete(requestId)) return;
          resolve({
            ok: false, commandId: envelope.commandId, revision: envelope.expectedRevision,
            // proto: the wording rides with the player-facing text reserved for review.
            reason: 'timeout', message: 'the GM did not answer in time',
          });
        }, timeoutMs);
        waiting.set(requestId, { settle: resolve, timer });
        channel.emit(requestOf(envelope, requestId));
      });
    },

    handleReply(message) {
      if (message.targetId !== userId) return;
      // Unknown here means another client's reply, or one to a request that has already timed
      // out. Either way this client has nothing to settle.
      const pending = waiting.get(message.requestId);
      if (!pending) return;
      waiting.delete(message.requestId);
      clearTimeout(pending.timer);
      pending.settle(message.kind === 'result' ? message.result : {
        ok: false, commandId: message.commandId, revision: message.revision,
        reason: message.reason, message: message.message,
      });
    },

    onRecord: records,
  };
}

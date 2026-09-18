import type { BattleCommand, CommandEnvelope, CommandResult, RejectionReason } from '../../runtime/commands.js';

/** The wire format's own version, carried on every message. A client running an older module
 * build is told apart from foreign traffic by it. */
export const PROTOCOL_VERSION = 1;

/** Foundry relays anything emitted on a module's own channel to every other client. */
export const socketChannel = (moduleId: string): string => `module.${moduleId}`;

/** One command, sent to the primary GM. The command's own envelope rides here whole: the
 * `requestId` correlates this transmission with its reply, and the `commandId` is what stays
 * the same when the client resends. */
export interface CommandRequestMessage {
  protocolVersion: number;
  kind: 'request';
  requestId: string;
  commandId: string;
  battleId: string;
  expectedRevision: number;
  userId: string;
  command: BattleCommand;
}

/** The executor's answer, accepted or refused. */
export interface CommandResultMessage {
  protocolVersion: number;
  kind: 'result';
  requestId: string;
  /** Foundry has no point-to-point emit, so every client hears the reply and the one named
   * here is the one that resolves. */
  targetId: string;
  result: CommandResult;
}

/** The command never reached the executor: a sender the table does not know, or a failure in
 * the receive path itself. It carries a reason so a client reads one shape either way. */
export interface CommandErrorMessage {
  protocolVersion: number;
  kind: 'error';
  requestId: string;
  targetId: string;
  commandId: string;
  revision: number;
  reason: RejectionReason;
  message: string;
}

export type CommandReplyMessage = CommandResultMessage | CommandErrorMessage;
export type SocketMessage = CommandRequestMessage | CommandReplyMessage;

const isString = (value: unknown): value is string => typeof value === 'string';

/**
 * The envelope guard. Another module emitting on this channel, a build speaking a later
 * protocol, or a hand-made message drops here rather than reaching the executor. The command's
 * own `type` is left to the executor, which answers an unknown one with `unsupported`.
 */
export function asSocketMessage(value: unknown): SocketMessage | null {
  if (!value || typeof value !== 'object') return null;
  const message = value as Partial<SocketMessage>;
  if (message.protocolVersion !== PROTOCOL_VERSION || !isString(message.requestId)) return null;
  switch (message.kind) {
    case 'request': {
      const request = message as CommandRequestMessage;
      const command = request.command as { type?: unknown } | undefined;
      return isString(request.commandId) && isString(request.battleId) && isString(request.userId)
        && Number.isInteger(request.expectedRevision) && !!command && isString(command.type)
        ? request : null;
    }
    case 'result': {
      const reply = message as CommandResultMessage;
      return isString(reply.targetId) && !!reply.result && typeof reply.result.ok === 'boolean'
        ? reply : null;
    }
    case 'error': {
      const reply = message as CommandErrorMessage;
      return isString(reply.targetId) && isString(reply.commandId) && isString(reply.message)
        ? reply : null;
    }
    default:
      return null;
  }
}

export const envelopeOf = ({ battleId, commandId, expectedRevision, userId, command }: CommandRequestMessage): CommandEnvelope =>
  ({ battleId, commandId, expectedRevision, userId, command });

export const requestOf = (envelope: CommandEnvelope, requestId: string): CommandRequestMessage =>
  ({ protocolVersion: PROTOCOL_VERSION, kind: 'request', requestId, ...envelope });

export const resultOf = (requestId: string, targetId: string, result: CommandResult): CommandResultMessage =>
  ({ protocolVersion: PROTOCOL_VERSION, kind: 'result', requestId, targetId, result });

export const errorOf = (
  requestId: string, targetId: string, commandId: string, revision: number,
  reason: RejectionReason, message: string,
): CommandErrorMessage =>
  ({ protocolVersion: PROTOCOL_VERSION, kind: 'error', requestId, targetId, commandId, revision, reason, message });

// proto: the ID format rides with the battle, unit, and command IDs reserved for review.
export const newRequestId = (): string =>
  `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** The module's socket channel, as this adapter uses it. Named so the transport and the host
 * test against a fake, the way the settings adapters test against a fake `WorldSettingStorage`. */
export interface SocketChannel {
  emit(message: SocketMessage): void;
  on(handler: (message: unknown) => void): void;
}

export function foundrySocketChannel(moduleId: string): SocketChannel {
  const channel = socketChannel(moduleId);
  return {
    emit: (message) => { game.socket?.emit(channel, message); },
    on: (handler) => { game.socket?.on(channel, handler); },
  };
}

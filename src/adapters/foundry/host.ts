import { newCommandId, type BattleCommand, type CommandResult, type RejectionReason } from '../../runtime/commands.js';
import { reseatAssignment } from '../../runtime/control.js';
import { createRuntime, type Runtime } from '../../runtime/createRuntime.js';
import type { BattleArchive, BattleSites, DicePort, SessionRepository } from '../../runtime/ports.js';
import type { BattleSession } from '../../runtime/session.js';
import type { ActorWritebackPort, CampaignOutcomePort } from '../../services/OutcomeApplicationService.js';
import { foundryCampaignPort, foundryTroopWriteback } from './campaign.js';
import { foundryChatPoster, publishCommit, type ChatPoster } from './chat.js';
import {
  asSocketMessage, envelopeOf, errorOf, resultOf,
  type CommandRequestMessage, type SocketChannel,
} from './socket.js';
import { createSocketTransport, type RecordFeed, type SocketTransport } from './socketTransport.js';
import { foundryPresence, holdsAuthority, primaryGmRepository, type TableUsers } from './table.js';

/** Where the table's authority stands, as one client sees it. The app raises its `authority`
 * notice from this and disables commands while nobody can run them. */
export interface AuthorityReport {
  primaryGm: string | null;
  handingOff: boolean;
  /** A command this client sent went unanswered; whether it committed is unknown. */
  unanswered: boolean;
}

export interface BattlefieldHostOptions {
  users: TableUsers;
  channel: SocketChannel;
  repository: SessionRepository;
  archive: BattleArchive;
  sites?: BattleSites;
  records: RecordFeed;
  dice?: DicePort;
  /** Where a resolved check's chat card goes. Defaults to the real `ChatMessage.create`
   * wrapper; tests hand in a fake that just records the cards it was given. */
  chat?: ChatPoster;
  /** Where the final outcome goes. ReignMaker when it is installed, the troop actors otherwise. */
  campaign?: CampaignOutcomePort;
  actors?: ActorWritebackPort;
  onAuthority?: (report: AuthorityReport) => void;
  /** A failure no command result carries: a runtime that would not build, a chat card, a
   * request that could not be answered. */
  onError?: (error: unknown) => void;
}

export interface BattlefieldHost {
  /** The executor, on the primary GM's client and nowhere else. */
  readonly runtime: Runtime | null;
  readonly transport: SocketTransport;
  /** The record this client holds: its own committed one, or the last one delivered to it. */
  readonly session: BattleSession | null;
  /**
   * Read `game.users.activeGM` again and take up or lay down the authority. The client that
   * becomes primary loads the committed session and builds a runtime around it, so its undo
   * history starts empty; the one that loses it drops its executor and sends like a player.
   */
  refresh(): Promise<void>;
  /**
   * Fit the seating to the users the world now holds. The primary GM commits it; every other
   * client reads the result off the record. A roster event that changes no seat commits
   * nothing.
   */
  reseat(): Promise<void>;
  /** Every message off the module channel, guarded before anything reads it. */
  handleMessage(raw: unknown): void;
  /** One command, run here when this client is the primary GM and sent over the socket when it
   * is not — a secondary GM included. */
  submit(command: BattleCommand): Promise<CommandResult>;
}

interface Gate { promise: Promise<void>; open: () => void }

const closedGate = (): Gate => {
  let open = (): void => {};
  const promise = new Promise<void>((resolve) => { open = resolve; });
  return { promise, open };
};

/**
 * The module's own client: the primary GM's executor, or a line to whoever holds it.
 *
 * Foundry replays buffered socket events before `ready`, so an inbound request waits on the
 * readiness gate before anything looks at it. The gate closes again for the length of a
 * handoff, which is what pauses commands while the new primary loads the committed record.
 */
export function createBattlefieldHost({
  users, channel, repository, archive, sites, records, dice, chat = foundryChatPoster(),
  campaign = foundryCampaignPort(), actors = foundryTroopWriteback(), onAuthority,
  onError = (error) => { console.error('battlefield |', error); },
}: BattlefieldHostOptions): BattlefieldHost {
  let runtime: Runtime | null = null;
  // This client holds the authority but its runtime would not build, so nobody can execute.
  let failed = false;
  let delivered: BattleSession | null = null;
  let primaryGm: string | null = null;
  let handingOff = false;
  let unanswered = false;
  let started = false;
  let gate = closedGate();

  const presence = foundryPresence(users);
  const report = (): void => onAuthority?.({ primaryGm, handingOff, unanswered });

  const transport = createSocketTransport({ channel, userId: () => users.currentUserId(), records });

  // A delivered record is word from the authority, so it ends both the handoff this client was
  // waiting out and the doubt a lost reply left.
  records((session) => {
    delivered = session;
    if (!handingOff && !unanswered) return;
    handingOff = false;
    unanswered = false;
    report();
  });

  const refuse = (reason: RejectionReason, message: string): CommandResult => ({
    ok: false, commandId: newCommandId(), revision: delivered?.revision ?? 0, reason, message,
  });

  function noteAnswer(result: CommandResult): CommandResult {
    const lost = !result.ok && result.reason === 'timeout';
    if (lost !== unanswered) {
      unanswered = lost;
      report();
    }
    return result;
  }

  async function build(): Promise<Runtime> {
    const session = await repository.load();
    const rt = createRuntime({
      repository: primaryGmRepository(repository, users),
      archive,
      sites,
      session,
      dice,
      policy: { userId: users.currentUserId(), presence },
      campaign,
      actors,
    });
    // This client's own executor is the one that just committed, so it is the one client that
    // should post the cards — not every client that happens to hold a copy of the record.
    // proto: cards keep their order inside one commit; two commits landing back to back can
    // interleave theirs, since nothing chains one publish onto the last.
    rt.subscribe((next) => { publishCommit(next.lastCommit?.events ?? [], chat).catch(onError); });
    return rt;
  }

  async function reseat(): Promise<void> {
    const executor = runtime;
    if (!executor) return;
    const control = reseatAssignment(executor.session.control, presence);
    // A refusal — a finalized battle, an authority that has just moved — leaves the seating
    // where it stands, and the next roster event asks again.
    if (control) await executor.submit({ type: 'control.assign', control });
  }

  async function refresh(): Promise<void> {
    const next = users.primaryGmId();
    // A handoff is one primary giving way to another. Losing the last GM is the `absent` case,
    // which the notice states on its own.
    if (next !== primaryGm && primaryGm !== null && next !== null) handingOff = true;
    primaryGm = next;
    const take = next !== null && next === users.currentUserId();
    if (started && take === (runtime !== null)) {
      report();
      await reseat();
      return;
    }

    if (started) gate = closedGate();
    started = true;
    report();
    try {
      runtime = take ? await build() : null;
      failed = false;
    } catch (error) {
      runtime = null;
      failed = true;
      onError(error);
    } finally {
      handingOff = false;
      gate.open();
      report();
    }
    await reseat();
  }

  // proto: placeholder wording.
  const unopened = 'the GM’s client could not open the battle';

  async function serve(request: CommandRequestMessage): Promise<void> {
    await gate.promise;
    const executor = runtime;
    // Silence here would leave the sender waiting out its timeout for an answer nobody sends.
    if (!executor && failed && holdsAuthority(users)) {
      channel.emit(errorOf(request.requestId, request.userId, request.commandId,
        delivered?.revision ?? 0, 'storage', unopened));
      return;
    }
    // A secondary GM and every player hear this request and leave it alone: one client runs it.
    if (!executor || !holdsAuthority(users)) return;
    const reply = (result: CommandResult): void =>
      channel.emit(resultOf(request.requestId, request.userId, result));
    // The sender names itself in the envelope, so this is a check against the table's active
    // users rather than proof of identity; the model assumes a cooperative Foundry table. The
    // executor's own policy rules on what that user may do.
    if (!users.isActive(request.userId)) {
      channel.emit(errorOf(request.requestId, request.userId, request.commandId,
        executor.session.revision, 'permission', 'the table does not know that user'));
      return;
    }
    try {
      reply(await executor.execute(envelopeOf(request)));
    } catch (error) {
      channel.emit(errorOf(request.requestId, request.userId, request.commandId,
        executor.session.revision, 'engine', error instanceof Error ? error.message : String(error)));
    }
  }

  return {
    get runtime() { return runtime; },
    get session() { return runtime?.session ?? delivered; },
    transport,
    refresh,
    reseat,

    handleMessage(raw) {
      const message = asSocketMessage(raw);
      if (!message) return;
      if (message.kind === 'request') serve(message).catch(onError);
      else transport.handleReply(message);
    },

    submit(command) {
      if (runtime) return runtime.submit(command).then(noteAnswer);
      // The socket does not echo to its sender, so the primary's own request would go unheard.
      if (failed && holdsAuthority(users)) return Promise.resolve(refuse('storage', unopened));
      if (primaryGm === null) return Promise.resolve(refuse('permission', 'no GM is at the table'));
      const record = delivered;
      if (!record) return Promise.resolve(refuse('battle', 'no battle has reached this client yet'));
      return transport.request({
        battleId: record.battleId,
        commandId: newCommandId(),
        expectedRevision: record.revision,
        userId: users.currentUserId(),
        command,
      }).then(noteAnswer);
    },
  };
}

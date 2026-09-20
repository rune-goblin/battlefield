import type { BoardSpec, DayOrder, RecoveryChoice, Side, UnitCard } from '../engine/index.js';
import { createLocalArchive } from '../adapters/browser/localArchive.js';
import { createLocalRepository, loadSessionSync } from '../adapters/browser/localRepository.js';
import { createRuntime } from '../runtime/createRuntime.js';
import type { StoreClient, TableSummons } from './client.js';
import { createPresentation } from './presentation.js';
import { sideReady as readyIn } from '../services/ArmyPreparationService.js';
import { newCommandId, type BattleCommand, type CommandResult, type PaintStroke, type PieceRef, type TacticalAction } from '../runtime/commands.js';
import type { HistorySnapshot } from '../runtime/executeCommand.js';
import { submissionOf } from '../runtime/interactions.js';
import type { ControlAssignment } from '../runtime/control.js';
import type { ArchiveEntry, TableUser } from '../runtime/ports.js';
import type { BattleSession, BattleSetupDraft, SetupEngine, SetupUnit } from '../runtime/session.js';

export type Setup = BattleSetupDraft;
export type { SetupEngine, SetupUnit };
export type { ArchiveEntry };

const localArchive = createLocalArchive();
// proto: the browser's runtime is built on every host, and a Foundry client replaces it through
// `bindClient` before its window opens.
const local = createRuntime({ repository: createLocalRepository(), archive: localArchive, session: loadSessionSync() });
let runtime = $state.raw<StoreClient>({
  get session() { return local.session; },
  get history() { return local.history; },
  userId: local.userId,
  gmUserId: () => local.gmUserId(),
  tableUsers: () => local.tableUsers(),
  submit: (command) => local.submit(command),
  subscribe: (listener) => local.subscribe(listener),
  archive: localArchive,
});

/** What every view reads. The committed record lands here and nothing else writes it; a view
 * that wants a change submits a command and waits for the record that comes back. */
export const game = $state({
  // A copy of the committed draft, kept so a view that reads it cannot reach the executor's
  // own record. Every command's result lands here through `adoptSetup`.
  setup: structuredClone(runtime.session.setup),
  battle: runtime.session.battle,
  battleId: runtime.session.battleId,
  history: [] as HistorySnapshot[],
  /** The shared decisions this stage is waiting on. A panel reads its side's submission here
   * rather than holding one of its own. */
  interactions: runtime.session.interactions,
  /** Whose activation is open, for every client to show. */
  turn: runtime.session.turn,
  control: runtime.session.control,
});

/** The record's board the local copy was taken from. It is replaced only when the record's own
 * changed: a fresh object costs the PIXI view a full redraw, and a placement command leaves the
 * terrain exactly where it was. */
let adoptedBoard = runtime.session.setup.board;

function adoptSetup(committed: BattleSetupDraft): void {
  const next = structuredClone(committed);
  game.setup.spec = next.spec;
  game.setup.units = next.units;
  game.setup.emplacements = next.emplacements;
  game.setup.roundsPerDay = next.roundsPerDay;
  if (committed.board !== adoptedBoard) game.setup.board = next.board;
  adoptedBoard = committed.board;
}

/** What the board plays after each commit. It observes the record before the store adopts it: a
 * token spends its route on the move the new positions trigger, so the route has to be on the
 * board before the tokens are. */
export const presentation = createPresentation(runtime.session);

const recordListeners = new Set<() => void>();
/** Called after the store adopts a record, whoever's command made it. */
export const onRecord = (listener: () => void): void => { recordListeners.add(listener); };

function adopt(session: BattleSession): void {
  game.battle = session.battle;
  game.battleId = session.battleId;
  game.history = [...runtime.history];
  game.interactions = session.interactions;
  game.turn = session.turn;
  game.control = session.control;
  adoptSetup(session.setup);
  for (const listener of [...recordListeners]) listener();
}

const follow = (client: StoreClient) => client.subscribe((session) => {
  presentation.observe(session);
  adopt(session);
});
let unfollow = follow(runtime);

/** Hand the store to another client. The host adapter calls this once, before its window
 * mounts; the record the new client holds replaces the local one outright. */
export function bindClient(client: StoreClient): void {
  unfollow();
  runtime = client;
  presentation.reset(client.session);
  adopt(client.session);
  unfollow = follow(client);
}

/** Who this client plays as, and who answers for the table. The panels read their own part in
 * the record from these. */
export const viewerId = (): string => runtime.userId;
export const gmUserId = () => runtime.gmUserId();

// A user who connects or drops changes no seat, so no record arrives to say so.
let presenceTick = $state(0);
/** The host calls this when someone connects or drops. */
export const presenceChanged = (): void => { presenceTick += 1; };

// The call is a world setting of its own, outside the record, so no record says it changed.
let tableTick = $state(0);
/** The host calls this when the GM's call to the table is made or dismissed. */
export const tableChanged = (): void => { tableTick += 1; };
export const tableSummons = (): TableSummons | null => runtime.table ?? null;
/** Read through the tick: the summons is the same object before and after a call. */
export const tableCalled = (): boolean => { void tableTick; return runtime.table?.called ?? false; };

/** Everyone the host would seat, for the GM's seating controls. */
export const tableUsers = (): TableUser[] => { void presenceTick; return runtime.tableUsers(); };

const submit = (command: BattleCommand) => runtime.submit(command);

/** A refusal the store makes on its own, shaped like the executor's so a view reads one thing. */
const refuse = (message: string): Promise<CommandResult> => Promise.resolve({
  ok: false, commandId: newCommandId(), revision: runtime.session.revision, reason: 'stage', message,
});

export const generate = () => submit({ type: 'setup.generate' });
export const rerollSeed = () => submit({ type: 'setup.rerollSeed' });
export const editSpec = (spec: Partial<BoardSpec>) => submit({ type: 'setup.editSpec', spec });
export const setRoundsPerDay = (roundsPerDay: number) => submit({ type: 'setup.setRoundsPerDay', roundsPerDay });
export const paintStroke = (stroke: PaintStroke) => submit({ type: 'setup.paint', stroke });

// Plain data crosses the command boundary: a Svelte proxy would reach `structuredClone` in the
// service, and a socket in Phase 4.
const plain = (piece: PieceRef): PieceRef => ({ kind: piece.kind, id: piece.id });

export const addUnit = (side: Side, card: UnitCard) =>
  submit({ type: 'army.addUnit', side, card: $state.snapshot(card) as UnitCard });
export const setUnitSide = (unitId: string, side: Side) => submit({ type: 'army.setSide', unitId, side });
export const swapSides = () => submit({ type: 'army.swapSides' });
export const removeUnit = (unitId: string) => submit({ type: 'army.removeUnit', unitId });
export const addEmplacement = (side: Side, engine: string) => submit({ type: 'army.addEmplacement', side, engine });
export const removeEmplacement = (emplacementId: string) => submit({ type: 'army.removeEmplacement', emplacementId });
export const setHauling = (emplacementId: string, hauling: boolean) => submit({ type: 'army.setHauling', emplacementId, hauling });
export const placePiece = (piece: PieceRef, square: string) => submit({ type: 'army.place', piece: plain(piece), square });
export const unplacePiece = (piece: PieceRef) => submit({ type: 'army.unplace', piece: plain(piece) });
export const autoPlacePiece = (piece: PieceRef) => submit({ type: 'army.autoPlace', piece: plain(piece) });
export const generateForce = (side: Side) => submit({ type: 'army.generateForce', side });

/** Every piece of this army stands on a square. The word that starts a battle is the
 * declaration below; this is what lets an army give it. */
export const sideReady = (side: Side): boolean => readyIn(game.setup, side);

/** One army's word that it has finished deploying. The battle starts once both have given it. */
export const declareReady = (side: Side, ready: boolean) =>
  submit({ type: 'army.declareReady', side, ready });

export const declaredReady = (side: Side): boolean =>
  submissionOf(game.interactions, 'army.readiness', side) === true;

/** The GM hands the open turn to another seat on the pending side. */
export const reassignTurn = (userId: string) => submit({ type: 'turn.reassign', userId });

/** Who plays which army. The GM sends it; the authority fits it to the users it can see. */
export const assignSeating = (control: ControlAssignment) => submit({
  type: 'control.assign',
  control: {
    mode: control.mode,
    gmSide: control.gmSide,
    seats: { attacker: [...control.seats.attacker], defender: [...control.seats.defender] },
  },
});

/** Deploy the prepared setup. The navigation store opens the battle stage on success. */
export const startBattle = () => submit({ type: 'battle.start' });

export const takeAction = (action: TacticalAction) => submit({ type: 'action.resolve', action });

// Choosing which of the pending side's units acts next is not an activation itself — no
// history entry, so Undo still rewinds to the last completed activation, not to a mid-pick
// selection.
export const selectUnit = (id: string) => submit({ type: 'activation.select', unitId: id });

export const deselectUnit = () => submit({ type: 'activation.deselect' });

/** Stop the active unit's activation with actions unspent — also the pass, since a unit that
 * has done nothing may end too. */
export function endActivation() {
  const id = game.battle?.active;
  return id ? submit({ type: 'activation.end', unitId: id }) : refuse('no unit is activating');
}

export const undo = () => submit({ type: 'session.undo' });

/** Drop the battle under way and reopen the setup draft that made it. */
export const endBattle = () => submit({ type: 'battle.returnToSetup' });

/** Throw the draft away and start from the example force. */
export const resetSetup = () => submit({ type: 'battle.reset' });

/** Each army declares its own recovery and rolls it at once. */
export const declareRecovery = (side: Side, choices: RecoveryChoice[]) =>
  submit({ type: 'continuation.declareRecovery', side, choices: choices.map((c) => ({ ...c })) });

export const chooseDayOrder = (side: Side, order: DayOrder) =>
  submit({ type: 'continuation.declareDayOrder', side, order });

export const confirmDayOrders = () => submit({ type: 'continuation.confirmDayOrders' });

export const respondToSurrender = (side: Side, accept: boolean) =>
  submit({ type: 'continuation.answerSurrender', side, accept });

/** Null keeps today's ground; a partial spec generates tomorrow's on the authority. */
export const chooseNextBattlefield = (spec: Partial<BoardSpec> | null) =>
  submit({ type: 'continuation.chooseBattlefield', spec: spec && { ...spec } });

export const declareDeployment = (side: Side, positions: Record<string, string>) =>
  submit({ type: 'continuation.declareDeployment', side, positions: { ...positions } });

export const startNextDay = () => submit({ type: 'continuation.startNextDay' });

export const listSaves = (): Promise<ArchiveEntry[]> => runtime.archive.list();
// Reads the record straight from the executor: `game.setup` is the panel's own copy, and a
// battle in progress has no local shadow at all.
export async function saveBattle(name: string): Promise<ArchiveEntry> {
  const session = runtime.session;
  const entry = await runtime.archive.save(name, session);
  savedAt = `${session.battleId}:${session.revision}`;
  savedTick += 1;
  return entry;
}
export const loadBattle = (slot: string) => submit({ type: 'session.load', slot });

// proto: a save made on another client, or before a reload, is unknown here, so the GM is asked
// once more than they need to be.
let savedAt = '';
let savedTick = $state(0);
/** Whether the battle under way has moved since this client last saved it. */
export const battleUnsaved = (): boolean => {
  void savedTick;
  return game.battle !== null && savedAt !== `${runtime.session.battleId}:${runtime.session.revision}`;
};
export const removeSave = (slot: string): Promise<void> => runtime.archive.remove(slot);
export const exportSave = (slot: string): Promise<string> => runtime.archive.export(slot);
export const importSave = (data: string): Promise<ArchiveEntry> => runtime.archive.import(data);

// Module-level $state is seeded once from the saved session; a hot patch would keep the old game.
if (import.meta.hot) import.meta.hot.accept(() => import.meta.hot!.invalidate());

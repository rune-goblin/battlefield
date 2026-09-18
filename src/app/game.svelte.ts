import {
  createBattle, ENGINES, randomRng, recoverAtNight, startNextDay,
  type Board, type BoardSpec, type BattleState, type Side, type RecoveryChoice, type UnitCard,
} from '../engine/index.js';
import { createLocalRepository, loadSessionSync } from '../adapters/browser/localRepository.js';
import { createRuntime } from '../runtime/createRuntime.js';
import { sideReady as readyIn } from '../services/ArmyPreparationService.js';
import { newCommandId, type BattleCommand, type CommandResult, type PaintStroke, type PieceRef, type TacticalAction } from '../runtime/commands.js';
import type { HistorySnapshot, SessionEdit } from '../runtime/executeCommand.js';
import { defaultSetup, type BattleSession, type BattleSetupDraft, type SetupEngine, type SetupUnit } from '../runtime/session.js';
import { answerSurrender, declareDayOrder, resolveDayOrders, type DayOrder } from '../engine/index.js';

export type Stage = 'board' | 'paint' | 'attackers' | 'defenders' | 'battle';
export type Setup = BattleSetupDraft;
export type { SetupEngine, SetupUnit };

const STAGES: Stage[] = ['board', 'paint', 'attackers', 'defenders', 'battle'];
/** The side each deployment stage edits. */
export const STAGE_SIDE: Partial<Record<Stage, Side>> = { attackers: 'attacker', defenders: 'defender' };

const runtime = createRuntime({ repository: createLocalRepository(), session: loadSessionSync() });

/** The record keeps the lifecycle stage. Which setup tab was open is local state, with no
 * store of its own until Wave 2.5, so a reload resumes at the first unfinished one. */
function openingStage(s: BattleSession): Stage {
  if (s.battle) return 'battle';
  if (!s.setup.board) return 'board';
  return readyIn(s.setup, 'attacker') ? 'defenders' : 'attackers';
}

export const game = $state({
  stage: openingStage(runtime.session),
  // The setup panels edit this copy and `save` writes it to the record; the executor's own
  // copy stays untouched between saves.
  setup: structuredClone(runtime.session.setup),
  battle: runtime.session.battle,
  history: [] as HistorySnapshot[],
});

// The read store: every committed record lands here, whichever path wrote it.
runtime.subscribe((session) => {
  game.battle = session.battle;
  game.history = [...runtime.history];
});

/** The record's lifecycle stage follows the battle; which setup tab is open is local. */
const staged = (s: BattleSession): BattleSession => ({ ...s, stage: s.battle ? 'battle' : 'setup' });

// proto: the writes Phase 2 turns into commands. They commit through the executor so the
// record has one writer, and they carry the store's own state in rather than a service's.
const write = (edit: SessionEdit, history: 'keep' | 'clear' = 'keep') =>
  runtime.change((s) => staged(edit(s)), history);

const submit = (command: BattleCommand) => runtime.submit(command);

/** A refusal the store makes on its own, shaped like the executor's so a view reads one thing. */
const refuse = (message: string): Promise<CommandResult> => Promise.resolve({
  ok: false, commandId: newCommandId(), revision: runtime.session.revision, reason: 'stage', message,
});

function battleOf(s: BattleSession): BattleState {
  if (!s.battle) throw new Error('no battle is under way');
  return s.battle;
}

export const save = () => write((s) => ({ ...s, setup: $state.snapshot(game.setup) }));

/** The record's board the panel's copy was taken from. */
let syncedBoard = runtime.session.setup.board;

/** The services compute the next `setup` on the executor's own copy, so the panel's local one
 * resyncs from the committed record afterward — unlike `save`, which still carries the panel's
 * own edit in, for the fields Phase 2 has yet to turn into a command. The board is replaced
 * only when the record's own changed: a fresh object costs the PIXI view a full redraw, and a
 * placement command leaves the terrain exactly where it was. */
function syncSetup(): void {
  const committed = runtime.session.setup;
  const next = structuredClone(committed);
  game.setup.spec = next.spec;
  game.setup.units = next.units;
  game.setup.emplacements = next.emplacements;
  game.setup.roundsPerDay = next.roundsPerDay;
  if (committed.board !== syncedBoard) game.setup.board = next.board;
  syncedBoard = committed.board;
}

async function submitSetup(command: BattleCommand): Promise<CommandResult> {
  const result = await submit(command);
  if (result.ok) syncSetup();
  return result;
}

export const generate = () => submitSetup({ type: 'setup.generate' });
export const rerollSeed = () => submitSetup({ type: 'setup.rerollSeed' });
export const editSpec = (spec: Partial<BoardSpec>) => submitSetup({ type: 'setup.editSpec', spec });
export const setRoundsPerDay = (roundsPerDay: number) => submitSetup({ type: 'setup.setRoundsPerDay', roundsPerDay });
export const paintStroke = (stroke: PaintStroke) => submitSetup({ type: 'setup.paint', stroke });

// Plain data crosses the command boundary: a Svelte proxy would reach `structuredClone` in the
// service, and a socket in Phase 4.
const plain = (piece: PieceRef): PieceRef => ({ kind: piece.kind, id: piece.id });

export const addUnit = (side: Side, card: UnitCard) =>
  submitSetup({ type: 'army.addUnit', side, card: $state.snapshot(card) as UnitCard });
export const removeUnit = (unitId: string) => submitSetup({ type: 'army.removeUnit', unitId });
export const addEmplacement = (side: Side, engine: string) => submitSetup({ type: 'army.addEmplacement', side, engine });
export const removeEmplacement = (emplacementId: string) => submitSetup({ type: 'army.removeEmplacement', emplacementId });
export const attachEquipment = (unitId: string, engine: string) => submitSetup({ type: 'army.attachEquipment', unitId, engine });
export const detachEquipment = (unitId: string, equipmentId: string) => submitSetup({ type: 'army.detachEquipment', unitId, equipmentId });
export const placePiece = (piece: PieceRef, square: string) => submitSetup({ type: 'army.place', piece: plain(piece), square });
export const unplacePiece = (piece: PieceRef) => submitSetup({ type: 'army.unplace', piece: plain(piece) });
export const autoPlacePiece = (piece: PieceRef) => submitSetup({ type: 'army.autoPlace', piece: plain(piece) });
export const generateForce = (side: Side) => submitSetup({ type: 'army.generateForce', side });

export const sideReady = (side: Side): boolean => readyIn(game.setup, side);

export const ready = () => sideReady('attacker') && sideReady('defender');

/** What the rail's forward button does and says on the current stage. */
export function forward(): { label: string; enabled: boolean; go: () => void } {
  if (game.stage === 'board') return { label: 'Next: paint', enabled: !!game.setup.board, go: next };
  if (game.stage === 'paint') return { label: 'Next: the attacking force', enabled: !!game.setup.board, go: next };
  if (game.stage === 'attackers') return { label: 'Next: the defending force', enabled: sideReady('attacker'), go: next };
  return { label: 'Begin the battle', enabled: ready(), go: startBattle };
}

export function next() {
  const i = STAGES.indexOf(game.stage);
  if (i < STAGES.length - 2) { game.stage = STAGES[i + 1]; void save(); }
}

export function back() {
  const i = STAGES.indexOf(game.stage);
  if (i > 0) { game.stage = STAGES[i - 1]; void save(); }
}

/** Jump straight to any setup stage, not just the adjacent one `next`/`back` reach — the rail's
 * step buttons use this so switching between board/paint/attackers/defenders during setup
 * doesn't cost a walk back through every stage in between. `battle` isn't a valid target:
 * it's reached only through `startBattle`, once both sides are ready. */
export function goToStage(stage: Stage) {
  if (stage === 'battle' || (stage !== 'board' && !game.setup.board)) return;
  game.stage = stage;
  void save();
}

export async function startBattle() {
  const setup = $state.snapshot(game.setup);
  const board = setup.board;
  if (!board) return refuse('generate a board first');
  const result = await write((s) => ({
    ...s,
    setup,
    battle: createBattle(
      {
        board,
        roundsPerDay: setup.roundsPerDay,
        units: setup.units.map((u) => ({
          id: u.id,
          card: u.card,
          side: u.side,
          square: u.square!,
          engines: u.engines
            .map((e) => ({ id: e.id, card: ENGINES.find((x) => x.name === e.name)! }))
            .filter((e) => e.card),
        })),
        engines: setup.emplacements
          .filter((e) => e.square)
          .map((e) => ({ id: e.id, card: ENGINES.find((x) => x.name === e.name)!, side: e.side, square: e.square! }))
          .filter((e) => e.card),
      },
      randomRng,
    ),
  }), 'clear');
  if (result.ok) game.stage = 'battle';
  return result;
}

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

/** A setup undo restores a whole `BattleSetupDraft` snapshot; resync the local copy the same
 * way a setup command does. A battle undo leaves `setup` untouched, so this is a no-op then. */
export async function undo(): Promise<CommandResult> {
  const result = await runtime.undo();
  if (result.ok) syncSetup();
  return result;
}

export function backToSetup() {
  game.stage = 'attackers';
  return write((s) => ({ ...s, battle: null }), 'clear');
}

// A committed night is a new boundary: undo cannot reroll its recovery checks.
export const resolveNight = (choices: RecoveryChoice[]) =>
  write((s) => ({ ...s, battle: recoverAtNight(battleOf(s), choices, randomRng) }), 'clear');

export const continueBattle = (positions: Record<string, string>) =>
  write((s) => ({ ...s, battle: startNextDay(battleOf(s), positions) }), 'clear');

export const chooseNextBattlefield = (board: Board | null) => write((s) => {
  const battle = battleOf(s);
  if (battle.phase !== 'ended' || battle.endedBy !== 'dusk') throw new Error('the day is not over');
  return { ...s, battle: { ...battle, nextBoard: board } };
});

export const chooseDayOrder = (side: Side, order: DayOrder) =>
  write((s) => ({ ...s, battle: declareDayOrder(battleOf(s), side, order) }));

export const confirmDayOrders = () =>
  write((s) => ({ ...s, battle: resolveDayOrders(battleOf(s)) }), 'clear');

export const respondToSurrender = (side: Side, accept: boolean) =>
  write((s) => ({ ...s, battle: answerSurrender(battleOf(s), side, accept) }), 'clear');

export function resetSetup() {
  game.setup = defaultSetup();
  game.stage = 'board';
  const setup = $state.snapshot(game.setup);
  return write((s) => ({ ...s, setup, battle: null }), 'clear');
}

// Module-level $state is seeded once from the saved session; a hot patch would keep the old game.
if (import.meta.hot) import.meta.hot.accept(() => import.meta.hot!.invalidate());

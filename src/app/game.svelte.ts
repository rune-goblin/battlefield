import type { BoardSpec, DayOrder, RecoveryChoice, Side, UnitCard } from '../engine/index.js';
import { createLocalRepository, loadSessionSync } from '../adapters/browser/localRepository.js';
import { createRuntime } from '../runtime/createRuntime.js';
import { sideReady as readyIn } from '../services/ArmyPreparationService.js';
import { newCommandId, type BattleCommand, type CommandResult, type PaintStroke, type PieceRef, type TacticalAction } from '../runtime/commands.js';
import type { HistorySnapshot } from '../runtime/executeCommand.js';
import type { BattleSession, BattleSetupDraft, SetupEngine, SetupUnit } from '../runtime/session.js';

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
  // A copy of the committed draft, kept so a view that reads it cannot reach the executor's
  // own record. Every command's result lands here through `adoptSetup`.
  setup: structuredClone(runtime.session.setup),
  battle: runtime.session.battle,
  history: [] as HistorySnapshot[],
  nightDeclarations: runtime.session.nightDeclarations,
  nextDeployment: runtime.session.nextDeployment,
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

// The read store: every committed record lands here, and nothing else writes it.
runtime.subscribe((session) => {
  game.battle = session.battle;
  game.history = [...runtime.history];
  game.nightDeclarations = session.nightDeclarations;
  game.nextDeployment = session.nextDeployment;
  adoptSetup(session.setup);
});

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
export const removeUnit = (unitId: string) => submit({ type: 'army.removeUnit', unitId });
export const addEmplacement = (side: Side, engine: string) => submit({ type: 'army.addEmplacement', side, engine });
export const removeEmplacement = (emplacementId: string) => submit({ type: 'army.removeEmplacement', emplacementId });
export const attachEquipment = (unitId: string, engine: string) => submit({ type: 'army.attachEquipment', unitId, engine });
export const detachEquipment = (unitId: string, equipmentId: string) => submit({ type: 'army.detachEquipment', unitId, equipmentId });
export const placePiece = (piece: PieceRef, square: string) => submit({ type: 'army.place', piece: plain(piece), square });
export const unplacePiece = (piece: PieceRef) => submit({ type: 'army.unplace', piece: plain(piece) });
export const autoPlacePiece = (piece: PieceRef) => submit({ type: 'army.autoPlace', piece: plain(piece) });
export const generateForce = (side: Side) => submit({ type: 'army.generateForce', side });

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
  if (i < STAGES.length - 2) game.stage = STAGES[i + 1];
}

export function back() {
  const i = STAGES.indexOf(game.stage);
  if (i > 0) game.stage = STAGES[i - 1];
}

/** Jump straight to any setup stage, not just the adjacent one `next`/`back` reach — the rail's
 * step buttons use this so switching between board/paint/attackers/defenders during setup
 * doesn't cost a walk back through every stage in between. `battle` isn't a valid target:
 * it's reached only through `startBattle`, once both sides are ready. */
export function goToStage(stage: Stage) {
  if (stage === 'battle' || (stage !== 'board' && !game.setup.board)) return;
  game.stage = stage;
}

export async function startBattle(): Promise<CommandResult> {
  const result = await submit({ type: 'battle.start' });
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

export const undo = () => submit({ type: 'session.undo' });

/** Drop the battle under way and reopen its setup draft on the deployment tab. */
export async function backToSetup(): Promise<CommandResult> {
  const result = await submit({ type: 'battle.returnToSetup' });
  if (result.ok) game.stage = 'attackers';
  return result;
}

/** Each army declares its own recovery. The night rolls once the second declaration lands. */
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

export async function resetSetup(): Promise<CommandResult> {
  const result = await submit({ type: 'battle.reset' });
  if (result.ok) game.stage = 'board';
  return result;
}

// Module-level $state is seeded once from the saved session; a hot patch would keep the old game.
if (import.meta.hot) import.meta.hot.accept(() => import.meta.hot!.invalidate());

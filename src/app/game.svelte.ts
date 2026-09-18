import {
  act, createBattle, deselect, endActivation as endActivationEngine, ENGINES, generateBoard, canDeploy, parse, randomRng, select, recoverAtNight, startNextDay,
  type Action, type BattleState, type Board, type Side, type RecoveryChoice,
} from '../engine/index.js';
import { createLocalRepository, loadSessionSync } from '../adapters/browser/localRepository.js';
import { defaultSetup, randomSeed, type BattleSession, type BattleSetupDraft, type SetupEngine, type SetupUnit } from '../runtime/session.js';
import { answerSurrender, declareDayOrder, resolveDayOrders, type DayOrder } from '../engine/index.js';

export type Stage = 'board' | 'paint' | 'attackers' | 'defenders' | 'battle';
export type Setup = BattleSetupDraft;
export type { SetupEngine, SetupUnit };

const STAGES: Stage[] = ['board', 'paint', 'attackers', 'defenders', 'battle'];
/** The side each deployment stage edits. */
export const STAGE_SIDE: Partial<Record<Stage, Side>> = { attackers: 'attacker', defenders: 'defender' };

const repository = createLocalRepository();
let session = loadSessionSync();

/** The record keeps the lifecycle stage. Which setup tab was open is local state, with no
 * store of its own until Wave 2.5, so a reload resumes at the first unfinished one. */
function openingStage(s: BattleSession): Stage {
  if (s.battle) return 'battle';
  if (!s.setup.board) return 'board';
  return readyIn(s.setup, 'attacker') ? 'defenders' : 'attackers';
}

export const game = $state({
  stage: openingStage(session),
  setup: session.setup,
  battle: session.battle,
  history: [] as BattleState[],
});

export function save() {
  session = {
    ...session,
    stage: game.battle ? 'battle' : 'setup',
    setup: $state.snapshot(game.setup),
    battle: $state.snapshot(game.battle),
  };
  // proto: a failed write is silent, as it was. Wave 1.4 raises it under the `storage` notice.
  void repository.save(session).catch(() => {});
}

export function generate() {
  const board = generateBoard($state.snapshot(game.setup.spec));
  game.setup.board = board;
  for (const u of game.setup.units) if (u.square && !canDeploy(board, u.side, u.card.tactics?.includes('ambush') ?? false, parse(u.square))) u.square = null;
  for (const e of game.setup.emplacements) if (e.square && !canDeploy(board, e.side, false, parse(e.square))) e.square = null;
  save();
}

export function rerollSeed() {
  game.setup.spec.seed = randomSeed();
  generate();
}

/** One side is ready when it has a unit and everything it owns stands on a square. */
function readyIn(setup: Setup, side: Side): boolean {
  const us = setup.units.filter((u) => u.side === side);
  return us.length > 0 && us.every((u) => u.square !== null)
    && setup.emplacements.filter((e) => e.side === side).every((e) => e.square !== null);
}

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
  if (i < STAGES.length - 2) { game.stage = STAGES[i + 1]; save(); }
}

export function back() {
  const i = STAGES.indexOf(game.stage);
  if (i > 0) { game.stage = STAGES[i - 1]; save(); }
}

/** Jump straight to any setup stage, not just the adjacent one `next`/`back` reach — the rail's
 * step buttons use this so switching between board/paint/attackers/defenders during setup
 * doesn't cost a walk back through every stage in between. `battle` isn't a valid target:
 * it's reached only through `startBattle`, once both sides are ready. */
export function goToStage(stage: Stage) {
  if (stage === 'battle' || (stage !== 'board' && !game.setup.board)) return;
  game.stage = stage;
  save();
}

export function startBattle() {
  const board = game.setup.board;
  if (!board) return;
  game.battle = createBattle(
    {
      board: $state.snapshot(board),
      roundsPerDay: game.setup.roundsPerDay,
      units: game.setup.units.map((u) => ({
        card: $state.snapshot(u.card),
        side: u.side,
        square: u.square!,
        engines: u.engines.map((n) => ENGINES.find((e) => e.name === n)!).filter(Boolean),
      })),
      engines: game.setup.emplacements
        .filter((e) => e.square)
        .map((e) => ({ card: ENGINES.find((x) => x.name === e.name)!, side: e.side, square: e.square! }))
        .filter((e) => e.card),
    },
    randomRng,
  );
  game.history = [];
  game.stage = 'battle';
  save();
}

export function takeAction(action: Action) {
  if (!game.battle) return;
  const next = act(game.battle, action, randomRng);
  game.history = [...game.history.slice(-30), game.battle];
  game.battle = next;
  save();
}

// Choosing which of the pending side's units acts next is not an activation itself — no
// history entry, so Undo still rewinds to the last completed activation, not to a mid-pick
// selection.
export function selectUnit(id: string) {
  if (!game.battle) return;
  game.battle = select(game.battle, id);
  save();
}

export function deselectUnit() {
  if (!game.battle) return;
  game.battle = deselect(game.battle);
  save();
}

/** Stop the active unit's activation with actions unspent — also the pass, since a unit that
 * has done nothing may end too. */
export function endActivation() {
  if (!game.battle) return;
  game.history = [...game.history.slice(-30), game.battle];
  game.battle = endActivationEngine(game.battle, randomRng);
  save();
}

export function undo() {
  const prev = game.history.pop();
  if (prev) { game.battle = prev; save(); }
}

export function backToSetup() {
  game.battle = null;
  game.history = [];
  game.stage = 'attackers';
  save();
}

export function resolveNight(choices: RecoveryChoice[]) {
  if (!game.battle) return;
  game.battle = recoverAtNight(game.battle, choices, randomRng);
  // A committed night is a new boundary: undo cannot reroll its recovery checks.
  game.history = [];
  save();
}

export function continueBattle(positions: Record<string, string>) {
  if (!game.battle) return;
  game.battle = startNextDay(game.battle, positions);
  game.history = [];
  save();
}

export function chooseNextBattlefield(board: Board | null) {
  if (!game.battle || game.battle.phase !== 'ended' || game.battle.endedBy !== 'dusk') return;
  game.battle.nextBoard = board;
  save();
}

export function chooseDayOrder(side: Side, order: DayOrder) {
  if (!game.battle) return;
  game.battle = declareDayOrder(game.battle, side, order);
  save();
}

export function confirmDayOrders() {
  if (!game.battle) return;
  game.battle = resolveDayOrders(game.battle);
  game.history = [];
  save();
}

export function respondToSurrender(side: Side, accept: boolean) {
  if (!game.battle) return;
  game.battle = answerSurrender(game.battle, side, accept);
  game.history = [];
  save();
}

export function resetSetup() {
  game.setup = defaultSetup();
  game.battle = null;
  game.history = [];
  game.stage = 'board';
  save();
}

// Module-level $state is seeded once from the saved session; a hot patch would keep the old game.
if (import.meta.hot) import.meta.hot.accept(() => import.meta.hot!.invalidate());

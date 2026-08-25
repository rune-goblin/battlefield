import {
  act, at, COMBATANTS, createBattle, ENGINES, generateBoard, parse, randomRng, select,
  type Action, type BattleState, type Board, type BoardSpec, type Side, type UnitCard,
} from '../engine/index.js';

export type Stage = 'board' | 'paint' | 'place' | 'battle';
export interface SetupUnit { card: UnitCard; side: Side; square: string | null; engines: string[] }
export interface Setup { spec: BoardSpec; board: Board | null; units: SetupUnit[] }

const KEY = 'battlefield.v2';
const STAGES: Stage[] = ['board', 'paint', 'place', 'battle'];

const randomSeed = () => Math.floor(Math.random() * 1e9);

function defaultSetup(): Setup {
  const pick = (name: string) => COMBATANTS.find((c) => c.name === name)!;
  return {
    spec: { base: 'plains', feature: 'none', construction: null, seed: randomSeed() },
    board: null,
    units: [
      { card: pick('Line Infantry'), side: 'attacker', square: 'c2', engines: [] },
      { card: pick('Heavy Cavalry'), side: 'attacker', square: 'e2', engines: [] },
      { card: pick('Kobold Warriors'), side: 'defender', square: 'c7', engines: [] },
      { card: pick('Troll Marauders'), side: 'defender', square: 'e7', engines: [] },
    ],
  };
}

function load(): { stage: Stage; setup: Setup; battle: BattleState | null } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.setup && STAGES.includes(parsed.stage)) return parsed;
    }
  } catch { /* fresh start */ }
  return { stage: 'board', setup: defaultSetup(), battle: null };
}

const saved = load();

export const game = $state({
  stage: (saved.battle ? 'battle' : saved.stage === 'battle' ? 'place' : saved.stage) as Stage,
  setup: saved.setup,
  battle: saved.battle as BattleState | null,
  history: [] as BattleState[],
});

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ stage: game.stage, setup: game.setup, battle: game.battle })); } catch { /* storage unavailable */ }
}

export function generate() {
  const board = generateBoard($state.snapshot(game.setup.spec));
  game.setup.board = board;
  for (const u of game.setup.units) if (u.square && at(board, parse(u.square)).terrain === 'water') u.square = null;
  save();
}

export function rerollSeed() {
  game.setup.spec.seed = randomSeed();
  generate();
}

export function next() {
  const i = STAGES.indexOf(game.stage);
  if (i < STAGES.length - 2) { game.stage = STAGES[i + 1]; save(); }
}

export function back() {
  const i = STAGES.indexOf(game.stage);
  if (i > 0) { game.stage = STAGES[i - 1]; save(); }
}

export function startBattle() {
  const board = game.setup.board;
  if (!board) return;
  game.battle = createBattle(
    {
      board: $state.snapshot(board),
      units: game.setup.units.map((u) => ({
        card: $state.snapshot(u.card),
        side: u.side,
        square: u.square!,
        engines: u.engines.map((n) => ENGINES.find((e) => e.name === n)!).filter(Boolean),
      })),
    },
    randomRng,
  );
  game.history = [];
  game.stage = 'battle';
  save();
}

export function takeAction(action: Action) {
  if (!game.battle) return;
  game.history = [...game.history.slice(-30), game.battle];
  game.battle = act(game.battle, action, randomRng);
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

export function undo() {
  const prev = game.history.pop();
  if (prev) { game.battle = prev; save(); }
}

export function backToSetup() {
  game.battle = null;
  game.history = [];
  game.stage = 'place';
  save();
}

export function resetSetup() {
  game.setup = defaultSetup();
  game.battle = null;
  game.history = [];
  game.stage = 'board';
  save();
}

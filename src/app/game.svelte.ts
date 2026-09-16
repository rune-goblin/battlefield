import {
  act, at, COMBATANTS, createBattle, deselect, endActivation as endActivationEngine, ENGINES, generateBoard, OFFICIAL, parse, randomRng, select,
  type Action, type BattleState, type Board, type BoardSpec, type Side, type UnitCard,
} from '../engine/index.js';
import { migrateMorale } from './migrate-morale.js';

export type Stage = 'board' | 'paint' | 'attackers' | 'defenders' | 'battle';
export interface SetupUnit { card: UnitCard; side: Side; square: string | null; engines: string[] }
/** An engine deployed on a square of its own. `engines` on a SetupUnit is the attached kind. */
export interface SetupEngine { name: string; side: Side; square: string | null }
export interface Setup { spec: BoardSpec; board: Board | null; units: SetupUnit[]; emplacements: SetupEngine[] }

// v3 -> v4: BattleState gained engines for emplacements. A v3 save deserialises without it
// and throws the first time the board reads it.
const KEY = 'battlefield.v4';
// A save written before a field existed still parses; it crashes later, at render. Drop it
// here so a missed KEY bump costs a fresh start rather than a broken board.
const intact = (b: BattleState | null | undefined): boolean =>
  !!b && Array.isArray(b.units) && Array.isArray(b.engines) && Array.isArray(b.log)
  // Units gained `selfBuffs`, which `finish` reads on every activation.
  && b.units.every((u) => Array.isArray(u.selfBuffs));
const STAGES: Stage[] = ['board', 'paint', 'attackers', 'defenders', 'battle'];
/** The side each deployment stage edits. */
export const STAGE_SIDE: Partial<Record<Stage, Side>> = { attackers: 'attacker', defenders: 'defender' };

const randomSeed = () => Math.floor(Math.random() * 1e9);

function defaultSetup(): Setup {
  const pick = (name: string) => [...COMBATANTS, ...OFFICIAL].find((c) => c.name === name)!;
  return {
    spec: { base: 'plains', feature: 'none', construction: null, seed: randomSeed() },
    board: null,
    emplacements: [],
    units: [
      { card: pick('Line Infantry'), side: 'attacker', square: 'c2', engines: [] },
      { card: pick('Heavy Cavalry'), side: 'attacker', square: 'e2', engines: [] },
      // Apprentice Magician Clique (L5) sits between Line Infantry (L6) and Heavy Cavalry (L7).
      { card: pick('Apprentice Magician Clique'), side: 'attacker', square: 'd2', engines: [] },
      { card: pick('Kobold Warriors'), side: 'defender', square: 'c7', engines: [] },
      { card: pick('Troll Marauders'), side: 'defender', square: 'e7', engines: [] },
      // Mitflit Vermin Cavalry (L4) sits between Kobold Warriors (L3) and Troll Marauders (L8).
      { card: pick('Mitflit Vermin Cavalry'), side: 'defender', square: 'd7', engines: [] },
    ],
  };
}

function load(): { stage: Stage; setup: Setup; battle: BattleState | null } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.setup && STAGES.includes(parsed.stage)) {
        if (!intact(parsed.battle)) parsed.battle = null;
        else parsed.battle = migrateMorale(parsed.battle);
        return parsed;
      }
    }
  } catch { /* fresh start */ }
  return { stage: 'board', setup: defaultSetup(), battle: null };
}

const saved = load();

export const game = $state({
  stage: (saved.battle ? 'battle' : saved.stage === 'battle' ? 'defenders' : saved.stage) as Stage,
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
  for (const e of game.setup.emplacements) if (e.square && at(board, parse(e.square)).terrain === 'water') e.square = null;
  save();
}

export function rerollSeed() {
  game.setup.spec.seed = randomSeed();
  generate();
}

/** One side is ready when it has a unit and everything it owns stands on a square. */
export function sideReady(side: Side): boolean {
  const us = game.setup.units.filter((u) => u.side === side);
  return us.length > 0 && us.every((u) => u.square !== null)
    && game.setup.emplacements.filter((e) => e.side === side).every((e) => e.square !== null);
}

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

export function resetSetup() {
  game.setup = defaultSetup();
  game.battle = null;
  game.history = [];
  game.stage = 'board';
  save();
}

// Module-level $state is seeded once from localStorage; a hot patch would keep the old game.
if (import.meta.hot) import.meta.hot.accept(() => import.meta.hot!.invalidate());

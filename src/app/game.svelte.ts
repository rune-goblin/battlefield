import {
  act, createBattle, randomRng, ROSTER, type Action, type BattleState, type Side, type Terrain, type UnitCard,
} from '../engine/index.js';

export interface SetupUnit { card: UnitCard; side: Side; step: number; }

export interface Setup { units: SetupUnit[]; terrain: Terrain; wallsTier: number; }

const KEY = 'battlefield.v1';

function defaultSetup(): Setup {
  const pick = (name: string) => ROSTER.find((c) => c.name === name)!;
  return {
    units: [
      { card: pick('Line Infantry'), side: 'attacker', step: 0 },
      { card: pick('Heavy Cavalry'), side: 'attacker', step: 1 },
      { card: pick('Kobold Warriors'), side: 'defender', step: 5 },
      { card: pick('Troll Marauders'), side: 'defender', step: 6 },
    ],
    terrain: { cover: true, rough: true, river: false },
    wallsTier: 0,
  };
}

function load(): { setup: Setup; battle: BattleState | null } {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fresh start */ }
  return { setup: defaultSetup(), battle: null };
}

const saved = load();

export const game = $state({
  screen: (saved.battle ? 'battle' : 'setup') as 'setup' | 'battle',
  setup: saved.setup,
  battle: saved.battle as BattleState | null,
  history: [] as BattleState[],
});

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({ setup: game.setup, battle: game.battle })); } catch { /* storage unavailable */ }
}

export function startBattle() {
  game.battle = createBattle(
    { units: game.setup.units, terrain: game.setup.terrain, wallsTier: game.setup.wallsTier || undefined },
    randomRng,
  );
  game.history = [];
  game.screen = 'battle';
  persist();
}

export function takeAction(action: Action) {
  if (!game.battle) return;
  game.history = [...game.history.slice(-30), game.battle];
  game.battle = act(game.battle, action, randomRng);
  persist();
}

export function undo() {
  const prev = game.history.pop();
  if (prev) { game.battle = prev; persist(); }
}

export function backToSetup() {
  game.battle = null;
  game.history = [];
  game.screen = 'setup';
  persist();
}

export function resetSetup() {
  game.setup = defaultSetup();
  persist();
}

export function saveSetup() { persist(); }

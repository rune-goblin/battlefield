import type { Board, GridKind, Square } from './board.js';
import type { EngineKind, Reach, Role, Tactic, UnitStats } from './cards.js';
import type { CheckResult } from './check.js';
import type { Grade, Grades, LadderType, RungId, SpellId } from './ladders.js';

export type Side = 'attacker' | 'defender';
export const SIDES: Side[] = ['attacker', 'defender'];
export const LAST_ROUND = 6;
export const MAX_WOUNDS = 4;
/** PF2e's economy, unchanged: Move, Move, Move, or Move, Shoot, Guard. */
export const ACTIONS_PER_ACTIVATION = 3;
/** The disorder a troop of ordinary discipline absorbs before it routs; `Unit.quality` varies it. */
export const ROUTED_AT = 3;

export interface EngineState {
  name: string;
  kind: EngineKind;
  launch: number;
  reach: Reach | null;
  fired: boolean;
  status: 'crewed' | 'abandoned' | 'captured';
  square: Square;
}

export interface Unit {
  id: string;
  name: string;
  side: Side;
  level: number;
  role: Role;
  stats: UnitStats;
  pace: boolean;
  /** Feet a single Move action buys. */
  speed: number;
  /** A flier ignores terrain cost and blocked edges. */
  flying: boolean;
  fear: boolean;
  tactics: Tactic[];
  grades: Grades;
  spells: SpellId[];
  quality: number;
  /** Actions left in this activation; back to three between activations. */
  actions: number;
  /** Movement banked by Move actions already taken and not yet spent, in feet. */
  feet: number;
  engines: EngineState[];
  square: Square;
  wounds: number;
  disorder: number;
  status: 'active' | 'destroyed' | 'left';
  guard: { defence: number; aura: number } | null;
  /** Activations left before the unit may move again. Digging in sets two: this one and the next. */
  rooted: number;
  exposed: boolean;
  warded: boolean;
  blessed: boolean;
  compelled: boolean;
}

/** Which unit acts. Defaults to `activeUnit(state)`. */
interface Acts { unit?: string }

export interface RungAction extends Acts {
  type: LadderType;
  rung: Grade;
  target?: string;
  spell?: SpellId;
}

/** Stride to `to`, spending as many Move actions as the route costs. */
export interface MoveAction extends Acts { type: 'move'; to: string }

/** Move into contact and fight: the movement's actions, plus one for the melee. */
export interface ChargeAction extends Acts { type: 'charge'; target: string; rung?: Grade }

export type Action = RungAction | MoveAction | ChargeAction;

export type TargetKind = 'cell' | 'unit' | 'wall';

export interface RungTarget { kind: TargetKind; id: string; label: string }

export interface RungOption {
  rung: RungId;
  index: Grade;
  label: string;
  detail: string;
  /** `free` needs no roll, `reach` is the gamble, `locked` is out of reach this activation. */
  access: 'free' | 'reach' | 'locked';
  legal: boolean;
  reason: string | null;
  needsTarget: boolean;
  targets: RungTarget[];
}

export interface ActionOffer {
  type: LadderType;
  /** Actions this offer spends. */
  cost: number;
  spell: SpellId | null;
  label: string;
  detail: string;
  granted: Grade;
  reachable: Grade | null;
  reachDc: number | null;
  reachModifier: number;
  rungs: [RungOption, RungOption, RungOption];
}

export interface MoveReach {
  /** Feet from where the unit stands. */
  feet: number;
  /** Move actions this destination costs, counting movement already banked. */
  actions: number;
  /** The cell it was reached from, for path reconstruction; `null` on the unit's own cell. */
  from: string | null;
}

export interface ChargeOption {
  /** The enemy charged. */
  unit: string;
  /** The cell the charge stops on. */
  cell: string;
  feet: number;
  /** Move actions, before the one the melee itself costs. */
  actions: number;
}

/** Everything a unit's activation offers: the menu, what movement is left, and where it reaches. */
export interface Activation {
  unit: string;
  actions: number;
  /** Unspent movement, in feet. */
  feet: number;
  /** Feet a single Move action buys. */
  speed: number;
  offers: ActionOffer[];
  moves: Map<string, MoveReach>;
  charges: ChargeOption[];
}

export interface LogEntry {
  round: number;
  unit?: string;
  text: string;
  check?: CheckResult;
}

export type Phase = 'battle' | 'ended';

export interface BattleState {
  units: Unit[];
  /** Deployment order. Activation order is alternating, not fixed. */
  order: string[];
  round: number;
  pending: Side;
  active: string | null;
  /** True once the active unit has spent an action; it may not be swapped out after that. */
  begun: boolean;
  activated: string[];
  lastSide: Side | null;
  board: Board;
  phase: Phase;
  winner: Side | 'draw' | null;
  endedBy: 'rout' | 'dusk' | null;
  startingCount: Record<Side, number>;
  halfChecked: Record<Side, boolean>;
  log: LogEntry[];
}

export type Range = 'engaged' | 'close' | 'long' | 'extreme' | 'beyond';
export const REACH_RANK: Record<Reach, number> = { close: 1, long: 2, extreme: 3 };

// Hex distance is true range where square's Manhattan distance over-counts a diagonal, so the
// same ring covers 37 of 64 cells on hex against 25 on square. The fan is the geometry and no
// threshold narrows it; the top band is capped instead, which keeps a Barrage out of the far
// deployment zone.
export const BANDS: Record<GridKind, Record<Reach, number>> = {
  square: { close: 2, long: 3, extreme: Infinity },
  hex: { close: 2, long: 3, extreme: 5 },
};

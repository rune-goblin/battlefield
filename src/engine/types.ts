import type { Board, Square } from './board.js';
import type { EngineKind, Reach, Role, Tactic, UnitStats } from './cards.js';
import type { CheckResult } from './check.js';
import type { Grade, Grades, LadderType, RungId, SpellId } from './ladders.js';

export type Side = 'attacker' | 'defender';
export const SIDES: Side[] = ['attacker', 'defender'];
export const LAST_ROUND = 6;
export const MAX_WOUNDS = 4;
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
  speed: number;
  fear: boolean;
  tactics: Tactic[];
  grades: Grades;
  spells: SpellId[];
  quality: number;
  engines: EngineState[];
  square: Square;
  wounds: number;
  disorder: number;
  status: 'active' | 'destroyed' | 'left';
  guard: { defence: number; aura: number } | null;
  rooted: boolean;
  exposed: boolean;
  warded: boolean;
  blessed: boolean;
  compelled: boolean;
}

export interface Action {
  type: LadderType;
  rung: Grade;
  target?: string;
  /** Advance only: an enemy to shoot at −2 from the cell you advance into. */
  shoot?: string;
  spell?: SpellId;
  /** Which unit activates. Defaults to `activeUnit(state)`. */
  unit?: string;
}

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
  spell: SpellId | null;
  label: string;
  detail: string;
  granted: Grade;
  reachable: Grade | null;
  reachDc: number | null;
  reachModifier: number;
  rungs: [RungOption, RungOption, RungOption];
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

export type Range = 'engaged' | 'close' | 'long' | 'extreme';
export const REACH_RANK: Record<Reach, number> = { close: 1, long: 2, extreme: 3 };

import type { Board, Square } from './board.js';
import type { EngineKind, Reach, Role, Tactic, UnitStats } from './cards.js';
import type { CheckResult } from './check.js';

export type Side = 'attacker' | 'defender';
export const SIDES: Side[] = ['attacker', 'defender'];
export const LAST_ROUND = 6;
export const MAX_WOUNDS = 4;
export const ROUTED_AT = 3;
export const ACTIONS_PER_TURN = 3;
export const MAP_STEP = 5;

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
  fear: boolean;
  tactics: Tactic[];
  engines: EngineState[];
  square: Square;
  wounds: number;
  shaken: number;
  status: 'active' | 'destroyed' | 'left';
  initiative: number;
  braced: boolean;
  exposed: boolean;
  reactionUsed: boolean;
  attacks: number;
  shieldBlockUsed: boolean;
  routImmune: boolean;
  feinted: boolean;
  defendedBy: string | null;
  suppressed: boolean;
  medicineReceived: boolean;
  woundedThisRound: boolean;
}

export type ActionKind =
  | 'advance' | 'withdraw' | 'strike' | 'volley' | 'brace' | 'rally' | 'retreat' | 'pass'
  | 'cavalry-charge' | 'feint' | 'dirty-fighting' | 'demoralize' | 'covering-fire'
  | 'defend-allies' | 'battlefield-medicine' | 'fire-engine' | 'engine-bombard';

export type TargetKind = 'unit' | 'square' | 'wall';

export interface Action { kind: ActionKind; target?: string; engine?: number; }

export interface ActionOption {
  kind: ActionKind;
  cost: number;
  targetKind: TargetKind | null;
  targets: string[] | null;
  label: string;
  engine?: number;
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
  order: string[];
  round: number;
  activeIndex: number;
  actionsLeft: number;
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

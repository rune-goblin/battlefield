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
/** What one action after the first is worth. The system's single increment: Press, Brace,
 * Outflanked and the mounted push bonus are all the same number. */
export const ACTION_BONUS = 2;
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
  /** Read off the 'mounted' signal (Mounted Troop / First-class Charge). Feeds the push
   * bonus alongside the cavalry-charge tactic — both went inert when Move's grade was
   * dropped; see "Move bands notes" in the todos. */
  mounted: boolean;
  /** Read off the 'no-retreat' signal. Such a troop follows an enemy that withdraws from it,
   * one free Move, to re-establish contact — it is a hold on others, not on itself. */
  noRetreat: boolean;
  fear: boolean;
  tactics: Tactic[];
  grades: Grades;
  spells: SpellId[];
  quality: number;
  /** Actions left in this activation; back to three between activations. */
  actions: number;
  /** A unit attacks once per activation. Further actions buy weight, never a second attack. */
  attacked: boolean;
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

/**
 * How the player allocates the actions committed beyond the one the act itself costs. Each
 * point is one action and is worth `ACTION_BONUS` where it lands, so
 * `roll + push + cost === actions committed`.
 */
export interface Spend {
  /** Fed to the act's own roll — the attack, the shot, the casting, Rally's check, the escape. */
  roll: number;
  /** Fed to the push check that climbs to a rung above the unit's grade. */
  push: number;
  /** Guard only: +2 Defence each, on top of the rung's own bonus. */
  defence: number;
  /** Withdraw only: another Speed's worth of ground, as a Move action buys. */
  distance: number;
}

export type Dial = keyof Spend;
export const DIALS: Dial[] = ['roll', 'push', 'defence', 'distance'];

export interface RungAction extends Acts {
  type: LadderType;
  rung: Grade;
  target?: string;
  spell?: SpellId;
  spend?: Partial<Spend>;
}

/** Stride to `to`, spending as many Move actions as the route costs. */
export interface MoveAction extends Acts { type: 'move'; to: string }

/** Break contact: one Escape check per enemy holding the unit, then move. */
export interface WithdrawAction extends Acts { type: 'withdraw'; to?: string; spend?: Partial<Spend> }

/** Move into contact and fight: the movement's actions, plus one for the melee, plus whatever
 * the melee is weighted with. */
export interface ChargeAction extends Acts { type: 'charge'; target: string; rung?: Grade; spend?: Partial<Spend> }

/** Reach for a cell beyond every action the unit has — a Quality check against the level DC.
 * Success lands on `to`; failure lands on `PushReach.fallback` instead. */
export interface PushAction extends Acts { type: 'push'; to: string }

export type Action = RungAction | MoveAction | WithdrawAction | ChargeAction | PushAction;

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

/** Which dials an offer will take, and what each action put on one is worth. */
export interface SpendDials {
  /** Actions this offer can absorb beyond the one it costs. */
  extra: number;
  /** What one of them buys, wherever it lands. */
  step: number;
  /** The act has a roll of its own. Guard sets a number outright, so it has none. */
  roll: boolean;
  /** There is a rung above the granted one and a check standing between. */
  push: boolean;
  /** Guard's second dial: the rung's Defence bonus, raised. */
  defence: boolean;
  /** Withdraw's second dial: another Speed's worth of ground to run. */
  distance: boolean;
}

export interface ActionOffer {
  type: LadderType;
  /** Actions the act itself costs, before anything the dials take. */
  cost: number;
  dials: SpendDials;
  spell: SpellId | null;
  label: string;
  detail: string;
  granted: Grade;
  reachable: Grade | null;
  reachDc: number | null;
  reachModifier: number;
  rungs: [RungOption, RungOption, RungOption];
}

/** One enemy holding the unit, and what breaking from it costs. */
export interface EscapeCheck {
  unit: string;
  name: string;
  /** That enemy's attack DC — its strike bonus plus ten. */
  dc: number;
  /** A `no-retreat` holder follows a withdrawal that is not a critical success. */
  follows: boolean;
}

/** Withdraw is not a ladder: it is one Escape check per holder, and the four degrees are what
 * Scatter, Break off and Fighting retreat used to name. */
export interface WithdrawOffer {
  cost: number;
  dials: SpendDials;
  /** The unit's Reflex, less disorder, before anything the dials add. */
  modifier: number;
  escapes: EscapeCheck[];
  /** Cells to leave for, at the full distance the dials could buy. */
  targets: RungTarget[];
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

/** A cell beyond every action the unit has — reachable only by gambling a Quality check.
 * Bounded to one further action's worth of movement past `MoveReach`'s own budget. */
export interface PushReach {
  /** Feet from where the unit stands. */
  feet: number;
  /** The cell this one was reached from, for path reconstruction; may itself be another push
   * cell, an affordable `MoveReach` cell, or the unit's own square. */
  from: string | null;
  /** Where a failed reach actually lands: the furthest cell along this same route the unit
   * could pay for outright. */
  fallback: string;
}

/** Everything a unit's activation offers: the menu, what movement is left, and where it reaches. */
export interface Activation {
  unit: string;
  actions: number;
  /** True once this activation's one attack is spent. */
  attacked: boolean;
  /** Unspent movement, in feet. */
  feet: number;
  /** Feet a single Move action buys. */
  speed: number;
  offers: ActionOffer[];
  /** Offered in contact, and to a routed unit. `null` when there is nothing to break from. */
  withdraw: WithdrawOffer | null;
  moves: Map<string, MoveReach>;
  /** Beyond every affordable cell — a reach, not a Stride. See `pushReach`. */
  push: Map<string, PushReach>;
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

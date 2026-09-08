import type { Board, GridKind, Square } from './board.js';
import type { EngineKind, Reach, Role, Tactic, Tradition, UnitStats } from './cards.js';
import type { CheckResult } from './check.js';
import type { Grade, LadderType } from './ladders.js';
import type { CastAxis, CastBand, CastTier, Tree } from './magic.js';

export type Side = 'attacker' | 'defender';
export const SIDES: Side[] = ['attacker', 'defender'];
export const LAST_ROUND = 6;
export const MAX_WOUNDS = 4;
/** PF2e's economy, unchanged: Move, Move, Move, or Move, Shoot, Guard. */
export const ACTIONS_PER_ACTIVATION = 3;
/** The system's single increment: a Guard's Defence, Outflanked and inspired are all the
 * same number. */
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
  /** Who works it now. An emplaced engine changes this when it is captured. */
  side: Side;
  /** Emplaced: it holds its deployment square, is worked by whichever friendly unit stands
   * in or beside it, and changes hands when only the enemy is left beside it. An attached
   * engine instead rides with its unit and is only lost when that unit is. */
  emplaced: boolean;
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
  /** Read off the 'no-retreat' signal. Such a troop follows an enemy that withdraws from it,
   * one free Move, to re-establish contact — it is a hold on others, not on itself. */
  noRetreat: boolean;
  fear: boolean;
  tactics: Tactic[];
  /** `null` for a non-caster and for a caster with no tradition set (there is none, per
   * `cardTraits`' own fallback — see cards.ts). Gates which trees `trees` may ever hold. */
  tradition: Tradition | null;
  /** Every tree this unit may cast at all, Tier 1 included — the caster's whole tradition, or
   * the one tree a non-caster's tactic grants (section 11). */
  trees: Tree[];
  quality: number;
  /** Actions left in this activation; back to three between activations. */
  actions: number;
  /** A unit attacks once per activation. Further actions buy other acts, never a second attack. */
  attacked: boolean;
  /** Movement banked by Move actions already taken and not yet spent, in feet. */
  feet: number;
  engines: EngineState[];
  square: Square;
  wounds: number;
  disorder: number;
  status: 'active' | 'destroyed' | 'left';
  /** The Guard in force until this unit next activates; `rung` says which effects it carries. */
  guard: { defence: number; rung: Grade } | null;
  /** Activations left before the unit may move again. Digging in sets two: this one and the next. */
  rooted: number;
  exposed: boolean;
  /** +2 on the unit's next roll of any kind. Never set while disorder stands. */
  inspired: boolean;
  /** The shooter's id: −2 to every roll and to Defence until that shooter acts again or leaves play. */
  suppressedBy: string | null;
  /** The shooter's id: it holds this unit at Volley + 10 until it acts again or leaves play. */
  pinnedBy: string | null;
  frightened: boolean;
  /** One action fewer on its next activation. */
  stunned: boolean;
  /** Wrath's wound, waiting on the unit's own `finish`; `dc` is the Fortitude save's. */
  persistent: { dc: number } | null;
  sureStrike: boolean;
  /** The unit's next hit leaves persistent damage on whoever takes it. */
  wrath: boolean;
  /** Activations left with a fourth action. */
  haste: number;
  ward: boolean;
  stoneskin: boolean;
  /** The caster's spell DC: an attacker rolls Will against it or wastes the activity. */
  aegis: { dc: number } | null;
  sureFooting: boolean;
  /** Flies on its next activation only; `flying` is the troop that always does. */
  flies: boolean;
}

/** Which unit acts. Defaults to `activeUnit(state)`. */
interface Acts { unit?: string }

export interface RungAction extends Acts {
  type: LadderType;
  rung: Grade;
  target?: string;
  spell?: Tree;
  /** Cast only: which of range, duration or effect a tier above the first buys — never more
   * than one. Defaults to `'effect'`, the only axis the graphical menu ever offers; range and
   * duration are reachable through this same action, just not from the board yet. */
  axis?: CastAxis;
}

/** Stride to `to`, spending as many Move actions as the route costs. */
export interface MoveAction extends Acts { type: 'move'; to: string }

/** Break contact: one Escape check per enemy holding the unit, then move. `distance` is the
 * further actions spent on ground, another Speed's worth each. */
export interface WithdrawAction extends Acts { type: 'withdraw'; to?: string; distance?: number }

/** Move into contact and fight: the movement's actions, plus the rung's own. */
export interface ChargeAction extends Acts { type: 'charge'; target: string; rung?: Grade }

export type Action = RungAction | MoveAction | WithdrawAction | ChargeAction;

export type TargetKind = 'cell' | 'unit' | 'wall';

export interface RungTarget { kind: TargetKind; id: string; label: string }

/** One board object a rung can be aimed at: a cell, a piece, or a wall. */
export interface TargetRef { kind: TargetKind; id: string }

/** What one offer can do to a given target: the offer, and only those of its rungs that both
 * reach that target and are legal right now. See `offersAt`. */
export interface TargetOffer { offer: ActionOffer; rungs: RungOption[] }

export interface RungOption {
  /** A `RungId` for the four ladders; `${Tree}-${CastTier}` (e.g. `blast-2`) for Cast. */
  rung: string;
  index: Grade;
  label: string;
  detail: string;
  /** Actions this rung costs: its own index, the same for every unit. `null` when no number of
   * actions reaches it — above a tradition's cap. */
  cost: number | null;
  legal: boolean;
  reason: string | null;
  needsTarget: boolean;
  targets: RungTarget[];
}

export interface ActionOffer {
  type: LadderType;
  spell: Tree | null;
  label: string;
  detail: string;
  rungs: [RungOption, RungOption, RungOption];
}

/** One enemy holding the unit, and what breaking from it costs. */
export interface EscapeCheck {
  unit: string;
  name: string;
  /** That enemy's attack DC — its strike bonus plus ten, or a pinning shooter's Volley plus ten. */
  dc: number;
  /** A `no-retreat` holder follows a withdrawal that is not a critical success. */
  follows: boolean;
}

/** Withdraw is not a ladder: it is one Escape check per holder, and the four degrees are what
 * Scatter, Break off and Fighting retreat used to name. */
export interface WithdrawOffer {
  cost: number;
  /** Further actions the unit could put on distance, another Speed's worth each. */
  extra: number;
  /** The unit's Reflex, less disorder. */
  modifier: number;
  escapes: EscapeCheck[];
  /** Cells to leave for, at the full distance `extra` could buy. */
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
  /** Emplaced engines only. An attached engine lives on its unit's `engines` instead. */
  engines: EngineState[];
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

export type Range = 'engaged' | 'short' | 'medium' | 'long' | 'extreme' | 'beyond';
export const REACH_RANK: Record<Reach, number> = { short: 1, medium: 2, long: 3, extreme: 4 };

// Hex distance is true range where square's Manhattan distance over-counts a diagonal, so the
// same ring covers 37 of 64 cells on hex against 25 on square. The fan is the geometry and no
// threshold narrows it; the top band is capped instead. The hexagon board has radius 4, so 8 is
// the farthest two hexes are ever apart — extreme's own ceiling, not an arbitrary cap.
export const BANDS: Record<GridKind, Record<Reach, number>> = {
  square: { short: 2, medium: 4, long: 6, extreme: Infinity },
  hex: { short: 2, medium: 4, long: 6, extreme: 8 },
};

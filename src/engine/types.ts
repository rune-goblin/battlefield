import type { Board, GridKind, Square } from './board.js';
import type { EngineKind, Reach, Role, Tactic, Tradition, UnitStats } from './cards.js';
import type { CheckResult } from './check.js';
import type { ClimbMode, Grade, Grades, LadderType } from './ladders.js';
import type { CastAxis, CastBand, CastTier, Tree } from './magic.js';

export type Side = 'attacker' | 'defender';
export const SIDES: Side[] = ['attacker', 'defender'];
export const LAST_ROUND = 6;
export const MAX_WOUNDS = 4;
/** PF2e's economy, unchanged: Move, Move, Move, or Move, Shoot, Guard. */
export const ACTIONS_PER_ACTIVATION = 3;
/** What one action after the first is worth. The system's single increment: Outflanked, a
 * Ward and the mounted push bonus are all the same number. */
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
  /** `null` for a non-caster and for a caster with no tradition set (there is none, per
   * `cardTraits`' own fallback — see cards.ts). Gates which trees `trees` may ever hold. */
  tradition: Tradition | null;
  /** Every tree this unit may cast at all, Tier 1 included — the caster's whole tradition, or
   * the one tree a non-caster's tactic grants (section 11). */
  trees: Tree[];
  /** The caster's own push-only pool: level ÷ 5, refreshed every activation. 0 for a
   * non-caster or a tactic-granted tree, which never pushes at all. */
  castPool: number;
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
  /** The Guard in force until this unit next activates. `defence` is bought outright with
   * committed actions; `rung` says which damage reduction the rung itself carries. */
  guard: { defence: number; rung: Grade } | null;
  /** Activations left before the unit may move again. Digging in sets two: this one and the next. */
  rooted: number;
  exposed: boolean;
  /** Took heart from an ally's Rally: +2 on its attacks until the end of its next activation.
   * The support half of the rally ladder — see `RallyEffect.heart`. */
  heartened: boolean;
  /** Controlling Tier 3: may not reach above its grade on its next activation. Cleared at
   * `finish`, the same as `heartened`. */
  compelled: boolean;
  /** Defense buff, applied the moment it's cast: protects the target through whatever comes
   * before its own next activation, the way the old Ward spell did — cleared at `begin`. */
  defense: { bonus: number; noWoundDisorder: boolean; damageReduction: number };
  /** Offense buff and Controlling's action penalty apply *during* the buffed or compelled
   * unit's own next activation, not before it — cleared at `finish`. */
  offense: { bonus: number; damage: number; noStrikeBack: boolean };
  movementBuff: { bonusFeet: number; flies: boolean };
  /** Controlling Tier 1/2. Tier 3 is `compelled`, above. */
  control: { movementPenaltyFeet: number; actionPenalty: boolean };
  /** Blast's lingering wound or Healing's regeneration: ticks at the start of the target's own
   * activation (`begin`), for as many of its own activations as `roundsLeft` still covers. */
  lingering: { tree: Tree; roundsLeft: number } | null;
  /** Healing's "+1/+2 on the target's next save" — consumed by whichever save comes first,
   * whoever's activation that falls in, not tied to `begin`/`finish` at all. */
  nextSaveBonus: number;
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
  /** Guard only: +2 Defence each. The rung adds none of its own. */
  defence: number;
  /** Withdraw only: another Speed's worth of ground, as a Move action buys. */
  distance: number;
  /** Cast only: points off the caster's own push pool, stacked on top of `push` — see
   * `castPool` on `Unit`. */
  pool: number;
}

export type Dial = keyof Spend;
export const DIALS: Dial[] = ['roll', 'push', 'defence', 'distance', 'pool'];

export interface RungAction extends Acts {
  type: LadderType;
  rung: Grade;
  target?: string;
  spell?: Tree;
  /** Cast only: which of range, duration or effect this push reaches for — never more than
   * one. Defaults to `'effect'`, the only axis the graphical menu ever offers; range and
   * duration pushes are reachable through this same action, just not from the board yet. */
  axis?: CastAxis;
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
  /** `free` needs no roll and no further action; `buy` is bought outright with one more
   * action; `reach` is the free gamble; `locked` is out of reach this activation. */
  access: 'free' | 'buy' | 'reach' | 'locked';
  legal: boolean;
  reason: string | null;
  /** The DC of the climb to *this* rung, which is not the same for every rung an offer holds —
   * Cast may gamble for two tiers at once, and the further one is dearer. `null` unless this
   * rung is gambled for. */
  reachDc: number | null;
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
  /** There is a rung above the granted one and a check standing between. False on a ladder
   * that buys its climb — there is no gamble to weight. */
  push: boolean;
  /** Guard's second dial: Defence, which is the only number a Guard sets. */
  defence: boolean;
  /** Withdraw's second dial: another Speed's worth of ground to run. */
  distance: boolean;
  /** Cast's own second dial: the caster's push-only pool, on top of `push`. */
  pool: boolean;
}

export interface ActionOffer {
  type: LadderType;
  /** Actions the act itself costs, before the climb or anything the dials take. */
  cost: number;
  /** How this ladder gets above its grade — the gamble, the purchase, or not at all. */
  climb: ClimbMode;
  /** Actions a `buy` rung costs on top of `cost`. Zero on a ladder that gambles instead. */
  climbCost: number;
  dials: SpendDials;
  spell: Tree | null;
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

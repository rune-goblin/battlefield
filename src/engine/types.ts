import type { Board, GridKind, Square } from './board.js';
import type { EngineKind, Reach, Role, Tactic, Tradition, UnitStats } from './cards.js';
import type { CheckResult } from './check.js';
import type { ActivityIndex, Verb } from './ladders.js';
import type { CastActivityIndex, Tree } from './magic.js';

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

/** The three buffs of the Defense tree, which stand until the unit they fell on has acted. */
export type DefenceBuff = 'ward' | 'stoneskin' | 'aegis';

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
  /** Read off the 'no-retreat' signal. Such a troop follows an enemy that maneuvers from it,
   * one free Move, to re-establish contact — it is a hold on others, not on itself. */
  noRetreat: boolean;
  /** Imported off a frightful presence and read by nothing: an aura's effect stays the
   * statblock's own. */
  fear: boolean;

  tactics: Tactic[];
  /** `null` for a non-caster and for a caster with no tradition set (there is none, per
   * `cardTraits`' own fallback — see cards.ts). Gates which trees `trees` may ever hold. */
  tradition: Tradition | null;
  /** Every tree this unit may cast at all — the caster's whole tradition, or the one tree a
   * non-caster's tactic grants (section 11). */
  trees: Tree[];
  /** Trees already cast this activation: one cast a tree, whatever else the actions buy. */
  castTrees: Tree[];
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
  /** The Guard in force until this unit next activates. `cap` is Dig in's wound cap, `holds`
   * Take cover's refusal of an Overrun's shove. */
  guard: { defence: 2 | 4; cap: boolean; holds: boolean } | null;
  /** Activations left before the unit may move again. Take cover sets one: the rest of this one. */
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
  /** Defense buffs cast on this unit inside its own activation. A buff lasts until the unit it
   * fell on has next acted, so `finish` holds these over the activation that cast them: a
   * caster's own ward stands through the enemy's turn (section 11). */
  selfBuffs: DefenceBuff[];
  sureFooting: boolean;
  /** Flies on its next activation only; `flying` is the troop that always does. */
  flies: boolean;
}

/** Which unit acts. Defaults to `activeUnit(state)`. */
interface Acts { unit?: string }

export interface ActivityAction extends Acts {
  type: Verb;
  activity: ActivityIndex;
  target?: string;
  spell?: Tree;
}

/** Stride to `to`, spending as many Move actions as the route costs. */
export interface MoveAction extends Acts { type: 'move'; to: string }

/** Break contact by one of the three activities, then move. `to` is the cell to leave for; a
 * critical Break off is the only one that carries further than a single hex. */
export interface ManeuverAction extends Acts { type: 'maneuver'; activity: ActivityIndex; to?: string }

/** Move into contact and fight: the movement's actions, plus the activity's own. */
export interface ChargeAction extends Acts { type: 'charge'; target: string; activity?: ActivityIndex }

export type Action = ActivityAction | MoveAction | ManeuverAction | ChargeAction;

export type TargetKind = 'cell' | 'unit' | 'wall';

export interface ActivityTarget { kind: TargetKind; id: string; label: string }

/** One board object an activity can be aimed at: a cell, a piece, or a wall. */
export interface TargetRef { kind: TargetKind; id: string }

/** What one offer can do to a given target: the offer, and only those of its activities that both
 * reach that target and are legal right now. See `offersAt`. */
export interface TargetOffer { offer: ActionOffer; activities: ActivityOption[] }

export interface ActivityOption {
  /** An `ActivityId` for the four verbs with a table; `${Tree}-${CastActivityIndex}` (e.g. `blast-2`) for Cast. */
  activity: string;
  index: ActivityIndex;
  label: string;
  detail: string;
  /** Actions this activity costs: its own index, the same for every unit. `null` when no number of
   * actions reaches it — above a tradition's cap. */
  cost: number | null;
  legal: boolean;
  reason: string | null;
  needsTarget: boolean;
  targets: ActivityTarget[];
}

export interface ActionOffer {
  type: Verb;
  spell: Tree | null;
  label: string;
  detail: string;
  activities: [ActivityOption, ActivityOption, ActivityOption];
}

/** One enemy holding the unit: what the Break off roll is read against for it, and what it
 * does about the maneuver. */
export interface Holder {
  unit: string;
  name: string;
  /** Its attack DC — its strike bonus plus ten, or a pinning shooter's Volley plus ten. */
  dc: number;
  /** Holding at range, by a Pin: it lands no free strike and never gives chase. */
  pinning: boolean;
  /** A `no-retreat` holder follows a Break off that is not a critical success, and a Disengage
   * or Fighting retreat it passes its own roll against. */
  follows: boolean;
}

/** Maneuver has no table, but it offers three activities like a verb that has one: Break off, Disengage,
 * Fighting retreat. A maneuver moves one hex to reposition or withdraw, and only a
 * critical Break off carries further. */
export interface ManeuverOffer {
  activities: [ActivityOption, ActivityOption, ActivityOption];
  /** The unit's Reflex, less disorder: what Break off rolls. */
  modifier: number;
  /** The highest attack DC among the holders, which Break off rolls against. */
  dc: number;
  holders: Holder[];
  /** Cells to leave for. Beyond the first hex they are the reach of a critical's free Move. */
  targets: ActivityTarget[];
}

export interface MoveReach {
  /** Feet from where the unit stands. */
  feet: number;
  /** Move actions this destination costs, counting movement already banked. */
  actions: number;
}

/** One cell of a route `movePath` walked back, with what it cost to reach — including a cell
 * that is not itself a legal `MoveReach` destination, such as water a flier only crosses. */
export interface PathStep {
  cell: string;
  feet: number;
  actions: number;
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
  maneuver: ManeuverOffer | null;
  moves: Map<string, MoveReach>;
  charges: ChargeOption[];
}

export interface LogEntry {
  round: number;
  unit?: string;
  /** Explicit activation boundaries keep reactions under the acting army's turn. */
  turn?: 'start' | 'end';
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

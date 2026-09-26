import type { TroopAbility, AbilityReview, AbilityMemory, AbilityMark, AbilityOutcome } from './abilities.js';
import type { Board, Square } from './board.js';
import type { EngineKind, Reach, Role, Tactic, Tradition, UnitStats, MovementRates, TroopSheet } from './cards.js';
import type { CheckResult } from './check.js';
import type { CONDITIONS } from './conditions.js';
import type { ActivityIndex, Verb } from './ladders.js';
import type { CastActivityIndex, Tree } from './magic.js';

export type Side = 'attacker' | 'defender';
export const SIDES: Side[] = ['attacker', 'defender'];
export const opponent = (side: Side): Side => (side === 'attacker' ? 'defender' : 'attacker');
export const LAST_ROUND = 6;
export const MAX_WOUNDS = 4;
/** PF2e's economy, unchanged: Move, Move, Move, or Move, Shoot, Guard. */
export const ACTIONS_PER_ACTIVATION = 3;
/** The system's single increment: a Guard's Defence, Outflanked and inspired are all the
 * same number. */
export const ACTION_BONUS = 2;
/** Every unit has three morale pips; filling the third causes rout. */
export const ROUTED_AT = 3;

export interface EngineState {
  speed?: number | null;
  loadCost?: number;
  /** Loading actions a full load takes. `legacy.ts` rescales an older save's full-load count. */
  loadSteps?: number;
  /** Completed load steps, from 0 to `loadSteps`. They belong to the engine and persist through
   * crew changes and capture. */
  loaded?: number;
  hauling?: boolean;
  /** The equipment ID the piece took in setup, kept through capture, days, and export. */
  id: string;
  name: string;
  kind: EngineKind;
  launch: number;
  reach: Reach | null;
  fired: boolean;
  status: 'crewed' | 'abandoned' | 'captured';
  square: Square;
  /** Who works it now. An emplaced engine changes this when it is captured, and one no unit
   * has claimed belongs to neither army: null, which no crew matches, so it does nothing. */
  side: Side | null;
  /** Emplaced equipment stays on the ground until hauled. Equipment in a unit's array
   * travels with that unit only while hauling; otherwise movement leaves it on the ground. */
  emplaced: boolean;
}

/** The three buffs of the Defense tree, which stand until the unit they fell on has acted. */
export type DefenceBuff = 'ward' | 'stoneskin' | 'aegis';

export interface Conditions {
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
  persistent: { dc: number; tag?: string } | null;
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
  /** Extra movement in feet for the next activation, or this activation after a self-cast. */
  movementBonus?: number;
  sureFooting: boolean;
  /** Flies on its next activation only; `flying` is the troop that always does. */
  flies: boolean;
}

export interface Unit extends Conditions {
  abilities?: TroopAbility[];
  abilityReview?: AbilityReview[];
  abilityState?: AbilityMemory;
  traits?: string[];
  immuneFear?: boolean;
  attackTags?: { melee: string[]; volley: string[]; spell?: string[] };
  id: string;
  name: string;
  side: Side;
  level: number;
  role: Role;
  stats: UnitStats;
  attackSources?: { strike?: string; volley?: string };
  /** Feet a single Move action buys. */
  speed: number;
  /** A flier ignores terrain cost and blocked edges. */
  flying: boolean;
  movementRates?: MovementRates;
  sourceSpeed?: Pick<TroopSheet, 'speed' | 'otherSpeeds'>;

  tactics: Tactic[];
  /** `null` for a non-caster and for a caster with no tradition set (there is none, per
   * `cardTraits`' own fallback — see cards.ts). Gates which trees `trees` may ever hold. */
  tradition: Tradition | null;
  /** Every tree this unit may cast at all — the caster's whole tradition, or the one tree a
   * non-caster's tactic grants (section 11). */
  trees: Tree[];
  /** Trees already cast this activation: one cast a tree, whatever else the actions buy. */
  castTrees: Tree[];
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
  status: 'active' | 'destroyed' | 'left' | 'camp';
}

/** Which unit acts. */
interface Acts { unit: string }

type ConditionEntries = typeof CONDITIONS;
/** The statuses of the conditions a heal may clear. */
export type HealingCondition = {
  [K in keyof ConditionEntries]: ConditionEntries[K] extends { status: infer S; heal: object } ? S : never;
}[keyof ConditionEntries];
export interface HealingChoice { conditions: HealingCondition[]; extraHealth?: boolean }

export interface ActivityAction extends Acts {
  ability?: string;
  type: Verb;
  activity: ActivityIndex;
  target?: string;
  spell?: Tree;
  /** Recipient recovery priorities, resolved according to the roll’s degree. */
  healingChoices?: Record<string, HealingChoice>;
  /** Extra actions committed before resolution: each adds +2, at most two. */
  focus?: number;
}

/** Cells a route must pass through, in order, before it goes on to its end. */
export interface Routes { waypoints?: string[] }

/** Stride to `to`, spending as many Move actions as the route costs. */
export interface MoveAction extends Acts, Routes { type: 'move'; to: string }

/** Move to a deployment-zone boundary and spend one action to leave the battlefield. */
export interface FleeAction extends Acts { type: 'flee'; to: string }
export interface FleePlan {
  cell: string;
  path: string[];
  feet: number;
  moveActions: number;
  actions: number;
  modifier: number;
  dc: number;
}

/** Break contact by one of the three activities, then move one hex to `to`. */
export interface StepAction extends Acts { type: 'step'; to: string }

/** Move into contact and fight at the activity price, plus optional commitment. */
export interface ChargeAction extends Acts, Routes { type: 'charge'; target: string; activity?: ActivityIndex; focus?: number }

/** Ordinary movement followed by the chosen melee, committed as one player decision. The
 * waypoints bind the whole road; the plan decides how many the move walks. */
export interface AdvanceAction extends Acts, Routes {
  type: 'advance'; target: string; via: string; finish: 'fight' | 'charge'; activity?: ActivityIndex; focus?: number;
}

export interface SiegeAction extends Acts {
  type: 'siege';
  engine: string;
  operation: 'load' | 'haul' | 'release' | 'attack';
  activity?: ActivityIndex;
  target?: string;
  focus?: number;
}

export interface GateAction extends Acts { type: 'gate'; edge: string; open: boolean; }

export type Action = GateAction | SiegeAction | ActivityAction | MoveAction | StepAction | ChargeAction | AdvanceAction | FleeAction;

export type TargetKind = 'cell' | 'unit' | 'wall';

export interface ActivityTarget { kind: TargetKind; id: string; label: string }

/** One board object an activity can be aimed at: a cell, a piece, or a wall. */
export interface BoardObject { kind: 'cell' | 'unit' | 'wall'; id: string }

/** What one offer can do to a given target: the offer, and only those of its activities that both
 * reach that target and are legal right now. See `offersAt`. */
export interface TargetOffer { offer: ActionOffer; activities: ActivityOption[] }

export interface ActivityOption {
  /** An `ActivityId` for the four verbs with a table; `${Tree}-${CastActivityIndex}` (e.g. `blast-2`) for Cast. */
  activity: string;
  index: ActivityIndex;
  label: string;
  detail: string;
  /** Action cost, independent of spell tier. `null` when level or tradition prevents access. */
  cost: number | null;
  legal: boolean;
  reason: string | null;
  needsTarget: boolean;
  targets: ActivityTarget[];
}

export interface ActionOffer {
  ability?: string;
  hostile?: boolean;
  type: Verb;
  spell: Tree | null;
  label: string;
  detail: string;
  activities: ActivityOption[];
}

/** One enemy holding the unit: the DC its zone of control sets, and what it does when the unit leaves. */
export interface Holder {
  unit: string;
  name: string;
  /** Its Battle DC, or a pinning shooter's Salvo DC. */
  dc: number;
  /** Holding at range, by a Pin: its free attack is a Volley. */
  pinning: boolean;
}

/** What a Move out of a zone of control rolls: Reflex, less disorder, against the highest holder's DC. */
export interface EscapeOffer {
  modifier: number;
  dc: number;
  holders: Holder[];
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
  /** The run's own actions, before the melee's. */
  actions: number;
  /** It ends a short range from where it began, for +2 on the attack. */
  runUp: boolean;
}

export interface MeleePlan {
  target: string;
  kind: 'fight' | 'charge';
  /** The ordinary move ends here. Null means the melee starts at the current position. */
  via: string | null;
  cell: string;
  moveActions: number;
  feet: number;
  bonus: number;
  movePath: string[];
  attackPath: string[];
  /** How many of the waypoints the move walks through; the charge runs through the rest. */
  split: number;
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
  /** The roll a Move from here makes first. `null` when nothing holds the unit. */
  escape: EscapeOffer | null;
  /** Cells one Step reaches. */
  steps: string[];
  moves: Map<string, MoveReach>;
  charges: ChargeOption[];
}

// proto: the tag names are reserved for review with the list of execution events.
/** The mark on the few log lines a comparison of two states cannot explain: a free strike,
 * a cast, and the second die a Blast throws. Every other line is read from `check`, from the
 * turn boundary, or from the state itself. */
export type LogTag =
  | { kind: 'freeStrike'; attacker: string; target: string }
  | { kind: 'spell'; caster: string; tree: Tree; activity: ActivityIndex; targets: string[] }
  | { kind: 'secondDie'; faces: [number, number] }
  /** `unit` is the piece the ability lands on or that resists it. */
  | ({ kind: 'ability'; unit: string; outcome: AbilityOutcome } & AbilityMark);

/** Where a check's result lands and how it reads. An attack lands on its target as a hit or a
 * miss; a failed repulse save and an attack an aegis turned each have their own word; a brace
 * against a wound says nothing, since the disorder it costs speaks for it. A check line without
 * one lands on its roller as a plain check. */
export interface CheckLanding { unit: string; reads: 'attack' | 'check' | 'repulse' | 'brace' | 'aegis' }

export interface LogEntry {
  round: number;
  unit?: string;
  /** Explicit activation boundaries keep reactions under the acting army's turn. */
  turn?: 'start' | 'end';
  text: string;
  check?: CheckResult;
  tag?: LogTag;
  lands?: CheckLanding;
}

export type Phase = 'battle' | 'ended';

export interface BattleState {
  /** One campaign battle may span several battlefield days. */
  day: number;
  roundsPerDay: number;
  /** Each army's rolls, recorded the moment that army rolls; an army present here has had its
   * night. Null before either army rolls. */
  night: Partial<Record<Side, NightRecovery[]>> | null;
  /** A chosen new battlefield, pending the next day's deployment. Null keeps this field. */
  nextBoard?: Board | null;
  /** Retain field damage and equipment left behind when the armies change maps. */
  previousBattlefields?: { day: number; board: Board; engines: EngineState[] }[];
  dayOrders?: { choices: Partial<Record<Side, DayOrder>>; confirmed: boolean };
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
  endedBy: 'rout' | 'dusk' | 'withdrawal' | 'surrender' | null;
  log: LogEntry[];
}

export type RecoveryActivity = 'rally' | 'treat';
export type DayOrder = 'surrender' | 'withdraw' | 'hold';
export interface RecoveryChoice { unit: string; activity: RecoveryActivity }
export interface NightRecovery extends RecoveryChoice {
  check: CheckResult;
  penalty: number;
  recovered: number;
}

export type Range = 'engaged' | 'short' | 'medium' | 'long' | 'extreme' | 'beyond';
export const REACH_RANK: Record<Reach, number> = { short: 1, medium: 2, long: 3, extreme: 4 };

/** Distance-band upper bounds. Weapons prefer one band; spells use a band as a fixed ceiling. */
export const BANDS: Record<Reach, number> = { short: 3, medium: 6, long: 9, extreme: 12 };

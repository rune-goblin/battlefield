import type { AbilityOutcome, ActivityIndex, BattleState, CheckLanding, CheckResult, Side, Status, Tree } from '../engine/index.js';

// proto: the list of event types is reserved for review.
/** What one commit did, in the order it happened. `ActionResolutionService` derives these by
 * comparing the state across a transition; the engine's log tags supply the few a comparison
 * cannot explain. Presentation, chat, and notices all read this list rather than the prose. */
export type BattleEventBody =
  /** `route` is the whole road walked, the unit's own cell first. */
  | { type: 'unitMoved'; unit: string; from: string; to: string; route: string[] }
  /** `unit` rolled; `lands` names the piece the result falls on and the words that read it: the
   * roller itself unless the engine says otherwise. Null when no piece rolled. */
  | { type: 'checkResolved'; unit: string | null; check: CheckResult; text: string; lands: CheckLanding | null }
  | { type: 'freeStrikeResolved'; unit: string; target: string; check: CheckResult | null; text: string }
  | { type: 'woundsChanged'; unit: string; from: number; to: number }
  | { type: 'disorderChanged'; unit: string; from: number; to: number }
  /** Every status a piece takes on, a stance and a buff as much as what an enemy did to it. */
  | { type: 'conditionGained'; unit: string; condition: Status }
  | { type: 'unitRouted'; unit: string }
  /** A troop ability landing on `unit`, or `unit` resisting it; `check` is the save, if any. */
  | { type: 'abilityResolved'; unit: string; label: string; name: string; outcome: AbilityOutcome; check: CheckResult | null; text: string }
  | { type: 'spellResolved'; unit: string; tree: Tree; activity: ActivityIndex; targets: string[]; check: CheckResult | null }
  | { type: 'activationEnded'; unit: string }
  | { type: 'roundEnded'; round: number }
  | { type: 'battleEnded'; winner: Side | 'draw' | null; endedBy: BattleState['endedBy'] };

export type BattleEventType = BattleEventBody['type'];

/** An event as the record holds it: stable across clients, so a chat card or a notice can name
 * the event it came from. */
export type BattleEvent = BattleEventBody & { id: string };

export const stampEvents = (commandId: string, bodies: BattleEventBody[]): BattleEvent[] =>
  bodies.map((body, index) => ({ ...body, id: `${commandId}:${index}` }));

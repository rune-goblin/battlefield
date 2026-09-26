import type { Status } from './status.js';
import type { BattleState, Conditions, DefenceBuff, HealingCondition, Unit } from './types.js';

type Key = keyof Conditions;
type KeysOf<T> = { [K in Key]-?: Conditions[K] extends T ? K : never }[Key];
type CountdownKey = KeysOf<number>;
type ShooterKey = KeysOf<string | null>;

/**
 * - `begin`: the unit's next activation starts.
 * - `finish`: the unit's next activation ends.
 * - `countdown`: one fewer at the end of each of the unit's activations.
 * - `after-acted`: the end of an activation, unless the unit cast it on itself during that one.
 * - `shooter`: the shooter it names activates or leaves play.
 */
export type Lapse = 'begin' | 'finish' | 'countdown' | 'after-acted' | 'shooter';

type LapseFor<K extends Key> = 'begin' | 'finish'
  | (K extends CountdownKey ? 'countdown' : never)
  | (K extends DefenceBuff ? 'after-acted' : never)
  | (K extends ShooterKey ? 'shooter' : never);

type Shown = {
  status: Status;
  /** Compared by value in `statusesGained`, so a second shooter's pin on a piece already pinned
   * counts as a change. */
  holds: (u: Unit) => unknown;
  /** A heal may clear it; `text` is read before the field resets. */
  heal?: { text: (u: Unit, state: BattleState) => string };
};
type Unshown = { status?: undefined; holds?: undefined; heal?: undefined };

export type ConditionSpec<K extends Key> = {
  /** A factory, so an array value is never shared between units. */
  fresh: () => Conditions[K];
  lapse: LapseFor<K>;
  /** A hit that removes magical buffs clears it. */
  magical?: true;
} & (Shown | Unshown);

// A mapping over `keyof Conditions` copies `movementBonus?` and lets its entry go missing, and `-?`
// stops `SPECS[key]` narrowing to one spec in `reset`. The `Key` alias avoids both.
type ConditionRecord = { [K in Key]: ConditionSpec<K> };

// The healable entries stand in the order a heal clears them: pinned through persistent damage.
export const CONDITIONS = {
  guard: { fresh: () => null, lapse: 'begin', status: 'guard', holds: (u) => u.guard !== null },
  pinnedBy: {
    fresh: () => null, lapse: 'shooter', status: 'pinned', holds: (u) => u.pinnedBy,
    heal: { text: (u, state) => {
      const pinner = state.units.find((e) => e.id === u.pinnedBy);
      return `${u.name} is healed clear of ${pinner ? `${pinner.name}'s` : 'the'} pin.`;
    } },
  },
  rooted: {
    fresh: () => 0, lapse: 'countdown', status: 'rooted', holds: (u) => u.rooted > 0,
    heal: { text: (u) => `${u.name} is healed clear of root.` },
  },
  suppressedBy: {
    fresh: () => null, lapse: 'shooter', status: 'suppressed', holds: (u) => u.suppressedBy,
    heal: { text: (u) => `${u.name} is healed clear of suppression.` },
  },
  exposed: {
    fresh: () => false, lapse: 'begin', status: 'exposed', holds: (u) => u.exposed,
    heal: { text: (u) => `${u.name} is healed clear of exposure.` },
  },
  frightened: {
    fresh: () => false, lapse: 'finish', status: 'frightened', holds: (u) => u.frightened,
    heal: { text: (u) => `${u.name} is healed clear of fright.` },
  },
  persistent: {
    fresh: () => null, lapse: 'finish', status: 'persistent', holds: (u) => u.persistent !== null,
    heal: { text: (u) => `${u.name} recovers from persistent damage.` },
  },
  stunned: { fresh: () => false, lapse: 'begin', status: 'stunned', holds: (u) => u.stunned },
  inspired: { fresh: () => false, lapse: 'finish', status: 'inspired', holds: (u) => u.inspired },
  ward: { fresh: () => false, lapse: 'after-acted', magical: true, status: 'warded', holds: (u) => u.ward },
  stoneskin: { fresh: () => false, lapse: 'after-acted', magical: true, status: 'stoneskin', holds: (u) => u.stoneskin },
  aegis: { fresh: () => null, lapse: 'after-acted', magical: true, status: 'aegis', holds: (u) => u.aegis !== null },
  sureStrike: { fresh: () => false, lapse: 'finish', magical: true, status: 'sure-strike', holds: (u) => u.sureStrike },
  wrath: { fresh: () => false, lapse: 'finish', magical: true, status: 'wrath', holds: (u) => u.wrath },
  haste: { fresh: () => 0, lapse: 'countdown', magical: true, status: 'hasted', holds: (u) => u.haste > 0 },
  movementBonus: {
    fresh: () => 0, lapse: 'finish', magical: true, status: 'burst-of-speed', holds: (u) => (u.movementBonus ?? 0) > 0,
  },
  sureFooting: { fresh: () => false, lapse: 'finish', magical: true, status: 'sure-footing', holds: (u) => u.sureFooting },
  flies: { fresh: () => false, lapse: 'finish', magical: true },
  selfBuffs: { fresh: () => [], lapse: 'finish', magical: true },
} satisfies ConditionRecord;

const SPECS: ConditionRecord = CONDITIONS;
const KEYS = Object.keys(SPECS) as Key[];
const keysWhere = (test: (spec: ConditionRecord[Key]) => unknown) => KEYS.filter((k) => test(SPECS[k]));
const lapsing = (lapse: Lapse) => keysWhere((spec) => spec.lapse === lapse);

export const BEGIN_CONDITIONS = lapsing('begin');
export const FINISH_CONDITIONS = lapsing('finish');
export const COUNTDOWN_CONDITIONS = lapsing('countdown') as CountdownKey[];
export const AFTER_ACTED_CONDITIONS = lapsing('after-acted') as DefenceBuff[];
export const SHOOTER_CONDITIONS = lapsing('shooter') as ShooterKey[];
export const MAGICAL_CONDITIONS = keysWhere((spec) => spec.magical);

function reset<K extends Key>(u: Conditions, key: K) {
  u[key] = SPECS[key].fresh();
}

export function resetConditions(u: Conditions, keys: readonly Key[]) {
  for (const key of keys) reset(u, key);
}

export function freshConditions(): Conditions {
  const conditions = {} as Conditions;
  resetConditions(conditions, KEYS);
  return conditions;
}

/** The entries a heal may clear, in the order it clears them. */
export const HEALABLE = KEYS.flatMap((key) => {
  const spec = SPECS[key];
  return spec.heal ? [{ key, status: spec.status as HealingCondition, holds: spec.holds, text: spec.heal.text }] : [];
});

export const HEALING_CONDITIONS: readonly HealingCondition[] = HEALABLE.map((h) => h.status);

export const healableConditions = (u: Unit): HealingCondition[] =>
  HEALABLE.filter((h) => h.holds(u)).map((h) => h.status);

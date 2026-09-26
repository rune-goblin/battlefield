import { HEALING_LABEL, healableConditions, healSlots, type HealingChoice, type HealingCondition, type Unit } from '../engine/index.js';

export interface HealingOption { value: string; label: string }
export interface HealingRow {
  id: string;
  name: string;
  first: { options: HealingOption[]; value: string };
  second: { options: HealingOption[]; value: string } | null;
}

const EXTRA_HEALTH = 'health';
const slotsFor = (renewal: boolean) => healSlots(renewal ? 4 : 1);

export const healingNote = (renewal: boolean): string => slotsFor(renewal).conditions === 2
  ? 'A success clears your first choice; a critical success also clears your second.'
  : 'On a critical success, clear a condition or restore 1 extra Health.';

export function healingRows(units: Unit[], renewal: boolean, choices: Record<string, HealingChoice>): HealingRow[] {
  const slots = slotsFor(renewal);
  return units.map((u) => {
    const eligible = healableConditions(u);
    const selected = choices[u.id];
    const labelled = (conditions: HealingCondition[]) => conditions.map((c) => ({ value: c, label: HEALING_LABEL[c] }));
    const firstValue = selected
      ? selected.extraHealth ? EXTRA_HEALTH : selected.conditions[0] ?? ''
      : eligible[0] ?? (slots.extraHealth ? EXTRA_HEALTH : '');
    const first = {
      options: [...labelled(eligible), slots.extraHealth
        ? { value: EXTRA_HEALTH, label: 'Restore 1 extra Health' } : { value: '', label: 'Clear no condition' }],
      value: firstValue,
    };
    const firstCleared = selected ? selected.conditions.length === 0 : false;
    const second = slots.conditions < 2 || eligible.length < 2 || firstCleared ? null : {
      options: [...labelled(eligible.filter((c) => c !== (selected?.conditions[0] ?? eligible[0]))),
        { value: '', label: 'Clear no second condition' }],
      value: selected ? selected.conditions[1] ?? '' : eligible[1],
    };
    return { id: u.id, name: u.name, first, second };
  });
}

export function chooseHealing(choices: Record<string, HealingChoice>, unit: Unit, renewal: boolean, slot: number, value: string): Record<string, HealingChoice> {
  const current = choices[unit.id] ?? { conditions: healableConditions(unit).slice(0, slotsFor(renewal).conditions) };
  const selected = [...current.conditions];
  if (value === EXTRA_HEALTH || value === '') selected.splice(slot);
  else { selected[slot] = value as HealingCondition; if (selected[1] === selected[0]) selected.splice(1); }
  return { ...choices, [unit.id]: { conditions: selected, extraHealth: value === EXTRA_HEALTH } };
}

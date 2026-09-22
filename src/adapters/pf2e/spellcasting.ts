import type { Tradition } from '../../engine/cards.js';

interface CastingItem {
  type?: string;
  name?: string;
  statistic?: { check?: { mod?: number }; dc?: { value?: number } };
  system?: {
    tradition?: { value?: string | null } | null;
    spelldc?: { value?: number; dc?: number } | null;
  } | null;
}

const traditionOf = (item: CastingItem): Tradition | undefined => {
  const value = item.system?.tradition?.value;
  if (value && ['arcane', 'divine', 'occult', 'primal'].includes(value)) return value as Tradition;
  return /\b(arcane|divine|occult|primal)\b/i.exec(item.name ?? '')?.[1].toLowerCase() as Tradition | undefined;
};

/** Keep one tradition and one entry's attack/DC pair. Prepared values include campaign
 * penalties; raw NPC spelldc values do not. Battlefield applies Demoralized itself. */
export function spellcastingOf(items: CastingItem[], demoralized = 0): {
  tradition?: Tradition; spellAttack?: number; spellDc?: number;
} {
  const entries = items.filter(item => item.type === 'spellcastingEntry');
  const tradition = entries.map(traditionOf).find(Boolean);
  const candidates = entries.filter(item => !tradition || traditionOf(item) === tradition).map(item => {
    const attack = item.statistic?.check?.mod;
    const dc = item.statistic?.dc?.value;
    // NPC innate entries use raw zero when their source supplies no attack bonus.
    const rawAttack = item.system?.spelldc?.value;
    const spellAttack = rawAttack === 0 ? undefined : Number.isFinite(attack) ? attack! + demoralized : rawAttack;
    const spellDc = Number.isFinite(dc) ? dc! + demoralized : item.system?.spelldc?.dc;
    return {
      ...(Number.isFinite(spellAttack) ? { spellAttack } : {}),
      ...(Number.isFinite(spellDc) && spellDc! > 0 ? { spellDc } : {}),
    };
  }).sort((a, b) => (b.spellDc ?? -Infinity) - (a.spellDc ?? -Infinity)
    || (b.spellAttack ?? -Infinity) - (a.spellAttack ?? -Infinity));
  return { ...(tradition ? { tradition } : {}), ...candidates[0] };
}

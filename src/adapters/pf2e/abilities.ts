import patterns from './ability-patterns.json';
import { abilitySignature, canonicalText, type AbilityItemSource } from './ability-signature.js';
import { validAbility, type AbilityReview, type TroopAbility } from '../../engine/abilities.js';

const bySignature = new Map(patterns.map(p => [p.signature, p]));
const damageTypes = ['acid', 'bleed', 'bludgeoning', 'cold', 'electricity', 'fire', 'force', 'mental', 'piercing', 'poison', 'slashing', 'sonic', 'spirit', 'vitality', 'void', 'holy', 'unholy', 'silver', 'cold-iron', 'adamantine'];
export function sourceAttackTags(items: AbilityItemSource[], name?: string): string[] {
  const item = items.find(i => i.name === name);
  if (!item) return [];
  const description = (item.system?.description?.value ?? '').toLowerCase();
  const start = description.indexOf('@damage[');
  let formula = '', depth = 1;
  if (start >= 0) for (let i = start + 8; i < description.length && depth; i++) {
    const c = description[i];
    if (c === '[') depth++;
    if (c === ']') depth--;
    if (depth) formula += c;
  }
  // The first damage formula describes the selected attack. A later critical rider or
  // persistent component never gives ordinary hits that damage type.
  const materials = (item.system?.traits?.value ?? []).filter(t => ['holy', 'unholy', 'silver', 'cold-iron', 'adamantine'].includes(t));
  const text = `${formula.split('+').filter(part => !part.includes('persistent')).join(' ')} ${materials.join(' ')}`;
  return damageTypes.filter(t => new RegExp(`\\b${t}\\b`).test(text));
}

/** Read explicit portable item annotations or verified content patterns. Unknown mechanics
 * remain on the card as review notes; reactions never become free passive benefits. */
export function importAbilities(items: AbilityItemSource[], attacks: { battleName?: string; salvoName?: string }) {
  const review: AbilityReview[] = [];
  const candidates: { ability: TroopAbility; priority: number; explicit: boolean; index: number }[] = [];
  const matched = new Set<number>();
  for (const [index, item] of items.entries()) {
    if (!['action', 'effect', 'melee'].includes(item.type ?? '')) continue;
    const label = item.name ?? 'Unnamed ability';
    if (item.system?.actionType?.value === 'reaction') {
      review.push({ label, reason: 'Reaction retained for the separate reaction system.' });
      continue;
    }
    const flags = item.flags?.battlefield as { abilities?: unknown } | undefined;
    if (flags?.abilities !== undefined) {
      if (!Array.isArray(flags.abilities) || flags.abilities.some(a => !validAbility(a))) review.push({ label, reason: 'Invalid portable ability assignment. Correct its version, template, or parameters.' });
      else {
        for (const a of flags.abilities) candidates.push({ ability: { ...a }, priority: 10000, explicit: true, index });
        matched.add(index);
      }
      continue;
    }
    const pattern = bySignature.get(abilitySignature(item));
    if (!pattern) {
      const text = canonicalText(item.system?.description?.value ?? '');
      if (text && item.type !== 'effect') review.push({ label, reason: 'Unrecognized or changed mechanics. Assign a shared ability or keep the source as a deliberate omission.' });
      continue;
    }
    for (const reason of pattern.problems) review.push({ label, reason });
    if (pattern.abilities.length) matched.add(index);
    for (const entry of pattern.abilities) {
      const a: Record<string, unknown> = { ...entry.ability, label };
      if (entry.ownAttack) {
        if (item.name === attacks.battleName) a.attack = 'melee';
        else if (item.name === attacks.salvoName) a.attack = 'volley';
        else { review.push({ label, reason: 'This rider belongs to an alternative attack profile. Select or assign that profile before enabling it.' }); continue; }
      }
      if (!validAbility(a)) { review.push({ label, reason: 'The compiled assignment failed validation.' }); continue; }
      if (a.environment && ['fire', 'metal', 'underground'].includes(a.environment)) review.push({ label, reason: `Regeneration requires a map cell with the ${a.environment} environment tag.` });
      candidates.push({ ability: a, priority: pattern.priority, explicit: false, index });
    }
  }
  candidates.sort((a, b) => b.priority - a.priority || a.ability.kind.localeCompare(b.ability.kind));
  const kinds = new Set<string>();
  const behavior = new Set<string>();
  const abilities: TroopAbility[] = [];
  for (const candidate of candidates) {
    const a = candidate.ability;
    if (!candidate.explicit && !kinds.has(a.kind) && kinds.size >= 3) {
      review.push({ label: a.label, reason: `Additional ${a.kind} candidate; the default card keeps three defining ability types.` });
      continue;
    }
    const signature = JSON.stringify({ ...a, key: '', label: '' });
    if (behavior.has(signature)) continue;
    behavior.add(signature);
    kinds.add(a.kind);
    abilities.push(a);
  }
  // Keys come from mechanics, so equivalent source copies share a key. Distinct portable
  // annotations must also use distinct local keys; collisions are shown instead of guessed.
  const keys = new Set<string>();
  const unique = abilities.filter(a => {
    if (keys.has(a.key)) { review.push({ label: a.label, reason: 'Duplicate assignment key; retain one effect and rename the explicit key to distinguish another.' }); return false; }
    keys.add(a.key); return true;
  });
  matched.clear();
  const accepted = new Set(unique.map(a => JSON.stringify({ ...a, key: '', label: '' })));
  for (const candidate of candidates) if (accepted.has(JSON.stringify({ ...candidate.ability, key: '', label: '' }))) matched.add(candidate.index);
  return { abilities: unique, abilityReview: review, matched };
}

/** A conservative content matcher. Labels and document IDs are absent; numbers, costs,
 * traits, predicates and mechanical qualifiers remain. Unknown paraphrases need review. */
export interface AbilityItemSource {
  name?: string;
  type?: string;
  flags?: Record<string, unknown>;
  system?: {
    description?: { value?: string | null } | null;
    traits?: { value?: string[] | null } | null;
    actionType?: { value?: string | null } | null;
    actions?: { value?: number | null } | null;
    rules?: unknown[];
  } | null;
}
export function canonicalText(text: string): string {
  return text.replace(/@UUID\[[^\]]+\]\{([^}]+)\}/g, '$1')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/[‘’]/g, "'").replace(/[−–]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
}
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !['label', 'slug'].includes(k)).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  return value;
}
export function abilitySignature(item: AbilityItemSource): string {
  const s = item.system;
  // These suffixes contain rules, not flavor labels. Removing one changes the mechanics.
  const qualifier = item.name?.match(/\((?:while|deactivated by)[^)]+\)/i)?.[0] ?? '';
  return JSON.stringify([canonicalText(s?.description?.value ?? ''), s?.actionType?.value ?? 'passive', s?.actions?.value ?? null,
    [...s?.traits?.value ?? []].sort(), stable(s?.rules ?? []), canonicalText(qualifier)]);
}

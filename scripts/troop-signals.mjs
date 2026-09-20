// Structural signals read off any PF2e troop statblock. Measured over the 162 published troops:
// AC and attack DC are essentially f(level), so grades come from these recurring action names,
// from Speed and from Will instead. See docs/plans/battle-mechanics.todos.md.
const SIGNALS = {
  mounted: /mounted troop|first-class charge/i,
  'melee-drill': /clash of steel|wild swing|strike as one|trample|attack of opportunity|reactive strike/i,
  shielded: /raise shields|shield block/i,
  formation: /form up|drilled in formations/i,
  'magic-ward': /status to all saves vs\.? magic/i,
  'no-retreat': /no retreat/i,
};

export const strip = (html) => (html ?? '').replace(/<[^>]+>/g, ' ');

export const actionsOf = (doc) => doc.items
  .filter((it) => it.type === 'action')
  .map((it) => ({ name: it.name, text: strip(it.system.description.value) }));

export const signalsOf = (actions) =>
  Object.entries(SIGNALS).filter(([, re]) => actions.some((a) => re.test(a.name))).map(([k]) => k);

export const casterOf = (doc, actions) =>
  doc.items.some((it) => it.type === 'spellcastingEntry' || it.type === 'spell')
  || actions.some((a) => /troop spellcasting|constant spells/i.test(a.name));

const feet = (t) => Number(/within (\d+) feet/.exec(t)?.[1] ?? NaN);
// Both spellings occur in the source: @Template[cone|distance:30] and @Template[type:cone|distance:30].
const templates = (t) => [...t.matchAll(/@Template\[(?:type:)?(\w+)\|distance:(\d+)/g)].map((m) => ({ kind: m[1], d: Number(m[2]) }));

// Template type, not distance, says whether an action is ranged: an emanation of 5 or 10 feet
// is a melee sweep, while a 20-foot burst is thrown. A burst's own distance is its splash;
// the "within N feet" in the text is how far it is thrown.
export function rangeOf(text) {
  const tps = templates(text);
  const stated = feet(text);
  if (!tps.length) return Number.isNaN(stated) ? null : stated;
  let best = null;
  for (const tp of tps) {
    if (tp.kind === 'emanation' && tp.d <= 10) continue;
    const r = tp.kind === 'burst'
      ? (Number.isNaN(stated) ? tp.d : stated)
      : (Number.isNaN(stated) ? tp.d : Math.max(stated, tp.d));
    best = best === null ? r : Math.max(best, r);
  }
  return best;
}

// Extreme is reserved for siege engines (see BANDS in types.ts) — a troop's own Salvo attack
// never derives it, however far its range increment runs.
export const bandOf = (ft) => (ft === null ? null : ft <= 60 ? 'short' : ft <= 120 ? 'medium' : 'long');

export const traditionOf = (doc) => {
  for (const item of doc.items.filter(item => item.type === 'spellcastingEntry')) {
    const value = item.system?.tradition?.value;
    if (['arcane', 'divine', 'occult', 'primal'].includes(value)) return value;
    const name = /\b(arcane|divine|occult|primal)\b/i.exec(item.name ?? '')?.[1].toLowerCase();
    if (name) return name;
  }
  return undefined;
};

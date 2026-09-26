/** Keep the static rules catalogue aligned with the playable siege profiles. */
import { readFileSync, writeFileSync } from 'node:fs';
import { ENGINES } from '../src/engine/engines.ts';
import { siegeModes, siegeDetail } from '../src/engine/siege-profiles.ts';
import { BANDS } from '../src/engine/types.ts';

const file = new URL('../public/rules.html', import.meta.url);
const start = '<!-- siege-reference:start -->';
const end = '<!-- siege-reference:end -->';
const escape = (value: string | number) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const reach = BANDS;
const rows = [...ENGINES].sort((a, b) => a.name.localeCompare(b.name)).map(engine => {
  const mobility = engine.speed === 0 ? 'Fixed' : engine.speed == null ? 'Crew speed' : `${engine.speed / 10} hex/action`;
  const modes = siegeModes(engine.name, engine.kind).map(mode =>
    `<li><strong>${escape(mode.label)} · ${mode.cost} action${mode.cost === 1 ? '' : 's'}.</strong> ${escape(siegeDetail(mode))}${mode.ignites ? ' · Clears webs' : ''}.</li>`).join('');
  return `<tr><th scope="row">${escape(engine.name)}<span class="meta">Level ${engine.level}</span></th><td>+${engine.launch}</td><td>${engine.reach ? reach[engine.reach] : 'Adjacent'}</td><td>${engine.loadSteps === 0 ? '—' : engine.loadCost}</td><td>${mobility}</td><td><details><summary>Attacks (${siegeModes(engine.name, engine.kind).length})</summary><ul>${modes}</ul></details></td></tr>`;
});
const block = `${start}
<details id="siege-catalogue" class="siege-catalogue">
<summary>All ${ENGINES.length} siege engines · stats and attacks</summary>
<p>Launch is the base attack bonus before crew modifiers. Range is the maximum in hexes; each attack lists any minimum or smaller area. Load is the total actions to refill an empty engine; a dash means no reload. Each Load action fills one pip. Hauling uses the slower of crew and engine speed. Damage reads <strong>hit/critical</strong>; wall attacks deal structural damage and subtract hardness after penetration.</p>
<div class="wrap"><table class="siege-reference"><caption>Battlefield siege profiles</caption><thead><tr><th scope="col">Engine</th><th scope="col">Launch</th><th scope="col">Range</th><th scope="col">Load</th><th scope="col">Haul speed</th><th scope="col">Activities and effects</th></tr></thead><tbody>
${rows.join('\n')}
</tbody></table></div>
</details>
${end}`;
const source = readFileSync(file, 'utf8');
const first = source.indexOf(start), last = source.indexOf(end);
if (first < 0 || last < first) throw new Error('Siege reference markers are missing.');
const updated = source.slice(0, first) + block + source.slice(last + end.length);
if (process.argv.includes('--check')) {
  if (updated !== source) throw new Error('Siege reference is stale. Run node scripts/update-siege-reference.ts.');
  console.log(`Siege reference matches ${ENGINES.length} engines and their attack profiles.`);
} else {
  writeFileSync(file, updated);
  console.log(`Updated ${ENGINES.length} siege engines in public/rules.html.`);
}

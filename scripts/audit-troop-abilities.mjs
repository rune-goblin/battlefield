// Evidence and review artifacts only. This script never changes playable cards.
// Refresh: node scripts/audit-troop-abilities.mjs --refresh [PF2e repository root]
// Render/verify from the saved evidence: node scripts/audit-troop-abilities.mjs
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const folder = join(repo, 'data/troop-abilities');
const docs = join(repo, 'docs/reviews/troop-abilities');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const save = (name, value) => writeFileSync(join(folder, name), JSON.stringify(value, null, 2) + '\n');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plain = html => (html ?? '').replace(/<[^>]+>/g, ' ')
  .replace(/@UUID\[([^\]]+)\](?:\{([^}]+)\})?/g, (_, id, label) => label ?? id.split('.').at(-1))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const scan = root => readdirSync(root, { withFileTypes: true }).flatMap(file => {
  const path = join(root, file.name);
  return file.isDirectory() ? scan(path) : file.name.endsWith('.json') ? [[path, read(path)]] : [];
});

if (process.argv.includes('--refresh')) {
  const root = resolve(process.argv[process.argv.indexOf('--refresh') + 1] ?? join(repo, '_pf2e-source'));
  const lang = read(join(root, 'static/lang/en.json'));
  const local = scan(join(repo, 'data/troops'));
  const official = scan(join(root, 'packs/pf2e')).filter(([, d]) => d.type === 'npc' && d.system?.traits?.value?.includes('troop'))
    .sort(([a], [b]) => Number(relative(join(root, 'packs/pf2e'), b).startsWith('pathfinder-')) - Number(relative(join(root, 'packs/pf2e'), a).startsWith('pathfinder-')) || a.localeCompare(b));
  const selectedNames = new Set(local.map(([, d]) => d.name));
  const localize = html => html.replace(/@Localize\[([^\]]+)\]/g, (original, key) => {
    const value = key.split('.').reduce((object, part) => object?.[part], lang);
    return typeof value === 'string' ? value : original;
  });
  const troops = [...local.map(([path, d]) => [path, d, 'reignmaker']), ...official.map(([path, d]) => [path, d, 'pf2e'])]
    .map(([path, actor, collection]) => {
      const selected = collection === 'reignmaker' || !selectedNames.has(actor.name);
      selectedNames.add(actor.name);
      const sourcePath = collection === 'reignmaker' ? relative(repo, path) : `packs/pf2e/${relative(join(root, 'packs/pf2e'), path)}`;
      const id = `${collection}:${sourcePath.replace(/\.json$/, '')}`;
      return { id, name: actor.name, selected, collection, sourcePath, actorId: actor._id,
        sourceHash: hash(actor), system: actor.system,
        items: actor.items.map((item, index) => ({ id: `${id}#${item._id ?? index}`, sourceHash: hash(item),
          source: item, text: plain(localize(item.system?.description?.value ?? '')) })) };
    }).sort((a, b) => a.name.localeCompare(b.name) || Number(b.selected) - Number(a.selected) || a.id.localeCompare(b.id));
  let commit = null;
  try { commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); } catch { /* hashes still pin every actor */ }
  const localizations = {};
  for (const troop of troops) for (const item of troop.items) for (const match of (item.source.system?.description?.value ?? '').matchAll(/@Localize\[([^\]]+)\]/g)) {
    localizations[match[1]] = match[1].split('.').reduce((object, part) => object?.[part], lang) ?? null;
  }
  save('sources.json', { schemaVersion: 1, reviewedOn: '2026-09-23', pf2eCommit: commit,
    scope: 'All 38 repository troops and all troop-trait NPC actors in the local PF2e checkout, including suppressed copies. Embedded spells and equipment are evidence; action-specific spellcasting modifiers are reviewed separately from spell conversion.',
    localizations, troops });
}

const snapshot = read(join(folder, 'sources.json'));
const reviewsPath = join(folder, 'reviews.json');
if (!existsSync(reviewsPath)) {
  console.log(`Saved ${snapshot.troops.length} source actors; reviews.json is required to render.`);
  process.exit(0);
}
const reviews = read(reviewsPath);
const reviewById = new Map(reviews.abilities.map(r => [r.id, r]));
if (reviewById.size !== reviews.abilities.length) throw new Error('Duplicate review IDs');
const structural = new Set(['Troop Defenses', 'Troop Movement', 'Form Up']);
const abilities = snapshot.troops.flatMap(t => t.items.filter(i => ['action', 'melee'].includes(i.source.type)).map(i => ({ troop: t, item: i })));
let missing = 0;
const reviewed = new Set();
const reviewOf = item => {
  const review = reviewById.get(item.id);
  if (!review || review.sourceHash !== item.sourceHash) { missing++; return { disposition: 'needs-review', proposal: 'Source is new or changed. Review before enabling a game effect.', family: 'unreviewed' }; }
  reviewed.add(item.id);
  return review;
};
const rows = abilities.map(({ troop, item }) => ({ troop, item, review: reviewOf(item) }));
const stale = reviews.abilities.filter(r => !reviewed.has(r.id)).length;
const counts = values => Object.fromEntries([...Map.groupBy(values, v => v)].sort(([a], [b]) => a.localeCompare(b)).map(([k, vs]) => [k, vs.length]));
const summary = { sourceActors: snapshot.troops.length, playableTroopNames: snapshot.troops.filter(t => t.selected).length,
  suppressedActors: snapshot.troops.filter(t => !t.selected).length, actionItems: rows.length,
  structuralItems: rows.filter(r => structural.has(r.item.source.name)).length,
  sourceActionTypes: counts(rows.map(r => r.item.source.system?.actionType?.value ?? r.item.source.type)),
  dispositions: counts(rows.map(r => r.review.disposition)),
  reactionItems: rows.filter(r => r.item.source.system?.actionType?.value === 'reaction').length,
  missingOrChangedReviews: missing, staleReviews: stale };
save('coverage.json', summary);
const esc = text => String(text ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const anchor = name => name.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-');
const sourceLink = troop => troop.collection === 'reignmaker'
  ? `../../../${troop.sourcePath}` : `https://github.com/foundryvtt/pf2e/blob/${snapshot.pf2eCommit}/${troop.sourcePath}`;
const mode = item => {
  const system = item.source.system;
  const type = system?.actionType?.value ?? item.source.type;
  return type === 'action' ? `${system.actions?.value ?? '?'} action(s); see source for variable costs` : type;
};
const heading = '# Troop ability inventory\n\nReview date: 2026-09-23. Proposals describe future behavior; they do not change current rules. See [review and standards](README.md), [separate reaction review](reactions.md), and [saved source evidence](../../../data/troop-abilities/sources.json).\n\n';
let inventory = heading;
inventory += '| Troop | Level | Source actions | Source reactions | Selection |\n|---|---:|---:|---:|---|\n';
for (const t of snapshot.troops) {
  const own = rows.filter(r => r.troop.id === t.id);
  inventory += `| [${esc(t.name)}](#${anchor(t.name + (t.selected ? '' : ' source alternative'))}) | ${t.system.details.level.value} | ${own.length} | ${own.filter(r => r.item.source.system?.actionType?.value === 'reaction').length} | ${t.selected ? 'Current library' : 'Source alternative'} |\n`;
}
for (const t of snapshot.troops) {
  inventory += `\n## ${t.name}${t.selected ? '' : ' source alternative'}\n\n[Source actor](${sourceLink(t)}). ${t.collection}; level ${t.system.details.level.value}. ${t.selected ? 'Current library selection.' : 'The current importer suppresses this same-name source; its abilities remain in the review.'}\n\n`;
  const own = rows.filter(r => r.troop.id === t.id);
  inventory += '| Ability | Source economy | Disposition | Proposed game effect |\n|---|---|---|---|\n';
  for (const { item, review } of own.filter(r => r.item.source.system?.actionType?.value !== 'reaction' && !structural.has(r.item.source.name))) {
    inventory += `| ${esc(item.source.name)} | ${esc(mode(item))} | ${review.disposition} / ${review.family} | ${esc(review.proposal)} |\n`;
  }
  inventory += `\nCommon troop rules: ${own.filter(r => structural.has(r.item.source.name)).map(r => r.item.source.name).join(', ')}. Their source text remains in the evidence; the review treats formation size and HP thresholds as an explicit abstraction.\n`;
  const reactions = own.filter(r => r.item.source.system?.actionType?.value === 'reaction');
  inventory += `\nReactions: ${reactions.length ? reactions.map(r => r.item.source.name).join('; ') : 'None in the source action items'}. See the separate reaction inventory.\n`;
  const spells = t.items.filter(i => i.source.type === 'spell');
  if (spells.length) inventory += `\nEmbedded spells: ${spells.map(i => i.source.name).join('; ')}. Spell items and casting entries remain in the evidence; this review maps action-specific casting modifiers, rather than rewriting the spell catalogue.\n`;
}
writeFileSync(join(docs, 'inventory.md'), inventory);
let reactions = '# Troop reaction inventory\n\nThese proposals belong to a separate reaction activity. No reaction becomes an automatic Attack or Volley rider. One reaction per troop per round is a proposed shared budget; refresh it at the round boundary. Existing maneuver free strikes remain an explicit rules decision, not evidence that a troop has Reactive Strike.\n\nA source may put a trigger inside a passive or free action. Those entries retain their source economy in the main inventory. Wind-Up and Shield Wall also describe reactions inside their text.\n\n';
reactions += '| Troop | Reaction | Source trigger and effect | Proposed game effect |\n|---|---|---|---|\n';
for (const { troop, item, review } of rows.filter(r => r.item.source.system?.actionType?.value === 'reaction')) {
  reactions += `| ${esc(troop.name)}${troop.selected ? '' : ' (source alternative)'} | ${esc(item.source.name)} | ${esc(item.text)} | **${review.disposition}**: ${esc(review.proposal)} |\n`;
}
reactions += '\n## Embedded reaction rules\n\nThese entries describe a reaction inside another ability. They are additional review obligations, outside the explicit reaction-item count. Their source action types remain unchanged.\n\n| Troop | Containing ability | Proposed treatment |\n|---|---|---|\n';
for (const { troop, item, review } of rows.filter(r => ['Wind-Up', 'Shield Wall'].includes(r.item.source.name))) {
  reactions += `| ${esc(troop.name)} | ${esc(item.source.name)} (${esc(mode(item))}) | ${esc(review.proposal)} |\n`;
}
reactions += '\n## Passive and free triggers\n\nBlood Soak, Mass Improved Grab, Thus Always to Tyrants, You\'re Coming with Us, threshold explosions, and death bursts keep their source passive/free economy. Now!! has a passive ambush trigger and remains a source question. These events need trigger handling, but do not consume a troop reaction unless a later rule explicitly changes their economy.\n';
writeFileSync(join(docs, 'reactions.md'), reactions);
console.log(JSON.stringify(summary, null, 2));
if (missing || stale) process.exitCode = 1;

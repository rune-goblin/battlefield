#!/usr/bin/env node
// Design evidence only. Never changes playable cards or the ReignMaker checkout.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = path.join(root, 'data/troop-abilities');
const hash = value => createHash('sha256').update(value).digest('hex');
const read = name => JSON.parse(fs.readFileSync(path.join(data, name), 'utf8'));
const write = (name, value) => fs.writeFileSync(path.join(data, name), JSON.stringify(value, null, 2) + '\n');
const args = process.argv.slice(2);
if (args.length && !(args.length === 2 && args[0] === '--refresh')) throw new Error('Usage: node scripts/audit-reignmaker-abilities.mjs [--refresh /path/to/pf2e-reignmaker]');

if (args[0] === '--refresh') {
  const sourceRoot = path.resolve(args[1]);
  const sourceImport = file => import(pathToFileURL(path.join(sourceRoot, file)).href);
  const { listAbilityFiles, readDefinition } = await sourceImport('buildscripts/troopAbilityFiles.mjs');
  const supportPaths = [
    'src/data/troopAbilities/tacticsLadder.ts', 'src/constants/doctrineAbilityMappings.ts',
    'src/config/troopAbilities.ts', 'src/services/creatures/abilityItemBuilder.ts',
    'src/services/army/ArmyActorBridge.ts', 'src/services/doctrine/DoctrineAbilityService.ts',
    'src/data/troopAbilities/AbilityRegistry.ts', 'buildscripts/troopAbilityFiles.mjs',
  ];
  const evidenceFile = file => {
    const text = fs.readFileSync(path.join(sourceRoot, file), 'utf8');
    return { file, sha256: hash(text), text };
  };
  const record = (id, kind, file, definition, extra = {}) => ({
    id, kind, ...evidenceFile(file), definition,
    definitionHash: hash(JSON.stringify(definition)), ...extra,
  });
  const entries = listAbilityFiles().map(({ file }) => {
    const def = readDefinition(file);
    return record(def.slug, 'registry', path.relative(sourceRoot, file), def);
  });
  const { DOCTRINE_ABILITY_MAPPINGS } = await sourceImport('src/constants/doctrineAbilityMappings.ts');
  for (const grant of DOCTRINE_ABILITY_MAPPINGS) {
    const file = `src/data/abilities/${grant.sourceId}.ts`;
    const exports = await sourceImport(file);
    const definition = Object.values(exports).find(value => value?.system);
    if (!definition) throw new Error(`Missing doctrine definition: ${file}`);
    entries.push(record(grant.id, 'doctrine', file, definition, {
      grant, actorSlug: `doctrine-ability-${grant.id}`,
    }));
  }
  const { TACTICS_LADDER } = await sourceImport('src/data/troopAbilities/tacticsLadder.ts');
  write('reignmaker-sources.json', {
    version: 1, reviewed: '2026-09-23',
    commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, encoding: 'utf8' }).trim(),
    provenance: 'Per-file hashes describe the inspected working tree; the commit does not imply a clean checkout.',
    entries, training: TACTICS_LADDER, supportFiles: supportPaths.map(evidenceFile),
  });
}

const snapshot = read('reignmaker-sources.json');
const catalogue = read('catalogue.json');
const review = read('reignmaker-mappings.json');
const unique = (rows, key, label) => {
  const ids = rows.map(row => row[key]);
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${label}`);
  return new Set(ids);
};
const abilities = unique(catalogue.abilities, 'id', 'ability');
const reactions = unique(catalogue.reactionPatterns, 'id', 'reaction');
const sources = unique(snapshot.entries, 'id', 'source');
const mappings = unique(review.entries, 'id', 'mapping');
const dispositions = new Set(['abstracted', 'baseline', 'omit', 'defer', 'reaction']);
for (const entry of snapshot.entries) {
  if (hash(entry.text) !== entry.sha256 || hash(JSON.stringify(entry.definition)) !== entry.definitionHash) throw new Error(`Corrupt evidence: ${entry.id}`);
  if (!mappings.has(entry.id)) throw new Error(`Unreviewed source: ${entry.id}`);
}
for (const entry of snapshot.supportFiles) if (hash(entry.text) !== entry.sha256) throw new Error(`Corrupt evidence: ${entry.file}`);
for (const row of review.entries) {
  if (!sources.has(row.id)) throw new Error(`Stale review: ${row.id}`);
  const source = snapshot.entries.find(entry => entry.id === row.id);
  if (row.sourceHash !== source.definitionHash) throw new Error(`Changed source needs review: ${row.id}`);
  if (!dispositions.has(row.disposition) || !row.conversion) throw new Error(`Invalid disposition: ${row.id}`);
  for (const id of row.abilities) if (!abilities.has(id)) throw new Error(`Unknown ability: ${row.id}/${id}`);
  for (const id of row.reactions) if (!reactions.has(id)) throw new Error(`Unknown reaction: ${row.id}/${id}`);
  if (row.disposition === 'abstracted' && !row.abilities.length) throw new Error(`Missing ability: ${row.id}`);
  if (row.disposition === 'reaction' && !row.reactions.length) throw new Error(`Missing reaction: ${row.id}`);
  if (source.definition.system.actionType?.value === 'reaction' && row.disposition !== 'reaction') throw new Error(`Reaction economy lost: ${row.id}`);
}
unique(snapshot.training, 'slug', 'training entry');
for (const tactic of snapshot.training) {
  for (const slug of [tactic.slug, tactic.requires, ...(tactic.gives ?? [])].filter(Boolean)) {
    if (!sources.has(slug)) throw new Error(`Unreviewed training reference: ${slug}`);
  }
}
const counts = Object.fromEntries([...dispositions].map(d => [d, review.entries.filter(row => row.disposition === d).length]));
const esc = text => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
const label = id => catalogue.abilities.find(a => a.id === id)?.name ?? catalogue.reactionPatterns.find(a => a.id === id)?.name;
const lines = [
  '# ReignMaker ability mapping', '',
  'Generated by `node scripts/audit-reignmaker-abilities.mjs`. This review selects useful abstractions; it makes no claim of runtime support or complete Pathfinder simulation.', '',
  'The [assignable catalogue](catalogue.md) defines the proposed game effects and limits. Source slugs identify evidence in this table; they are not runtime matching rules.', '',
  `Reviewed ${snapshot.reviewed}, source commit \`${snapshot.commit}\`, with per-file hashes. The snapshot contains **${snapshot.entries.filter(e => e.kind === 'registry').length} registry abilities and ${snapshot.entries.filter(e => e.kind === 'doctrine').length} doctrine grants**. All have a disposition.`, '',
  `The training ladder has **${snapshot.training.length} entries**, including **${snapshot.training.filter(t => t.family !== 'Logistics').length} tactical choices** and three campaign logistics entries. Grant bundles and prerequisites resolve to reviewed entries.`, '',
  `Dispositions: ${Object.entries(counts).map(([key, n]) => `${key}: ${n}`).join('; ')}.`, '',
  '- **abstracted:** Assign shared abilities and accept the stated simplifications.',
  '- **baseline:** Keep the existing attack, movement, role, or stat abstraction; add no ability.',
  '- **omit:** Intentionally leave this detail in the source description.',
  '- **defer:** A distinctive mechanic needs a later decision; grant nothing automatically.',
  '- **reaction:** Record a separate future reaction assignment; grant nothing until reactions exist.', '',
];
for (const [title, predicate] of [
  ['Troop registry', e => e.kind === 'registry' && e.definition.system.actionType?.value !== 'reaction'],
  ['Source reactions', e => e.definition.system.actionType?.value === 'reaction'],
  ['Doctrine passives', e => e.kind === 'doctrine' && e.definition.system.actionType?.value !== 'reaction'],
]) {
  lines.push(`## ${title}`, '', '| Source | Disposition | Shared ability | Conversion and omissions |', '|---|---|---|---|');
  for (const source of snapshot.entries.filter(predicate)) {
    const row = review.entries.find(r => r.id === source.id);
    lines.push(`| ${esc(source.definition.name)} (\`${source.id}\`) | ${row.disposition} | ${[...row.abilities, ...row.reactions].map(label).join(' + ') || '—'} | ${esc(row.conversion)} |`);
  }
  lines.push('');
}
lines.push('## Training choices', '', '| Training slug | Family | Prerequisite | Grants |', '|---|---|---|---|');
for (const row of snapshot.training) lines.push(`| \`${row.slug}\` | ${row.family} | ${row.requires ?? '—'} | ${(row.gives ?? []).join(', ') || '—'} |`);
lines.push('', '## Common generated rules', '', review.generatedRules, '', '## Import findings', '', ...review.importFindings.map(t => `- ${t}`), '', '## Evidence', '',
  '[Source snapshot](../../../data/troop-abilities/reignmaker-sources.json) preserves the original definitions, doctrine grants, training ladder, and relevant import code. [Mapping data](../../../data/troop-abilities/reignmaker-mappings.json) pins each interpretation to its source definition hash. These hashes audit the review; they do not select abilities at runtime.', '');
fs.writeFileSync(path.join(root, 'docs/reviews/troop-abilities/reignmaker-mapping.md'), lines.join('\n'));
console.log(JSON.stringify({ abilities: abilities.size, reactionPatterns: reactions.size, reviewedSources: sources.size, trainingEntries: snapshot.training.length, dispositions: counts, missing: 0 }, null, 2));

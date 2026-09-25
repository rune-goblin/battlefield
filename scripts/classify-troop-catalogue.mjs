#!/usr/bin/env node
// Generate a reviewable design classification from the saved, audited source inventory.
// This is not a runtime recognizer and never changes playable cards or actor documents.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.join(root, 'data/troop-abilities');
const read = name => JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8'));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const source = read('sources.json');
const reviews = read('reviews.json');
const catalogue = read('catalogue.json');
const policy = read('classification-policy.json');
const abilities = new Map(catalogue.abilities.map(a => [a.id, a]));
const reactions = new Map(catalogue.reactionPatterns.map(a => [a.id, a]));
const reviewById = new Map(reviews.abilities.map(r => [r.id, r]));
const familyRules = new Map();
const reactionRules = new Map();
const knownFamilies = new Set(reviews.abilities.map(r => r.family));
const addRules = (rules, map) => {
  for (const rule of rules) for (const family of rule.families) {
    if (!knownFamilies.has(family) || map.has(family)) throw new Error(`Unknown or duplicate policy family: ${family}`);
    for (const id of rule.abilities ?? []) if (!abilities.has(id)) throw new Error(`Unknown template: ${id}`);
    if (rule.pattern && !reactions.has(rule.pattern)) throw new Error(`Unknown reaction: ${rule.pattern}`);
    if (rule.requires && !abilities.has(rule.requires)) throw new Error(`Unknown prerequisite: ${rule.requires}`);
    map.set(family, rule);
  }
};
addRules(policy.rules, familyRules);
addRules(policy.reactionRules, reactionRules);
if (reviewById.size !== reviews.abilities.length) throw new Error('Duplicate source reviews');

const baseline = new Set(policy.baselineFamilies);
const omitted = new Set(policy.omittedFamilies);
for (const family of [...baseline, ...omitted]) {
  if (!knownFamilies.has(family) || familyRules.has(family)) throw new Error(`Invalid baseline/omission policy: ${family}`);
}
const seen = new Set();
const explicitReactions = new Set();
const troops = source.troops.map(troop => {
  const features = troop.items.filter(i => ['action', 'melee'].includes(i.source.type)).map(item => {
    const review = reviewById.get(item.id);
    if (!review || review.sourceHash !== item.sourceHash || hash(item.source) !== item.sourceHash) throw new Error(`Missing or changed evidence: ${item.id}`);
    if (seen.has(item.id)) throw new Error(`Duplicate source item: ${item.id}`);
    seen.add(item.id);
    const economy = item.source.system?.actionType?.value ?? item.source.type;
    const result = {
      sourceId: item.id, sourceHash: item.sourceHash, name: item.source.name,
      family: review.family, sourceEconomy: economy,
      sourceActions: item.source.system?.actions?.value ?? null,
      sourceText: item.text, disposition: '', abilities: [], reaction: null,
      conversion: '', priority: 0, decision: null,
    };
    if (economy === 'reaction') {
      explicitReactions.add(item.id);
      const rule = review.disposition === 'source-question' ? null : reactionRules.get(review.family);
      result.disposition = rule ? 'future-reaction' : 'reaction-decision';
      result.reaction = rule?.pattern ?? null;
      result.conversion = rule?.conversion ?? 'Keep this reaction separate. The seven proposed patterns do not yet preserve its trigger, effect, or prerequisite; choose a deliberate abstraction in the reaction activity.';
      result.decision = rule ? null : review.proposal;
      return result;
    }
    if (review.disposition === 'source-question') {
      result.disposition = 'source-decision';
      result.conversion = 'Resolve the source ambiguity before granting a new ability.';
      result.decision = review.proposal;
      return result;
    }
    let rule = familyRules.get(review.family);
    // The source audit groups several conditional save bonuses together. Only the
    // positive fear/Intimidation cases justify Resolve; other predicates remain distinct.
    if (review.family === 'conditional-saves' && /fear|intimidation/i.test(item.text + ' ' + item.source.name)
        && !/[−–-]\s*\d/.test(item.source.name)) {
      rule = { abilities: ['resolve'], priority: 70,
        conversion: 'Resolve in fear-resistance mode. Replace this positive fear/Intimidation-only source bonus with the common +2 and deduplicate prepared statistics.' };
    }
    if (rule) {
      result.disposition = rule.decision ? 'candidate-with-decision' : 'candidate';
      result.abilities = rule.abilities;
      result.priority = rule.priority;
      result.conversion = rule.conversion;
      result.decision = rule.decision ?? null;
      if (rule.requires) result.requires = rule.requires;
    } else if (baseline.has(review.family) || review.disposition === 'baseline') {
      result.disposition = 'baseline';
      result.conversion = 'Retain the normal game attack, movement, caster, role, or stat abstraction. Add no catalogue ability for this feature; source profile costs and damage types remain evidence.';
    } else if (omitted.has(review.family) || review.disposition === 'reference') {
      result.disposition = 'omit';
      result.conversion = 'Intentionally omit this additional mechanic from the first ability set. Preserve the source text; no later implementation is promised.';
    } else {
      result.disposition = 'catalogue-decision';
      result.conversion = 'No assignment in the shared catalogue. Decide whether to omit this mechanic or add a shared abstraction; grant no substitute benefit automatically.';
      result.decision = review.proposal;
    }
    // Source text can contain reactions in passive/free/paid items. A mention alone
    // is an inspection flag, never a new reaction grant or a passive effect.
    if (/\breaction\b/i.test(item.text)) result.embeddedReactionReview = true;
    return result;
  });
  const candidates = new Map();
  for (const feature of features) for (const id of feature.abilities) {
    let candidate = candidates.get(id);
    if (!candidate) {
      candidate = { ability: id, priority: feature.priority, sourceFeatures: [], needsDecision: false };
      candidates.set(id, candidate);
    }
    candidate.priority = Math.max(candidate.priority, feature.priority);
    candidate.sourceFeatures.push(feature.sourceId);
  }
  // A helper is not independently assignable when its granted activity is absent.
  for (const feature of features.filter(f => f.requires)) {
    if (!candidates.has(feature.requires)) {
      feature.decision = `Requires an independently granted ${abilities.get(feature.requires).name} activity.`;
      feature.disposition = 'candidate-with-decision';
    }
  }
  // One unresolved delivery must not suppress another fully classified delivery of
  // the same template. Keep each unresolved source clause visible in the detail rows.
  for (const candidate of candidates.values()) {
    candidate.eligibleSourceFeatures = candidate.sourceFeatures.filter(id => !features.find(f => f.sourceId === id).decision);
    candidate.needsDecision = candidate.eligibleSourceFeatures.length === 0;
  }
  const ordered = [...candidates.values()].sort((a, b) => Number(a.needsDecision) - Number(b.needsDecision)
    || b.priority - a.priority || a.ability.localeCompare(b.ability));
  const proposed = ordered.filter(a => !a.needsDecision).slice(0, 3);
  const proposedIds = new Set(proposed.map(a => a.ability));
  const alternatives = ordered.filter(a => !proposedIds.has(a.ability));
  const decisions = features.filter(f => f.decision).map(f => f.sourceId);
  return {
    sourceId: troop.id, sourceHash: troop.sourceHash, name: troop.name, selected: troop.selected,
    level: troop.system.details.level.value,
    sourceHealthDetails: troop.system.attributes?.hp?.details ?? '',
    classification: proposed.length ? 'proposed-abilities' : decisions.some(id => features.find(f => f.sourceId === id).sourceEconomy !== 'reaction')
      ? 'no-assignment-pending-decision' : 'baseline-only',
    proposed, alternatives,
    reactions: features.filter(f => f.sourceEconomy === 'reaction').map(f => f.sourceId),
    embeddedReactionReviews: features.filter(f => f.embeddedReactionReview).map(f => f.sourceId),
    decisions, features,
  };
});
if (seen.size !== reviews.abilities.length || reviews.abilities.some(r => !seen.has(r.id))) throw new Error('Stale or missing source classification');
for (const example of read('catalogue-examples.json').examples) {
  const feature = troops.flatMap(t => t.features).find(f => f.sourceId === example.sourceId);
  if (!feature || feature.sourceHash !== example.sourceHash || !feature.abilities.includes(example.ability)) throw new Error(`Catalogue example lost: ${example.sourceId}`);
}
for (const troop of troops) {
  if (new Set(troop.proposed.map(a => a.ability)).size !== troop.proposed.length) throw new Error(`Duplicate grant: ${troop.name}`);
  for (const a of [...troop.proposed, ...troop.alternatives]) for (const id of a.sourceFeatures) {
    const f = troop.features.find(f => f.sourceId === id);
    if (!f || !f.abilities.includes(a.ability) || explicitReactions.has(id)) throw new Error(`Invalid ordinary assignment: ${troop.name}/${id}`);
  }
}
const selected = troops.filter(t => t.selected);
if (new Set(selected.map(t => t.name)).size !== selected.length) throw new Error('Duplicate selected troop names');
const tally = rows => Object.fromEntries([...Map.groupBy(rows, x => x)].map(([k, vs]) => [k, vs.length]).sort(([a], [b]) => a.localeCompare(b)));
const counts = {
  selectedTroops: selected.length, sourceAlternatives: troops.length - selected.length,
  classifiedSourceFeatures: seen.size,
  selectedClassifications: tally(selected.map(t => t.classification)),
  selectedProposedAbilities: { ...Object.fromEntries([...abilities.keys()].map(id => [id, 0])), ...tally(selected.flatMap(t => t.proposed.map(a => a.ability))) },
  selectedDispositions: tally(selected.flatMap(t => t.features.map(f => f.disposition))),
  selectedReactionFeatures: selected.reduce((n, t) => n + t.reactions.length, 0),
  selectedTroopsWithDecisions: selected.filter(t => t.decisions.length).length,
};
const output = {
  version: 1, reviewed: '2026-09-24', status: 'Design classification; no runtime assignments enabled.',
  inputs: { sourceHash: hash(source), reviewHash: hash(reviews), catalogueHash: hash(catalogue), policyHash: hash(policy) },
  scope: 'All selected library troops and saved source alternatives. Source identities audit the examples; they are not runtime recognition rules.',
  counts, troops,
};
fs.writeFileSync(path.join(folder, 'troop-classifications.json'), JSON.stringify(output, null, 2) + '\n');

const esc = text => String(text).replaceAll('|', '\\|').replaceAll('\n', ' ');
const anchor = name => name.toLowerCase().replace(/[^a-z0-9 -]/g, '').replaceAll(' ', '-');
const names = assignments => assignments.map(a => abilities.get(a.ability).name).join(', ') || '—';
const reactionNames = troop => [...new Set(troop.features.filter(f => f.reaction).map(f => reactions.get(f.reaction).name))].join(', ') || '—';
const lines = [
  '# Troop catalogue classification', '',
  `Design review, ${output.reviewed}. Classify the existing library now; classify new or mechanically changed abilities during import. Store accepted assignments on the imported card and revalidate automatic matches when mechanics change. A label-only rename keeps its assignment.`, '',
  `This first pass covers **${selected.length} selected troops**, **${troops.length - selected.length} source alternatives**, and all **${seen.size} reviewed source features**. It uses the [${abilities.size}-ability catalogue](catalogue.md). ReignMaker is supplementary evidence; these classifications use the complete saved creature inventory.`, '',
  '**These are proposed selections, not enabled runtime effects.** The list favors up to three defining templates per troop and keeps further candidates visible. Priorities are editorial defaults, not a balance score. A missing assignment is an explicit baseline or decision, never an inferred generic bonus.', '',
  '**Duplicate source features do not grant duplicate uses.** The detail tables preserve several deliveries of one template so a reviewer can select the clearest expression. Before runtime import, choose or explicitly combine those deliveries, bind local attack references, resolve prerequisites, and validate timing and parameters. Classification does not assert that every row is ready to execute.', '',
  'Source action costs, descriptions, prerequisites, and reaction economy remain in the [classification data](../../../data/troop-abilities/troop-classifications.json). Earlier inventory proposals are historical evidence; the present conversion notes describe the smaller abstraction. Embedded spell lists remain a separate spell-catalogue task.', '',
  '## Coverage', '', '| Classification | Selected troops |', '|---|---:|',
  ...Object.entries(counts.selectedClassifications).map(([k, n]) => `| ${k} | ${n} |`), '',
  `${counts.selectedTroopsWithDecisions} selected troops retain at least one source, catalogue, prerequisite, or reaction decision. These decisions can coexist with useful proposed abilities. All ${counts.selectedReactionFeatures} explicit source reactions stay separate; only reactions that fit the seven proposed patterns receive a pattern.`, '',
  'Some catalogue abilities can come from training rather than these particular actors. Siege Crew has no proposed recipient in this saved creature snapshot; its ReignMaker training mappings remain available for future imports. An unassigned template does not require an invented creature match.', '',
  '## Selected library', '',
  '| Troop | Proposed abilities | Further candidates | Future reaction patterns | Decisions |', '|---|---|---|---|---:|',
];
for (const t of selected) lines.push(`| [${esc(t.name)}](#${anchor(t.name)}) | ${names(t.proposed)} | ${names(t.alternatives)} | ${reactionNames(t)} | ${t.decisions.length} |`);
lines.push('', '## Import policy', '',
  '1. Ship reviewed built-in examples with the library so existing troops have a visible, consistent starting classification.',
  '2. On import, read an explicit portable assignment first. Otherwise recognize supported mechanical patterns from the current ability content; source names and IDs only narrow candidates.',
  '3. Save the selected template, parameters, local attack attachment, flavor label, source evidence, and explicit omissions. Persist manual overrides separately from automatic classifications.',
  '4. Reuse an accepted classification when the mechanical signature and template version still agree. A mechanical edit triggers revalidation; a creature or ability rename does not remove it.',
  '5. Show unknown mechanics as a review choice: select a template, intentionally omit the detail, or defer it. Battle resolution consumes validated assignments and never interprets source prose.', '',
  'The [classification policy](../../../data/troop-abilities/classification-policy.json) operates on human audit families in the saved review. It is a reproducible editorial tool, not the production importer or a prose classifier. Its family labels do not yet exist on newly imported actors.', '',
  '## Source alternatives', '', '| Source alternative | Proposed abilities | Further candidates |', '|---|---|---|');
for (const t of troops.filter(t => !t.selected)) lines.push(`| ${esc(t.name)} | ${names(t.proposed)} | ${names(t.alternatives)} |`);
lines.push('', '## Per-troop decisions', '');
for (const t of selected) {
  lines.push(`### ${t.name}`, '', `[Original inventory](inventory.md#${anchor(t.name)}). Level ${t.level}. Proposed: **${names(t.proposed)}**.`, '');
  const special = t.features.filter(f => !['baseline', 'omit'].includes(f.disposition));
  if (special.length) {
    lines.push('| Source feature | Classification | Conversion or decision |', '|---|---|---|');
    for (const f of special) {
      const mapped = f.abilities.map(id => abilities.get(id).name).join(' + ') || (f.reaction ? reactions.get(f.reaction).name : '—');
      lines.push(`| ${esc(f.name)} (${f.sourceEconomy}) | ${mapped}; ${f.disposition} | ${esc(f.conversion)}${f.decision ? ` **Decision:** ${esc(f.decision)}` : ''} |`);
    }
    lines.push('');
  } else lines.push('Its ordinary profile or intentionally omitted details supply the first-pass classification; no extra ability is proposed.', '');
  const omittedFeatures = t.features.filter(f => f.disposition === 'omit');
  if (omittedFeatures.length) lines.push(`Intentional omissions: ${omittedFeatures.map(f => esc(f.name)).join('; ')}.`, '');
  if (t.embeddedReactionReviews.length) lines.push(`Embedded reaction text requires separate inspection: ${t.features.filter(f => f.embeddedReactionReview).map(f => esc(f.name)).join('; ')}. A mention of reactions alone grants nothing.`, '');
}
lines.push('Regenerate and validate with `node scripts/classify-troop-catalogue.mjs`. This checks source hashes, full review coverage, catalogue references, duplicate grants, and reaction separation. It changes design artifacts only.', '');
fs.writeFileSync(path.join(root, 'docs/reviews/troop-abilities/troop-classification.md'), lines.join('\n'));
console.log(JSON.stringify(counts, null, 2));

// Compile reviewed source examples into content-matching import patterns. No actor-name lookup.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
const read = name => JSON.parse(fs.readFileSync(new URL(`../data/troop-abilities/${name}`, import.meta.url), 'utf8'));
const sources = read('sources.json');
const classification = read('troop-classifications.json');
const reign = read('reignmaker-sources.json');
const reignMap = read('reignmaker-mappings.json');
const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error', optimizeDeps: { noDiscovery: true } });
const { abilitySignature } = await vite.ssrLoadModule('/src/adapters/pf2e/ability-signature.ts');
const { validAbility } = await vite.ssrLoadModule('/src/engine/abilities.ts');
const patterns = new Map();
const digest = text => createHash('sha256').update(text).digest('hex');
const familyRange = /volley|barrage|fusillade|push-hit|wind-displacement|burning-splash|clumsy-hit|trip-hit/;
function config(kind, feature, item, family = feature.family) {
  const text = feature.sourceText ?? item.system?.description?.value ?? '';
  const name = item.name ?? '';
  const a = { version: 1, key: 'pattern', kind, label: name, delivery: 'passive' };
  const ownAttack = feature.sourceEconomy === 'action' && /@Damage\[|\bdamage\b/i.test(text);
  const attack = familyRange.test(family) ? 'volley' : 'melee';
  const critical = /critical/.test(family) || ['critical-grab', 'critical-weakening', 'trip-critical'].includes(family);
  switch (kind) {
    case 'recovery': Object.assign(a, { delivery: family === 'condition-recovery' ? 'start' : 'activity', mode: family === 'condition-recovery' ? 'condition' : 'health', recipient: 'ally', cost: 2 }); if (a.delivery === 'start') a.once = 'battle'; break;
    case 'temporary-protection': Object.assign(a, { delivery: 'attack', attack: 'melee', trigger: 'use', recipient: 'self' }); break;
    case 'regeneration': {
      a.delivery = 'start';
      const detail = `${name} ${text}`.toLowerCase();
      a.environment = /underground/.test(detail) ? 'underground' : /underwater/.test(detail) ? 'water' : /plants|trees|refuse|filth/.test(detail) ? 'woods' : /touching fire/.test(detail) ? 'fire' : /touching metal/.test(detail) ? 'metal' : /open air/.test(detail) ? 'air' : 'always';
      if (/filth|refuse/.test(detail)) return { problem: 'Regeneration requires refuse terrain; choose an explicit environmental assignment.' };
      const suppress = /deactivated by ([^)]+)/i.exec(name)?.[1];
      if (suppress) a.suppressors = suppress.toLowerCase().split(/\s+(?:or|and)\s+|,\s*/).map(t => t.trim());
      break;
    }
    case 'persistent-injury': Object.assign(a, { delivery: 'attack', attack, trigger: critical ? 'critical' : 'hit', damageTag: /fire|burning/.test(family + text.toLowerCase()) ? 'fire' : /poison|venom/.test(family) ? 'poison' : /acid/i.test(name) ? 'acid' : 'bleed' }); break;
    case 'fear':
      if (['fear-presence', 'despair-aura', 'croaking-aura'].includes(family)) a.delivery = 'aura';
      else if (['frightening-hit', 'terrifying-volley', 'fear-rider-save'].includes(family)) Object.assign(a, { delivery: 'attack', attack, trigger: family === 'fear-rider-save' ? 'damage' : 'hit', willSave: family === 'fear-rider-save' });
      else Object.assign(a, { delivery: 'activity', cost: 1, willSave: true });
      break;
    case 'expose':
      if (['feint', 'dirty-trick', 'advance-feint'].includes(family)) Object.assign(a, { delivery: 'activity', cost: 1 });
      else Object.assign(a, { delivery: 'attack', attack, trigger: critical || ['wind-displacement', 'bleed-and-trip', 'thundering-move'].includes(family) ? 'critical' : 'hit', requiresCharge: /charge|thundering/.test(family), requiresGuard: family === 'phalanx-charge' });
      break;
    case 'suppression': Object.assign(a, family === 'covering-fire' ? { delivery: 'activity', cost: 2 } : { delivery: 'attack', attack: family === 'casting-rider' ? 'spell' : 'melee', trigger: 'critical' }); break;
    case 'snare': Object.assign(a, /volley|net|slime/.test(family) ? { delivery: 'activity', cost: 2 } : { delivery: 'attack', attack: 'melee', trigger: 'critical' }); break;
    case 'displace': Object.assign(a, { delivery: 'attack', attack: 'volley', trigger: 'hit', direction: 'push' }); break;
    case 'guard':
      if (family === 'defensive-attack') Object.assign(a, { delivery: 'attack', attack: 'melee', trigger: 'use' });
      else if (/shared|ally|living-shields|designated/.test(family)) Object.assign(a, { delivery: 'activity', recipient: 'ally', cost: 1 });
      break;
    case 'resolve': a.mode = family === 'hold-ground' ? 'ground' : 'fear'; break;
    case 'charge': if (family === 'limited-charge' || /once per (?:encounter|battle)|once per 10 minutes/i.test(text)) a.once = 'battle'; break;
    case 'terrain-passage': a.terrain = /forest/.test(family) ? ['forest'] : /swamp|specialist/.test(family) ? ['swamp', 'shallows', 'water'] : /urban/.test(family) ? ['settlement'] : ['forest', 'rough', 'swamp', 'settlement']; if (family === 'ice-movement') return { problem: 'Terrain Passage requires snow/ice terrain tags; retain this as an assignment choice.' }; break;
    case 'opening-move': Object.assign(a, { delivery: 'activity', first: family === 'opening-attack' }); if (family === 'swamp-ambush') a.terrain = ['swamp', 'shallows', 'water']; break;
    case 'advantage': {
      a.stat = /defence|protective-aura/.test(family) ? 'defence' : /ambush/.test(family) ? 'initiative' : family === 'fear-expertise' ? 'menace' : family === 'sonic-casting' ? 'spell' : family === 'undead-salvo' ? 'volley' : 'melee';
      a.predicate = /bleeding-prey/.test(family) ? 'bleeding' : /prone-prey|sneak/.test(family) ? 'exposed' : /mounted/.test(family) ? 'unmounted' : family === 'flight-defence' ? 'nonflying' : /unholy|protective-aura/.test(family) ? 'unholy' : /undead/.test(family) ? 'undead' : /giant/.test(family) ? 'giant' : /pack-flanking/.test(family) ? 'outflanked' : /held-target/.test(family) ? 'snared' : /cruelty/.test(family) ? 'controlled' : family === 'marked-quarry' ? 'quarry' : 'always';
      if (family === 'ranged-defence') a.predicate = 'ranged';
      if (family === 'protective-aura') a.delivery = 'aura';
      if (family === 'terrain-prey' || family === 'sonic-casting' || family === 'prepared-ambush') return { problem: 'Combat Bonus requires a source-specific terrain, spell, or preparation predicate; choose it explicitly.' };
      break;
    }
    case 'siege-crew': break;
  }
  // Charge conversions deliberately move the source's movement activity onto the game's
  // Charge. Their riders bind to that activity, rather than an alternative weapon profile.
  return { ability: a, ownAttack: ownAttack && a.delivery === 'attack' && !a.requiresCharge };
}
function record(item, entries, problem, priority = 70) {
  for (const localized of [false, true]) {
    const copy = structuredClone(item);
    if (localized && copy.system?.description?.value) copy.system.description.value = copy.system.description.value.replace(/@Localize\[([^\]]+)\]/g, (all, key) => sources.localizations[key] ?? all);
    const signature = abilitySignature(copy);
    let pattern = patterns.get(signature);
    if (!pattern) patterns.set(signature, pattern = { signature, abilities: [], problems: [], priority });
    pattern.priority = Math.max(pattern.priority, priority);
    if (problem && !pattern.problems.includes(problem)) pattern.problems.push(problem);
    for (const entry of entries) {
      // Family overrides can change delivery. Emit only parameters that delivery executes.
      if (entry.ability.delivery !== 'attack') for (const key of ['attack', 'trigger', 'requiresCharge', 'requiresGuard']) delete entry.ability[key];
      if (entry.ability.delivery !== 'activity') delete entry.ability.cost;
      const cfg = { ...entry.ability, label: '', key: '' };
      const identity = JSON.stringify([cfg, entry.ownAttack]);
      if (!pattern.abilities.some(e => e.identity === identity)) pattern.abilities.push({ ...entry, identity });
    }
  }
}
for (const troop of classification.troops) {
  const actor = sources.troops.find(t => t.id === troop.sourceId);
  for (const feature of troop.features) {
    const item = actor.items.find(i => i.id === feature.sourceId).source;
    const entries = [];
    if (feature.sourceEconomy === 'reaction') { record(item, [], 'Reaction retained for the separate reaction system.'); continue; }
    if (feature.disposition.startsWith('candidate') && !feature.decision) {
      for (const kind of feature.abilities) {
        const result = config(kind, feature, item);
        if (result.ability) entries.push(result); else record(item, [], result.problem);
        if (kind === 'suppression' && feature.family === 'critical-weakening') entries.push({ ability: { ...result.ability, attack: 'volley' }, ownAttack: false });
      }
    }
    const problem = feature.decision ? feature.conversion + ' ' + feature.decision : undefined;
    record(item, entries, problem, feature.priority);
  }
}
// ReignMaker tactic names select reviewed build-time examples only. Runtime lookup verifies
// the whole current description/economy/traits/rules signature and never dispatches by slug.
const families = {
 'battlefield-medicine':'medicine', 'combat-medics':'medicine', 'cavalry-charge':'charge', 'covering-fire':'covering-fire',
 'defend-allies':'shared-guard', 'demoralize':'fear-activity', 'dirty-fighting':'frightening-hit', 'feint':'feint',
 'raise-shields':'guard', 'ambush':'opening-attack', 'battlefield-adaptability':'adaptive-stance',
 'forest-passage':'forest-movement','form-a-phalanx':'guard','frightening-foe':'fear-expertise','hold-the-line':'fear-discipline',
 'no-retreat':'hold-ground','no-retreat-elite':'hold-ground','opening-salvo':'opening-attack','overrun':'mounted-impact',
 'shield-discipline':'guard','shield-wall':'guard','sure-stride':'terrain-movement','swift-recovery':'condition-recovery',
 'thunder-of-hooves':'thundering-move','trample':'trample','unpredictable-movement':'ranged-defence','amphibious':'terrain-specialist',
 'brave':'fear-resistance','brutal-assault':'fear-rider-save','burning-weaponry':'burning-critical','chorus-of-croaks':'croaking-aura',
 'furious-charge':'limited-charge','hurl-nets':'net-volley','rise-from-the-swamp':'swamp-ambush','supernatural-attacks':'critical-weakening',
 'water-stride':'swamp-movement','wyvern-venom':'wyvern-poison','city-passage':'urban-movement','dagger-defense':'defensive-attack',
 'drilled-in-formations':'formation-choice','first-class-charge':'charge','harry-prey':'hunting-trip','lance-charge':'lance-charge',
 'pack-hunt':'prone-prey','phalanx-charge':'phalanx-charge','seek-quarry':'marked-quarry','trailblazing-stride':'terrain-movement',
};
for (const source of reign.entries) {
  const mapping = reignMap.entries.find(m => m.id === source.id);
  const entries = [];
  if (mapping.disposition !== 'abstracted') { record(source.definition, [], ['defer','reaction'].includes(mapping.disposition) ? mapping.conversion : undefined); continue; }
  const family = families[source.id] ?? '';
  for (const kind of mapping.abilities) {
    // The review presents alternatives; the default import chooses the defensive stance.
    if (source.id === 'battlefield-adaptability' && kind !== 'guard') continue;
    const result = config(kind, { family, sourceEconomy: source.definition.system.actionType.value }, source.definition);
    const a = result.ability;
    if (!a) { record(source.definition, [], result.problem); continue; }
    if (['commanding-presence','stay-in-the-fight'].includes(source.id)) Object.assign(a, { delivery: source.id === 'commanding-presence' ? 'aura' : 'activity', recipient: 'ally', cost: 2 });
    if (['inspiring-banner','idealist-inspiring-aura'].includes(source.id)) Object.assign(a, { delivery: 'aura', mode: 'fear' });
    if (source.id === 'ruthless-despair') a.delivery = 'aura';
    if (source.id === 'practical-rally') Object.assign(a, { delivery: 'activity', recipient: 'ally', cost: 1 });
    if (source.id === 'ruthless-no-quarter') Object.assign(a, { delivery: 'aura', stat: 'melee', predicate: 'always' });
    if (source.id === 'idealist-aura-of-righteousness') Object.assign(a, { delivery: 'aura', stat: 'melee', predicate: 'unholy' });
    if (source.id === 'bloodied-but-unbroken') Object.assign(a, { stat: 'defence', predicate: 'wounded' });
    if (source.id === 'keen-eyed') a.stat = 'initiative';
    if (['keep-up-the-pressure','keep-up-with-me'].includes(source.id)) { record(source.definition, [], mapping.conversion + ' Requires explicit assignment.'); continue; }
    entries.push(result);
    if (source.id === 'supernatural-attacks' || source.id === 'ruthless-no-quarter') entries.push({
      ability: { ...a, ...(source.id === 'supernatural-attacks' ? { attack: 'volley' } : { stat: 'volley' }) }, ownAttack: false,
    });
  }
  record(source.definition, entries, mapping.reactions.length ? 'The reaction component remains deferred.' : undefined);
}
const result = [...patterns.values()].map(p => ({ ...p, abilities: p.abilities.map(({ identity, ...e }) => {
  e.ability.key = `${e.ability.kind}-${digest(p.signature + identity).slice(0,16)}`;
  if (!validAbility(e.ability)) throw new Error(`Invalid compiled ability ${JSON.stringify(e.ability)}`);
  return e;
}) }));
fs.writeFileSync(new URL('../src/adapters/pf2e/ability-patterns.json', import.meta.url), JSON.stringify(result) + '\n');
await vite.close();
console.log(`${result.length} mechanical patterns; ${result.filter(p => p.abilities.length).length} grant shared abilities.`);

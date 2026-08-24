// Reads official PF2e troop actors from a local PF2e system source checkout and emits stat cards.
// Usage: PF2E_SOURCE=/path/to/pf2e/packs/pf2e node scripts/import-official.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.env.PF2E_SOURCE ?? join(import.meta.dirname, '../../pf2e-reignmaker/_pf2e-source/packs/pf2e');

const SELECTION = [
  ['pfs-season-5-bestiary/quests/mercenary-squad', 'infantry'],
  ['pathfinder-npc-core/military/conscript-squad', 'infantry'],
  ['battlecry-bestiary/goblin-rabble', 'infantry'],
  ['battlecry-bestiary/mitflit-vermin-cavalry', 'cavalry'],
  ['pathfinder-monster-core-2/shambler-troop', 'infantry'],
  ['pathfinder-npc-core/official/city-guard-squadron', 'infantry'],
  ['battlecry-bestiary/orc-raiding-party', 'infantry'],
  ['pathfinder-monster-core-2/velociraptor-pack', 'infantry'],
  ['battlecry-bestiary/apprentice-magician-clique', 'infantry'],
  ['pathfinder-npc-core/military/phalanx-formation', 'infantry'],
  ['pathfinder-npc-core/ancestry-npcs/hobgoblin/hobgoblin-battalion', 'infantry'],
  ['battlecry-bestiary/qadiran-camel-corps', 'cavalry'],
  ['battlecry-bestiary/scamp-inferno', 'infantry'],
  ['battlecry-bestiary/gnome-cannon-corps', 'infantry'],
  ['pathfinder-npc-core/criminal/bandit-gang', 'infantry'],
  ['triumph-of-the-tusk-bestiary/book-2-hoof-cinder-and-storm/aurochs-herd', 'infantry'],
  ['pathfinder-npc-core/military/hellknight-cavalry-brigade', 'cavalry'],
  ['pathfinder-npc-core/ancestry-npcs/elf/woodland-scouts', 'infantry'],
  ['battlecry-bestiary/hell-hound-pack', 'infantry'],
  ['pathfinder-monster-core-2/ghostly-mob', 'infantry'],
  ['battlecry-bestiary/hobgoblin-veteran-regiment', 'infantry'],
  ['battlecry-bestiary/gargoyle-wing', 'infantry'],
  ['battlecry-bestiary/wight-battalion', 'infantry'],
  ['battlecry-bestiary/dwarf-longshot-squad', 'infantry'],
  ['battlecry-bestiary/redcap-brigade', 'infantry'],
  ['battlecry-bestiary/viking-guard', 'infantry'],
  ['battlecry-bestiary/clockwork-infantry', 'infantry'],
  ['battlecry-bestiary/archer-regiment', 'infantry'],
  ['battlecry-bestiary/angelic-chorus', 'infantry'],
  ['battlecry-bestiary/first-class-infantry', 'infantry'],
  ['battlecry-bestiary/drake-flight', 'infantry'],
  ['pathfinder-bestiary-3/terra-cotta-garrison', 'infantry'],
  ['battlecry-bestiary/xulgath-dinosaur-cavalry', 'cavalry'],
  ['battlecry-bestiary/monk-cadre', 'infantry'],
  ['prey-for-death-bestiary/einherji-host', 'infantry'],
  ['battlecry-bestiary/archon-bastion', 'infantry'],
  ['prey-for-death-bestiary/valkyrie-tempest', 'infantry'],
  ['battlecry-bestiary/lich-legion', 'infantry'],
  ['hells-destiny-bestiary/angelic-host', 'infantry'],
];

const strip = (html) => (html ?? '').replace(/<[^>]+>/g, ' ');
const dcs = (t) => [...t.matchAll(/@Check\[reflex\|dc:(\d+)/g)].map((m) => Number(m[1]));
const hasTemplate = (t, kinds) => kinds.some((k) => t.includes(`@Template[type:${k}`));
const feet = (t) => Number(/within (\d+) feet/.exec(t)?.[1] ?? NaN);

const cards = SELECTION.map(([path, role]) => {
  const d = JSON.parse(readFileSync(join(root, `${path}.json`), 'utf8'));
  const s = d.system;
  const actions = d.items.filter((it) => it.type === 'action').map((it) => ({ name: it.name, text: strip(it.system.description.value) }));
  const isRanged = (a) => !Number.isNaN(feet(a.text)) || hasTemplate(a.text, ['burst', 'cone', 'line']);
  const melee = actions.filter((a) => dcs(a.text).length && !isRanged(a));
  const ranged = actions.filter((a) => isRanged(a) && !Number.isNaN(feet(a.text)));
  const battleDc = Math.max(...melee.flatMap((a) => dcs(a.text)), ...ranged.flatMap((a) => dcs(a.text)));
  if (!Number.isFinite(battleDc)) throw new Error(`${path}: no DC found`);
  const salvo = ranged.sort((a, b) => feet(b.text) - feet(a.text))[0];
  const salvoDc = salvo ? (dcs(salvo.text)[0] ?? battleDc) : null;
  const ft = salvo ? feet(salvo.text) : NaN;
  const reach = salvo ? (ft <= 60 ? 'close' : ft <= 120 ? 'long' : 'extreme') : null;
  const fly = (s.attributes.speed.otherSpeeds ?? []).some((o) => o.type === 'fly');
  return {
    name: d.name,
    level: s.details.level.value,
    role,
    pace: fly || s.attributes.speed.value >= 30,
    fear: d.items.some((it) => /frightful presence/i.test(it.name)),
    source: d.system.details.publication?.title ?? '',
    overrides: {
      strike: (melee.length ? Math.min(...melee.flatMap((a) => dcs(a.text))) : battleDc) - 10,
      volley: salvoDc === null ? null : salvoDc - 10,
      reach,
      defence: s.attributes.ac.value,
      will: s.saves.will.value,
      perception: s.perception?.mod ?? 0,
    },
  };
}).sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

const body = cards.map((c) => {
  const o = c.overrides;
  const reach = o.reach ? `'${o.reach}'` : 'null';
  return `  { name: ${JSON.stringify(c.name)}, level: ${c.level}, role: '${c.role}', salvo: ${reach}, pace: ${c.pace}, fear: ${c.fear}, tactics: [], overrides: { strike: ${o.strike}, volley: ${o.volley}, reach: ${reach}, defence: ${o.defence}, will: ${o.will}, perception: ${o.perception} } }, // ${c.source}`;
}).join('\n');

writeFileSync(new URL('../src/engine/official.ts', import.meta.url),
`import type { UnitCard } from './cards.js';

// Generated by scripts/import-official.mjs from the Pathfinder Second Edition system source (ORC licence). Numbers only.
export const OFFICIAL: UnitCard[] = [
${body}
];
`);
console.log(`${cards.length} official troops written`);

# Troop ability implementation

The [balance and naming review](balance-review.md) covers all 16 templates, their interactions, and recommended changes. Names and descriptions reflect that review; balance mechanics retain their current playtest values.

The 16 shared abilities now execute through [typed assignments](../../../src/engine/abilities.ts) and [shared effects](../../../src/engine/ability-effects.ts). Built-in cards and live PF2e imports use the same [ability adapter](../../../src/adapters/pf2e/abilities.ts). The [game rules](../../../public/rules.html#troop-abilities) describe current effects and limits. Balance values remain playtest values.

## Import behavior

Sweep is retired from the catalogue and interpreter. Imports and save restoration discard its old assignments. Trampling sources retain Cavalry Charge; cleaving sources add no extra damage.

The saved review covers all 193 library troops. The compiler turns reviewed, unambiguous feature mappings into content patterns. The importer compares description, action economy, cost, traits, rule elements and mechanical qualifiers. It excludes actor names, document IDs and flavor titles. Renaming Lich Legion and Siphoning Grip preserves Damage Absorption. Changing the actual healing mechanic requires review.

Patterns recognize the saved source text and its resolved English glossary text. They deliberately require review for unfamiliar paraphrases and translations. This boundary avoids granting benefits from a familiar name with different mechanics. Explicit portable assignments support homebrew abilities and remain useful when source prose changes.

The default import keeps at most three distinct automatic ability types. Several source items can supply variants of one type, such as critical Suppression on both Melee and Volley. Equivalent benefits merge. A higher-priority defining feature can displace another candidate; the card retains a review note. Explicit assignments take priority and may exceed that default.

An attack rider binds to the selected source attack on that actor. A rider on an alternative profile stays in review. The importer excludes reactions from ordinary attack selection and from shared assignments. It retains unknown mechanics, source ambiguities and reaction dependencies as source ability notes on the unit sheet. Known baseline features remain baseline.

For a prepared Foundry actor, the adapter prepares a temporary clone that removes FlatModifier rules from source items whose replacement abilities were accepted. This prevents a shared bonus from stacking with its original prepared modifier. It never edits the campaign actor.

## Portable assignments

Add an `abilities` array to a `UnitCard`, or store it on a source action/effect item in `flags.battlefield.abilities`. The versioned schema accepts data only. Unknown fields, invalid templates and invalid parameters produce review notes. An empty annotation array deliberately omits the source ability.

```ts
import type { TroopAbility } from './src/engine/abilities.js';

const drainingTouch: TroopAbility = {
  version: 1,
  key: 'draining-touch',
  kind: 'temporary-protection',
  label: 'Althazar’s Embrace',
  delivery: 'attack',
  attack: 'melee',
  trigger: 'use',
  recipient: 'self',
};

// Source item data:
const flags = { battlefield: { abilities: [drainingTouch] } };
```

Use `recovery`, `mode: 'health'`, and `trigger: 'damage'` for a touch that restores real Health after dealing damage. Use `regeneration`, `delivery: 'start'`, and `suppressors: ['fire', 'acid']` for recurring recovery with counters. Those are assignment choices; actor identity supplies neither effect.

Each key identifies one assignment on a unit. Labels can change independently. Optional parameters express the trigger, attack, recipient, cost, condition, terrain, regeneration counter and once-per-battle allowance. `abilityDescription` produces the player text from these same parameters. The current UI presents assignments and their notes; authors set custom assignments through card or source-item data.

## Timing and simplifications

- Heal and Regeneration cap healing at battle-start Health. Heal applies once per recipient per battle; Regeneration attempts a Fortitude save against the unit’s own level DC at most once per round, including failures. Success or critical success restores exactly 1 Health; failure restores nothing. Neither revives a destroyed unit.
- Damage Absorption grants a single buffer per recipient per round, expires at activation start, and absorbs damage after existing caps. For attacks other than Blast, a matching regeneration counter still suppresses recovery when the buffer absorbs its damage.
- Any Blast that causes Health loss suppresses Regeneration at the recipient’s next activation. Area Blasts check each recipient separately. Misses and fully absorbed Blasts leave regeneration available, regardless of source spell damage tags. Repeated hits refresh one interruption. The existing activation counter saves this interruption across resume; source damage counters on other attacks retain their existing timing.
- Attack-use effects precede the attack gate and roll. Hit, critical-hit and Health-damage riders use their separate thresholds. Ordinary maneuver free strikes grant no new riders. Melee riders affect only the chosen target or the attacker.
- Auras use adjacent hexes across open edges and refresh during movement. Hostile aura fear remains separate from campaign Demoralized.
- Resist Fear and Rout / Hold Ground distinguishes fear resistance from holding ground. Legacy No Retreat saves migrate to hold ground and lose their former pursuit behavior. Pursuit remains in the reaction review.
- Paid control volleys replace damage and consume the ordinary attack. They cost two actions and use a two-hex range. Fear and Weaken Defence allow one Will save. Shared Guard protects one chosen adjacent ally while the source guards.
- Terrain Passage changes terrain cost only. It grants neither a movement mode nor passage through an obstacle. Fire, metal and underground Regeneration require an explicit `abilityEnvironment` tag on the map cell; maps without that evidence grant no recovery. The map editor currently exposes no control for those tags.
- Opening Initiative Bonus breaks the opening side-count tie because Battlefield uses side selection rather than initiative rolls. Quarry marks the first enemy in deployment order. These deterministic choices avoid adding separate targeting phases.
- Guard’s basic mode consolidates ordinary Guard. It adds a distinguishing benefit when its assignment supplies an attack-use delivery or ally protection. Battlefield Adaptability chooses the defensive option during automatic import.

Assignments and battle resources serialize with cards and units. Resume preserves temporary protection, healing allowances, counters and once-per-battle use. Existing active battles retain their saved assignments; loading a save never classifies a unit from its name. Re-import a troop to acquire new source mappings.

## Regeneration commands

```sh
node scripts/audit-troop-abilities.mjs
node scripts/audit-reignmaker-abilities.mjs
node scripts/classify-troop-catalogue.mjs
node scripts/compile-troop-ability-patterns.mjs
node scripts/import-troops.mjs
PF2E_SOURCE=/path/to/pf2e/packs/pf2e node scripts/import-official.mjs
npm run check
npm test
npm run build
npm run build:foundry
```

Refresh and review source snapshots before recompiling changed source mechanics. The generated [pattern data](../../../src/adapters/pf2e/ability-patterns.json) derives from those snapshots and retains their original content licensing; publication metadata remains in the evidence files. The source audit establishes review coverage. Runtime tests establish behavior, including renamed actors, changed mechanics, reaction separation, resource persistence, trigger thresholds and damage counters.

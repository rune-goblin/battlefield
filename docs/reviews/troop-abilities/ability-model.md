# Reusable troop abilities

Design revision: 2026-09-23. This proposal enables no runtime behavior. It revises the [import design](README.md#import-design) while retaining the full source inventory as evidence.

The [assignable catalogue](catalogue.md) now supplies the concrete first set: 16 shared abilities and seven separate future reaction patterns. Its selective scope, effect definitions, and timing supersede the exploratory list and illustrative values below. ReignMaker is supplementary evidence; the broader troop review also supplies defining mechanics such as Siphoning Grip and regeneration. Full Pathfinder feature parity is outside this design.

Define a small catalogue of abilities that any troop can carry. Recognize the mechanics of the source ability, instantiate a catalogue definition, and attach it to the troop's local attack or activity. A creature name, actor ID, or original compendium entry is optional provenance. None is a prerequisite for having the ability.

The review's many `family` labels describe source cases. They are not a proposed list of separate engine implementations. Use the records as examples and eventual regression fixtures for a smaller vocabulary.

## Ability composition

Use three layers:

| Layer | Purpose | Example |
|---|---|---|
| Category | Groups abilities for authoring and discovery | Sustain |
| Ability template | Supplies a useful, reusable behavior and allowed options | Temporary protection after an attack |
| Effect instance | Specifies the troop's trigger, recipient, scale, duration, and cost | Gain a temporary buffer when using this melee profile |

An ability consists of **trigger + conditions + effects + economy + limits**. Its display name and description supply flavor. For example, Siphoning Grip, Soul Harvest, and Althazar's Embrace can all instantiate the same temporary-protection template. A compound source ability can combine a hold with persistent damage through the same shared operations.

Categories organize the catalogue. Templates do the useful work. Grouping unrelated custom implementations under a broad category would retain the original maintenance problem.

## Initial catalogue

| Category | Reusable templates | Typical options |
|---|---|---|
| Sustain | Recovery, temporary protection, regeneration | Self/ally; on use, damage, critical hit, or activation; recovery ceiling; suppressing damage type |
| Attrition | Persistent injury, affliction exposure | Bleed/fire/poison; hit threshold; tick and recovery timing; immunity |
| Restraint | Hinder, hold, tether | Movement reduction; escape DC; tether distance; expiry; minimum attack investment |
| Displacement | Push, pull, reposition | Direction; distance; legal destination; attacker follow movement |
| Disruption | Fear, expose, weaken, impair casting, lose actions | Affected statistic/activity; degree; recipient; duration; recovery |
| Protection | Brace, resistance, intercept | Self/ally; damage or attack predicate; damage cap; shield/resource requirement |
| Mobility | Pounce, charge, safe movement, terrain passage | Movement mode; route; terrain; attached attack; action cost |
| Exploitation | Advantage against a condition, terrain, or target trait | Bleeding/prone/hidden; bright light; undead; conditional modifier |
| Influence | Aura, rally, reveal, control zone | Range; recipients; entry/start/end trigger; immunity; maintenance cost |
| Attack shaping | Payload choice, payload replacement, cleave, extended area | Damage tags; target count; friendly fire; profile cost; recharge |

These categories provide an initial authoring vocabulary. Recovery and temporary protection share Sustain while retaining different effect operations. Auras and charges act as reusable ways to deliver effects: an aura can apply fear, and a charge can apply a hold. They do not require a new fear or hold implementation.

Campaign-only rules, social abilities, and unsupported systems keep their review records. Every source ability receives a disposition, but the catalogue need not force every source into an inaccurate approximation.

## Sustain examples

The current sources distinguish actual healing from temporary HP. Preserve that distinction within the shared Sustain category, along with the separate reaction cost.

| Source example | Shared template | Trigger | Economy | Result |
|---|---|---|---|---|
| Siphoning Grip | Temporary protection | Use the attached melee attack | Automatic part of that attack | Temporary buffer, including when the attack misses |
| Revel in Battle | Recovery | Critical result from the attached Battle attack | Reaction | Restore Health within the recovery ceiling |
| Fueled by Spite | Temporary protection | Linked curse removes HP | Automatic | Temporary buffer with a shorter duration |
| Fast Healing | Recovery | Start of activation | Passive | Restore Health if its environmental condition holds |
| Regeneration | Regeneration | Start of activation | Passive | Recover while active, with source suppression and survival rules |
| Medic! | Recovery | Use the healing activity | Paid action | Restore an adjacent target's Health; apply recipient immunity |

The names never select the effect. A homebrew Drain ability that heals after dealing damage uses Recovery with a damage trigger. If it grants temporary HP instead, it uses Temporary protection. Siphoning Grip's own trigger remains action use. A shared category must preserve those differences.

Amounts need one common balance policy per template. The source review's suggested one-Health amounts remain provisional. Preserve raw source values separately so a later scale change updates the template's conversion policy across all creatures.

## Other combinations

| Source example | Composition |
|---|---|
| Burning Weaponry | Critical-hit trigger + persistent fire |
| Jaws and Claws | Hit trigger + persistent bleed |
| Predator's Advantage | Target-is-bleeding condition + attack advantage |
| Call Down the Storm | Volley hit + push away |
| Windstorm | Volley hit + chosen-direction displacement; critical hit also exposes |
| Seize Them | Melee result + hold/restraint, with thresholds that depend on action investment |
| Wyvern Venom | Melee hit + persistent poison + weakness while that poison lasts |
| Sprinkle Pixie Dust | Prepare payload + replace next arrow's damage + chosen control effect and save |

Keep effect relationships explicit. “Weak while poisoned by this ability” needs a reference to that poison instance. It cannot rely on a global “has any condition” check. Reuse the operation while preserving its cause.

## Renamed and copied creatures

Suppose a ReignMaker world creates Althazars and Wizards from a lich troop, generates new actor and item IDs, and keeps Siphoning Grip. The importer reads the ability and identifies these mechanical facts:

- The effect belongs to a melee attack.
- Using it grants temporary HP to the actor.
- The source amount scales with the actions spent.
- The temporary HP lasts one minute.
- The benefit does not require the attack to deal damage.

Those facts instantiate Temporary protection. Renaming the actor to Althazars and Wizards changes its label and provenance. Renaming the ability to Althazar's Embrace changes its label. Both versions retain the same game behavior when their mechanical content or explicit ability annotation remains intact.

If the description instead changes to “restore HP only when this attack deals damage,” its effect and trigger change. Reclassify it as Recovery after damage. The importer must detect that mechanical edit even when the title and original source UUID stay the same.

## Recognition policy

Use the same process for the built-in library and live imports:

1. **Read an explicit ability annotation.** A user or previous import can assign a catalogue template and its settings to the source ability item. Persist this optional annotation when the workflow permits actor writes. Otherwise preserve it in the local imported record and provide an explicit export route. Importing a creature does not silently edit its campaign actor.
2. **Read mechanical structure.** Extract the source action type, traits, rule elements, damage/healing markup, action cost, and description clauses. Look for supported combinations of trigger, recipient, effect, duration, and prerequisite. Resolve referenced abilities within this creature.
3. **Reuse a verified ability signature.** Cache the recognized mechanical facts and template version independently of actor IDs, item IDs, names, images, and presentation markup. Preserve numeric parameters or extract them into validated settings; never erase them merely to force a match.
4. **Use titles and source IDs as hints.** They can narrow candidate templates, but the current mechanical content must agree. A match on “Drain” alone cannot decide between damage, healing, temporary HP, or an affliction.
5. **Expose ambiguity.** Suggest a category/template and the missing settings when a new description lacks a supported pattern. The user can assign the template once. Persist that assignment so later imports and copies that carry the annotation reuse it.

The annotation is a proposed portable format, not an existing ReignMaker feature. It should travel with the ability item when copied. If a copying/export workflow strips custom metadata, mechanical recognition remains the fallback. Verify those workflows during implementation.

An annotation must distinguish an explicit game-rule override from an earlier automatic classification. Respect an explicit override and display it as such. Revalidate an automatic classification when the underlying mechanical signature changes. Two recognizers matching the same source effect must produce one effect instance, rather than duplicate benefits.

Free-form prose cannot guarantee automatic recognition of every paraphrase. Start with supported patterns from the saved inventory. An optional language-model-assisted import can propose a definition, but should pass it through the same schema validation and review policy. Battle resolution consumes the saved definition and never interprets prose during play.

## Evidence and signatures

Keep two separate records:

| Record | Purpose | Rename behavior |
|---|---|---|
| Exact source hash and origin | Audit the original item and reproduce the review | Can change when an item name, image, or ID changes |
| Mechanical signature and template version | Reuse a valid ability conversion | Remains equivalent when only labels or provenance change |

The existing audit's exact hashes remain useful. They check historical evidence coverage. They must not become a prerequisite for runtime ability recognition.

A mechanical signature requires parsing before hashing. A hash of lightly cleaned prose still changes when text is paraphrased and cannot establish semantic equivalence. Retain clauses that the parser did not understand as review obligations. Finding one familiar healing phrase does not prove that the entire ability has been converted.

## Typed representation

Use a closed set of operations and supported templates, with validated parameters. Separate the event from its economy so a reaction can reuse Recovery or Push while consuming the later reaction system's budget.

This illustrative data shape omits balance amounts and supporting type declarations:

```ts
const protectiveAttack = {
  template: 'temporary-protection',
  category: 'sustain',
  attachedTo: { role: 'primary-melee' },
  trigger: 'action-used',
  economy: { kind: 'attached' },
  recipient: 'self',
  effect: { kind: 'temporary-health', scale: 'standard' },
  duration: 'battle',
  stacking: 'refresh',
};

const battleRecovery = {
  template: 'recovery',
  category: 'sustain',
  attachedTo: { role: 'primary-melee' },
  trigger: 'critical-hit',
  economy: { kind: 'reaction', cost: 1 },
  recipient: 'self',
  effect: { kind: 'heal', scale: 'standard', ceiling: 'current-segments' },
};
```

The catalogue owns categories, defaults, limits, and player-facing descriptions. Instances select a template and override only its allowed parameters. Derive category from the template in the actual schema; it appears twice above to make the examples readable. Keep source provenance and flavor labels alongside the instances.

`primary-melee` is a local semantic attachment, independent of source names. A creature with several melee profiles needs an explicit local profile reference and a verified relationship. Resolve source text references during import, then store that attachment. A renamed attack must retain the relation; an unresolved relation remains a review item.

Keep the composition vocabulary bounded. Add an operation when several abilities need a distinct game behavior, or a signature mechanic warrants one. Use existing operations for new combinations. Avoid per-creature callbacks and an unrestricted scripting language inside the data file.

## Validation targets

- Renaming a creature preserves all ability effects.
- Copying a creature and regenerating actor/item IDs preserves recognition from mechanics or portable annotations.
- Renaming an ability preserves recognition when its mechanics remain the same.
- Changing temporary HP to healing changes the effect, even when the original name and UUID remain.
- Adding a hit requirement changes the trigger; removing it restores the on-use benefit.
- One source ability can compose several effects without duplicate damage or resource spending.
- A recognized clause plus an unknown clause yields a partial review, not a claim of full support.
- A reaction retains its cost even when it shares an effect with an automatic ability.
- Ability assignments survive supported export/import, session, and continuation workflows.

Build and balance Temporary protection, Recovery, Persistent injury, Hold, Push/Pull, and conditional Advantage first. Use examples from several unrelated creatures for each template. Extend the catalogue from demonstrated mechanical gaps, and retain the original creature inventory as coverage evidence.

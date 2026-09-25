# Troop ability review

The [balance and naming review](balance-review.md) covers all 16 templates, their interactions, and recommended changes. Names and descriptions reflect that review; balance mechanics retain their current playtest values.

Review date: 2026-09-23. This document preserves the original source findings and broader proposals. The 16 shared abilities now execute in the game; see [implementation and portable assignments](implementation.md). [Current game rules](../../../public/rules.html#troop-abilities) remain authoritative.

**Current design:** the [assignable catalogue](catalogue.md) defines 16 shared abilities that preserve key unit differences. It supersedes this inventory's detailed conversion proposals where they differ. The goal is selective abstraction; the source inventory does not create an obligation to reproduce every Pathfinder mechanic. The [ReignMaker mapping](reignmaker-mapping.md) supplements the broader creature review with 97 registry abilities and six doctrine grants.

The [complete troop classification](troop-classification.md) now applies that catalogue to all 193 selected troops and preserves seven source alternatives. It gives each source feature a disposition, proposes a small selection of defining abilities, and keeps extra candidates, unresolved mechanics, and reactions visible. Classify the known library now and recognize new or changed mechanics during import; these design records enable no runtime effects.

The original imports preserved attack numbers and names but discarded most defining mechanics. The implementation restores selected mechanics through shared assignments while retaining the broader evidence below. Actor identity records provenance and never gates access to an ability. See the [reusable ability model](ability-model.md) for the design and the [implementation guide](implementation.md) for current behavior. Findings and implementation proposals below describe the pre-implementation review.

## Saved inventory

| Artifact | Content |
|---|---|
| [Complete troop classification](troop-classification.md) | Proposed abilities for every library troop, intentional omissions, further candidates, and separate reaction decisions |
| [Assignable catalogue](catalogue.md) | Sixteen shared abilities, source examples, deliberate simplifications, assignment standards, and seven separate future reaction patterns |
| [ReignMaker mapping](reignmaker-mapping.md) | A disposition for every registry and doctrine ability, training grants, generated troop rules, and import findings |
| [Reusable ability model](ability-model.md) | Shared categories, effect templates, and import matching that survives creature renaming and copying |
| [Every troop and its proposed effects](inventory.md) | One section per source actor, including ordinary attacks, special activities, passive riders, and spell lists |
| [Separate reaction inventory](reactions.md) | Each explicit reaction, its source trigger/effect, and its proposed conversion; embedded reaction rules appear separately |
| [Source snapshot](../../../data/troop-abilities/sources.json) | Actor statistics, original item data, action costs and traits, exact descriptions, resolved PF2e glossary text, publication metadata, and hashes |
| [Ability reviews](../../../data/troop-abilities/reviews.json) | An explicit disposition and proposal for every action item, keyed to source actor/item identity and the item's complete source hash |
| [Coverage](../../../data/troop-abilities/coverage.json) | Counts and missing/changed/stale review checks |
| [Audit script](../../../scripts/audit-troop-abilities.mjs) | Refreshes source evidence or renders and verifies the saved review without changing playable cards |

The snapshot contains 38 repository/ReignMaker actors and all 162 troop-trait NPC actors in the local PF2e checkout. Those PF2e actors have 161 distinct names. Six overlap the repository troops, and Rancorous Priesthood has a second publication copy. The current library therefore has **193 distinct troop names**. All **200 source actors** remain available for comparison.

The review covers **1,384 action items**: 590 actions, 726 passives, 6 free actions, and 62 reactions. Of those, 457 entries describe the common Troop Defenses, Troop Movement, and Form Up rules. The current library selection contains 1,343 action items and **59 explicit reactions across 46 troops**. Counts include source alternatives where stated; they do not imply 62 distinct reaction mechanics.

The source snapshot pins PF2e commit `dfeaa4b119e8ee4a6a596915d5a2ed8684bb8a28` and hashes each actor and item. It covers this checkout and the repository data, rather than claiming every troop Paizo has ever published. Embedded spells and equipment remain as evidence. The review covers modifiers to Cast, such as Steady Troop Spellcasting; individual spell conversions remain a separate spell-catalogue task.

The dispositions have specific meanings:

| Disposition | Meaning | Source entries |
|---|---|---:|
| `baseline` | Common troop abstraction or damage profile; no extra automatic rider in that description | 683 |
| `proposed` | Concrete conversion to an attack, activity, trait, or trigger; implementation and balance work remain | 453 |
| `extension` | Concrete direction that requires a larger subsystem, such as concealment, afflictions, ships, or carried targets | 130 |
| `reference` | Campaign, sensory, equipment, or source metadata with no immediate new battle effect | 86 |
| `source-question` | Missing prerequisite, inconsistent description, or unresolved localization; preserve and flag | 32 |

A `baseline` attack can still acquire riders from other entries on the same creature. Goblin Bombardiers' ordinary Battle profile gains Burning Weaponry; Wolf Pack's attack interacts with Harry Prey. The proposal must bind those relationships explicitly.

## Main findings

| Finding | Evidence and consequence |
|---|---|
| Attack riders disappear | `cardFromActor` keeps DC, range, and name; `UnitCard` has no action-effect collection. Both static import scripts emit empty tactics. |
| Names survive without their rules | `TroopSheet.battleName` and `salvoName` become `Unit.attackSources`; they identify the animation/report source but do not execute source riders. |
| Attack selection loses alternatives | `publishedAttacks` keeps one melee DC and one longest ranged attack. It skips once-per-day/hour damage actions and does not retain each profile's cost, cooldown, save type, or payload. |
| Non-damaging volleys disappear | Hurl Nets and Mucus Deluge need ranged targeting but lack ordinary damage. A damage-text filter cannot discover their role. |
| Shared names conceal different mechanics | Angelic Host's Troop Spellcasting improves healing; other troops enlarge spell areas. Cultist Troop's Wild Swing hurts itself; the priesthood version does not. |
| Several signals are inert | The engine reads `no-retreat`; the other imported signal flags carry no effect. `fear` also lacks an active aura implementation. |
| No Retreat has the wrong meaning | Source No Retreat reduces forced movement and substitutes action loss for compelled fleeing. The engine makes it pursue withdrawing enemies. The source pursuit ability is the **No Escape reaction**. |
| Healing needs more source state | Source troops lose maximum HP with segments. The game's four Health levels and ordinary healing do not track that ceiling. Regrowth explicitly restores lost segments; normal healing does not. |
| Reactions require their own system | Existing maneuver free strikes are common maneuver consequences. They do not implement creature-specific reactions, choices, trigger windows, or a reaction budget. |

Code references: [PF2e troop adapter](../../../src/adapters/pf2e/troopCard.ts), [repository troop import](../../../scripts/import-troops.mjs), [published troop import](../../../scripts/import-official.mjs), [card definitions](../../../src/engine/cards.ts), [unit state](../../../src/engine/types.ts), [battle resolution](../../../src/engine/battle.ts).

## Attack and Volley priorities

These examples expose the most useful effect families. The full inventory contains every troop, including troops whose attacks have no special rider.

| Troop | Source ability and distinction | Proposed game effect |
|---|---|---|
| Lich Legion | Siphoning Grip grants 10 temporary HP per action for one minute, independent of damage dealt | Grant a temporary Health buffer on use; refresh rather than stack. Preserve action scaling in source metadata. |
| Berserkers | Revel in Battle heals on a critical Battle result and costs a reaction | Recover Health through a separate reaction, with a source recovery ceiling. |
| Wight Battalion | Hateful Daggers applies Corrupting Spite; curse HP loss fuels temporary HP | Separate curse application, curse ticks, and the temporary buffer trigger. |
| Goblin Bombardiers | Burning Weaponry rides on a critical Battle; Alchemical Grenades supplies persistent elemental damage | Critical Battle burn; selectable grenade Volley payload with a use limit. |
| Deinonychus Pack | Jaws and Claws bleeds; Predator's Advantage targets bleeding prey | A pending bleed wound plus a specific benefit against bleeding targets. |
| Wyvern Flight | Wyvern Venom rides on a failed Battle save without a second save | Pending poison damage and physical weakness while poisoned. |
| Arrester Squadron | Seize Them changes grab/restraint thresholds with action investment | A critical one-action hit holds; a two/three-action hit holds and critical restrains. |
| Sootsoldiers | Incinerating Grasp adds Grabbed at two/three actions | Keep the one-action attack distinct from the grabbing profile. |
| Vicious Levaloch Squad | Barbed Net Barrage restrains; Escape hurts; Merciless Tridents punishes impaired victims | Net, Escape hazard, and a linked attack benefit against eligible conditions. |
| Bog Strider Scouts | Hurl Nets replaces Salvo damage with entanglement | A non-damaging control Volley; Escape ends its effect. |
| Dottari Excruciator Division | Stop Where You Are slows, then immobilizes on a critical failure | Movement penalty on hit; hold on critical hit, with its own Escape DC. |
| Druid Circle | Call Down the Storm pushes on a failed save | One-hex push on a Volley hit, subject to legal space. |
| Blustering Gale | Windstorm chooses push direction and adds knockdown on critical failure | Directional displacement on hit; exposure on critical hit. |
| Archer Regiment | Rain of Arrows trades range/area for damage; Dagger Defense grants AC on use | Selectable Volley profiles and a temporary defensive Attack stance. |
| Woodland Scouts / Skirmishers | Longbow Barrage adds precision while hidden | Ambush Volley benefit gated by actual hidden state. |
| Qadiran Camel Corps | Reflective Arrows improves in bright light | Conditional Volley benefit; keep Dust Storm as a separate activity. |
| Ratfolk Shank Squad | Poisoned Bolts deals immediate poison damage but states no poison affliction | Retain mixed damage tags; do not invent delayed damage. |
| Sinswarm | Two/three-action Sinful Assault invokes Sinful Bite with a separate Will save | Paid attack profile with a linked condition table and per-round sin rotation. |
| Pixie Swarm | Pixie Dust replaces arrow damage with a selected effect | Payload replacement, including nonlethal damage or control; preserve its second save. |
| Gnome Cannon Corps | Arcane Explosion dazzles and leaves illusion terrain; Direct Hit pushes | Two distinct ranged profiles with different effects and prices. |
| Gold Defender Garrison | Light Reflection needs light, has two DCs, burns, and recharges | A light-dependent breath profile, separate from ordinary Volley. |
| Valkyrie Tempest | Tempest of Battle is once per day | Keep a limited signature activity alongside ordinary attacks. |
| Cultist Troop | Wild Swing also damages the troop | Retain a deliberate self-damage tradeoff; quantify the small damage before implementation. |
| Conscript Squad | Indiscriminate Assault also attacks allies | Show friendly-fire recipients before spending actions. |
| Frog Riders / Boggard Dreadknot | Tongues tether without immobilizing | A tether that allows local movement, with an escape boundary. |
| Heavy Cavalry | Thunder of Hooves chooses Trip or Demoralize after movement | One named movement activity with an explicit choice. |

### Lich Legion conversion

Siphoning Grip gives **temporary HP**, not restored HP. The source has 330 maximum HP and gives 10/20/30 temporary HP. In this game, one Health represents roughly a quarter of total HP, so one buffer point already exceeds the source amount. The initial proposal of a one-point buffer deliberately preserves the defensive character at a coarse scale; its frequency and strength require balance checks.

The rule must trigger on action use after legal targeting and payment. It must work when the enemy takes no damage. The buffer absorbs incoming damage before Health, expires after the source minute (the remainder of this six-round battle), never stacks with itself, and never changes campaign HP. Track buffer loss separately from actual Health loss so it cannot trigger an HP-threshold event or heal a destroyed troop.

Keep actual healing, temporary HP, fast healing, regeneration, and rejuvenation as separate effects. They have different timings, limits, and outcome implications. Healing one Health per activation also overstates many small source healing values; the inventory marks those values as proposals, with recovery-ceiling and balance work still required.

## Conversion standards

### Evidence and identity

1. Preserve actor source UUID or pack/path identity, actor ID, item ID, source hash, publication, and original description. Names are labels, not primary keys.
2. Preserve every action, passive, free action, and reaction before selecting default attacks. Preserve unselected source alternatives and record which actor takes precedence.
3. Resolve localization from the matching source version. Keep unresolved keys visible. Keep raw Foundry markup alongside readable evidence, because damage traits and references may carry mechanics absent from plain prose.
4. The historical audit binds each review to its complete item hash. Runtime ability recognition uses a separate mechanical signature and portable ability annotations. Renaming or copying an actor can change IDs and presentation fields without changing its mechanics. Such changes must preserve the ability classification; changed mechanics require validation.
5. Read linked abilities as relationships. Store `attack -> rider -> affliction -> triggered benefit`, rather than searching text for a few condition names at runtime. Bind those relationships within the imported actor to canonical attack roles or explicit local profiles. Preserve actor traits and member size for target predicates.

### Effect timing and scope

| Source statement | Proposed timing |
|---|---|
| Using an action grants a benefit | `on-use`, after payment and legal target selection; independent of a hit |
| A failed basic save receives a rider | `on-hit`, when converting to an attacker roll |
| A critical failed save receives a rider | `on-critical-hit` |
| Taking/dealing HP damage causes an effect | `on-health-lost`, after protection; require positive actual Health loss |
| The target attempts another save | Keep an explicit rider save with its own source DC and save type |
| An action must immediately follow another | A paid follow-up with prior-action and result predicates |
| An effect replaces damage | `replace-payload`; suppress the ordinary damage payload |
| A source HP threshold triggers an effect | `on-threshold-crossed`, at most once per crossed source threshold |
| A passive/free effect has a trigger | Preserve passive/free economy; do not turn it into a reaction automatically |
| A reaction has a trigger | Route to the separate reaction window and budget |

The hit conversion is a game adaptation. A PF2e basic-save success can still take half damage; the current game has no half-Health graze. Preserve original four-degree outcomes and flag riders that apply on a successful save. Barbed Net Barrage, Sinful Bite, and fear auras need explicit degree tables. A blanket inversion of every saving throw would lose these effects.

Retain `on-use`, `on-hit`, and `on-health-lost` as distinct hooks. A shielded hit can still satisfy a source hit trigger, while a trigger that requires damage must wait for the final damage result. The effect record must also distinguish troop targets, allied/enemy targets, structures, member size, source traits, terrain, light, and a previously affected target.

### Economy and scale

- Preserve fixed/variable action cost, minimum action investment, prerequisite actions, recharge, daily uses, target caps, and source duration. Existing universal Strike/Press/Overrun and Fire/Suppress/Pin prices are explicit game adaptations. A future profile must specify whether it replaces those activities or adds a paid follow-up.
- Keep one attack per activation by default. A compound activity such as Closing Volley needs an explicit exception and total cost. A free trigger does not grant a second ordinary attack automatically.
- Preserve original feet and area shapes before converting to hexes. A cone is not a distant burst, a 30-foot emanation is not a ranged Volley, and a larger troop token does not establish member size. Use bounded templates for multi-target profiles and resolve each target once.
- Start persistent damage at one pending wound through the target's next activation, matching the existing engine primitive. This compresses PF2e recovery checks and repeat ticks; record the difference. Track damage kind, cause, and expiry so blood, poison, and burning interactions remain distinct. Reapplication refreshes rather than adds unlimited pending wounds.
- Use one-hex displacement and the existing legal-space checks as the initial scale. Pulling or pushing does not automatically move the attacker. Tether, grab, restraint, and movement reduction require distinct records; `rooted` and a shooter's `pinnedBy` do not express all of them.
- Preserve conditional modifiers when the source's character is numeric. Keep their exact predicates and bonus types. Several attack-damage bonuses use a proposed +2 attack benefit in the inventory; that substitutes reliability for damage and requires matchup testing before adoption.
- Temporary fear does not automatically remove permanent Morale. Sickness, weakness, and casting impairment also need their own cause and duration. Reusing broad suppression for every condition would repeat the current loss of character.
- Preserve source segment thresholds and a healing ceiling before implementing regeneration and threshold effects. A four-Health unit has three injury steps while most PF2e troops have two segment-loss thresholds. Define that mapping explicitly; never assume one wound equals one segment.
- An effect that normally disables one individual does not automatically disable an entire troop. The later target policy must preserve or deliberately abstract Troop Defenses, member size, and incapacitation limits. Single-creature inheritance is flagged where its named Strike is absent.
- Resistances, weaknesses, physical materials, void/vitality interactions, and nonlethal outcomes need typed damage/target metadata. Preserve it now; do not invent an extra wound for every elemental word.

### Effect lifecycle

Every transient effect needs an owner, source ability, source actor, target, event that starts it, expiry event, stacking policy, and cleanup rule. Store once-per-target immunity and once-per-battle/daily uses separately from visual status flags.

Resolution should validate and pay for the activity, apply on-use effects, select all recipients, open applicable pre-resolution reactions, resolve the main check, apply damage protection, apply actual Health loss, resolve riders and threshold events, then offer post-resolution reactions. A trigger queue must record visited events to prevent retaliation, healing, and death effects from looping.

Movement must distinguish ordinary travel, safe Steps, forced movement, teleportation, and pursuit. This prevents the same relocation from both triggering an opportunity attack and evading one by accident. End effects when their stated source or target leaves play; a lingering hazard may persist when its source dies if the source rule says so.

## Separate reaction activity

Use a shared proposed budget of **one reaction per troop per round**, with refresh at the round boundary. Let the player reserve or choose a reaction in an eligible window. A later automation policy can resolve a previously chosen preference; it must produce the same event log and resource use.

| Reaction family | Examples | Window |
|---|---|---|
| Opportunity and interruption | Reactive Attack, Reactive Sweep, Pin It Down, Long Arm of the Law | During eligible movement, ranged attack, or manipulation |
| Protection | Shield Block, Archon's Aegis, Sacrifice, Stygian Guardian | Before incoming damage lands |
| Pursuit or escape | No Escape, Reactive Relocation | On retreat movement or after a hit resolves |
| Threshold retaliation | Ferocious Fall, Final Grudge, Brutal Retaliation, Stampede | Before/at the source segment-loss event |
| Offensive recovery | Revel in Battle | After the troop scores a critical Battle result |
| End-turn recovery | Bolster the Wounded | At the troop's own activation end |
| Spell interference | Troop Counterspell | Before an eligible enemy spell resolves |
| Conditional retaliation | Hellish Revenge, Avenging Bite, Savage | The precise critical-hit, ally-attack, or Escape trigger |

No ordinary attack receives these effects for free. Preserve explicit exceptions to reaction access, especially the shamblers' permanent Slow. A round-boundary refresh is a deliberate game timing choice; PF2e's own reaction refresh happens on a creature's turn.

The existing common free strike on a failed maneuver needs an explicit decision before reactions ship: retain it as a common maneuver consequence, replace it with available troop reactions, or share the resource. Do not allow both to fire from one event by accident.

## Source issues

| Issue | Treatment |
|---|---|
| Pageant Troupe's reaction names point to the wrong glossary entries, while Performers denies shields | Preserve the inconsistency and enable neither reaction until corrected. |
| Pageant Troupe's two-action damage exceeds its three-action damage | Keep the baseline attack; review the source numbers before generating scaling. |
| Salty Clutch says restraint on a critical success | Preserve the text; proposed correction is target critical failure. |
| Coordinated Maneuvers lists Reposition twice but names Trip's DC | Record the probable Trip correction explicitly. |
| Ulat-Kini Spoils of War names an absent Let 'em Have It attack | Propose an explicit link to Claw and Trident; do not match by fuzzy title alone. |
| Individual abilities refer to missing hoof, foot, trunk, claw, pitchfork, or stinger Strikes | Keep the source prerequisite and request a troop-profile binding in the review state. |
| Fervent Casting and Shields Up! have reaction economy but no trigger | Record the proposed trigger/cost policy as a source question. |
| Viking Guard's Shield Wall is passive but describes a movement activity and an ally reaction | Keep both source facts; propose a paid escort activity and separate ally reaction. |
| Now!! is passive despite its explicit ambush trigger | Preserve automatic trigger economy until a deliberate reaction decision. |
| CRISPR Troop Spellcasting localization is unavailable in this source checkout | Preserve the key and spell items. Do not borrow a same-name rule. |
| Some bleed formulas omit the persistent marker while labels or PF2e semantics imply it | Preserve markup and prose; use an explicit reviewed interpretation for each variant. |

## Import design

Use **TypeScript types plus a shared ability catalogue and recognition rules**. The saved creature-by-creature JSON is an evidence record and future fixture set. Runtime effects come from reusable definitions such as temporary protection, recovery, persistent damage, and displacement. A runtime `.d.ts` file alone cannot provide effect data. The [reusable ability model](ability-model.md) defines the categories and matching policy.

A proposed module split:

| Module | Responsibility |
|---|---|
| `src/engine/troop-abilities.ts` | Engine-owned effect/profile types and validated reusable primitives |
| `src/adapters/pf2e/troopAbilities.ts` | Ability normalization, mechanical signatures, local attack/rider links, portable annotations, and review diagnostics |
| `src/adapters/pf2e/troopAbilityPatterns.ts` | Shared recognition rules that translate source ability mechanics into catalogue definitions; source IDs and names provide optional hints |
| `UnitCard.abilities` / `Unit.abilities` | Serializable profiles and transient effect/resource state |
| Import review view | Source ability, proposed rule, missing prerequisite, and explicit unsupported state |

Both static import scripts and live Foundry import should call the same adapter. `import-troops.mjs` currently has a separate conversion path; unifying it first will stop the built-in library and newly imported creatures from acquiring different abilities.

A minimal future effect record should resemble this sketch. These are proposed fields, not existing APIs:

```ts
type EffectTrigger = 'on-use' | 'on-hit' | 'on-critical-hit' | 'on-health-lost';
type EffectOperation =
  | { kind: 'temporary-health'; amount: number }
  | { kind: 'heal'; amount: number; ceiling: 'current-segments' }
  | { kind: 'persistent'; amount: number; damageKind: string }
  | { kind: 'push' | 'pull'; hexes: number };

interface AttackRider {
  id: string;
  sourceItemId: string;
  sourceHash: string;
  trigger: EffectTrigger;
  minimumSourceActions?: number;
  operation: EffectOperation;
  expiry: 'battle-end' | 'target-activation-end' | 'source-activation-start';
  stacking: 'refresh' | 'replace-if-stronger';
}

const siphoningGripProposal = {
  trigger: 'on-use',
  operation: { kind: 'temporary-health', amount: 1 },
  expiry: 'battle-end',
  stacking: 'refresh',
} as const;
```

The complete design also needs target predicates, saves, four-degree payloads, replacement effects, resources, action profiles, and a separate discriminated reaction definition. The sketch illustrates the separation between healing and temporary protection without pretending to finish that schema.

New-creature import should proceed as follows:

1. Save source items and metadata before classification. Identify explicit actions and named attacks; retain all alternatives.
2. Read portable ability annotations, then recognize supported mechanical patterns from structured fields and ability descriptions. Use source IDs and familiar titles as optional hints. Verify trigger, effect, scope, economy, and limits before accepting a match.
3. Instantiate shared definitions and bind them to this actor's attack profiles, preserving its labels. Several source abilities can map to one definition, and one source ability can compose several effects. Retain review items for unfamiliar mechanics and ambiguous relationships.
4. Import the usable baseline creature with visible diagnostics for unresolved abilities. Never report that an ability is supported merely because its name was imported.
5. Show a concise player description such as “Siphoning Grip: gains temporary protection when used.” Keep source hashes and parser details in the import review rather than the battle activity menu.
6. Serialize profiles/resources through army storage, sessions, replay, and continuation. Tactical temporary Health expires without increasing campaign HP; daily resources need continuation state rather than a reset on every encounter.

## Implementation sequence

1. **Shared ability catalogue and source-preserving import.** Define the reusable categories and templates, unify import paths, preserve all source profiles, and expose unsupported abilities. Validate renamed actors, copied items with new IDs, and persistent annotations alongside ordinary round trips.
2. **Core attack effects.** Implement temporary Health, pending typed damage, on-use defence, movement penalties, holds, displacement, and exact hit/critical gates. Start with Lich Legion, Goblin Bombardiers, Arrester Squadron, Dottari, Druid Circle, and Wolf Pack.
3. **Named alternatives and passives.** Add paid follow-ups, conditional traits, profile choices, source costs, cooldowns, and daily resources. Resolve segment/healing scale before enabling recovery and threshold triggers.
4. **Reactions.** Add the shared budget and event windows as its own activity; settle its relationship to maneuver free strikes.
5. **Larger systems.** Add concealment, afflictions, carried targets, naval interactions, and source spell access when their rules are ready.

For implementation, test behavior that distinguishes the source: Siphoning Grip still protects on a miss; a critical-only rider stays absent on an ordinary hit; two-action Seize Them differs from one action; poison immunity affects poison rather than all persistence; a temporary buffer does not heal campaign HP; recharge and daily limits survive replay/continuation; rejected imports expose unresolved abilities; reactions neither chain forever nor spend the same budget twice. Compare six-round outcomes at lower, equal, and higher levels before choosing final wound/healing amounts.

## Regeneration and verification

Render and verify the saved review without a PF2e checkout:

```sh
node scripts/audit-troop-abilities.mjs
```

Refresh source evidence from the local checkout, then render. Source changes intentionally cause missing/changed/stale review failures until the review catches up:

```sh
node scripts/audit-troop-abilities.mjs --refresh /path/to/pf2e
```

The audit checks exact item hashes, duplicate review IDs, full action coverage, and stale review entries. It does not prove that proposed rules are balanced or implemented. The initial run reports zero missing/changed reviews and zero stale reviews. No gameplay files change in this review.

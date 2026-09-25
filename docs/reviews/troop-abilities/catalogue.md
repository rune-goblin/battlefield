# Assignable troop abilities

The [balance and naming review](balance-review.md) covers all 16 templates, their interactions, and recommended changes. Names and descriptions reflect that review; balance mechanics retain their current playtest values.

Current catalogue, naming review 2026-09-24. **Start with 16 shared abilities.** Assign a small number that express a unit's defining behavior. The saved review of 200 troop sources supplies the broad evidence; ReignMaker's registry and doctrine grants supply additional examples. Neither list sets the limits of the catalogue.

The goal is recognizable units at Battlefield's scale. A draining legion should gain staying power by attacking. Trolls should recover unless enemies counter their regeneration. Nets should restrict movement. Several shield formations can share one protective ability. We can omit source details when they add little to those differences.

The shared catalogue now executes in the game. See [implementation and portable assignments](implementation.md) for the import boundary and concrete simplifications. Numerical values remain initial playtest values on the four-Health scale. [Current game rules](../../../public/rules.html#troop-abilities) remain authoritative. This catalogue takes precedence over the earlier inventory's detailed conversion proposals when their scope or balance values differ.

## Catalogue

Sweep is retired. Melee area damage exceeds Battlefield’s unit scale. Trampling sources use Cavalry Charge against one unit; cleaving sources retain the ordinary melee attack.

<!-- catalogue:start -->
| Category | Ability | Current game effect |
|---|---|---|
| Sustain | **Heal / Clear Condition** (`recovery`) | Restore 1 Health, or clear one tactical condition. Choose the mode when assigning the ability. |
| Sustain | **Damage Absorption** (`temporary-protection`) | Gain a buffer that absorbs the next 1 Health of damage. It expires at the start of the recipient's next activation. |
| Sustain | **Regeneration** (`regeneration`) | At activation start, while below battle-start Health, attempt a Fortitude save against the DC for the unit’s own level. Success or critical success restores 1 Health; failure restores nothing. |
| Offense | **Delayed Damage** (`persistent-injury`) | Apply 1 pending damage at the end of the target’s next activation. Multiple marks share one pending hit. |
| Control | **Fear** (`fear`) | Apply the game's frightened condition: -1 to rolls and Defence through the target's next activation. |
| Control | **Weaken Defence** (`expose`) | The target suffers -2 Defence until it next acts. |
| Control | **Suppression** (`suppression`) | Apply -2 to rolls and Defence until the source next acts. |
| Control | **Immobilize** (`snare`) | Prevent movement through the target’s next activation. The target can still attack and can spend one action to break free. |
| Control | **Push / Pull** (`displace`) | Move the target one legal hex away from or toward the source after a qualifying hit. |
| Protection | **Guard** (`guard`) | Use Guard, or share its +2 protection with one adjacent ally while guarding. |
| Protection | **Resist Fear and Rout / Hold Ground** (`resolve`) | Choose +2 on checks to resist fear or rout, ignore the first forced displacement each round, or both. |
| Movement | **Cavalry Charge** (`charge`) | Use the existing cavalry-charge impact benefit on a legal Charge. |
| Movement | **Terrain Passage** (`terrain-passage`) | Ignore ordinary difficult terrain in one assigned terrain group. |
| Movement | **Opening Move** (`opening-move`) | In the first activation of the battle’s first round, make one free Move before other actions. |
| Offense | **Combat Bonus** (`advantage`) | Gain +1 to the assigned attack, Defence, opening initiative comparison, or Fear save difficulty, subject to the assigned condition. |
| Support | **Siege Accuracy** (`siege-crew`) | Gain +1 to the first attack check each activation with a siege engine this unit operates. |
<!-- catalogue:end -->

The [machine-readable catalogue](../../../data/troop-abilities/catalogue.json) records each stable ID, effect, allowed options, limits, and implementation status. It is design data; it is not an executable TypeScript schema.

The [complete troop classification](troop-classification.md) applies these templates to all 193 selected library troops. It proposes a small set per troop and records alternatives, omissions, prerequisites, and separate reaction decisions. These examples inform later import recognition; actor names never select runtime effects.

**Auras, attack riders, and active abilities are delivery choices.** An inspiring banner can deliver Resist Fear and Rout to adjacent allies; a terrifying creature can deliver Fear to adjacent enemies. Those deliveries reuse the same effects. A paid support activity can grant Damage Absorption to an ally, while a lich's attack grants Damage Absorption to itself. Each assignment records its delivery separately from its effect.

## Defining creature examples

| Source | Assignment | Preserved identity | Deliberate simplification |
|---|---|---|---|
| Lich Legion — Siphoning Grip | Damage Absorption on use of its melee attack | Attacking grants temporary protection, including on a miss | One buffer; omit action-scaled temporary HP and shorten its duration |
| Troll Marauders — Regeneration | Regeneration, suppressed by electricity or fire | Sustained recovery with damage-based counterplay | Omit PF2e dying rules and destroyed-unit recovery |
| Sacristan Scourge — Regeneration | Regeneration, suppressed by holy or silver | Enemies need the right attack to stop recovery | Share the same recovery operation and preserve the different suppressors |
| Scamp Flood — Fast Healing While Underwater | Regeneration requiring underwater terrain/state | The unit recovers in its native environment | Use one environmental gate; retain the source label Fast Healing |
| Protean Tumult — Fast Healing 8 | Regeneration with no damage suppressor | Repeated recovery distinguishes it from a one-use healer | Omit the original HP rate |
| Dezullon Thicket — Regeneration and Regrowth | Regeneration | The thicket regrows during battle | Omit segment restoration; do not invent a suppressing type when evidence lacks one |
| Arrester Squadron — Seize Them! | Immobilize on the qualifying melee result | Arresters hold enemies in place | Replace graded restraint with one root and a one-action release |
| Druid Circle — Call Down the Storm | Push / Pull after a successful storm hit | The storm moves enemies as well as hurting them | One legal hex; use the chosen game attack shape |
| Deinonychus Pack — Predator's Advantage | Combat Bonus against a target with pending bleed-tagged Delayed Damage | Predators capitalize on bleeding prey | One +1 attack bonus; omit separate source Reflex penalties |
| ReignMaker — Revel in Battle | Future Battle Recovery reaction | A critical melee result restores actual Health | Keep the reaction cost; omit level-based healing |

These examples justify templates; they do not create name-based import rules. [Example records](../../../data/troop-abilities/catalogue-examples.json) link them to the saved source review for auditing. Troll Marauders exists in the broader creature snapshot even though regeneration does not appear in the inspected ReignMaker ability registry.

Heal / Clear Condition, Damage Absorption, and Regeneration share Sustain but deserve distinct player choices. **Heal** restores lost Health once. **Damage Absorption** absorbs future damage temporarily. **Regeneration** restores Health repeatedly and can have an environmental requirement or a counter. A life-draining ability that actually heals uses Heal after damage; Siphoning Grip uses Damage Absorption on attack use. Preserve the source flavor name on the card.

## Assignment standards

1. **Choose defining traits.** Aim for one to three visible abilities per unit, as a design target rather than a hard limit. Prefer mechanics that change positioning, target choice, timing, or counterplay. Record the source details we deliberately omit.
2. **Keep one primary effect per source feature.** Combine two effects only when both matter to its identity, such as Cavalry Charge plus Delayed Damage for an attack that also causes bleeding. More source paragraphs do not automatically grant more benefits.
3. **Attach mechanics to the ability.** Store its catalogue ID, flavor label, local attack reference, trigger, target, prerequisites, duration, and limits. A renamed creature or ability keeps those assignments. Source names, UUIDs, and slugs remain evidence and recognition hints.
4. **Use fixed choices.** Restrict parameters to the catalogue's options. Use source damage tags and environmental requirements where they supply meaningful counters. A missing mechanical fact yields a review note, not a guessed benefit.
5. **Preserve the triggering distinction.** On attack use, on hit, on damage, and on critical hit are separate choices. On-use Damage Absorption still works on a miss. A replacement Volley with Immobilize or Suppression deals no normal damage.
6. **Keep costs explicit.** A rider shares its parent attack's cost and attack limit. A paid activity spends its stated game actions. A passive remains automatic unless its mapping explicitly changes that behavior. A reaction remains unavailable until the reaction system exists.
7. **Merge duplicate benefits.** One condition, buffer, or shared bonus applies once per recipient. Combat Medics plus Battlefield Medicine grants one Heal activity. Siege Training plus Practiced Gunners plus Practiced Loaders grants one Siege Accuracy benefit. Prepared actor modifiers also need deduplication.
8. **Share balance rules.** Adjust a template's conversion across units. Preserve raw source values for comparison without converting each PF2e HP or die directly into a new Health box. Recurring healing and temporary protection need particular testing on a four-Health scale.

## Shared timing and limits

- Heal / Clear Condition's default is a two-action activity for self or one adjacent ally. A source can attach it to an attack or, for Swift Recovery, grant a once-per-battle activation-start condition clear. Use the unit's battle-start tactical Health as the healing ceiling; campaign wounds stay unchanged.
- Regeneration attempts a Fortitude save against the unit’s own level DC at activation start, while alive and below that same ceiling. Success or critical success restores 1 Health; failure restores nothing and still uses the round’s attempt. Any Blast that causes Health loss suppresses recovery at the next activation. Repeated hits refresh one interruption; misses and fully absorbed Blasts do not interrupt it. Source damage counters still apply. This deliberately omits PF2e dying and segment rules. Track source damage and environmental tags before enabling their automatic gates.
- Damage Absorption grants one temporary buffer per recipient per round. It expires at the start of that recipient's next activation. Start-of-activation delivery resolves after expiry, so a commander can refresh protection. Damage consumes the buffer before Health.
- Fear, Weaken Defence, Suppression, and Delayed Damage reuse existing game conditions. Delayed Damage means the existing one pending damage event; it does not introduce endless damage ticks. Immobilize uses root with an explicit one-action release.
- Auras use adjacent hexes for this proposal. The source must remain active. Benefits end on leaving the area, subject to an effect's explicit timed grant such as Damage Absorption. A hostile Fear aura applies only while adjacent and never adds campaign Demoralized.
- Resist Fear and Rout / Hold Ground's fear-resistance and hold-ground modes are separate choices. A banner may grant fear resistance; No Retreat grants hold ground. The hold-ground allowance is once per recipient per round across all sources.
- Combat Bonus supports melee, Volley, Defence, initiative, or a named granted ability check. Predicates are target tag/condition, terrain, first qualifying attack, half Health, marked quarry, active nearby commander, or an explicit parent-activity requirement. +1 is the total Combat Bonus bonus on a check, regardless of source count.
- The ordinary attack limit applies to all riders. A melee attack damages its chosen unit. Cleaving and trampling source areas do not grant damage to additional units.

## Separate reactions

Record seven future reaction patterns: **Retaliate, Pursue, Block, Counterplay, Battle Recovery, Hold Nerve, and Coordinated Advance**. They reuse ordinary attacks, movement, prevention, Heal / Clear Condition, and Weaken Defence where possible. The [reaction definitions](../../../data/troop-abilities/catalogue.json) record triggers and deliberate simplifications; the [full reaction inventory](reactions.md) remains the broader evidence.

Proposed economy: one reaction per unit per round, with explicit trigger windows and no reaction chains. Resolving a reaction never grants another reaction. This is a separate design activity, not permission to make reactions passive riders today. Block resolves after a hit result and before damage; Battle Recovery resolves after the triggering attack completes. Those timing rules need an implementation design before activation.

No Escape can become Pursue. No Retreat becomes Hold Ground. Revel in Battle remains a reaction even though it shares Heal with medics. Signal the Advance is a paid command whose recipient spends a reaction; keep that dependency visible.

## ReignMaker review

The [complete ReignMaker mapping](reignmaker-mapping.md) covers **97 registry definitions and six doctrine grants**, plus its 42-entry training ladder and common generated Troop Defenses rule. It records 62 proposed abstractions, 20 baseline entries, six intentional omissions, seven deferred entries, and eight entries that require reactions. One of those eight is the paid Signal the Advance command.

Examples of deliberate consolidation include Raise Shields, Form a Phalanx, and Shield Wall into Guard; forest, city, and rough-ground passage into Terrain Passage; and three siege-training improvements into Siege Accuracy. `opening-salvo` is a movement benefit, and `overrun` is Aggressive Mounts. Read the actual mechanics.

Campaign logistics, source footprint geometry, and small stat details can remain outside this catalogue. Death explosions, random loss of control, major action penalties, and friendly-fire or self-damage drawbacks stay explicit review items. These could justify later shared abilities or drawbacks if they matter to unit identity. An intentional omission requires no future implementation; a deferred feature remains a decision, not a hidden promise of complete coverage.

The catalogue can grow when the wider creature review reveals a distinctive behavior that these templates cannot express. Add a shared rule for that behavior, illustrated by source examples. ReignMaker coverage alone neither proves completeness nor justifies a new template.

## Import integration boundary

Imported cards now carry an `abilities` collection with versioned TypeScript definitions and runtime validation. Shared engine operations resolve the effects. Template definitions remain separate from source recognition and creature data. The importer matches verified mechanical content or a portable explicit assignment and saves unresolved clauses as review notes. An imported name change preserves an assignment.

The built-in library now includes shared assignments from the reviewed sources. Tests cover renaming and copying, damage versus use triggers, temporary protection versus healing, duplicate grants, regeneration counters, movement and named activities. Unsupported mechanics remain in review. Reaction implementation and balance playtesting remain separate work.

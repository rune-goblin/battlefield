# Assignable troop abilities

Design proposal, 2026-09-23. **Start with 17 shared abilities.** Assign a small number that express a unit's defining behavior. The saved review of 200 troop sources supplies the broad evidence; ReignMaker's registry and doctrine grants supply additional examples. Neither list sets the limits of the catalogue.

The goal is recognizable units at Battlefield's scale. A draining legion should gain staying power by attacking. Trolls should recover unless enemies counter their regeneration. Nets should restrict movement. Several shield formations can share one protective ability. We can omit source details when they add little to those differences.

These definitions enable no runtime behavior. Numerical values below are initial playtest proposals on the four-Health scale. [Current game rules](../../../public/rules.html) remain authoritative. This catalogue takes precedence over the earlier inventory's detailed conversion proposals when their scope or balance values differ.

## Catalogue

<!-- catalogue:start -->
| Category | Ability | Proposed game effect |
|---|---|---|
| Sustain | **Recovery** (`recovery`) | Restore 1 Health, or clear one tactical condition. Choose the mode when assigning the ability. |
| Sustain | **Vitality** (`temporary-protection`) | Gain a buffer that absorbs the next 1 Health of damage. It expires at the start of the recipient's next activation. |
| Sustain | **Regeneration** (`regeneration`) | At the start of each activation, restore 1 Health while alive and below the recovery ceiling. |
| Offense | **Lingering Harm** (`persistent-injury`) | A qualifying hit applies the game's existing persistent damage effect once. |
| Control | **Menace** (`fear`) | Apply the game's frightened condition: -1 to rolls and Defence through the target's next activation. |
| Control | **Expose** (`expose`) | The target suffers -2 Defence until it next acts. |
| Control | **Suppression** (`suppression`) | Apply the game's suppression penalty until the source next acts. |
| Control | **Snare** (`snare`) | Root the target through its next activation. It can spend one action to clear this root. |
| Control | **Shove** (`displace`) | Move the target one legal hex away from or toward the source after a qualifying hit. |
| Protection | **Shielding** (`guard`) | Use Guard, or share its +2 protection with one adjacent ally while guarding. |
| Protection | **Resolve** (`resolve`) | Gain +2 on checks to resist fear or rout. Ignore the first one-hex forced displacement each round. |
| Movement | **Shock Charge** (`charge`) | Use the existing cavalry-charge impact benefit on a legal Charge. |
| Movement | **Pathfinder** (`terrain-passage`) | Ignore ordinary difficult terrain in one assigned terrain group. |
| Movement | **Vanguard** (`opening-move`) | Before its first activation, make one free Move of up to its ordinary allowance. |
| Offense | **Exploit** (`advantage`) | Gain +1 to one assigned check type while one concrete condition holds. |
| Offense | **Sweep** (`sweep`) | After a successful melee attack, deal 1 Health damage to one other enemy adjacent to the attacker. |
| Support | **Siege Crew** (`siege-crew`) | Gain +1 to the first attack check each activation with a siege engine this unit operates. |
<!-- catalogue:end -->

The [machine-readable catalogue](../../../data/troop-abilities/catalogue.json) records each stable ID, effect, allowed options, limits, and current implementation gap. It is design data; it is not an executable TypeScript schema.

**Auras, attack riders, and active abilities are delivery choices.** An inspiring banner can deliver Resolve to adjacent allies; a terrifying creature can deliver Menace to adjacent enemies. Those deliveries reuse the same effects. A paid support activity can grant Vitality to an ally, while a lich's attack grants Vitality to itself. A delivery may still require engine work even when the underlying condition exists.

## Defining creature examples

| Source | Assignment | Preserved identity | Deliberate simplification |
|---|---|---|---|
| Lich Legion — Siphoning Grip | Vitality on use of its melee attack | Attacking grants temporary protection, including on a miss | One buffer; omit action-scaled temporary HP and shorten its duration |
| Troll Marauders — Regeneration | Regeneration, suppressed by electricity or fire | Sustained recovery with damage-based counterplay | Omit PF2e dying rules and destroyed-unit recovery |
| Sacristan Scourge — Regeneration | Regeneration, suppressed by holy or silver | Enemies need the right attack to stop recovery | Share the same recovery operation and preserve the different suppressors |
| Scamp Flood — Fast Healing While Underwater | Regeneration requiring underwater terrain/state | The unit recovers in its native environment | Use one environmental gate; retain the source label Fast Healing |
| Protean Tumult — Fast Healing 8 | Regeneration with no damage suppressor | Repeated recovery distinguishes it from a one-use healer | Omit the original HP rate |
| Dezullon Thicket — Regeneration and Regrowth | Regeneration | The thicket regrows during battle | Omit segment restoration; do not invent a suppressing type when evidence lacks one |
| Arrester Squadron — Seize Them! | Snare on the qualifying melee result | Arresters hold enemies in place | Replace graded restraint with one root and a one-action release |
| Druid Circle — Call Down the Storm | Shove after a successful storm hit | The storm moves enemies as well as hurting them | One legal hex; use the chosen game attack shape |
| Deinonychus Pack — Predator's Advantage | Exploit against a target with pending bleed-tagged Lingering Harm | Predators capitalize on bleeding prey | One +1 attack bonus; omit separate source Reflex penalties |
| ReignMaker — Revel in Battle | Future Battle Recovery reaction | A critical melee result restores actual Health | Keep the reaction cost; omit level-based healing |

These examples justify templates; they do not create name-based import rules. [Example records](../../../data/troop-abilities/catalogue-examples.json) link them to the saved source review for auditing. Troll Marauders exists in the broader creature snapshot even though regeneration does not appear in the inspected ReignMaker ability registry.

Recovery, Vitality, and Regeneration share Sustain but deserve distinct player choices. **Recovery** restores lost Health once. **Vitality** absorbs future damage temporarily. **Regeneration** restores Health repeatedly and can have an environmental requirement or a counter. A life-draining ability that actually heals uses Recovery after damage; Siphoning Grip uses Vitality on attack use. Preserve the source flavor name on the card.

## Assignment standards

1. **Choose defining traits.** Aim for one to three visible abilities per unit, as a design target rather than a hard limit. Prefer mechanics that change positioning, target choice, timing, or counterplay. Record the source details we deliberately omit.
2. **Keep one primary effect per source feature.** Combine two effects only when both matter to its identity, such as Shock Charge plus Sweep for trampling cavalry. More source paragraphs do not automatically grant more benefits.
3. **Attach mechanics to the ability.** Store its catalogue ID, flavor label, local attack reference, trigger, target, prerequisites, duration, and limits. A renamed creature or ability keeps those assignments. Source names, UUIDs, and slugs remain evidence and recognition hints.
4. **Use fixed choices.** Restrict parameters to the catalogue's options. Use source damage tags and environmental requirements where they supply meaningful counters. A missing mechanical fact yields a review note, not a guessed benefit.
5. **Preserve the triggering distinction.** On attack use, on hit, on damage, and on critical hit are separate choices. On-use Vitality still works on a miss. A replacement Volley with Snare or Suppression deals no normal damage.
6. **Keep costs explicit.** A rider shares its parent attack's cost and attack limit. A paid activity spends its stated game actions. A passive remains automatic unless its mapping explicitly changes that behavior. A reaction remains unavailable until the reaction system exists.
7. **Merge duplicate benefits.** One condition, buffer, or shared bonus applies once per recipient. Combat Medics plus Battlefield Medicine grants one Recovery activity. Siege Training plus Practiced Gunners plus Practiced Loaders grants one Siege Crew benefit. Prepared actor modifiers also need deduplication.
8. **Share balance rules.** Adjust a template's conversion across units. Preserve raw source values for comparison without converting each Pathfinder HP or die directly into a new Health box. Recurring healing and temporary protection need particular testing on a four-Health scale.

## Shared timing and limits

- Recovery's default is a two-action activity for self or one adjacent ally. A source can attach it to an attack or, for Swift Recovery, grant a once-per-battle activation-start condition clear. Use the unit's battle-start tactical Health as the healing ceiling; campaign wounds stay unchanged.
- Regeneration is automatic at activation start, at most once per round, while the unit is alive and below that same ceiling. A suppressing hit prevents the next recovery through the end of that activation. This deliberately omits PF2e dying and segment rules. Track source damage and environmental tags before enabling their automatic gates.
- Vitality grants one temporary buffer per recipient per round. It expires at the start of that recipient's next activation. Start-of-activation delivery resolves after expiry, so a commander can refresh protection. Damage consumes the buffer before Health.
- Menace, Expose, Suppression, and Lingering Harm reuse existing game conditions. Lingering Harm means the existing one pending damage event; it does not introduce endless damage ticks. Snare uses root with an explicit one-action release.
- Auras use adjacent hexes for this proposal. The source must remain active. Benefits end on leaving the area, subject to an effect's explicit timed grant such as Vitality. A hostile Menace aura applies only while adjacent and never adds campaign Demoralized.
- Resolve's fear-resistance and hold-ground modes are separate choices. A banner may grant fear resistance; No Retreat grants hold ground. The hold-ground allowance is once per recipient per round across all sources.
- Exploit supports melee, Volley, Defence, initiative, or a named granted ability check. Predicates are target tag/condition, terrain, first qualifying attack, half Health, marked quarry, active nearby commander, or an explicit parent-activity requirement. +1 is the total Exploit bonus on a check, regardless of source count.
- The ordinary attack limit applies to all riders. Sweep's secondary damage cannot trigger another ability. These constraints prevent combinations from multiplying attacks or healing.

## Separate reactions

Record seven future reaction patterns: **Retaliate, Pursue, Block, Counterplay, Battle Recovery, Hold Nerve, and Coordinated Advance**. They reuse ordinary attacks, movement, prevention, Recovery, and Expose where possible. The [reaction definitions](../../../data/troop-abilities/catalogue.json) record triggers and deliberate simplifications; the [full reaction inventory](reactions.md) remains the broader evidence.

Proposed economy: one reaction per unit per round, with explicit trigger windows and no reaction chains. Resolving a reaction never grants another reaction. This is a separate design activity, not permission to make reactions passive riders today. Block resolves after a hit result and before damage; Battle Recovery resolves after the triggering attack completes. Those timing rules need an implementation design before activation.

No Escape can become Pursue. No Retreat becomes Resolve. Revel in Battle remains a reaction even though it shares Recovery with medics. Signal the Advance is a paid command whose recipient spends a reaction; keep that dependency visible.

## ReignMaker review

The [complete ReignMaker mapping](reignmaker-mapping.md) covers **97 registry definitions and six doctrine grants**, plus its 42-entry training ladder and common generated Troop Defenses rule. It records 62 proposed abstractions, 20 baseline entries, six intentional omissions, seven deferred entries, and eight entries that require reactions. One of those eight is the paid Signal the Advance command.

Examples of deliberate consolidation include Raise Shields, Form a Phalanx, and Shield Wall into Shielding; forest, city, and rough-ground passage into Pathfinder; and three siege-training improvements into Siege Crew. `opening-salvo` is a movement benefit, and `overrun` is Aggressive Mounts. Read the actual mechanics.

Campaign logistics, source footprint geometry, and small stat details can remain outside this catalogue. Death explosions, random loss of control, major action penalties, and friendly-fire or self-damage drawbacks stay explicit review items. These could justify later shared abilities or drawbacks if they matter to unit identity. An intentional omission requires no future implementation; a deferred feature remains a decision, not a hidden promise of complete coverage.

The catalogue can grow when the wider creature review reveals a distinctive behavior that these templates cannot express. Add a shared rule for that behavior, illustrated by source examples. ReignMaker coverage alone neither proves completeness nor justifies a new template.

## Import integration boundary

The next implementation should add an `abilities` collection to imported cards, validate a closed TypeScript union, and resolve effects through shared engine operations. Keep template definitions separate from source recognition and creature data. Match mechanical structure or a portable explicit assignment, then save the chosen abstraction and omitted clauses for review. An imported name change never removes an assignment.

Start with Vitality, Recovery, Regeneration, Lingering Harm, and Snare across unrelated source creatures. Verify renaming/copying, damage versus use triggers, temporary protection versus healing, duplicate grants, and regeneration counters. Balance the four-Health effects before assigning abilities across the entire library. The present deliverable defines the vocabulary and preserves evidence; runtime wiring remains the next activity.

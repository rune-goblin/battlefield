# Troop ability balance and naming review

Review date: 2026-09-24. Scope: all 16 current shared templates, their import mappings, and their interactions with Battlefield’s four-Health units and three-action activations. Reactions remain a separate future activity. Sweep remains retired.

The initial pass changed player names and descriptions. **The recommendations below record that initial review; the implemented regeneration follow-up appears next.** Source names, portable IDs, assignment keys, and saved resources remain stable. The source inventory remains evidence rather than a requirement to reproduce every PF2e mechanic.

## Implemented regeneration follow-up

Regeneration now attempts a Fortitude save against the unit’s own level DC at activation start, while below battle-start Health. Success or critical success restores 1 Health; failure restores nothing. One attempt per round includes failed saves. Any Blast that causes Health loss suppresses regeneration at the next activation. Repeated hits refresh one interruption; misses and fully absorbed Blasts do not interrupt it. Source damage counters and environmental requirements still apply.

The Fortitude save and universal Blast counter replace automatic recovery. The proposed two-Health interruption and finite battle recovery allowance remain unimplemented. The initial damage comparison below still measures damage output; the regeneration assessment describes the earlier automatic recovery rule.

## Main findings

1. **Free sustain exceeds the ordinary damage budget.** Damage Absorption can cancel the first ordinary hit each round. It applies after damage caps, so Dig In or Stoneskin plus absorption can also cancel the first critical hit. Damage that causes no Health loss also avoids the associated damage Morale check. Regeneration can restore 1 Health per round while an ordinary attack often deals less than 1 expected damage. Healing ceilings preserve campaign wounds but do not limit repeated recovery during battle. Recommend a starting playtest allowance of two successful absorption grants or two successful regeneration restores per recipient per battle. Preserve source triggers and regeneration counters. Give each automatically imported unit one free sustain template by default; review combinations separately.
2. **Delayed Damage on an ordinary hit is a large offensive increase.** Converting a small source bleed or burn to one Health can almost double expected damage. Recommend critical-hit delivery as the default. Keep ordinary-hit delivery for an explicit, limited exception that justifies its cost. The effect remains one pending damage event, shared across damage tags.
3. **Auras multiply a template’s value across units.** One absorption source can protect each adjacent ally as that ally activates. Fear affects every adjacent enemy without a save. Bonus and resistance auras can support several allies. Adjacency limits reach but does not cap total benefit per source. Recommend one adjacent recipient per source per round for sustain support. Review hostile auras and broad command bonuses as explicit exceptions with their own budget. Their value needs comparison with several individual ability assignments.
4. **Some assignments add little or duplicate an existing action.** The paid Suppression ability costs two actions, requires a hit, and deals no normal damage. In the overlapping legal ranged cases, ordinary Suppress costs the same, deals ordinary damage, and suppresses even on a miss. Basic passive Guard adds no benefit beyond the Guard action that every unit already has. Recommend treating those source features as baseline and preserving variants that add a distinct effect, such as critical-hit Suppression or Guard Ally.

## Damage comparison

The table enumerates all 20 die results with the engine’s `degreeOf` function against Defence 23. An ordinary success deals 1 Health and a critical success deals 2. The hit rider adds 1 on either success; the critical rider adds 1 only on a critical success. These are expected Health losses per attack attempt, including the eventual delayed damage.

| Attack modifier | Ordinary attack | With on-hit Delayed Damage | With critical-only Delayed Damage | Against one available absorption buffer |
|---|---:|---:|---:|---:|
| +7 | 0.30 | 0.55 | 0.35 | 0.05 |
| +11 | 0.50 | 0.95 | 0.55 | 0.05 |
| +15 | 0.80 | 1.45 | 0.95 | 0.15 |

At +11, ordinary-hit delivery adds 90% to expected damage; critical-only delivery adds 10%. A buffer reduces that one attack’s expected Health loss by 90%. These figures assume that delayed damage lands, no mark already exists, and the target survives to take it. They exclude condition clearing, Morale, cover, further attacks, and other modifiers. The buffer protects only until one damaging hit consumes it. Holding the same attack results fixed, a one-damage cap followed by a buffer reduces that attack’s Health loss to zero. These comparisons identify budget problems; they do not establish battle win rates.

## Complete catalogue assessment

| Current player name | Assessment | Recommendation |
|---|---|---|
| **Heal / Clear Condition** | Heal restores a quarter of maximum Health, usually for two actions, once per recipient per battle. Clear Condition has a separate per-round allowance and removes the first condition in a fixed priority order. Spending two actions to clear immobilization competes with the target’s one-action Break Free. | Keep the finite Health allowance. Show the two modes separately. Review the condition mode’s cost and target choice before expanding assignments. |
| **Damage Absorption** | Repeated free protection can erase ordinary hits and their damage Morale checks. Applying it after a damage cap strengthens the combination. An aura multiplies grants across allies. | Trial a finite battle allowance and one recipient per support source per round. Preserve Siphoning Grip’s on-use trigger, including a miss. |
| **Regeneration** | One free Health per round can exceed incoming attrition. Source counters and environmental requirements create counterplay, but some sources have no damage counter. It can combine with absorption and one-use healing. | Trial two successful restores per battle. Preserve source counters and requirements; avoid stacking free sustain during automatic import. |
| **Delayed Damage** | Ordinary-hit delivery approaches a second ordinary attack’s expected Health damage for free and can cause another damage Morale check. | Default to critical-only delivery. Keep one pending event and review ordinary-hit exceptions. |
| **Fear / Fear Aura** | A single-target −1 penalty gives a clear role. A free hostile aura affects several units with no save. Fear can combine with Suppression and exposure. | Retain the single-target forms for testing. Give aura delivery a separate budget. Review combined control penalties. |
| **Weaken Defence** | −2 Defence rewards focused attacks, with expiry at the target’s next activation start. Existing exposure and outflanking benefits share the same Defence reduction. Fear and Suppression can still add further penalties. | Keep the short duration. Review units that combine several control riders on one attack. |
| **Suppression** | The critical rider has a distinct role. The paid version loses damage and reliability compared with ordinary Suppress where both actions are legal. Its special range and targeting rules also differ from ordinary Volley. | Map ordinary covering fire to baseline Suppress. Review the special targeting rules before retaining a separate paid version. |
| **Immobilize** | Restricts movement, preserves attacks, and allows a one-action escape. The two-action replacement trades the attacker’s damage and actions for positioning pressure. | Keep the escape and single-target limit. Preserve critical-only delivery for free melee riders. |
| **Push / Pull** | One battlefield hex can break a line, remove Guard, or disrupt hauling. An ordinary-hit rider supplies that positional benefit alongside damage. Direction matters to the player. Troop displacement riders omit the root check that siege displacement uses. | Prefer critical-only delivery for cheap riders. Audit forced-movement legality consistently with root, obstacles, and Hold Ground. Preserve one hex and zero collision damage. |
| **Guard / Guard on Attack / Guard Ally** | Basic Guard duplicates a universal action. Guard on Attack saves an action even on a miss when its trigger is use. Guard Ally shares +2 Defence with one ally. While guarding, an assignment without a chosen ally currently selects the first adjacent ally. | Omit basic Guard from the defining-ability budget. Preserve explicit variants. Review free Guard with damage caps and absorption; make ally selection explicit in a later interaction pass. |
| **Resist Fear and Rout / Hold Ground** | A +2 resistance bonus and one ignored displacement per round are bounded, distinct protections. Combined mode grants both. Aura delivery multiplies their reach. Some displacement paths check and consume Hold Ground before confirming a legal destination. | Keep individual modes. Budget combined and aura assignments separately. Check that an already-blocked displacement does not consume Hold Ground’s allowance. |
| **Cavalry Charge** | Reuses the existing impact benefit, route requirements, action cost, and attack limit. It adds no melee area damage. It can still combine with other riders. | Keep. Preserve one target and the existing Charge requirements. Reconcile the existing Overrun cornering Morale consequence with any description that promises no extra consequence for blocked movement. |
| **Terrain Passage** | A terrain-cost reduction changes position without extra attacks. Settlement already costs the open-ground rate, so an urban-only assignment supplies no reduction. Generic mappings can broaden a narrow source movement benefit. | Omit assignments with no effect from the defining-ability budget. Keep terrain groups tied to supported source mechanics; avoid turning a narrow passage feature into general mobility. |
| **Opening Move** | One free Move supplies an opening positional advantage once per battle. It preserves legal paths and ends outside contact. The old catalogue incorrectly described a pre-activation window and deployment-boundary restriction. | Keep. This pass corrects the text to the existing first-activation timing. |
| **Combat Bonus** | A shared +1 cap bounds duplicate bonuses, but unconditional and aura variants have more uptime. Initiative only affects the opening side-count tie. Quarry automatically chooses the first enemy in deployment order. | Keep narrow predicates. Name the affected statistic and explain its actual condition. Review arbitrary quarry selection and broad aura/unconditional mappings before expanding them. |
| **Siege Accuracy** | +1 to the first engine attack per activation supplies a small, bounded distinction. It leaves loading and firing costs intact. An engine’s own area attack can benefit; this template creates no new attack area. | Keep. The new name makes clear that this improves accuracy rather than loading speed or crew size. |

## Naming standard

Use the shared effect as the visible name, then retain the source title for flavor: **Damage Absorption — Siphoning Grip**. Display the assigned mode, such as **Pull**, **Heal**, or **Hold Ground**, rather than the entire template’s menu of options. Bonus names identify their statistic; descriptions spell out the condition, trigger, amount, duration, and allowance. Activity descriptions identify the effect while retaining the source activity’s name.

| Previous catalogue label | Current catalogue label or assigned mode |
|---|---|
| Recovery | Heal or Clear Condition |
| Vitality | Damage Absorption |
| Lingering Harm | Delayed Damage |
| Menace | Fear or Fear Aura |
| Expose | Weaken Defence |
| Snare | Immobilize; its escape activity is Break Free |
| Shove | Push or Pull |
| Shielding | Guard, Guard on Attack, or Guard Ally |
| Resolve | Resist Fear and Rout, Hold Ground, or both |
| Pathfinder | Terrain Passage |
| Vanguard | Opening Move |
| Exploit | Combat Bonus; assignments show Melee Bonus, Defence Bonus, and the other affected statistics |
| Siege Crew | Siege Accuracy |

Regeneration, Suppression, and Cavalry Charge retain their names. Reaction proposals retain their separate status and receive no combat implementation in this pass.

## Verification boundary

The review uses the [current interpreter](../../../src/engine/ability-effects.ts), [combat rules](../../../src/engine/battle.ts), [catalogue](../../../data/troop-abilities/catalogue.json), [classification policy](../../../data/troop-abilities/classification-policy.json), and [ReignMaker mapping](../../../data/troop-abilities/reignmaker-mappings.json). The numeric comparison uses exact die enumeration, not a simulated battle. Focused tests cover mode-specific names, legacy labels, source-name preservation, plain conditions, and catalogue/runtime agreement. Existing combat tests remain the behavior check for the naming-only implementation.

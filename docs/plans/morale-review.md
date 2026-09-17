# Morale review

Date: 2026-09-16. Status: three-point morale and ordinary activities below rout implemented.

Update 2026-09-17: removed the half-army morale penalty by user decision. Losing half a side's units no longer adds disorder to its survivors. References below to that penalty describe the earlier rules.

The user approved the common three-pip track and removal of the early action restriction. The engine, tokens, army reel, save loading and rules now use that model. The analysis below preserves the earlier variable-Quality baseline for comparison. Check frequency and Rally's critical-failure outcome remain candidates for later experiments.

Display update: the user subsequently approved decreasing status bars. Health shows four minus wounds; morale shows three minus disorder. Both start full and green, shrink as losses accumulate, and leave an empty grey track at death or rout. Health is the thicker upper bar; morale is the thinner lower bar of equal length. The pip descriptions below record the earlier proposal. The thresholds and deferred post-battle leadership check remain as documented.

Use three morale pips for every unit and rout when the third pip fills. Let saves provide the troop distinction. Remove the separate action restriction at the penultimate pip: disorder already reduces effectiveness, and the player should retain choices until rout.

This separates two problems. A fixed track removes the extra capacity advantage from high Will and makes the display consistent with wounds. It does not make the current game gentler by itself. Troll Marauders already rout at three disorder; most other units currently rout at four or more.

## ReignMaker sources

The current campaign implementation confirms the fixed threshold:

- [MoraleCheck.ts](/Users/mark/Documents/repos/pf2e-reignmaker/src/types/MoraleCheck.ts) sets `DEMORALIZED_DISBAND_THRESHOLD = 3`. Critical success removes one Demoralized; success holds; failure adds one; critical failure adds two.
- [moraleResolver.ts](/Users/mark/Documents/repos/pf2e-reignmaker/src/services/army/moraleResolver.ts) triggers disband when the resulting value is at least three.
- [MoraleCheckService.ts](/Users/mark/Documents/repos/pf2e-reignmaker/src/services/army/MoraleCheckService.ts) uses a leader's Diplomacy or Intimidation. These campaign checks concern support and incidents; they do not use the troop's Will save.

The earlier [strategic battle rules draft, section 8](/Users/mark/Documents/repos/pf2e-reignmaker/docs/design/strategic-battle-rules.html:172) addresses combat directly. Every unit tracks shaken from zero to three, takes a −1 roll penalty per point, and routs at three. Will provides the distinction between troops. Ordinary rout checks occur once at the end of a round if the unit took a wound, is Broken, or its side crossed the half-loss threshold. A failure adds one point; a critical failure adds two; a critical success exempts the unit from further rout checks that battle.

That draft supplies precedent for both a fixed track and fewer checks. It is an earlier design, not proof that the current campaign implementation has the same tactical rules. Its section 12 also separates battlefield rout from subsequent campaign disbanding.

## Reinforcement in Battlefield

Before this change, `qualityFor` derived Quality from Will relative to the unit's level. Quality ranged from two to six. A unit became shaken at Quality and routed at Quality plus one. In the comparison below, “current” means this pre-change baseline. The analysis script retains that old formula locally so the comparison remains reproducible.

High Will therefore provides three advantages:

1. It resists disorder from a repulsed melee attack and Controlling magic more often.
2. It clears disorder through Rally more often, with more critical successes and fewer critical failures.
3. It grants more disorder capacity before the unit loses its attacks or routs.

The third advantage reinforces the first two. It also arrives in steps: at level 8, Will +15 gives Quality 3 while +16 gives Quality 4. That single modifier point improves the save and raises the rout threshold from four to five, a 25% increase in capacity.

Disorder adds another feedback loop. Each point lowers attacks, saves and Defence. A unit hits less often, risks more repulse checks, takes hits more often, and struggles to Rally. At the shaken threshold it loses Fight, Shoot, Guard and Cast as well. These effects explain why a unit can feel defeated before its visible track has an unambiguous terminal state.

The reinforcement is measurable. It does not establish whole-game imbalance by itself: damage, terrain, level, support and target selection also matter. The force generator budgets mainly by unit count and total level, so it does not explicitly price the additional Quality advantage.

## Exact probability comparison

The following comparison fixes level at 8 and the opposing DC at 24. Below-low Will +11 matches Troll Marauders; the other values come from Battlefield's save bands. Natural 1, natural 20 and all four degrees of success use the engine's actual `degreeOf` function.

| Will band | Will | Fresh save success | Current shaken / rout | Rout with a fixed track |
|---|---:|---:|---:|---:|
| Below low, troll | +11 | 40% | 2 / 3 | 3 |
| Low | +13 | 50% | 3 / 4 | 3 |
| Moderate | +16 | 65% | 4 / 5 | 3 |
| High | +19 | 80% | 5 / 6 | 3 |
| Extreme | +21 | 90% | 6 / 7 | 3 |

Even before capacity enters the calculation, the troll fails 60% of fresh saves and the high-Will unit fails 20%. Equal capacity retains that distinction.

For an endurance comparison, expose each unit to repeated Dread checks: failure adds one disorder, critical failure adds two. Start at zero disorder, include the −1 save penalty per existing disorder, and stop at rout. Exclude recovery, wounds, commitment, other conditions and loss-of-army effects. Allow temporary Frightened from a successful save to expire between exposures. These are isolated check opportunities, not predicted battle rounds or win rates.

| Will | Mean checks to rout, current | Mean checks to rout, fixed 3 | Rout within 6 checks, current | Rout within 6 checks, fixed 3 |
|---:|---:|---:|---:|---:|
| +11 | 3.92 | 3.92 | 92.4% | 92.4% |
| +13 | 6.25 | 5.03 | 61.0% | 78.7% |
| +16 | 10.44 | 6.98 | 14.5% | 52.3% |
| +19 | 17.46 | 10.83 | 1.8% | 27.0% |
| +21 | 28.12 | 17.50 | 0.2% | 14.0% |

The high-Will unit lasts 4.45 times as many checks as the troll under current rules, and 2.76 times as many with fixed capacity. Will alone preserves substantial endurance differences.

The calculation enumerates all twenty die faces. If `p1(d)` and `p2(d)` are the probabilities of gaining one or two disorder at current disorder `d`, expected remaining checks satisfy:

```text
E(d) = [1 + p1(d) E(d+1) + p2(d) E(d+2)] / [p1(d) + p2(d)]
E(d) = 0 at or beyond the rout threshold
```

This is an exact finite-state calculation under the stated assumptions. It avoids random sampling error.

## The troll's recovery problem

Troll Marauders have Will +11 and Fortitude +21. Against level-8 DC 24, a fresh troll passes a Will save 40% of the time and a Fortitude save 90% of the time. Battlefield uses Fortitude to resist disorder from wounds. Low Will therefore does not make the troll poor at every source of morale resistance; it particularly affects repulse, hostile morale magic and Rally.

At two disorder, the troll's unboosted Rally modifier falls to +9:

| Rally outcome against DC 24 | Chance |
|---|---:|
| Critical success: clears two disorder | 5% |
| Success: clears one disorder | 25% |
| Failure: stays at two | 45% |
| Critical failure: reaches three and routs | 25% |

That gives a 30% chance to recover and a 25% chance to rout while attempting recovery. With no intervening pressure, repeated unboosted attempts at this state produce recovery before rout only 54.5% of the time: `0.30 / (0.30 + 0.25)`. This stops at the first recovery; it does not model later attempts to clear the remaining point.

Committing one extra action raises recovery to 40% and lowers rout to 15%. Committing two raises recovery to 50% and lowers rout to 5%, at the cost of all three actions. An ally can also supply its own stronger Rally roll. These are useful choices, but they make a weak unit expensive to sustain.

Removing the early action restriction would let that troll choose another attack, Guard or movement while carrying its −2 disorder penalty. It would retain a meaningful decision at two pips.

## Gameplay consequences of a fixed track

The current 38-card ReignMaker roster contains two Quality-2 units, 25 Quality-3 units and 11 Quality-4 units. Fixed rout at three preserves the two weakest thresholds and lowers the other 36. Across all 88 library entries, it lowers 84 thresholds. Those counts describe available cards, not their frequency in actual armies.

The change would make morale attacks more useful against disciplined troops, increase the value of Rally and Healing, and make automatic disorder from half-army losses more consequential. It would also make rout compete with wounds for more units: without recovery or other disorder sources, a unit can suffer at most three wound-save failures before its fourth wound destroys it. Current rout thresholds of four or more cannot be reached through those wound saves alone. A fixed threshold of three can.

Use the same display convention for both tracks:

| Track | Terminal state |
|---|---|
| Four wound boxes | Fourth box fills: destroyed |
| Three morale pips | Third pip fills: routed |

Every point remains visible. The arrow reinforces the routed state and indicates the home edge. It carries no hidden overflow point.

Keep tactical rout separate from permanent campaign disbanding. Routing can retain the existing retreat and allied recovery mechanics. Permanent army loss belongs to the campaign handoff and its recovery rules.

## Recommended prototype

Adopt a common three-pip track and make full mean routed. Remove Will-derived Quality as a capacity statistic. Keep Will and Fortitude in their current roles for the first comparison; moving all morale resistance to Will would be another large change, especially for trolls.

Allow ordinary activities at zero, one and two disorder. Keep the current −1-per-point penalty initially, so those points still matter. Use a status word at two if useful, but give it no separate menu restriction. This retains player agency and removes a condition rule.

A shorter track needs a separate pacing assessment. Compare the fixed-track prototype with a second variant that consolidates ordinary combat morale into at most one check per unit per round, drawing on the earlier ReignMaker draft. Specify which triggers that check replaces; retaining all current losses and adding an end-of-round check would increase pressure. Keep deliberate morale attacks explicit during this comparison. Do not also import the draft's critical-success immunity without testing it: permanent immunity could make an early lucky roll dominate a short battle.

If recovery still feels punitive, the next focused experiment should remove disorder gain on a critically failed Rally. A failed Rally would spend actions while leaving disorder unchanged. This addresses the troll's risk of routing itself while recovering. Evaluate it separately from the fixed track so the source of improvement remains clear.

Measure rounds to first rout, rout versus destruction, actions spent on recovery, activations lost to restrictions, and recovery from two pips. Test matched levels across Will bands, then mixed-level armies with melee, shooting and Controlling pressure. The exact calculations establish amplification; those games establish pacing and overall balance.

## Reproduction

From the Battlefield repository:

```sh
npx tsc -p tsconfig.engine.json --noEmit false --outDir /private/tmp/battlefield-morale-engine
node scripts/analyze-morale.mjs /private/tmp/battlefield-morale-engine
```

The script imports the compiled engine, computes exact outcome probabilities and checks probability conservation. It also prints the library's historical Quality distribution, Rally outcomes and a sensitivity case that removes the disorder penalty from Dread saves.

## Deferred integration: post-battle leadership check

Superseded on 2026-09-16: the user chose one shared campaign/battle morale track, a paid ReignMaker Rally Troops action, and disbanding for armies still Routed at the end of the ReignMaker turn. The historical proposal below no longer governs the integration. Current rules appear in `public/rules.html`, section 13.

A battlefield rout should trigger a morale check at the end of the battle to determine whether the army keeps the surviving unit. This should be a leadership check in the ReignMaker integration. Battlefield currently resolves tactical rout and retreat only.

The integration must remember that a unit routed during the battle, including a unit that an ally subsequently rallied or that left the field. Reading final disorder alone would miss those cases. The leadership actor, skill, DC, outcomes and any support modifiers still need an integration design. ReignMaker's existing leader-based morale service provides a starting point.

This is a recorded requirement only. The current implementation adds no leadership roll, automatic disbanding, campaign writeback or new rout-history field.

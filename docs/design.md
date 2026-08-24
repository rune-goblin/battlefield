# Strategic Battle System

## Purpose

Armies in Reignmaker are troop NPC actors with kingdom-level `Army` records, but nothing resolves army-versus-army conflict. Events apply conditions to a random army, the only army-destruction path is upkeep morale, and the war-action data is display-only. The skirmish rules (5-ft grid, five actions, segments; see `siege-engines-in-skirmishes.md` §1) suit heroic encounters and fail a GM running three faction armies against four players' armies in one sitting.

This design defines an abstracted battle mini-game that resolves a field battle in under thirty minutes, gives every player a real choice each round, handles unequal forces without a points system, and reuses the numbers the troop actors already carry.

Scope of this version: units only. Commanders and PC heroes are deferred; the action economy leaves room for them (see Open questions).

References: Kingmaker war rules (Archives of Nethys: War Actions, War Encounters, Army Conditions, Victory or Defeat), *Dragon Rampant* (Mersey, 2015), *One Page Rules: Fantasy* v3.5.1.

## Design principles

1. One dice idiom: d20 + modifier vs DC, four degrees. Every roll is a PF2e check, so it posts as a chat card and level scaling comes free.
2. One number of position, one of damage, one of morale per unit. Nothing pairwise.
3. Melee does not lock. A Strike is an exchange; position changes only by choice.
4. Morale carries the state. Wounds feed rout checks, rout checks feed shaken, shaken 3 ends the unit.
5. Numbers come from the actor: Battle DC, Salvo DC and range, AC, saves, Speed, level, tactics. No second profile.
6. Unequal forces are expected. The level curve, outflanking, ground and walls balance a fight; there are no points.

## Stats consumed from the troop actor

| Battle stat | Source on actor | Line Infantry (L6) |
|---|---|---|
| Strike bonus | Battle DC − 10 (the `[Battle]` item's `@Check` DC) | 21 − 10 = +11 |
| Volley bonus | Salvo DC − 10 (the `[Salvo]` item) | +11 |
| Volley band | `[Salvo]` "within N feet": ≤ 60 close, ≤ 120 long, > 120 extreme | 120 ft → long |
| Defence DC | AC; fortification and Outfit Army armor effects already land here | 24 |
| Will | `saves.will` | +13 |
| Reflex | `saves.reflex` | +14 |
| Perception | initiative | +13 |
| Pace | Speed ≥ 30 ft or a fly speed: may Double Advance | 20 ft → no |
| Level | rout DC for enemies | 6 |
| Wounds | derived from HP (below) | 0 |
| Shaken | the `demoralized` counter effect | 0 |

Troops without a `[Salvo]` item cannot Volley. A siege engine's Volley bonus is `getSiegeLaunchDc(...) − 10`, and it always reaches extreme.

## The battle line

A single track of seven steps, 0 to 6. The attacker's edge is step 0; the defender's edge is step 6. Every unit occupies one step. Range between two units is their step distance:

| Distance | Band | Strike | Volley |
|---|---|---|---|
| 0 | engaged | yes | no |
| 1 | close | no | any Salvo |
| 2 | long | no | Salvo band long or extreme |
| 3+ | extreme | no | Salvo band extreme, or siege engines; −2 |

Deployment: attacker at steps 0–1, defender at steps 5–6. Both sides start at extreme with two Advances between them and contact, so the first round is volleys and positioning. Ambush tactics (the `Vigilance & Pursuit` family) deploy one step further in.

A step holds any number of units. A step with units of both sides is a melee.

## Wounds

Every unit has 0–4 wounds. Wounds replace hit points for the battle and map onto the PF2e troop thresholds:

| Wounds | HP written back | Segments | Effect |
|---|---|---|---|
| 0 | max | 4 | — |
| 1 | ⌊¾ max⌋ | 3 | — |
| 2 | ⌊½ max⌋ | 2 | Weakened: −2 to Strike and Volley; Volley band shrinks one step |
| 3 | ⌊¼ max⌋ | 1 | Broken: as Weakened; cannot Advance; Rout check every round |
| 4 | 0 | 0 | Destroyed |

A unit entering battle reads its wounds from HP: 0 if HP > ¾ max, 1 if > ½, 2 if > ¼, 3 if > 0. HP is written back at aftermath only; the battle keeps its own state.

Damage is a degree of success, never dice: critical success 2 wounds, success 1, failure 0. Level does the rest. A level-6 troop striking a level-2 troop needs about 7+ and crits on 17+; the reverse needs 17+ and cannot crit without help.

## Morale

Shaken runs 0–3 and mirrors onto the existing `demoralized` counter effect (−1 status per stack). Shaken 3 is routed: the unit must Retreat on every activation, cannot Strike or Volley, and leaves the battle when it reaches its edge.

Rout DC: the level-based DC of the highest-level enemy unit within close range, or of the highest-level enemy on the field if none is within close. +2 if that unit has a fear aura or frightful presence; −2 if the checking unit holds its own fortification.

Rout check triggers, resolved once per unit at end of round:

- the unit took a wound this round;
- the unit is Broken;
- half or more of its side's starting units are destroyed or routed (once, the round it happens).

Rout check: Will save vs rout DC. Critical success: immune to rout checks for the rest of the battle. Success: no change. Failure: shaken +1. Critical failure: shaken +2.

## Round structure

A round is one hour of battle. Initiative is rolled once per battle: each unit rolls Perception, and units act in that order every round. On its activation a unit takes two actions, then the next unit acts. At end of round: rout checks, then the battle checks for an end.

Two actions is deliberate. "Advance + Strike", "Volley + Brace", "Rally + Withdraw" is the whole decision, and eight units resolve in a few minutes.

The battle ends when one side has no unit that is neither destroyed nor routed, or at the end of round six (dusk): both sides withdraw to their edges and the hex stays contested.

## Actions

| Action | Cost | Effect |
|---|---|---|
| Advance | 1 | Not while engaged. Move one step toward the enemy edge. Pace units may Double Advance for 2 actions. Entering a step with enemies engages them. |
| Withdraw | 1 | Move one step toward your edge. If engaged when you start, the cost is 2 and each engaged enemy may take one free Strike (success = 1 wound, no critical). |
| Strike | 1 | Engaged only. d20 + Strike bonus vs the target's Defence DC. Critical 2 wounds, success 1, critical failure: you are Exposed (−2 Defence until your next activation). |
| Volley | 1 | Not engaged; target within your Volley band. Firing at a target engaged with an ally is −4. d20 + Volley bonus vs Defence DC; extreme −2. Critical 2 wounds, success 1. |
| Brace | 1 | +2 circumstance Defence until your next activation. A Braced unit gets one free Strike (success = 1 wound) at an enemy that Advances into its step. |
| Rally | 1 | Will save vs rout DC. Critical: shaken −2. Success: −1. Critical failure: +1. |
| Retreat | 2 | Withdraw twice; the second step draws no free Strikes. A unit that Retreats past its edge leaves the battle intact. |

Outflanked: a unit engaged with two or more enemy units, or Feinted, is Outflanked: −2 Defence. This is the numbers lever. Three level-3 units engaging one level-8 unit strike it at −2 and force a rout-check trigger every round they wound it.

Fatigue: a unit may Strike once per round from any source, including free Strikes from Brace and Withdraw. A single elite unit therefore cannot cut down every unit that touches it.

Circumstance bonuses do not stack: Brace, cover and fortification benefits use the highest.

## Tactical actions

The eleven `war-actions/tactical` abilities become battle actions, gated by the tactic the army has trained. The prose in `src/data/troopAbilities` stays authoritative for skirmish play; this table is the battle mapping.

| Ability | Battle action |
|---|---|
| cavalry-charge | 2 actions: Advance, then Strike at +2. Requires Pace and open ground. |
| reactive-attack | Reaction: Strike an enemy that Advances into your step. Uses the round's Strike. |
| raise-shields | Brace grants +3 instead of +2. |
| shield-block | Reaction, once per round: reduce one wound result by 1. |
| defend-allies | 1 action: an ally on your step is not Outflanked until your next activation. |
| feint | 1 action, engaged: Strike bonus vs target's Will DC. Success: target Outflanked until end of round. Critical failure: you are Outflanked. |
| dirty-fighting | Strike an Outflanked target; on success the target also gains shaken 1 unless it passes a DC 11 flat check. |
| demoralize | 1 action, target within close: d20 + level + Will modifier vs target's Will DC. Success shaken +1, critical +2, critical failure your own shaken +1. |
| covering-fire | Volley; on success the target takes −2 to Strike until its next activation. |
| false-retreat | Reaction when you Withdraw: the enemy that takes the free Strike becomes Outflanked until end of round. |
| battlefield-medicine | 2 actions, once per battle per target: remove 1 wound from an ally on your step. |

Passive tactics and doctrine auras that exist as PF2e rule elements (AC, saves, fear immunity) apply on their own because Strike, Volley and rout checks read the live actor. Tactics with no battle analogue stay skirmish-only.

## Terrain and fortifications

The battle inherits the defender's hex:

| Terrain | Effect |
|---|---|
| Forest, hills, settlement | Cover: defender +1 Defence against Volley |
| Swamp, forest | Rough: no Double Advance, no cavalry-charge |
| River crossing on the attacker's path | Attacker deploys at step 0 only; attacker units cannot Withdraw or Retreat while engaged |
| Mountains | Cover and rough |

Fortified hex or settlement: the `FortificationTier` AC and save benefits already sit on the defender's actor. In addition the defender holds Walls with wound boxes equal to tier + 1. While the Walls stand:

- attackers at step 5 count as engaged with step 6 but Strike at −2 (Assault);
- defenders at step 6 Strike attackers at step 5 normally and Volley at +1 in any band;
- siege engines may Bombard: a Volley against the Walls (Defence DC = 10 + tier + defender level) that wounds the Walls instead of a unit.

At 0 Wall wounds the Walls are breached and steps 5 and 6 behave normally. Walls repair through fortification maintenance, never in battle.

## Siege engines

An engine acts with its train army (`trainArmyId`) and shares its activation. Bombard or Volley spends one of the train army's two actions and uses the engine's launch DC − 10; it reaches extreme without penalty and cannot fire while the train army is engaged. Engines of a destroyed or routed army are captured by any enemy unit that ends the battle on their step, matching the existing rule that engines change hands.

## Unequal forces

Four levers scale a fight without points:

- Level. The DC and AC curves make a two-level gap noticeable and a five-level gap decisive.
- Numbers. Outflanked and repeated rout-check triggers let three lesser units grind down one greater unit, at the cost of wounds on two of them.
- Ground. Cover, rough, rivers and Walls favour the defender and let a small garrison be a real obstacle.
- Time. Six rounds and the half-side rout trigger reward a decisive attacker and punish a hesitant one.

A side whose total levels sit below half the enemy's should hold ground or refuse battle. The design does not try to make that fight even.

## The table

The GM owns every faction army and acts for them in initiative order. Each player owns the armies they lead (`ledBy`) and those delegated to them. A player without an army at the battle observes. With four players and a GM, a field battle is six to nine units and lasts four to five rounds.

Triggers: a battle begins when armies of hostile factions share a hex at the end of a Deploy Army action, or when an event names a defender. The moving side attacks. The battle resolves inside the Actions phase before the next kingdom action.

## Aftermath

Winner: units keep their wounds. The side rolls a Warfare check. Critical success: heal 1 wound on every damaged unit and gain 1 Fame. Success: heal 1 wound on one unit. Failure: nothing. Critical failure: shaken +1 on every unit.

Loser: units keep wounds and shaken. The side rolls a Defense check. Critical success: one destroyed unit survives at 3 wounds. Success: nothing. Failure: +1 Unrest. Critical failure: +1d4 Unrest.

Then the battle writes back:

- wounds → actor HP by the table above; Tend Wounded heals as today;
- shaken → `demoralized`, taking the higher value; the existing threshold of 3 disbands at upkeep unless the army is rallied or supported;
- destroyed units → disband; their engines are captured or destroyed;
- the loser's surviving units move one hex toward their nearest friendly settlement.

## Mapping from prior systems

| Kingmaker | This design |
|---|---|
| engaged / near / distant | engaged / close / long / extreme by step distance |
| HP 4–6, rout threshold | 4 wounds, rout checks on wounds |
| shaken, routed | shaken 0–3, routed at 3 |
| weary, mired | dropped; Weakened and terrain cover the cases |
| outflanked | kept |
| 3 war actions | 2 actions |
| 5 ranged Strikes | no ammunition |

| Dragon Rampant / OPR | Borrowed |
|---|---|
| Half-strength breakpoint | Weakened at 2 wounds |
| Courage worsens with losses | rout triggers on wounds and Broken |
| Melee never sticks | Strike is an exchange; position is separate |
| OPR Fatigue | one Strike per round including reactions |
| OPR Shaken as the one marker | shaken with one effect (`demoralized`) |
| Order failure ends the turn (DR) | not adopted; fixed initiative keeps every player active |

## Worked battle

Forest hex (cover, rough). Attacker: Heavy Cavalry (L7, AC 25, Strike +12, Will +14, Perception +14, Speed 40 → Pace) and Line Infantry (L6, AC 24, Strike +11, Volley +11 long, Will +13, Perception +13). Defender: Kobold Warriors (L3, AC 18, Strike +7, Volley +7 close, Will +9, Perception +9) and Troll Marauders (L8, AC 25, Strike +13, Will +11, Perception +15, Speed 30 → Pace). Level DCs: L3 18, L6 22, L7 23, L8 24.

Deployment: cavalry step 1, infantry step 0; kobolds step 5, trolls step 6.

Initiative: infantry 25, trolls 22, cavalry 19, kobolds 14.

**Round 1.** Infantry: kobolds are five steps away (extreme, beyond a long Salvo), so Advance, Advance → step 2. Trolls: Advance → step 5 beside the kobolds; Brace. Cavalry: rough blocks Double Advance; Advance → step 2; Brace. Kobolds: the infantry at distance 3 is beyond a close Salvo; Brace. No wounds, no checks.

**Round 2.** Infantry: Advance → step 3; kobolds now at long. Volley: +11 vs AC 18, cover +1 and Brace +2 do not stack → 20. Roll 13 = 24, success: kobolds 1 wound. Trolls: Advance → step 4; Brace. Cavalry: Advance → step 3; Brace. Kobolds: Advance → step 4 with the trolls; Brace. End of round: kobolds took a wound; rout DC 22 (infantry, L6, within close). Will +9, roll 10 = 19, failure: kobolds shaken 1.

**Round 3.** Infantry: Volley kobolds at close: +11 vs 20, roll 16 = 27, success: kobolds 2 wounds, Weakened. Brace. Trolls: Advance → step 3, engaging infantry and cavalry. Both are Braced and take free Strikes: infantry +11 vs 25, roll 15 = 26, trolls 1 wound; cavalry +12 vs 25, roll 9 = 21, miss. Trolls are engaged with two units: Outflanked. Trolls Strike cavalry: +13 vs 25 + 2 Brace = 27, roll 17 = 30, success: cavalry 1 wound. Trolls Brace. Cavalry: its free Strike spent the round's Strike; Brace, and the second action has no use. Kobolds: shaken 1 and Weakened; a Volley at the infantry would be +7 − 2 − 1 − 4 into the melee, pointless. Rally: Will +9 − 1 vs DC 22, roll 14 = 22, success: shaken 0. Brace. End of round: trolls took a wound, rout DC 23 (cavalry, L7); Will +11, roll 12 = 23, success. Cavalry took a wound, rout DC 24 (trolls, L8); Will +14, roll 5 = 19, failure: cavalry shaken 1.

**Round 4.** Infantry: Strike trolls: +11 vs 25 + 2 Brace − 2 Outflanked = 25, roll 14 = 25, success: trolls 2 wounds, Weakened. Brace. Trolls: Strike infantry: +13 − 2 vs 24 + 2 = 26, roll 18 = 29, success: infantry 1 wound. Brace. Cavalry: Strike trolls: +12 − 1 vs 25, roll 19 = 30, success: trolls 3 wounds, Broken. Brace. Kobolds: Volley the infantry in the melee: +7 − 2 − 4 = +1 vs 26; roll 20, natural 20 lifts a failure to a success: infantry 2 wounds, Weakened. Brace. End of round: trolls wounded and Broken, one check vs DC 23; Will +11, roll 3 = 14, failure: trolls shaken 1. Infantry wounded, DC 24; Will +13, roll 11 = 24, success.

**Round 5.** Infantry: Strike trolls: +11 − 2 vs 25 + 2 − 2 = 25, roll 17 = 26, success: trolls 4 wounds, destroyed. Brace. Trolls: gone. Cavalry: Advance → step 4, engaging the kobolds; their free Strike +7 − 2 vs 25, roll 11 = 16, miss. Strike kobolds: +12 − 1 vs 18 + 2 = 20, roll 10 = 21, success: kobolds 3 wounds, Broken. Kobolds: Broken, cannot Advance. Retreat: Withdraw from the engaged step draws no free Strike because the cavalry's Strike is spent; step 5, then step 6. End of round: kobolds wounded, Broken, and half their side is destroyed: one check. No enemy within close, so the DC is the highest enemy on the field, 23. Will +9, roll 9 = 18, failure: kobolds shaken 1.

**Round 6.** Kobolds Retreat past their edge and leave the field. The defender has no unit standing. Attacker wins in six rounds.

Aftermath: attacker Warfare check succeeds, cavalry heals to 0 wounds; infantry keeps 2 wounds (HP 48 of 96) and the cavalry keeps shaken 1 (`demoralized 1`). Trolls disband. Kobolds return to their settlement at 3 wounds, shaken 1, and the defender's Defense check fails: +1 Unrest.

What the transcript shows: volleys matter before contact; Brace is the default second action and free Strikes make it a threat; a lone elite unit is worn down by Outflanked and wound triggers; a Broken unit with nothing to gain retreats on its own.

## Standalone game

The rules ship as a standalone web game at `github.com/rune-goblin/battlefield`: a pure TypeScript engine with unit cards (level, type infantry or cavalry, optional Salvo reach, Pace and Fear) plus a Svelte hot-seat app; siege engines are a separate class that rides with a unit. Foundry, PF2e and Reignmaker adapters are deferred; the engine's `UnitCard` input and `BattleState` output are the seam.

## Open questions

- Whether Volley should be limited per battle to reward closing, as Kingmaker's five shots do.
- Whether a free Strike from Brace should spend the round's Strike; the transcript shows cavalry idling for it. The alternative is that free Strikes ignore Fatigue but never critical.
- Whether Pace should be a Speed threshold or a tag on the army type.
- Whether commanders, when added, grant a third action or a reaction per round.
- Whether a Broken unit that is the last on its side routs automatically at end of round.

## Playtest plan

Run three paper battles: the worked example above, an even three-versus-three at equal level, and a fortified level-4 garrison with Walls 3 against a level-8 attacker with a catapult. Each should finish within six rounds and produce a result a GM accepts as plausible. Every DC used must exist on a troop in `data/troops/`.

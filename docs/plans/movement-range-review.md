# Movement, terrain and range review

Date: 2026-09-16. Status: baseline analysis with implementation follow-up.

## Implementation follow-up

The default board now has radius 5: 91 hexes, files a–k, ranks 1–11, and a maximum distance of 10. Both sides keep three deployment ranks. The default forces start on ranks 3 and 9. The size selector retains the original 61-hex option; saved boards retain their actual size, deployment zones and retreat edges.

Reach now names preferred weapon distances: short 2 hexes, medium 3, long 4, extreme 5–7. A weapon may shoot one hex shorter or longer at −2. Anything more than one hex outside that interval is unavailable, regardless of height or commitment. Short allows 1–3, medium 2–4, long 3–5, and extreme 4–8. Engagement prevents shooting, so a short weapon can fire at distance 1 only across a wall or cliff that prevents contact. This replaces the one-category flex rule and preserves close-range weaknesses while narrowing long weapons' extended reach.

Spell ranges remain fixed ceilings: Blast 4, Controlling 3, buffs 2. Artillery uses its own preferred distances and emplacement position, including the minimum range and the −2 penalty on wall shots. Extreme artillery can now reach eight hexes at −2.

Across seeds 1–200, forest coverage averages 30.11 of 91 hexes (33.1%), and swamp coverage averages 23.18 (25.5%). Forest and swamp components contain at most four hexes, with open gaps between patches. Terrain prices and unit speeds remain unchanged. These measurements describe generated maps, not combat balance.

| Terrain | Current tactical effect |
|---|---|
| Higher ground | +1 circumstance to attacks against a lower unit; replaces uphill attack penalties and downhill range extension |
| Mountain, height 2 or higher | +1 circumstance Defence; blocks shooting and spells through intermediate hexes, while allowing targets in the mountain hex |
| Forest | +1 circumstance Defence against shooting and Blast for targets in or beyond trees; height does not bypass cover |
| Swamp | −1 circumstance Defence; replaces the former melee attack penalty |
| Shallows | Retains −1 melee attack and two-point movement |
| Bridge | One-point crossing, with no inherent cover |

Use the strongest circumstance bonus and worst circumstance penalty on a statistic. Mountain and forest defence do not add to Guard; swamp does not add to exposed or outflanked. The Charge and garrison accuracy bonuses do not add to high ground. Commitment and status effects remain separate. Forest screens do not change Will saves. Every hex in a Blast shape must have sight from the caster. Sight lines along an edge read both cells; a corner touch alone does not screen a shot. Flight changes movement, not visibility. Walls retain their existing garrison and movement rules.

The earlier changes also remain in force: wounds do not reduce performance; ordinary movement and Charges stop at first contact; critical Maneuvers stop at new enemy control; Maneuver checks terrain budgets; river connectivity warnings remain advisory; and the GM can paint bridges or shallows.

### Further playtest proposals

- Add a central objective or two flank objectives. These give defenders a reason to leave safe positions and make routes around mountains useful. Measure contact timing and objective access before increasing Speed.
- Evaluate extreme artillery’s new eight-hex shot at −2. If it dominates approaches, test a setup or reload cost. Retain mountain sight blocking until indirect fire has its own explicit rule.
- Consider a one-action prepared shot that triggers when an enemy enters sight. Limit it to the activation's single attack and show its threatened area, so it creates a choice between moving now and waiting to cover an approach.
- Keep forest as soft cover. Making it fully opaque would give the many forest patches the same role as mountains and could shut shooting out of too much of the board.
- Keep terrain modifiers at ±1 for this pass. Movement prices already make rough ground expensive; stronger modifiers could make good positions mandatory. Swamp's defensive penalty replaces its offensive penalty to avoid charging twice for poor footing.
- Consider directional cover from walls as a separate change. Current walls block movement and grant a garrison benefit, but allow intervening shots. A future wall rule should distinguish shooting through a wall from firing along or from its defended edge.

Validation covers both grid kinds, legacy save geometry, all four preferred range windows and their near/far penalties, mountain endpoints and intervening blockers, forest cover on Blast, circumstance stacking, and 200 seeds for each dense terrain type.

## Original baseline

The measurements and issue table below preserve the pre-change analysis. Rerunning the script measures the current engine. The range, board-size and density proposals above have now been implemented; the historical wording below describes the earlier build.

The current rules give shooting much more freedom than movement. Most units move one open hex per action, while every shooting profile can reach the whole board. Difficult terrain restricts movement further, often across most of a forest or swamp map. It provides little protection from shooting because intervening terrain does not block sight.

The board's geometry is internally consistent. The larger problems are unrestricted shooting, dense expensive terrain, coarse Speed conversion, and several implementation inconsistencies. Shortening the named range bands alone would leave whole-board shooting in place: they currently set penalties, not weapon range limits.

## Scope and method

The analysis imports the current engine and examines the 88 cards in `LIBRARY`: 38 Combatants, 39 Official troops and 11 prototype cards. This is the actual local selection, not the larger published catalogue mentioned in the rules. Card counts are unweighted; they do not predict the composition of a generated army.

The routing sample uses seeds 1–200 for each of eight board configurations: six base terrains without a feature, plains with a river, and plains with a lakeside. It covers 1,600 boards and 75,796 valid frontline deployment pairs. It measures the cheapest ground route from attacker rank 3 to a hex that engages a defender on rank 7. Water and barriers retain their engine behaviour. Lakeside water excludes some deployment positions.

Routes assume an otherwise empty board, a stationary target, ordinary ground movement and no buffs. These are optimistic approach costs. Other units, retreat, suppression, pins, attacks, healing and player choices can extend the approach. The sample is a reproducible spatial audit, not a simulation of battle winners or a proof of balance. Proposed settings require playtesting.

## Board geometry and deployment

The hexagon has radius 4, 61 cells and a maximum distance of 8. Hex distance uses cube coordinates and six neighbours; pathfinding uses those same neighbours. The geometry does not overcharge diagonal movement. See [grid.ts](../../src/engine/grid.ts) and [path.ts](../../src/engine/path.ts).

Each army normally deploys in its first three ranks, with 18 eligible cells on an empty board. Across all 324 opposing deployment pairs, distance ranges from 4 to 8, averages 6.11, and has median 6. Even the two foremost deployment ranks can be 8 apart at opposite flanks; 29 of their 49 pairs are distance 4. Ambush can deploy one rank further forward and is excluded from these figures.

The default setup uses attacker rank 2 and defender rank 7. The central opposing positions are five hexes apart. Infantry must cover four hexes to engage a stationary target. With one hex per action, a final Charge brings the first attack into the unit's second activation on open ground. This is reasonable room for an approach in a six-round battle, but expensive terrain can consume most of that battle.

The named bands cover large portions of this small board:

| Origin | Within 2 | Within 3 | Within 4 | Within 6 | Within 8 |
|---|---:|---:|---:|---:|---:|
| Centre, e5 | 18 | 36 | **60** | 60 | 60 |
| Front centre, e3 | 18 | 32 | 43 | **60** | 60 |
| Default infantry position, c2 | 13 | 22 | 33 | 51 | **60** |

Counts exclude the origin and include adjacent cells; they show geometric coverage, not legal shooting targets. Engagement prevents ordinary shooting at adjacent enemies across a traversable edge. From the centre, **medium range already covers every other hex**. Long and extreme add nothing there. Position still matters near an edge.

## Movement conversion and action costs

[cards.ts](../../src/engine/cards.ts), `squaresPerAction`, converts sheet Speed to `max(1, ceil(Speed / 30))` cells per action. Cards without a sheet use the Pace fallback.

| Unit | Sheet Speed | Open hexes per action |
|---|---:|---:|
| Line Infantry | 20 ft | 1 |
| Troll Marauders | 30 ft | 1 |
| Kobold Warriors | 25 ft | 1 |
| Apprentice Magician Clique | 25 ft | 1 |
| Mitflit Vermin Cavalry | 15 ft | 1 |
| Heavy Cavalry | 40 ft | 2 |

**68 of 88 cards (77%) move one hex per action; 20 move two.** None currently moves three. A 15-foot unit and a 30-foot unit receive the same movement. Crossing from 30 to 35 feet doubles it. Being cavalry does not guarantee two hexes when a sheet provides Speed.

The display also mixes two scales. A sheet Speed of 30 feet becomes one hex and then 10 internal movement feet. The Orders panel can therefore show “10 ft” for a troop whose sheet says “30 ft.” The rules describe an abstract hex while `CELL_FEET` describes it as ten feet. These internal feet are accounting units, not a consistent physical battlefield scale. Show **“1 hex per Move”** and terrain costs in movement points to make the conversion explicit.

One source record, the flying Shadow Host, has ground Speed 0 and becomes one hex per action through the minimum. The imported sheet stores a flight flag but no separate flight speed. That needs an explicit adapter policy rather than an assumption that zero means an immobile flying unit.

## Terrain prices

The engine charges for the destination cell and adds uphill cost. Downhill movement has no surcharge. [path.ts](../../src/engine/path.ts), `stepFeet`, is the authoritative implementation.

| Terrain or edge | Movement points | Actions at Speed 1 | Actions at Speed 2 | Other effect |
|---|---:|---:|---:|---|
| Open | 1 | 1 | 1, with 1 point left | None |
| Settlement | 1 | 1 | 1, with 1 point left | Road; no inherent cover |
| Forest | 2 | 2 | 1 | +1 Defence against shooting, unless shooter is higher |
| Shallows | 2 | 2 | 1 | −1 melee attack from that cell |
| Swamp | 3 | **3** | 2, with 1 point left | −1 melee attack from that cell |
| Climb one level | +1 | +1 point of cost | Pools with other costs | Uphill attacks also suffer a penalty |
| Water | Blocked | — | — | Shooting crosses it |
| Standing wall or two-level cliff | Blocked | — | — | Prevents engagement across that edge |

Action prices assume an empty movement bank. Movement normally pools within an activation. A native flier pays one point per hex and crosses water, walls and cliffs. Sure footing removes rough-ground and climbing costs but preserves water and barrier restrictions.

Three consequences deserve attention:

1. **One swamp hex consumes a slow unit's entire activation.** It cannot also attack, Guard or Rally that turn.
2. **An uphill swamp step costs four points.** A Speed-1 unit has only three points in an ordinary activation, so that edge is effectively impassable without assistance. It cannot save movement across rounds to pay four later.
3. **A Speed-1 Charge cannot enter even one forest, shallow or swamp hex.** Charge has a separate one-Speed movement budget. Extra commitment improves the attack, not the run. A slow unit can instead Move into contact and Fight later. Faster units can Charge through affordable difficult ground but lose the +2 attack bonus unless a clean route exists. The charger remains exposed at −2 Defence.

Forest therefore doubles the approach cost while granting only +1 cover at the endpoint. Intervening trees provide no sight screening. Swamp triples the approach cost and also penalises the melee attack. These effects favour a stationary shooting position and heavily reward flight.

## Generated terrain and approach time

The generators create many large rough patches. Forest boards average **68.2% forest plus 5.9% swamp**; swamp boards average **67.2% swamp plus 14.4% forest**. These are broad movement taxes, not occasional obstacles.

| Configuration | Median approach cost | 90th percentile cost | Mean destinations in a Speed-1 full movement turn | Mean destinations with twice that budget |
|---|---:|---:|---:|---:|
| Plains | 3 | 6 | 23.8 | 53.3 |
| Forest | 6 | 9 | 10.0 | 29.4 |
| Hills | 4 | 6 | 21.3 | 48.7 |
| Mountains | 5 | 7 | 17.5 | 41.9 |
| Swamp | **9** | **14** | **6.5** | 17.4 |
| Desert | 4 | 6 | 23.0 | 51.2 |
| Plains + river | **7** | **11** | 15.5 | 29.6 |
| Plains + lakeside | 4 | 6 | 19.6 | 43.2 |

Approach cost is in open-hex movement points, measured to legal contact, before any separate attack. It equals the pure movement action cost at Speed 1. River statistics exclude unreachable pairs from the quantiles. Reachable-destination counts exclude the start cell and average over valid attacker frontline cells.

At 34.8% of forest frontline starts and 51.4% of swamp starts, a Speed-1 unit cannot reach **any** other cell with one action. It can often move by spending two or three actions at once. This explains why the first movement band can appear empty even though the unit is mobile.

Uniform terrain makes the timing easier to see. The following approaches start at distance 5, matching central default deployment. They use an unobstructed shortest route, a stationary target, all available actions and a basic Charge when affordable:

| Ground throughout approach | Speed 1: first attack | Speed 2: first attack |
|---|---|---|
| Open | 4 actions; own activation 2 | 2 actions; own activation 1 |
| Forest | 9 movement/attack actions across **4 own activations** | 4 actions; own activation 2 |
| Swamp | **13 actions; own activation 5** | 7 actions; own activation 3 |

A Speed-1 unit can enter only one forest hex per activation: the two-action step leaves one action, which cannot buy the next two-action step or carry over. Four forest hexes therefore require four activations even though their nominal movement bill is eight actions. The unit can use the spare actions for other activities.

The six-round limit makes the forest and swamp cases severe. These times assume survival and no diversion of actions to recovery. They do not prescribe an exact number of enemy volleys: initiative, activation order, retreat and the number of shooters matter.

## Shooting reach and action efficiency

The current bands are short ≤2, medium ≤4, long ≤6 and extreme ≤8. They define the weapon's **unpenalised** range. Every ordinary ranged troop can target any non-engaged enemy anywhere on the board. Each extra band costs −2. The local library contains 31 short, 23 medium and two long profiles; 32 cards have no ordinary volley, although some can cast.

There is no line-of-sight or intervening-obstacle check in shooting target selection or resolution. The audit places a two-level forest ridge across rank 5, with Line Infantry at e3 and e7. The engine offers Fire at +11 against Defence 24, with no intervening-ridge penalty. Target elevation and target forest cover matter; the intervening ridge does not. This conflicts with the natural reading of the rules' “target you can see.” See [battle.ts](../../src/engine/battle.ts), `targetsFor`, `shotRank`, `shootModifier` and `defenceOf`.

Extra commitment makes distance penalties less effective. A stationary shooter can buy +4 with its other two actions. That cancels two bands of range penalty.

At a representative +11 Volley against Defence 24, with no wounds, disorder, cover, height or buffs:

| Weapon / target distance | Fire, one action | Fire with +4, three actions |
|---|---:|---:|
| Short / 5 hexes | 20% hit or crit | **40%** |
| Medium / 5 hexes | 30% | **50%** |
| Medium / 8 hexes | 20% | **40%** |
| Long / 8 hexes | 30% | **50%** |

For comparison, an unpenalised one-action shot hits or crits 40% of the time. Medium-reach fire at the opposite edge, with full commitment, is therefore as accurate as an ordinary unpenalised shot. These probabilities enumerate all 20 dice, including natural-1/20 degree shifts. They describe one attack, not its later morale effects or an entire battle.

The one-attack limit prevents three volleys per activation, but spare actions still fund commitment, Guard, Rally or retreat. A Speed-1 shooter can Fire and retreat two open hexes; a Speed-1 pursuer moving all three actions gains only one hex of distance that activation. A Speed-2 shooter can retreat four after firing, outrunning the slow pursuer until terrain, another unit or the board edge intervenes.

Height further rewards a firing position: shooting down counts one band closer and ignores target forest cover. These advantages stack spatially with the cost an approaching unit pays to climb.

## Implementation issues to resolve before balancing

The audit reproduces these behaviours without changing the engine:

| Issue | Reproduction | Consequence |
|---|---|---|
| River can sever all ground approaches | Plains + river, seeds **88, 139, 149, 193**: all 49 frontline pairs are disconnected in each case | 4 of 200 sampled rivers have no usable ground crossing. Placing a ford does not guarantee a connected crossing |
| Long Move passes through contact | Speed-2 unit c1, enemy e1, Move to g1: c1 → d1 → d2 → e2 → f2 → g1 | A single Move enters and leaves contact. Stopping at d1 first engages the unit and blocks further ordinary Moves |
| Final-action movement discards spare distance | Speed-2 unit c2 uses two actions to Dig in, then Moves to d2 | Its last action could reach e2 directly, but the shorter Move ends activation and clears the remaining point. Small drags can lose distance |
| Displayed Reach differs from shot calculation after wounds | Line Infantry with two wounds | `reachOf` displays short; `shootHome` still uses medium. Shooting applies the −2 weakened attack penalty but does not shorten the effective band |

The sight rule also needs a definite policy: implement intervening terrain visibility, or explicitly state that all battlefield positions remain visible. The current wording promises more than target selection enforces.

The contact and bank examples are interface-dependent inconsistencies, not evidence that all movement is too slow. Fixing them will make distance depend on the intended route rather than how the player divides clicks. Ordinary movement should have an explicit policy for stopping when it first enters enemy contact, consistent with Charge's interception rule.

## Recommended experiments

### Range and terrain prototype

Keep the 61-hex board as the comparison baseline. Following the board-size discussion below, the preferred larger prototype has 91 hexes and retains current movement speeds initially. Give weapon Reach an actual target-distance ceiling and test these limits:

| Reach | Current free range / maximum | Proposed maximum |
|---|---|---:|
| Short | 2 / 8 | 2 |
| Medium | 4 / 8 | 3 |
| Long | 6 / 8 | 4 |
| Extreme | 8 / 8 | 6 |
| Designated siege range | Engine-dependent / 8 | 8, explicitly |

The proposed ordinary bands use hard limits. Remove the current unlimited over-range permission in this experiment. If extended shots remain desirable, test a separate, explicit one-band extension later rather than leaving every profile able to reach every cell.

These ceilings make repositioning necessary. No ordinary medium profile can shoot across the initial deployment gap; a long profile can cover the nearest opposing frontline positions. At the centre, long still covers the entire board because every cell lies within four: reaching and holding the centre becomes a spatial advantage. A centre-positioned medium profile covers 36 of the other 60 cells geometrically, down from 60.

The same band constants also control spells: Blast currently reaches six hexes and Controlling four. The prototype would give them four and three. Short-range buffs and the short-range search for Rally's DC remain at two. Audit target shapes, UI labels and the rules diagram when changing these shared constants. Weapon ceilings also need an explicit rule for height; a downhill bonus should not silently override a hard distance limit.

Keep the **1 / 2 / 3** terrain prices initially, but reduce continuous rough coverage and guarantee useful ground corridors. A first generator target could be 30–40% forest on forest maps and 20–30% swamp on swamp maps, with open or shallows routes between deployment zones. Those percentages are trial settings, not validated balance targets. Check connectivity after generation, ensure every legal ground deployment has an escape route, and evaluate corridors using a Speed-1 unit's actual per-activation budget. A graph that is technically connected can still require an unaffordable four-point step.

This experiment addresses whole-board shooting and the terrain tax while preserving open-ground pacing. It should establish whether the current slow movement remains a problem once armies can approach without taking distant fire through all intervening terrain.

### Faster movement comparison

Then compare a variant with **two hexes per Move for ordinary units and three for fast units**. It gives ordinary troops one-action forest movement and two-action swamp movement. Preserve a clear source-Speed policy and handle zero-Speed/flight data explicitly.

This has a large interaction with the current one-action Charge. Two Moves plus Charge threaten a stationary enemy at up to **distance 7** for Speed 2, or distance 10 for Speed 3 on an unbounded open field. The current board caps distance at 8. Ordinary troops could reach most opponents in one activation; fast troops could reach the whole field before obstacles and interception. Those are conditional threat distances, not guaranteed legal attacks.

Faster movement therefore needs its own Charge assessment. A two-action basic Charge would reduce that threat, but adding a movement surcharge to every existing Charge activity would make the three-action Overrun cost four. Preserve a coherent activity ladder if that route is chosen. Enlarging the board would also create room, but it changes deployment, range and the six-round time limit together and is a larger experiment.

I would first test the range-and-terrain prototype on the current and 91-hex boards, then add faster movement as a separate comparison. On the current board, open-ground Speed 1 already reaches an aligned forward-deployed opponent in one activation with Move, Move, Charge. The strongest evidence of excessive delay comes from dense rough terrain and restricted approaches.

### Board-size comparison

The user proposed adding space alongside range limits and terrain changes. **One additional ring, from radius 4 to radius 5, is the preferred first larger prototype.** It adds 49% more cells while increasing the maximum end-to-end distance by two hexes. Two additional rings more than double the area and stretch the approach further.

| Measure | Current | One extra ring | Two extra rings |
|---|---:|---:|---:|
| Radius | 4 | **5** | 6 |
| Cells | 61 | **91** | 127 |
| Widest row | 9 | 11 | 13 |
| Maximum distance | 8 | 10 | 12 |
| Cells per deployment zone, three ranks deep | 18 | 21 | 24 |
| Nearest opposing frontline distance | 4 | **6** | 8 |
| Mean distance across all opposing deployment pairs | 6.11 | 8.05 | 10.02 |
| Earliest slow-unit attack from aligned fronts, open ground | Own activation 1 | **Own activation 2** | Own activation 3 |

The last row assumes a stationary opponent, three actions per activation and the current one-Speed Charge. Both armies advancing can meet sooner. The means treat every deployment pair equally; intentional forward placement produces shorter approaches. These are exact geometry calculations, not generated-map or combat simulations for larger boards.

The proposed ranges become more distinct on 91 hexes. From the centre, short reaches 18 of the other 90 cells (20%); medium reaches 36 (40%); long reaches 60 (67%). On 61 hexes those same proposed ceilings cover 30%, 60% and 100%. An outer ring on the larger board therefore lies beyond a central long-range shooter and creates room to reposition around its reach. Extreme range six still covers the whole board from the centre; an explicit siege range eight does not span the maximum ten-hex separation between edges.

Use the larger prototype with the following constraints:

- Keep the proposed range limits at 2 / 3 / 4 / 6, with designated siege range 8. Scaling range up with board size would undo the added separation.
- Keep three deployment ranks, and place the default forces near their fronts: attacker rank 3 and defender rank 9 on the eleven-rank board. The nearest gap is then six. Back-rank deployment remains a deliberate choice rather than the default walk to combat.
- Keep the current unit counts for comparison. More units would consume the new room and confound the spacing experiment.
- Retain the six-round limit initially, with a target of contact in activation 2 on ordinary maps and 3 through meaningful terrain. Reassess after playtests, especially for rear deployments and rivers.
- Apply explicit terrain-density targets and connected ground corridors. The old fixed patch counts will cover a smaller percentage of a larger board; do not accidentally restore the current dense rough coverage by scaling them proportionally.
- Preserve a useful camera zoom. Fitting eleven rather than nine hexes across the same viewport makes units roughly 18% smaller; pan and zoom should retain readable status bars.

The larger board creates room for flanks and makes range positioning matter. It also increases walking time, makes a routed unit's retreat longer, and gives a retreating shooter more space. Range ceilings and passable approaches therefore belong in the same prototype. A larger board alone would amplify several existing problems.

Implementation needs a board-dimension audit rather than a single constant change. The engine currently fixes `SIZE`, `FILES` and `RADIUS`, and rendering assumes the widest row has an even offset. An eleven-rank board puts that row at odd rank parity, so horizontal bounds and centring need verification. Also check deployment presets, terrain generation, home edges, range ceilings, coordinate labels, saved boards and rules diagrams. Keep the existing board size available for a controlled comparison.

### Evaluation measures

Use matched forces and identical board seeds across variants. Include short-range troops, melee-only troops, cavalry, casters, flyers and a fortified river crossing. Record:

- Own activation of first melee attack and number of enemy attacks before it.
- Share of an activation spent moving, recovering and attacking.
- Turns with no legal one-action movement, and unreachable ground objectives.
- Frequency of first-activation Charges and attacks from original deployment positions.
- Damage and disorder before contact, plus outcomes for both first-acting sides.
- Value of forest cover, high ground, flanking and firing-position changes.

A useful starting design target is contact in activation 2 on ordinary maps, with meaningful terrain occasionally extending it to activation 3. A non-siege force should usually reposition to fire across the field. These are proposed pacing goals; the current measurement does not establish a balanced win rate.

## Reproduction

```sh
npx tsc -p tsconfig.engine.json --noEmit false --outDir /private/tmp/battlefield-spatial-engine
node scripts/analyze-spatial.mjs /private/tmp/battlefield-spatial-engine 200 > /private/tmp/battlefield-spatial-analysis.json
```

[analyze-spatial.mjs](../../scripts/analyze-spatial.mjs) produces card distributions, geometry counts, generated-map route statistics, uniform-ground approach bounds, exact shooting probabilities and the behavioural reproductions above. Pure movement action counts are budget lower bounds; they omit the attack and can omit bank loss across activation boundaries. Uniform-ground activation counts account for whole-cell movement and the final attack: each prior movement turn can cover `floor(3 × Speed / terrain cost)` cells, and the attack turn can cover `floor(2 × Speed / terrain cost)` plus a Charge run of `floor(Speed / terrain cost)` cells. The script reports action-budget lower bounds separately from those activation counts.

The principal sources are [cards.ts](../../src/engine/cards.ts), [grid.ts](../../src/engine/grid.ts), [path.ts](../../src/engine/path.ts), [board.ts](../../src/engine/board.ts), [battle.ts](../../src/engine/battle.ts), [types.ts](../../src/engine/types.ts), [magic.ts](../../src/engine/magic.ts), [default setup](../../src/app/game.svelte.ts), and [the player rules](../../public/rules.html). The original analysis left the implementation unchanged. The implementation follow-up at the start of this document records the subsequent changes; rerunning the script measures the current engine.

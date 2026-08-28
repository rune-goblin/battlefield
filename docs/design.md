# Strategic Battle System

## Purpose

Armies in Reignmaker are troop NPC actors with kingdom-level `Army` records, but nothing resolves army-versus-army conflict. Events apply conditions to a random army, the only army-destruction path is upkeep morale, and the war-action data is display-only. The skirmish rules (5-ft grid, five actions, segments; see `siege-engines-in-skirmishes.md` §1) suit heroic encounters and fail a GM running three faction armies against four players' armies in one sitting.

This design defines an abstracted battle mini-game that resolves a field battle in under thirty minutes, gives every player a unit to command and a real choice each round, handles unequal forces without a points system, and reuses the numbers the troop actors already carry.

Scope of this version: units only. Commanders and PC heroes are deferred; the action economy leaves room for them (see Open questions).

References: Kingmaker war rules (Archives of Nethys: War Actions, War Encounters, Army Conditions, Victory or Defeat), *Dragon Rampant* (Mersey, 2015), *One Page Rules: Fantasy* v3.5.1.

## Design principles

1. One dice idiom: d20 + modifier vs DC, four degrees. Every roll is a PF2e check, so it posts as a chat card and level scaling comes free.
2. One square of position, one number of damage, one of morale per unit. Nothing pairwise.
3. Melee does not lock. A Strike is an exchange; position changes only by choice.
7. The PF2e action economy: three actions and one reaction per activation, with the multiple attack penalty. Players already know it.
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
| Pace | Speed sets squares per Advance: 30 ft and under one, 60 ft two, 90 ft three. Flight is not distance — it only ignores terrain | 20 ft → one square |
| Level | rout DC for enemies | 6 |
| Wounds | derived from HP (below) | 0 |
| Shaken | the `demoralized` counter effect | 0 |

The imported troop keeps its sheet: `UnitCard.sheet` carries AC, HP, Battle DC, Salvo DC and range in feet, all three saves, Perception and Speed as written on the actor. The battle stats are derived from it, never edited by hand, and the unit row shows both: the sheet line as the source, and the battle line with each number's derivation (`derivation(card)`), so a GM can see that Strike +11 is Battle DC 21 − 10 and that Speed 20 ft advances one square. Thirty feet of Speed is a square: a troop is a formation, not one creature. Generic roster cards have no sheet and derive from the level table instead; the row says so.

Troops without a `[Salvo]` item cannot Volley. A siege engine's Volley bonus is `getSiegeLaunchDc(...) − 10`, and it always reaches extreme.

## The battlefield

A hexagon of hexes: nine files a to i and nine ranks 1 to 9, rows of 5·6·7·8·9·8·7·6·5, sixty-one cells in all. Rank 1 is the attacker's edge and rank 9 the defender's, and both are the narrowest rows — the line widens as it advances and funnels again at the objective. Each cell holds at most one unit. Units step to any of the six neighbours per Advance; distance between two units is the count of steps from one to the other.

| Distance | Band | Strike | Volley |
|---|---|---|---|
| 1 | engaged | yes | no |
| 2 | close | no | any Salvo |
| 3 | long | no | Salvo band long or extreme |
| 4+ | extreme | no | Salvo band extreme, or siege engines; −2 |

Two units are engaged when they occupy orthogonally adjacent squares with no barrier on the edge between them. Diagonal neighbours are at distance 2 and never engaged.

Deployment: attacker anywhere on ranks 1–3, defender anywhere on ranks 7–9, never on water. Three empty ranks lie between the lines, so a unit on the front rank reaches contact in its first activation and a unit held back on rank 1 takes two; the depth of the deployment is the first decision. Ambush tactics (the `Vigilance & Pursuit` family) may deploy one rank further in.

The board is the geometry the rest hangs on. Squares carry terrain and elevation; edges carry barriers. Eight files give room for a refused flank, a reserve rank and a walled corner; three ranks of deployment a side give both players a front line and a reserve.

The board can also generate as an 8×8 hex grid (pointy-top, odd-r) instead of square, chosen alongside the hex terrain; rank stays row, so deployment still reads ranks 1–3 and 6–8. Read "orthogonal" above as "adjacent" on hex — hexes have no diagonal, so the diagonal-neighbours-at-distance-2 clause is square-only, and Pace's second square continues the same cube direction rather than reflecting through a corner. Distance, engagement, outflanking, walls and cliffs all resolve through the same `Grid` interface unchanged, but hex geometry itself is more permissive than square: 18 cells sit within distance 2 of a given cell against square's 12, so Volley and Demoralize bands reach further across a hex board in practice; the two front deployment rows interlock at more points, widening the opening clash; and an unengaged Withdraw offers two homeward cells instead of one. These are properties of the grid, not rule changes made to fix them — whether the numeric bands above should move for hex play is a playtesting question, open in `docs/plans/pixi-board.todos.md`.

## Setting up a battle

Five stages, in order, each on its own screen:

1. **Generate the battlefield.** Pick the hex terrain, a feature and a construction, roll or type a seed, and reroll until the board looks like the hex. See Generating the board.
2. **Paint.** The GM adjusts the generated board by hand: terrain on any square, elevation 0–2, a wall on any edge, or clears a square. This is where a specific hazard from the adventure goes: the bridge, the burning barn, the ravine.
3. **The attacking force.** Build the attacker from the library, the generator or a custom card, give it siege engines, and put every piece on a square in ranks 1–3. One side at a time: the screen shows only the attacker's roster, and the board lights only the attacker's deployment ranks.
4. **The defending force.** The same screen for the defender, on ranks 7–9, with the attacker's pieces already on the board to answer.
5. **Begin the battle.** Initiative is rolled and the first unit activates.

Each side needs at least one unit, and every unit and emplaced engine needs a square, before the stage will advance.

A river always runs on ranks 4–5, so it never eats a deployment rank; the generator keeps every deployment rank at least half passable.

## Wounds

Every unit has 0–4 wounds. Wounds replace hit points for the battle and map onto the PF2e troop thresholds:

| Wounds | HP written back | Segments | Effect |
|---|---|---|---|
| 0 | max | 4 | — |
| 1 | ⌊¾ max⌋ | 3 | — |
| 2 | ⌊½ max⌋ | 2 | Weakened: −2 to Strike and Volley; Volley band shrinks one band |
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

A round is one hour of battle. Initiative is rolled once per battle: each unit rolls Perception, and units act in that order every round. On its activation a unit takes three actions, then the next unit acts. Each unit also has one reaction per round, refreshed at the start of its activation. At end of round: rout checks, then the battle checks for an end.

Three actions and a reaction is the PF2e economy, so the players bring their habits to the table: "Advance, Advance, Strike", "Volley, Volley, Brace", "Rally, Withdraw". The multiple attack penalty makes the third Strike a gamble rather than a routine, which keeps the third action a decision.

The battle ends when one side has no unit that is neither destroyed nor routed, or at the end of round six (dusk): both sides withdraw to their edges and the hex stays contested.

## Actions

| Action | Cost | Effect |
|---|---|---|
| Advance | 1 | Not while engaged. Move as many squares as the unit's Speed buys — one at 30 ft and under, two at 60, three at 90. Movement pools across the activation, so a Pace unit's spare square carries to its next action. Cannot cross a barrier, enter water, or enter an occupied square. Ending adjacent to an enemy engages it. |
| Withdraw | 1 | Move one square orthogonally away from every engaged enemy. If engaged when you start, the cost is 2 and each engaged enemy may spend its reaction on a free Strike (success = 1 wound, no critical). |
| Strike | 1 | Engaged only. d20 + Strike bonus vs the target's Defence DC. Critical 2 wounds, success 1, critical failure: you are Exposed (−2 Defence until your next activation). Takes the multiple attack penalty. |
| Volley | 1 | Not engaged; target within your Volley band. Firing at a target engaged with an ally is −4. d20 + Volley bonus vs Defence DC; extreme −2. Critical 2 wounds, success 1. Takes the multiple attack penalty. |
| Brace | 1 | +2 circumstance Defence until your next activation. A Braced unit may spend its reaction on a free Strike (success = 1 wound) at an enemy that Advances into an adjacent square. |
| Rally | 1 | Will save vs rout DC. Critical: shaken −2. Success: −1. Critical failure: +1. |
| Retreat | 2 | Withdraw twice; the second square draws no free Strikes. A unit that Retreats past its own edge leaves the battle intact. |

Multiple attack penalty: the second Strike or Volley in an activation is at −5, the third at −10. Free Strikes from reactions ignore the penalty and never critical.

Reactions: Brace's free Strike, the free Strike against a Withdrawing enemy, and the reaction tactics below all spend the unit's one reaction. A single elite unit therefore cannot cut down every unit that touches it.

Outflanked: a unit engaged with two or more enemy units, or Feinted, is Outflanked: −2 Defence. This is the numbers lever. Three level-3 units engaging one level-8 unit from three sides strike it at −2 and force a rout-check trigger every round they wound it.

Circumstance bonuses do not stack: Brace, cover and fortification benefits use the highest.

## Tactical actions

The eleven `war-actions/tactical` abilities become battle actions, gated by the tactic the army has trained. The prose in `src/data/troopAbilities` stays authoritative for skirmish play; this table is the battle mapping.

| Ability | Battle action |
|---|---|
| cavalry-charge | 2 actions: Advance, then Strike at +2, +3 if downhill. Requires Pace; the squares entered must be open or settlement and not uphill. |
| reactive-attack | Reaction: free Strike at an enemy that Advances into an adjacent square, without Bracing. |
| raise-shields | Brace grants +3 instead of +2. |
| shield-block | Reaction, once per round: reduce one wound result by 1. |
| defend-allies | 1 action: an adjacent ally is not Outflanked until your next activation. |
| feint | 1 action, engaged: Strike bonus vs target's Will DC. Success: target Outflanked until end of round. Critical failure: you are Outflanked. |
| dirty-fighting | Strike an Outflanked target; on success the target also gains shaken 1 unless it passes a DC 11 flat check. |
| demoralize | 1 action, target within close: d20 + level + Will modifier vs target's Will DC. Success shaken +1, critical +2, critical failure your own shaken +1. |
| covering-fire | Volley; on success the target takes −2 to Strike until its next activation. |
| false-retreat | Reaction when you Withdraw: the enemy that takes the free Strike becomes Outflanked until end of round. |
| battlefield-medicine | 2 actions, once per battle per target: remove 1 wound from an adjacent ally. |

Passive tactics and doctrine auras that exist as PF2e rule elements (AC, saves, fear immunity) apply on their own because Strike, Volley and rout checks read the live actor. Tactics with no battle analogue stay skirmish-only.

## Terrain, elevation and barriers

Three layers, each with one job: terrain on squares changes checks, elevation on squares changes who has the advantage, barriers on edges change where units can go.

### Terrain

A square is one of five types. Open is the default and does nothing.

| Type | Effect |
|---|---|
| Open | — |
| Forest | Difficult (a flier is over it, as it is over all of these — that is all flight does): entering costs two squares' worth of movement, so a troop spends two actions and a Pace unit one — which is what cancels Pace. Cover: the occupant has +1 Defence against Volley. Blocks cavalry-charge. |
| Swamp | Very difficult: entering costs three squares' worth, so a troop spends three actions and a Pace unit two. Pace and cavalry-charge never apply. A unit in swamp Strikes at −1. |
| Shallows | A ford or marsh edge: difficult as forest, and a unit in shallows cannot Withdraw or Retreat while engaged. |
| Water | Impassable. No unit enters; Volleys cross it. |

Settlement squares count as forest for cover and as open for movement.

### Elevation

Every square has an elevation of 0, 1 or 2. The effects read the difference between attacker's and target's squares:

- Striking uphill: −1 to Strike per level of difference.
- Volley downhill: the target's cover does not apply and the Volley reaches one band further; Volley uphill: −1 per level.
- Advancing uphill: a square's worth more per level climbed, so a troop spends two actions to climb one square. That is what cancels Pace, and it blocks cavalry-charge.
- Rout DC: a unit on higher ground than every engaged enemy treats the DC as 2 lower, matching the fortification bonus. The two do not stack.
- An edge with a difference of 2 is a cliff (see barriers).

### Barriers

A barrier sits on the edge between two squares. Terrain fills a square; a barrier is a line a unit must get over. Units on either side of a barrier are not engaged across it and may not Advance, Withdraw or Retreat across it unless the barrier says so.

| Barrier | Cross | Engaged across | Fire across |
|---|---|---|---|
| Wall (tier 0–3) | No, until breached | Yes: attacker Strikes at −2 (Assault); defender Strikes normally and Volleys at +1 in any band | Yes |
| Cliff (elevation difference of 2) | No | No | The upper side Volleys at +1; the lower side cannot Volley the upper |

Walls have wound boxes equal to tier + 1. Siege engines may Bombard: a Volley against the segment (Defence DC = 10 + tier + defender level) that wounds the segment instead of a unit. At 0 wounds the segment is breached and removed. Walls repair through fortification maintenance, never in battle. A tier-0 wall is a palisade or hedge with a single box: one hit from any engine breaches it.

### Generating the board

The board is generated, not drawn. The GM picks the Reignmaker hex terrain from a dropdown, adds a feature and a construction if the hex has one, and rolls a seed; the generator lays the board and the seed reproduces it. Hex types are tendencies, not exclusions: a plains board can carry a copse, a hills board a marsh, but never many. `src/engine/board.ts` holds the generator; `generateBoard({ base, feature, construction, seed })` returns the squares, elevations and walls.

Layers go down in order: ridge, feature, construction, then patches, so the dramatic thing is always there and the patches fill in around it.

| Base | Ridge | Forest patches | Swamp patches | Water patches | Patch size |
|---|---|---|---|---|---|
| Plains | — | 0–2 | 0–1 | 0–1 | 1–3 |
| Forest | — | 8–11 | 0–2 | 0–1 | 3–6 |
| Hills | one, elevation 1 | 1–3 | 0–1 | 0–1 | 1–3 |
| Mountains | one, with 1–2 peaks at 2 | 4–7 | 0 | 0–1 | 2–4 |
| Swamp | — | 1–3 | 8–12 | 1–3 | 3–6 |
| Desert | one, elevation 1 | 0 | 0 | 0–1 | 1–2 |

A patch is a seed square grown by random neighbour steps, so trees come as copses and marsh as pools rather than as scattered squares. A ridge is a connected line of five to eight squares that runs across the board on ranks 3–6, wandering by one rank; peaks on a mountain ridge create cliffs against their level neighbours.

Features are the dramatic types the base cannot be trusted to produce:

| Feature | Layout |
|---|---|
| River | A line of water across every file on ranks 4–5, wandering between them, with one or two shallows on straight stretches. The attacker must cross it. |
| Lakeside | A block of 8–12 water squares against the a or h file, with one to three shallows on its shore. One flank is closed. |

Constructions place settlement squares and walls. A fort of tier N is a block against the defender's edge, two by one at tier 0 and up to three by two at tier 3, walled on its front and flanks with the 4 + N segments the tier allows; a short budget leaves a gate open on one flank. Water patches never land on the deployment ranks, so both sides can always deploy.

Each type has one job: forest hides, swamp slows, water blocks, height commands, walls hold.

## Siege engines

An engine is deployed one of two ways, and the choice is the whole difference between them.

**Attached.** The engine rides with one unit, shares that unit's square and activation, and is lost only when the unit is: a destroyed or routed crew abandons it where it falls, and an enemy that ends the battle in or beside that square takes it.

**Emplaced.** The engine is deployed on a square of its own, in its side's deployment ranks, and never moves again. It is worked by whichever friendly unit is standing in or beside its square — no action crews it, and no unit owns it. With no friendly beside it the engine is abandoned, and at the end of that round any enemy standing in or beside it takes the piece, which the captor's units then work exactly as the old owner did. A friendly still standing by holds it however outnumbered: an emplacement is taken by standing on it, not by winning a fight over it. Being fixed, an emplaced ram can only ever batter a wall on an edge of the square it was deployed in, so a ram is normally attached.

Either way the engine fires on its crew's activation and spends one of that unit's three actions. Bombard or Volley uses the engine's launch DC − 10; artillery reaches extreme without penalty and cannot fire while its crew is engaged. A ram only Bombards, only a wall segment on an edge of its own square, and at +2. An engine fires once a round whoever works it: where two friendly units both stand beside an emplacement, the crew is the first in deployment order.

## Unequal forces

Four levers scale a fight without points:

- Level. The DC and AC curves make a two-level gap noticeable and a five-level gap decisive.
- Numbers. Outflanked and repeated rout-check triggers let three lesser units grind down one greater unit, at the cost of wounds on two of them.
- Ground. Forest, high ground, shallows and walls favour the defender and let a small garrison be a real obstacle. The board adds the flank: numbers only pay off when they reach a second side, and a ridge or river decides where the second side is.
- Time. Six rounds and the half-side rout trigger reward a decisive attacker and punish a hesitant one.

A side whose total levels sit below half the enemy's should hold ground or refuse battle. The design does not try to make that fight even.

## The table

The GM owns every faction army and acts for them in initiative order. Each player owns the armies they lead (`ledBy`) and those delegated to them.

Every player commands at least one unit. When the players' side brings fewer armies than players, armies split before deployment: one troop actor becomes two or more units of the same card, each with its own square, wounds and shaken. A split is a choice the side makes, and the halves are full units; the counterweight is that each half is a separate target for Outflanked and rout triggers, and a player who commands one may lose it. At aftermath the halves rejoin: wounds take the average rounded up, shaken takes the higher. The GM may also hand an allied faction's unit to a player for the battle.

With four players and a GM, a field battle is six to nine units and lasts three to five rounds.

Triggers: a battle begins when armies of hostile factions share a hex at the end of a Deploy Army action, or when an event names a defender. The moving side attacks. The battle resolves inside the Actions phase before the next kingdom action.

## Opposing forces

The GM picks the enemy from the library or lets the generator build one. `generateForce(opponent, rng, options)` in `src/engine/force.ts` reads the other side and answers it: the same unit count give or take one, every unit within three levels of the opponent's average, the total level within a tenth of the opponent's. It draws from the Reignmaker troops, the official Pathfinder troops and the generic roster together, and swaps units in and out until the totals agree. At most one unit brings a siege engine: an attacker facing walls brings one three times in four, and it may be a ram; anyone else brings artillery one time in five. The generated force is a starting point: the picker adds to it, and the row control removes from it.

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
| engaged / near / distant | engaged / close / long / extreme by rook distance |
| HP 4–6, rout threshold | 4 wounds, rout checks on wounds |
| shaken, routed | shaken 0–3, routed at 3 |
| weary, mired | dropped; Weakened and terrain cover the cases |
| outflanked | kept |
| 3 war actions | 3 actions and a reaction, as PF2e |
| 5 ranged Strikes | no ammunition |

| Dragon Rampant / OPR | Borrowed |
|---|---|
| Half-strength breakpoint | Weakened at 2 wounds |
| Courage worsens with losses | rout triggers on wounds and Broken |
| Melee never sticks | Strike is an exchange; position is separate |
| OPR Fatigue | dropped; the multiple attack penalty and one reaction per round cover it |
| OPR Shaken as the one marker | shaken with one effect (`demoralized`) |
| Order failure ends the turn (DR) | not adopted; fixed initiative keeps every player active |

## Worked battle

Forest hex (every square forest, elevation 0, no barriers). Attacker: Heavy Cavalry (L7, AC 25, Strike +12, Will +14, Perception +14, Speed 40 → Pace) and Line Infantry (L6, AC 24, Strike +11, Volley +11 long, Will +13, Perception +13). Defender: Kobold Warriors (L3, AC 18, Strike +7, Volley +7 close, Will +9, Perception +9) and Troll Marauders (L8, AC 25, Strike +13, Will +11, Perception +15, Speed 30 → Pace). Level DCs: L3 18, L6 22, L7 23, L8 24. Forest cancels Pace for both mounted units.

Initiative: infantry 25, trolls 22, cavalry 19, kobolds 14. Deployment: infantry c2, cavalry e2, kobolds d7, trolls e7; both sides keep a rank in hand.

**Round 1.** Infantry: the kobolds are at distance 6. Advance c3, c4, c5; kobolds at distance 3, long, but no action is left. Trolls: Advance e6, e5; the infantry at c5 is at distance 2. Brace. Cavalry: Advance e3, e4, adjacent to the trolls: engaged. Strike trolls: +12 vs 25 + 2 Brace = 27, roll 16 = 28, success: trolls 1 wound. Kobolds: Advance d6; the infantry at c5 is at distance 2, close. Volley infantry: +7 vs 24 + 1 cover = 25, roll 19 = 26, success: infantry 1 wound. Brace. End of round: trolls wounded, rout DC 23 (cavalry, L7, engaged); Will +11, roll 14 = 25, success. Infantry wounded, DC 24 (trolls, L8, within close); Will +13, roll 8 = 21, failure: infantry shaken 1.

**Round 2.** Infantry (shaken 1, −1): Advance c6, adjacent to the kobolds at d6: engaged. Strike kobolds: +11 − 1 vs 18 + 2 Brace = 20, roll 15 = 25, success: kobolds 1 wound. Second Strike at −5: +5 vs 20, roll 17 = 22, success: kobolds 2 wounds, Weakened. Trolls: Strike cavalry: +13 vs 25, roll 12 = 25, success: cavalry 1 wound. Second Strike: +8 vs 25, roll 9 = 17, miss. Brace. Cavalry: Strike trolls: +12 vs 27, roll 16 = 28, success: trolls 2 wounds, Weakened. Second Strike: +7 vs 27, roll 6 = 13, miss. Brace. Kobolds (Weakened, engaged): Withdraw d7 for 2 actions; the infantry spends its reaction: +11 − 1 vs 18, roll 11 = 21, success: kobolds 3 wounds, Broken. Brace. End of round: kobolds wounded and Broken, one check vs DC 22 (infantry, within close); Will +9, roll 12 = 21, failure: kobolds shaken 1. Trolls wounded, DC 23; Will +11, roll 4 = 15, failure: trolls shaken 1. Cavalry wounded, DC 24; Will +14, roll 7 = 21, failure: cavalry shaken 1.

**Round 3.** Infantry (shaken 1): Advance d6, adjacent to the kobolds at d7. Strike kobolds: +10 vs 18 + 2 = 20, roll 16 = 26, success: kobolds 4 wounds, destroyed. Advance e6, adjacent to the trolls at e5, which are now engaged from e4 and e6: Outflanked. Trolls (Weakened, shaken 1, Outflanked): Strike cavalry: +13 − 2 − 1 vs 25 + 2 Brace = 27, roll 12 = 22, miss. Second Strike: +5 vs 27, roll 15 = 20, miss. Rally: Will +11 − 1 vs DC 23, roll 15 = 25, success: shaken 0. Cavalry (shaken 1): Strike trolls: +12 − 1 vs 25 − 2 Outflanked = 23, roll 12 = 23, success: trolls 3 wounds, Broken. Second Strike: +6 vs 23, roll 15 = 21, miss. Brace. End of round: trolls wounded, Broken, and half their side destroyed: one check vs DC 23; Will +11, roll 3 = 14, failure: trolls shaken 1.

**Round 4.** Infantry: Strike trolls: +10 vs 23, roll 14 = 24, success: trolls 4 wounds, destroyed. The defender has no unit standing. Attacker wins in four rounds.

Aftermath: attacker Warfare check succeeds, cavalry heals to 0 wounds; infantry keeps 1 wound (HP 72 of 96) and both keep shaken 1 (`demoralized 1`). Trolls and kobolds disband. The defender's Defense check fails: +1 Unrest.

What the transcript shows: the four-rank gap gives the kobolds one volley on the approach and no more; the trolls stand in the open and are flanked because the infantry walks round the corpse of the kobolds; the multiple attack penalty makes the second Strike a coin flip; the last unit of a side goes down to a rout trigger it can no longer pass. On a hills or river hex the trolls would have held a ridge or shallows and the fight would take two more rounds.

## Standalone game

The rules ship as a standalone web game at `github.com/rune-goblin/battlefield`: a pure TypeScript engine with unit cards (level, type infantry or cavalry, optional Salvo reach, Pace and Fear) plus a Svelte hot-seat app; siege engines are a separate class that rides with a unit. Foundry, PF2e and Reignmaker adapters are deferred; the engine's `UnitCard` input and `BattleState` output are the seam.

## Open questions

- Whether Volley should be limited per battle to reward closing, as Kingmaker's five shots do.
- Whether a split army's halves should rejoin at average wounds, or whether splitting should cost upkeep so it is a real trade.
- Whether a unit should be allowed to Advance diagonally; it shortens flanking by a round.
- Whether elevation should also shorten Advance downhill, or only penalise climbing.
- Whether Pace should be a Speed threshold or a tag on the army type.
- Whether commanders, when added, grant a second reaction, a free action, or a once-per-battle bonus.
- Whether a Broken unit that is the last on its side routs automatically at end of round.

## Playtest plan

Run four paper battles: the worked example above, an even three-versus-three at equal level with two split units on a hills hex, a river crossing with two shallows through a swamp, and a fortified level-4 garrison behind seven wall segments against a level-8 attacker with a catapult. Each should finish within six rounds and produce a result a GM accepts as plausible. Every DC used must exist on a troop in `data/troops/`.

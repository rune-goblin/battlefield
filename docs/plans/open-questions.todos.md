# Open questions

An item leaves this list when it is answered or built.

## Rules and balance

- **Artillery and Pin.** Artillery may need a cheaper Pin now that the gun crew has no extra action. Deferred on 2026-09-09.
- **Pin's automatic landing.** Pin lands hit or miss, like Suppress. Pin is the stronger effect: a hold at Volley + 10 with no roll and no save. Gating it on the shot would turn rung 3 from a purchase into a gamble.
- **Unbreached walls.** A standing wall breaks engagement, so a garrison can be shot at and never fought until a segment is breached. Judge the strength at the table.
- **Charge landing.** Among the hexes beside its target, a charge picks one that earns the run-up before the cheapest. That can land the charger on a flank the player did not intend; a waypoint overrides it. Judge at the table.
- **Slow chargers.** A Speed-1 unit runs 2 hexes and can never earn the run-up's +2 alone. Decide whether that is right for slow troops.
- **Shooting on the larger field.** With bands of 3, 6, 9 and 12, medium shooters get about one free volley against Speed-2 infantry and long shooters two. Watch whether shooting now dominates.
- **Blast at 9 hexes.** If a caster at long range proves too strong, give Storm a limit of 6 first.
- **Siege minimum ranges.** Arcing engines (catapult, trebuchet, mortar) have no minimum range beyond what their profiles list. Decide whether they need one.
- **Reach of "balance against moderate".** The worked examples in `rules.html` quote a moderate level-6 Will of +14. The engine's fallback profile gives a sheet-less infantry card high Will (+17). Rule whether the fallback follows the examples.
- Does concentrated Controlling deny too many actions, especially against units with disorder?
- Does Press retain sufficient value beside a more accurate Strike?
- Does concentrated Rally offer a useful alternative to repeated Steady attempts?
- Playtest the −2 penalty per extra recovery participant together with disorder, and the pace of two-wound critical recovery.

## Terrain

- Two units in one hollow lose sight of each other across a level-0 hex between them.
- Forest at 46% average may slow infantry too much. `forestPatches` and `patchSize` in `DENSITY` are the dials. Patch counts scale with board area, so the 169-hex board keeps the same share; check it at the table.
- Level-1 ground blocks sight from the flat, so hills boards shorten most shots.
- A layout picker on the setup screen would let the GM ask for "a pass" directly. The layout is drawn from the seed today.

## Combat text

- Helpful states (Inspired, Warded, Sure strike) may deserve green words of their own.
- Criticals and Routed may deserve the loud treatment Resisted has.
- A lapsing status may deserve an exit line of combat text.

## Service architecture rulings

Each is a first draft marked `// proto:` in the code and awaits a ruling.

- **Save migration shape.** New record fields (`sources`, `writeback`) arrive without a schema bump, and an older record revives with empty values. `battleId` is `battle-<base36 time>-<random>` and `rulesVersion` is a date.
- **Stable ID format.** Units, equipment, archive slots, and socket requests use `<prefix>-<base36 time>-<6 random base36>`. A deployment that names no ID falls back to `u0…`.
- **Event target.** `checkResolved` names no target, so the board infers an attack's mark from the pieces the acting unit changed, and a miss leaves none. Rule whether the event carries its target.
- **Player-facing wording.** Every turn, seat, readiness, authority, and refusal line is a first draft. Two gaps ride with it: notices print the raw user ID where a display name belongs, and the turn line omits the holder's side, which the hot seat needs.
- **Window title and scene-control tooltip.** Drafted as "Battlefield".
- **Writeback floor.** A surviving unit is written back at no fewer than one hit point, since the wound ladder floors to zero for a troop under four maximum hit points. Without ReignMaker the writeback updates an existing Demoralized effect, creates none, and leaves Routed and disbanding to the GM.
- **Campaign import defaults.** The GM takes `gmSide`, defaulting to defender, and every other user takes the other army. Units arrive unplaced. `createBattle` refuses while a battle is under way. Role is read off the statblock, and imported cavalry carries no `cavalry-charge`.

## Create-battle wizard and Foundry

- A troop picked from a world actor or a kingdom army joins the draft as a bare card with no source binding, so the outcome writeback skips its actor. Binding it means `army.addUnit` carries a `UnitSource`, a runtime change with its own tests.
- The Foundry troop sources are unverified in a live world, and so is the flee popup text under Foundry's PIXI.
- A ReignMaker `listArmies` API would replace the direct flag read.
- Published troops carry no faction, so the troop picker's Faction column shows the publication or collection for them. Judge at the table whether that filter earns its place outside the Kingdom armies tab.
- Do the bundled ReignMaker and Generic cards stay in "All armies" in Foundry once Trooper supplies the list?
- Guard, Stunned, Wrath and Hasted have no row in the modifier table in `rules.html`. The unit effects panel words them from the activity descriptions.

## Test gaps

- The `needs N actions` reason and the `already cast this activation` reason have no test.

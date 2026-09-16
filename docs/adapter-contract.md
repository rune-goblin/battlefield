# Adapters

Battlefield is playable on its own. Integrations attach at two seams in `src/engine`, and nothing in the engine imports a DOM or a VTT (`tsconfig.engine.json` compiles it with `lib: ["ES2022"]` and no ambient types).

This file is the code seam and nothing else. The rules are in `public/rules.html`, which is the only place they are written down; where a mapping below has a meaning, that document explains it and this one points at it.

## Input: `UnitCard`

```ts
{ name, level, role: 'infantry' | 'cavalry', sheet?: TroopSheet, salvo?: 'close' | 'long' | 'extreme', pace?, fear?, caster?, signals?, tactics?, wounds?, disorder?, overrides?: Partial<UnitStats> }
```

Roles match the skirmish rules: infantry and cavalry, with siege engines as a separate class (`SiegeEngineCard`, attached to a unit or emplaced on a cell of its own). `deriveStats(card)` fills Strike, Volley (when `salvo` is set), reach, Defence, Will, Reflex and Perception from the PF2e level tables for the role. An adapter that has real numbers passes them in `overrides` and the raw statblock in `sheet`; a fully overridden card is a troop sheet. Reflex is read off `sheet` when there is one, and it is the only stat breaking contact consults. Perception is derived and displayed but no rule reads it — there is no initiative roll.

`ROUTED_AT` is 3 for every unit. `Unit` and `UnitTokenModel` carry `disorder`; capacity is constant. The former `quality` field and `qualityFor(card)` helper have been removed. The former `isShaken` predicate has also been removed; use `isRouted` or `isStanding` to check morale eligibility. Imported disorder caps at 3. Every activity costs the same for every unit (section 6), so nothing else is derived from the card. `signals` is the closed vocabulary of structural cues an importer reads off a statblock; the engine reads only `no-retreat` from it. `fear` is imported the same way and read by nothing: an aura's effect stays the statblock's own. `caster` marks spellcasting, and `tactics` stays an optional hand-authored list — five of its values do something: `cavalry-charge` gives a charge its impact, `defend-allies` shares a Guard's +2 with a neighbour, `battlefield-medicine` and `demoralize` each grant a fixed Cast activity, and `ambush` buys an extra deploy rank. Every other tactic sits inert.

| Source | Mapping |
|---|---|
| Pathfinder 2e troop actor | `sheet` takes the actor verbatim: AC, HP, the `[Battle]` and `[Salvo]` check DCs, the Salvo template's distance in feet, all three saves, Perception, Speed and `fly`. `fear` comes from a frightful presence or fear aura, `caster` from a spellcasting entry, a spell item or a Troop Spellcasting action, `signals` from the recurring action names, `wounds` from the HP thresholds and `disorder` from a demoralized counter. What each number then becomes — the Battle DC less ten, the reach bands, Speed into cells — is section 2 of the rules, and `derivation(card)` prints it for a GM. |
| Foundry VTT | Same as above through the actor document; post each `LogEntry.check` as a chat card. |
| Reignmaker | An `Army` record's linked actor gives the card; `ledBy` gives the side; the defender's hex terrain, its river or lake and its fortification tier give the `BoardSpec` for `generateBoard`, and the GM paints the result; a `SiegeEngine` with `trainArmyId` becomes a `SiegeEngineCard` in that army's `Deployment.engines` (Trooper's siege vehicles map by name onto `ENGINES`). |

## Output: `BattleState`

Future ReignMaker integration: a unit that routs during a battle should require a post-battle leadership morale check to keep it. This remains a design note; the engine does not perform that check or record a dedicated rout-history field. See [the morale review](plans/morale-review.md#deferred-integration-post-battle-leadership-check).

After `phase === 'ended'`, each `Unit` carries `wounds`, `disorder`, `status` (`active`, `destroyed`, `left`) and `side`; `winner` and `endedBy` name the result; `walls.remaining` is what stands. An adapter writes back:

- wounds → hit points (`max`, `⌊¾⌋`, `⌊½⌋`, `⌊¼⌋`, `0`);
- disorder → frightened / demoralized, one stack per point, keeping the higher value; a unit at `ROUTED_AT` (3) is routed; `status: 'left'` records its departure from the field;
- `destroyed` → disband; each `EngineState` with `status: 'captured'` changes owner to the capturing side, `abandoned` ones are lost;
- the loser's surviving units fall back one hex.

## Randomness

Every roll goes through `Rng.d20()`. Pass `seededRng` for replays and tests, `randomRng` for play, or a wrapper around a VTT's dice roller.


## Targeting UI

`src/app/targeting.ts` adapts an `ActionOffer` and `ActivityOption` to `TargetChoice` objects. `TargetingService.matches` accepts hex, edge, corner and exact-target hits; multiple matches require an explicit choice. `forRef` supports target-first menus. `preview` supplies the icon, affected cells and the projected aim point. `resolve` returns the exact engine action, feedback markers and spell animations, or `null` for an invalid selection.

Target geometry and effects remain separate. A Burst anchors at a shared corner and affects all cells in its shape. Translocate anchors at the destination and preserves the origin/destination pair in the engine action. `src/board/target-point.ts` projects anchors for both DOM markers and PIXI aim lines. The engine remains the authority for legal targets and mechanical effects.

`surface(selected)` provides the current board markers for every spell tree. Healing groups select one unit hex at a time and mark each recipient. Translocate first offers source units, then the chosen unit's destinations. `pickCell` advances or reverses that selection and returns an exact target only when the selection is complete. Shared destinations therefore keep their source explicit. `markersFor` places group feedback on each recipient instead of between units.

`arrows(selected, targetId, cell)` supplies action tones and endpoints for exact targets and intermediate surface picks. Selected Healing recipients keep individual arrows; Translocate draws from the chosen unit to its destination. `BoardView.setShot` accepts one `TargetArrow`, an array, or `null`, and maps each tone through the board theme. The picker retains its last valid arrow when the pointer or keyboard focus leaves a target and clears it when targeting ends. Action feedback retains the arrow briefly alongside the target icon.

## Action commitment

`ActivityAction` and `ChargeAction` accept optional `focus`, an integer from 0 to 2.
The total cost is the base activity price plus `focus`; each extra action adds +2.
`canFocus(type, spell)` identifies activities that support commitment. The engine validates
support, the integer bound and affordability before resolution. Tradition caps the activity
index, not the total cost. `ActivityOption.cost` remains the base price.

The activity selector shows total cost and the bonus before confirmation. Target selection
preserves commitment; changing the activity clears it. `TargetingService.resolve` supplies
the base action, and the battle UI attaches commitment before calling `takeAction`.

# Adapters

Players see **Health** (4 minus `wounds`) and **Morale** (3 minus `disorder`). The stored fields continue to count losses so existing saves, events, and campaign imports remain compatible. Rules and UI report remaining capacity; internal contracts retain their field names.

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
| Pathfinder 2e troop actor | `sheet` takes the actor verbatim: AC, HP, the `[Battle]` and `[Salvo]` check DCs, the Salvo template's distance in feet, all three saves, Perception, Speed and `fly`. A published troop labels neither attack, so its damaging save actions are sorted instead: an emanation or a reach of ten feet is the Battle, and the longest burst, cone or stated distance is the Salvo. `fear` comes from a frightful presence or fear aura, `caster` from a spellcasting entry, a spell item or a Troop Spellcasting action, `signals` from the recurring action names, `wounds` from the HP thresholds and `disorder` from a demoralized counter. What each number then becomes — the Battle DC less ten, the reach bands, Speed into cells — is section 2 of the rules, and `derivation(card)` prints it for a GM. |
| Foundry VTT | Same as above through the actor document; post each `LogEntry.check` as a chat card. |
| Reignmaker | An `Army` record's linked actor gives the card; `ledBy` gives the side; the defender's hex terrain, its river or lake and its fortification tier give the `BoardSpec` for `generateBoard`, and the GM paints the result; a `SiegeEngine` with `trainArmyId` becomes a `SiegeEngineCard` in that army's `Deployment.engines` (Trooper's siege vehicles map by name onto `ENGINES`). |

## Output: `BattleState`

Campaign Demoralized and battlefield `disorder` are one track. Set `UnitCard.disorder` to the campaign value on import. Supply stats before this morale penalty: the engine subtracts `disorder` once, including on overnight checks. If an actor's prepared stats already include Demoralized, remove that contribution before passing the stats to Battlefield. Preserve other applicable actor modifiers according to their normal stacking rules.

Export final `disorder` directly, including recovery. Never keep the higher of the old campaign value and the battle value, and never add the two. A survivor at disorder 3, including `status: 'left'`, requires the campaign Routed condition. A unit that rallied before leaving the field and finishes standing does not require a historical-rout retention check. Destroyed units are permanent losses.

ReignMaker owns Rally Troops and turn-end disbanding, as proposed in [feature request #2](https://github.com/motionproto/reignmaker-feedback/issues/2). Battlefield does not spend leader actions or advance the ReignMaker turn. Its night phase cannot recover units that left the battle through rout.

After `phase === 'ended'`, each `Unit` carries `wounds`, `disorder`, `status` (`active`, `destroyed`, `left`) and `side`; `winner` and `endedBy` name the result; `walls.remaining` is what stands. An adapter writes back:

- wounds → hit points (`max`, `⌊¾⌋`, `⌊½⌋`, `⌊¼⌋`, `0`);
- disorder → Demoralized, one stack per point, replacing the prior value; a surviving unit at `ROUTED_AT` (3) requires Routed; `status: 'left'` records its departure from the field;
- `destroyed` → disband; each `EngineState` with `status: 'captured'` changes owner to the capturing side, `abandoned` ones are lost;
- the loser's surviving units fall back one hex.

## Day continuation

`declareDayOrder(state, side, order)` records `surrender`, `withdraw`, or `hold` in `dayOrders.choices`. `resolveDayOrders` requires both choices: two holds confirm continuation; withdrawals set `endedBy: 'withdrawal'` and award the field to the side that stays, or draw when both leave. `answerSurrender(state, responder, accept)` requires an opposing proposal. Acceptance sets `endedBy: 'surrender'` and `winner` to the responder; rejection clears the proposer's choice. These functions preserve all unit losses and survivor condition. The campaign owns surrender terms and withdrawal movement. Recovery precedes decisions. Day-order functions require a committed `night`; `startNextDay` requires recovery and confirmed holds from both sides. Recovery clears any decisions from older saves so players choose again with the results.

`BattleSetup.roundsPerDay` defaults to 6. `BattleState.day` starts at 1; `round` restarts each day. `phase: 'ended'` with `endedBy: 'dusk'` can continue while both sides have standing survivors.

`recoverAtNight(state, choices, rng)` accepts the complete array of `{ unit, activity: 'rally' | 'treat' }` declarations for both sides. It validates the complete selection before rolling, stores each check and recovery in `state.night`, and logs the results. A non-null `night` prevents repeated recovery, including after serialization. An empty array commits a night without recovery. Routed units become `status: 'left'`; all unit records remain available to the report and campaign handoff.

`BattleState.nextBoard` stores an optional new board. Null or absence keeps the current field. `nextDayBattlefield(state)` previews the destination without changing the current report. Pass that preview to `deploymentCells` and `suggestDeployment` for legal home-zone placements. `startNextDay(state, positions)` accepts a unit-ID-to-cell map, validates all survivor positions against the chosen board, and begins the next day. It preserves unit IDs, casualties, morale, wounds, and recovery results. On the same field, board damage and equipment positions remain. On a new field, only crewed attached engines travel with standing survivors; `previousBattlefields` archives the old board and all fixed or abandoned equipment for campaign writeback. Read those archives alongside current equipment when resolving the campaign outcome. `order` contains that day's deployment. Survivors retain their morale when their side loses half its units. The client migrates older saves to day 1, six rounds, and no committed night.

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
support, the integer bound and affordability before resolution. Spells also cap total
commitment at three actions, including under Haste. `ActivityOption.cost` supplies the base price;
spell tier IV has index 4 and costs three actions. Level and tradition govern spell access.

The activity selector shows total cost and the bonus before confirmation. Target selection
preserves commitment; changing the activity clears it. `TargetingService.resolve` supplies
the base action, and the battle UI attaches commitment before calling `takeAction`.

## Magic progression

`casterTier(level)` and `spellCeiling(tradition, level, tree)` define access. Casting offers
contain four spell tiers; use each option’s `cost` rather than its index for action diamonds.
Ordinary verbs retain their three activities. Tactic-only casters retain their first spell.
The engine recalculates tradition access when building offers, including for older saves.

Troop imports read the first explicit spellcasting-entry tradition, then its name when the
structured field is absent. Legacy cards without a tradition retain the Arcane fallback.
Bundled roster generation follows the same rule.

Multi-recipient spells use unit IDs joined by `+`. Storm uses connected cell IDs; its menu
collapses areas that affect the same enemies. Gate uses ordered source/destination cell pairs,
with a maximum of two pairs. Destinations must be distinct and empty before either transfer.
`TargetingService` permits either Gate source to be selected first.

Healing accepts optional `healingChoices`, keyed by recipient ID. Each choice lists condition
priorities; ordinary Healing can instead request `extraHealth`. Renewal clears at most the first
condition on success or the first two on critical success. The UI presents these choices before
confirmation. Omitted choices retain the engine’s default condition order. All outcomes,
including Renewal’s failure recovery, resolve in one command and support the existing undo flow.

## Fortification tiers

Pass ReignMaker's hex fortification tier through unchanged: 1 Earthworks, 2 Wooden Tower, 3 Stone Tower, 4 Fortress. These are the hex tiers from `src/data/fortificationTiers.ts`, rather than the settlement support-building progression. Tier 0 remains a legacy barricade. Battlefield derives wall durability, hardness, and cover from the tier and generates one closed gate with an explicit interior hex. The campaign adapter must avoid adding the same campaign bonus twice to troop statistics.

Wall state carries remaining boxes, an optional interior cell, and optional gate open state. Save and handoff these fields with the board. Temporary siege fields also persist within a day and clear overnight. Structure-damaging siege abilities currently target walls and gates; future building targets should use the same structural damage calculation.

## Foundry table and ReignMaker hex pick

`game.modules.get('battlefield').api` offers `open`, `close`, `createBattle`, `callTable`,
`dismissTable`, `battles`, `openBattleAt`, `removeBattle`, and `screenOf`. `screenOf(cell)` gives a cell's centre on the open board in viewport pixels, for a macro or the e2e specs to point at the map. `callTable` sets the `tableCall` world setting: every client opens its window
once, and a client whose window is shut keeps a floating Battlefield chip until `dismissTable`.
The GM reaches the same two calls from the window's header menu. The setting stands outside the
session record, so a reset or a loaded save leaves the players where they are.

The hex pick reads three functions ReignMaker adds to its own module API, plus the
`pf2e-reignmaker.apiReady` hook it fires once that API is complete:

| ReignMaker API | Use |
|---|---|
| `registerMapToolbarButton(button)` | The GM-only Battle button on the kingdom map's toolbar. |
| `selectHexes({ colorType: 'battle', count: 1, getHexInfo })` | The pick itself; answers with `["i.j"]` or null. `getHexInfo` names the battle standing in a hovered hex. |
| `getBattleSite(hexId)` | Terrain, holder, fortification tier, and every army in the hex with its banner. |

`src/adapters/reignmaker/battleSite.ts` turns the site into a `BattleRequest`. The holder of the
hex defends; on ground nobody holds the player kingdom attacks. Each unit carries its banner as
`faction`, a label no rule reads, and the wizard opens at the Sides step for the GM to correct
the guess with `army.swapSides` and `army.setSide`.

### Many battles, one open

A session carries `site`, the kingdom-map hex it stands on, or null for a battle no campaign
placed. The table plays one session; every other sited battle waits in the `sites` world
setting, one record to a hex (`BattleSites`, `src/adapters/foundry/worldSites.ts`).

Picking a hex submits `session.moveTo { site, battleId, opening }`. In one commit the executor
parks the open battle at its own site, then opens the record parked at the picked hex. A hex
with no record opens on `opening`: the armies `getBattleSite` found, or the bare ground as an
empty draft when no army stands there. Picking the hex already open raises the window and
sends nothing.

- A finalized battle is removed from the map when the table leaves it.
- A battle under way on no site refuses the move; the GM saves or ends it first.
- A parked battle keeps its interactions and loses its undo history.
- `battle.reset` clears `site`. `removeBattle(site)` deletes a parked battle, for a macro.

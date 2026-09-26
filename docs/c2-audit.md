# C2 Audit Report

Written 2026-09-26 at `6850377`. `docs/plans/c2-remediation.md` fixes these findings wave by wave.
A status tag follows the scope tag as each finding lands: `[done]`, `[partial]`, `[skipped]` or
`[deferred]`, with a `**Resolution (YYYY-MM-DD):**` line under it.

**Scope:** whole codebase: every non-test file under `src/engine`, `src/board`, `src/app`,
`src/services`, `src/runtime` and `src/adapters`, with entry points and vite configs.
**Files reviewed:** 213 (about 30,000 lines).
**Findings:** 2 critical, 13 major, 15 minor, 7 nits
**Scope tags:** 13 [local], 17 [cross-cutting] (nits and project-convention bullets not counted)

## Summary

The layering holds. The engine imports no DOM, PIXI or Svelte; one executor commits every shared
change; no Foundry global appears outside `src/adapters`; no component writes state directly.
The dominant theme is rules knowledge copied outside the engine. App controllers, views and the
board each re-derive refusal reasons, charge options, recovery modifiers, routed status and
cliffs, and several copies have already drifted. Inside the engine, three pairs of duplicated
rules have diverged. The second theme is Shotgun Surgery: a new condition takes about 8
coordinated engine edits, and a new command takes 5 or more across three runtime files.

## Critical

### C1. Unreadable stored data is treated as empty and then overwritten — Swallowed Exception / Data Loss `[cross-cutting]` `[done]`
- **Where:** `src/adapters/foundry/worldSessionRepository.ts:19-25`; same shape in `worldArchive.ts:20-27,64`, `worldSites.ts:8-15,28`, `browser/localArchive.ts:12-20`, `browser/localRepository.ts:14-21`.
- **What:** Any record `migrateSession` rejects (a newer `schemaVersion` after a module downgrade, a corrupt string) silently becomes `freshTable()`, `[]` or `{}`; on `ready`, `reseat()` commits that fresh table over the setting, and an archive save writes `[...[], entry]`, wiping every slot.
- **Why it matters:** A downgrade or schema bump erases a campaign's battles with no notice to the GM.
- **Direction:** A store distinguishes absent from unreadable, keeps the raw value, refuses writes and raises a notice; build it once in the shared store helper from M10.

**Resolution (2026-09-26):** W1.1 added `createJsonStore` in `src/adapters/json-store.ts`. It tells an absent value from an unreadable one, leaves the unreadable value in place, refuses every write over it and raises one notice. The browser and Foundry session repositories, both archives and the Foundry sites store read through it. An unreadable session loads fresh in memory while every save, `reseat` included, is refused. `migrateSession` now rejects a record from a newer schema before the legacy path can rebuild it, and the Foundry GM gets a permanent error notice. No UI lets a GM clear or export an unreadable setting; the todos file carries that.

### C2. Duplicated engine rules have already diverged — Once And Only Once `[local]` `[done]`
- **Where:** `src/engine/battle.ts`:
  - Terror, the tier-4 Controlling spell (`1845-1849`), re-implements Controlling and skips the `immuneFear` check tiers 1–3 make (`1887`); it also logs nothing on frightened.
  - The wound pipeline exists twice (`applyWounds` `755-786`, `landPersistent` `2093-2111`); death by persistent damage skips `refreshAbilityAuras` (`2103` vs `770`).
  - Push/pull exists twice (siege `484-491`, ability `displace` `713-720`); the siege copy refuses rooted targets and skips the occupied-cell test, the ability copy the reverse.
- **Why it matters:** These are live rules bugs: Terror frightens an immune unit, and a dead aura source keeps its aura until something else refreshes auras.
- **Direction:** Extract `landWound(target, n, …)` and `displace(...)`, and route tier-4 spells through the per-tree effects.

**Resolution (2026-09-26):** W1.2 routed Terror through `controlOne`, the tier 1–3 Controlling sequence, so it respects `immuneFear`, logs the frightened line, and a failed save costs Morale alone. `landWound`, `fall` and `moraleSave` now serve hits and persistent damage, so a death at dusk refreshes auras. Siege and ability push/pull share `forcedStep`, which asks Hold Ground only once a legal hex exists. The audit's claim that the siege copy skips the occupied-cell test is false: `enterable` refuses occupied hexes on both paths. One divergence stays open: the siege caller refuses rooted targets and the ability caller does not, pending the rules question in the todos file.

**Resolution (2026-09-26):** W3.3 moved the rooted check into `forcedStep`, so siege engines and troop abilities refuse a rooted target by one rule. The Push / Pull and Rooted rows in `rules.html` say so, and a troop-ability test covers it. Overrun has its own displacement path and still moves a rooted target; the rules page is silent on it.

## Major

### M1. `battle.ts` is a God Module — Divergent Change `[local]` `[done]`
- **Where:** `src/engine/battle.ts:1-2436`
- **What:** 2,436 lines and 83 exports holding setup, turn flow, siege, shooting, combat, movement and charge, targeting and menus, and every spell; 81 of the 94 engine commits since August touched it.
- **Why it matters:** Every rules change lands in one file, and private helpers couple clusters that do not otherwise touch — C2 grew out of that.
- **Direction:** Split along existing seams: siege (`333-581`, `2405-2436`), movement and charge (`988-1348`), targeting (`1351-1621`), spells (`1682-1976`), combat (`733-986`), turn flow; all 97 outside importers use the `engine/index.ts` barrel, so no caller changes.

**Resolution (2026-09-26):** W4.1 replaced `battle.ts` with eleven modules in `src/engine/battle/`: setup, state, turn, movement, manoeuvres, combat, wounds, siege, emplacements, targeting and spells, none over 340 lines. `battle/index.ts` re-exports exactly the 83 names `battle.ts` exported, so helpers shared between the modules stay off the engine barrel, and the engine has no import cycles. Callers changed only import paths: eleven tests and one comment in `docs/pixi-board.md`.

### M2. Conditions are flat fields enumerated by hand in 8 places — Shotgun Surgery / Primitive Obsession `[cross-cutting]`
- **Where:** `src/engine/types.ts:96-130` (about 18 fields on `Unit`); re-listed at `battle.ts:115-120`, `:479-483`, `:1749-1783`, `:2131-2141`, `:2205`, `aftermath.ts:135-159`, `status.ts:19-38`, `ability-effects.ts:225`.
- **Why it matters:** A new condition needs 8 or more coordinated edits plus 3 in the app; missing one leaves a condition that never clears.
- **Direction:** One condition record with per-condition lifetime metadata; derive the reset, nullify, heal and status lists from it.

### M3. App controllers re-derive what the engine decides — Once And Only Once `[cross-cutting]` `[partial]`
- **Where:** `src/app/battle/ring-controller.svelte.ts:110,126,138-143`; `drag-controller.svelte.ts:326-331,378-387`; `battle-controller.svelte.ts:466-491`.
- **What:** The ring guesses refusal reasons with its own precedence ladder. `CHARGES` ignores the `charge` ability the engine honours (`battle.ts:2308`), and `CHARGE_ACTIVITIES = [1, 2]` never offers the activity 3 the engine accepts (verified drift). `status()` is a third hand-written list of 22 unit flags, beside `status.ts` and `status-effects.ts`.
- **Why it matters:** `rules.html` and the engine are the arbiters; these copies go silently wrong when a rule changes, and the charge copy already has.
- **Direction:** `activation()` returns every verb with a legal flag and an engine-authored reason; `ChargeOption` carries activities, cost and impact; the status line builds from `statusEffectsOf`.

**Resolution (2026-09-26):** W1.3 fixed the charge drift. The rules list only Charge 2 and Charge and Press 3, so `doCharge` now rejects activity 3. `chargeImpact` moves the impact formula into the engine, and the drag controller reads the engine's activities and impact, so a unit with the `charge` ability sees its impact. The ring's refusal ladder and the hand-written `status()` list remain for W6.1 and W6.2.

### M4. Views compute rules — Feature Envy `[cross-cutting]` `[partial]`
- **Where:** `src/app/BattleReport.svelte:124` recomputes the recovery modifier from `aftermath.ts:122`; `:98` and `:106-107` decide routed without `isRouted`'s `status === 'active'` check, so a unit in camp counts as both in camp and routed; `:223` repeats the "nothing to recover" guard. `HealingChoices.svelte:5,7` maps conditions and the renewal heal count. `UnitSheet.svelte:9` partially copies `shootModifier`. `BattlePins.svelte:98` repeats `movementSpeed`, `:129` hard-codes the cast cap, and `:73,101,108,117` call `gateReason`/`siegeReason` in the template.
- **Why it matters:** This breaks the rule in `docs/plans/battle-controller-split.md:33` ("a view imports no engine function that decides anything"); the routed count is already wrong on screen.
- **Direction:** Engine exports `recoveryModifier`, `canRecover` and `healableConditions`; a controller per view hands finished rows to the view.

**Resolution (2026-09-26):** The overseer rejected the routed claim. A unit in camp never reaches the routed disorder level, and every `left` unit is routed, so switching to `isRouted` would drop the units that left from the routed count; the count on screen is right. W6.1 and W6.3 should give the engine status label `left` as routed and gone. The recovery modifier, recovery guard, healing map, shoot modifier and `BattlePins` rules remain for W6.1–W6.3.

### M5. Each command's facts are spread across 5+ tables — Shotgun Surgery `[cross-cutting]`
- **Where:** `src/runtime/commands.ts:25,97`; `policy.ts:15,68,84`; `executeCommand.ts:29,81,86,92,205`.
- **What:** 40 commands, at least 5 edit sites per new one; `commandSide` ends `default: return null`, so a side-scoped command left out fails at runtime with "that piece belongs to no side".
- **Direction:** One descriptor per command — `{ stage, scope, history, side?, run }` — in a `Record<CommandType, …>`.

### M6. The executor holds BattleManager's lifecycle transitions — God Module `[local]`
- **Where:** `src/runtime/executeCommand.ts:290-300,332-408`
- **What:** `loadSession`, `install` and `moveTo` run as special cases ahead of the handler table, and the executor drops army readiness on any setup command, an army rule.
- **Why it matters:** Plan decision 3 makes BattleManager the one lifecycle coordinator; each new transition grows the commit boundary instead.
- **Direction:** Narrow the executor to queue, validate and persist; BattleManager owns the transitions with a pre-fetched archive or site read, and ArmyPreparation owns the readiness drop.

### M7. `battle-controller` is a forwarding facade over one shared bag — Middle Man / Inappropriate Intimacy `[cross-cutting]`
- **Where:** `src/app/battle/battle-controller.svelte.ts:50-96,504-646`
- **What:** 127 public members, 79 of them pure forwards; all three sub-controllers receive the same 35-getter bag `s` and call each other's verbs through it.
- **Why it matters:** Each new drag or picker field needs three edits, and any sub-controller can call any sibling.
- **Direction:** Expose `c.drag`, `c.picker` and `c.ring` directly, and replace `s` with narrow ports.

### M8. Save migration is mixed into rules and schema code — Backwards-compat shims / Divergent Change `[cross-cutting]` `[done]`
- **Where:** `src/engine/battle.ts:61-65,101,368-390,406,437,535` (legacy engine rate formulas, a hard-coded `'Wolf Fang'`, load-count rescaling); `src/runtime/session.ts:188-450` (about 260 lines of repairs, including `deriveStats` arithmetic).
- **What:** `SCHEMA_VERSION` is still 1 while five fields arrive as "proto: no schema bump" backfills.
- **Why it matters:** Every engine read pays for save history, rules knowledge leaks into the runtime, and C1 makes the next schema bump dangerous.
- **Direction:** Normalise once at load in a `migrate.ts` backed by engine helpers, then bump the schema.

**Resolution (2026-09-26):** W4.2 moved the save repairs out of the rules. `engine/legacy.ts` upgrades saved battles and cards: legacy engine rates, the Wolf Fang case, load-count rescaling, the no-retreat card fallback and the missing engine IDs. The engine's reads carry no save shims. `runtime/migrate.ts` steps a schema-1 record to schema 2 once at load, and `SCHEMA_VERSION` is 2. Only schema-1 records run the catalogue backfill, so a future catalogue change needs its own step. `reviveSession` accepts every schema from 1 to the current one, so the bump leaves browser saves readable, and a test loads a schema-1 browser save. Two effects reach players: an old save whose engine owner was never updated logs one "takes the X" line when it loads, and a module-API `createBattle` card with the `no-retreat` signal and no `abilities` no longer gains Hold Ground.

### M9. Target IDs are encoded as strings — Stringly Typed `[cross-cutting]`
- **Where:** 28 `'+'` split/join sites across 8 files and 16 `'|'` sites across 9; `battle.ts:1988` tells a wall from a unit with `includes('|')`.
- **What:** `ActivityAction.target: string` discards `ActivityTarget.kind`, and the encoding has spread into `app/targeting.ts`, the picker and the board.
- **Direction:** Carry a typed `TargetRef` in actions and parse only at the UI edge.

### M10. Browser and Foundry archives are copy-pasted — Copy-and-Paste Programming `[cross-cutting]` `[done]`
- **Where:** `src/adapters/browser/localArchive.ts` and `src/adapters/foundry/worldArchive.ts`
- **What:** `list`, `load`, `remove`, `export`, `import`, `newSlotId` and the parse fallback exist in both; only the Foundry copy evicts.
- **Why it matters:** Every format fix — the C1 fix included — lands twice.
- **Direction:** One `createJsonArchive(store, { beforeInsert? })` over a minimal get/set store.

**Resolution (2026-09-26):** W1.1 added `createJsonArchive` in `src/adapters/json-store.ts`, the one copy of list, save, load, remove, export and import. Both archives are thin bindings over it, and the Foundry one keeps its ten-slot eviction as `beforeInsert`.

### M11. `Token` is a God Class — Divergent Change `[local]`
- **Where:** `src/board/Token.ts:171`
- **What:** 37 methods covering art loading, tweening, drag lift, spell reactions, rings, flag, engine chip, pips, status bars, rout arrow and the status-intro handshake.
- **Direction:** Compose per-concern parts: `StatusColumn`, `MoveTween`, `RingGlow`, `EngineChip`.

### M12. Board layers share no contract, and `destroy()` misses five — Shotgun Surgery / Resource Leak `[cross-cutting]` `[partial]`
- **Where:** `src/board/index.ts:248-289,546-557`
- **What:** 12 layers use 6 different `setGeometry`/`draw` signatures and repeat their teardown 13 times; `destroy()` skips the overlay, shot, grid, map-line and edge layers and only clears ink, so `OverlayLayer.destroyed` never flips and a late `loadBarred` redraws into a destroyed container.
- **Direction:** A `BoardLayer { setGeometry(ctx|null); destroy() }` interface and an iterated layer list.

**Resolution (2026-09-26):** W1.6 made `destroy()` tear down the grid, map-line, edge, overlay and shot layers and destroy the ink layer; `EdgeLayer` and `InkLayer` gained a `destroy()`. `OverlayLayer.destroyed` now flips, so a late `loadBarred` stops. The shared layer contract remains for W9.1.

### M13. Modal, popover and army-card chrome is copied between components — Copy-and-Paste Programming `[cross-cutting]`
- **Where:** `QuitDialog.svelte:43-55` and `EndBattleDialog.svelte:53-65` are identical; Escape-to-close is written 4 times; `SeatingPanel.svelte:143-148` and `SaveLoadPanel.svelte:109-114` share one panel; `Sides.svelte` and `Summary.svelte` repeat the army card, and the `--side` ternary appears 5 times. `TokenModel` is built by hand in `BattleReport.svelte:117`, `Summary.svelte:46`, `VfxGallery.svelte:15` and `Place.svelte`, which already pick the engine name differently.
- **Direction:** `Modal`, `Popover` and `ArmyCard` components, a `sideColour` helper, and `unitToken`/`setupToken` builders in `presentation.ts`; sweep every caller.

## Minor

### m1. Dead engine rules code — Lava Flow `[local]` `[done]`
- **Where:** `src/engine/battle.ts:1655,1662-1680,2258`
- **What:** Nothing sets `noRetreat`, so pursuit (`follow`, `chasersOf`, `follows`) never runs and the "follows you" tag at `BattlePins.svelte:232` never shows. Also dead: `homewardStep` (`:1254`), `seededRng` (`rng.ts:3`), `VERB_TYPES`, `RADIUS`, and the write-only `Unit.fear` and `Unit.pace`.
- **Direction:** Delete them.

**Resolution (2026-09-26):** W2.1 deleted the pursuit code, the "follows you" tag, `battle.ts`'s `homewardStep`, `seededRng`, `VERB_TYPES`, `RADIUS` and the `noRetreat`, `fear` and `pace` fields; `rules.html:435` gives No Retreat only Hold Ground. Session migration now deletes the three legacy fields from saved units and still turns `noRetreat` into the Hold Ground ability. `grid.ts` keeps its own `homewardStep`, which is live.

### m2. Dead board surface — Speculative Generality `[local]` `[partial]`
- **Where:** `LayerManager.ts` (8 of 13 public methods have no callers), `layers/MapTextUtils.ts` (no importer), `BoardApp.setTheme` (no callers), and the `index.ts:625-637` barrel, which exports 11 unused symbols while `app/` deep-imports 12 internal modules.
- **Direction:** Delete the dead code and make the barrel match actual use.

**Resolution (2026-09-26):** W2.4 trimmed `LayerManager` to the methods the board calls, deleted `MapTextUtils.ts` and `BoardApp.setTheme`, cut the barrel to the symbols `src/app` and `dev/**` import through it, and updated `docs/pixi-board.md`. App files still deep-import `art`, `asset-base`, `terrain-textures`, `status-bars`, `color`, `paper`, `ink-map`, `selection`, `preload` and `target-point`; routing them through the barrel goes to W8.3.

### m3. Hash, PRNG, colour and easing helpers duplicated — Reinventing The Wheel `[cross-cutting]` `[done]`
- **Where:** FNV-1a ×5 (`EdgeLayer.ts:144`, `vfx/textures.ts:112`, `ink-map.ts:208`, `forest-placement.ts:20`, `TerrainScatter.ts:167`); `mulberry32` (`vfx/textures.ts:102`) copies `engine/rng.ts:25`; hex-to-CSS ×4; `easeInOut` is cubic in `Token.ts:140` and quadratic in `FallenLayer.ts:18` though the two animations are meant to match.
- **Direction:** One `hashSeed` beside `seededRandom`, one `cssHex`, one easing module.

**Resolution (2026-09-26):** W3.2 put `hashSeed` beside `seededRandom` in `engine/rng.ts` and replaced the five FNV-1a copies and the `mulberry32` copy with it. `cssHex` in `board/layers/color.ts` serves the board, `LchColour.svelte` and `ArmyReel.svelte`. `board/easing.ts` holds the four curves, and `FallenLayer` now settles on `Token`'s cubic `easeInOut`.

### m4. Sides and IDs are bare primitives — Primitive Obsession `[cross-cutting]` `[partial]`
- **Where:** `side === 'attacker' ? 'defender' : 'attacker'` ×12; `SIDES` re-declared at `policy.ts:64` and `SeatingPanel.svelte:18` beside `engine/types.ts:9`; every ID is `string`.
- **Direction:** `opponent(side)` in the engine; branded ID types.

**Resolution (2026-09-26):** W3.1 added `opponent(side)` beside `SIDES` in `engine/types.ts`. Every side flip in the engine, runtime, services, adapters and Svelte views calls it, and `policy.ts`, `SeatingPanel.svelte` and `battle-ending.ts` import `SIDES` from the engine. Sites that pick a side by a condition keep their ternary. The plan defers branded ID types.

### m5. The two `withSetup` helpers differ — Once And Only Once `[local]` `[done]`
- **Where:** `ArmyPreparationService.ts:160` and `MapPreparationService.ts:88`; `battleOf` ×3.
- **What:** Only the army copy runs `settleHauling`, so map `generate` can leave a stale `hauled` flag in setup.
- **Direction:** One shared services helper module with the settle step.

**Resolution (2026-09-26):** W1.5 moved `battleOf`, `withBattle`, `settleHauling` and a `withSetup` that always settles into `src/services/session-helpers.ts`, and all five services import it. Map `generate` and `rerollSeed` now settle hauling.

### m6. Small engine utilities duplicated — Once And Only Once `[local]` `[partial]`
- **Where:** `sameSquare` (`battle.ts:73`) copies `sameCell` (`grid.ts:22`); `clone` ×2; the degree-to-wounds ternary ×6; `ENGINES.find` by name ×5; the "can act now" guard ×4.

**Resolution (2026-09-26):** W2.2 replaced `sameSquare` with `sameCell`, moved both `clone` copies into `clone.ts`, replaced the degree ternary with `successes()` in `check.ts`, and replaced the activation guard with `mayActivate` and `canActNow`. `engineNamed` and `engineKind` in the new `siege-engines.ts` serve the engine, `BattleManager` and `ArmyPreparationService`; `engines.ts` is generated and stays as the importer writes it. `Place.svelte` keeps two `ENGINES.find` calls for W8.2.

### m7. Two ground-connectivity checks disagree — Once And Only Once `[local]` `[done]`
- **Where:** `board.ts:229` and `connectivity.ts:7`
- **What:** The map generator guarantees one rule and `ConnectionWarning` checks the other.

**Resolution (2026-09-26):** W2.3 moved `hasGroundConnection` into `board.ts` and deleted `connectivity.ts`. The generator and `ConnectionWarning` share one rule, the one the user set: a walking route runs from the attacker's deployment zone to the defender's without entering water or crossing a cliff or an intact wall, and an open gate lets it through. `rules.html:833` states it under Map editing and says a generated map keeps a route unless water cuts every one. The generator now tests the deployment zones and counts walls, so six mountain seeds keep cliffs they used to flatten. The warning still checks river maps alone; the todos file asks whether it should cover every map.

**Resolution (2026-09-26):** W3.4, the fallback in case W2.3 had not landed, did not run.

### m8. Import cycles between layers — Dependency Inversion `[cross-cutting]`
- **Where:** `runtime/executeCommand.ts:7` and `createRuntime.ts` import services, which import runtime in 18 places; `board/layers/CombatTextLayer.ts:3` imports its types from `services`.
- **Direction:** Move shared session types and helpers to a module both import; the board owns its display types.

### m9. Async failures vanish or look like failed commits — Error Hiding `[local]`
- **Where:** `foundry/tableCall.ts:60-71` and `foundry/index.ts:107,113` start promises with `void` and no `catch` — a throwing `refresh()` leaves this client primary with no runtime, and commands time out after 10 s; at `executeCommand.ts:258` a throwing listener rejects a command that already committed.

### m10. Randomness and clock read inside authority edits — Hidden Dependencies `[cross-cutting]`
- **Where:** `randomSeed()` at `MapPreparationService.ts:95` and `BattleContinuationService.ts:41`; `mintId` at `session.ts:138`. Only `generateForce` carries its seed in the command.
- **Direction:** A seed and ID port beside `DicePort`.

### m11. `beginBattle` is three commands in a row — Sequential Coupling `[cross-cutting]`
- **Where:** `src/app/navigation.svelte.ts:93-104` submits `declareReady` twice and then `startBattle`; a failure partway leaves one side ready.
- **Direction:** One command.

### m12. `Place.svelte` still holds controller logic `[local]`
- **Where:** `src/app/Place.svelte`: 289 of its 628 lines are script; `lastPick` (`:161-165`) guesses the new ID with `.at(-1)`, so a remote `addUnit` landing first selects the wrong piece.
- **Direction:** The planned split, with `CommandResult` returning the minted ID.

### m13. The app layer binds the browser adapter at import time — Hidden Dependency `[cross-cutting]`
- **Where:** `src/app/game.svelte.ts:2-3,20-23`, `launch.ts:1`. Every Foundry client reads `localStorage` and builds a throwaway runtime before `bindClient` replaces it.
- **Direction:** Build the browser runtime in `main.ts`.

### m14. `VfxGallery` ships in the product bundle — Boat Anchor `[local]` `[done]`
- **Where:** `src/app/App.svelte:10,34,58`: a query string alone gates it, and it is present in `dist-foundry`.
- **Direction:** A dynamic `import()`, or a DEV gate.

**Resolution (2026-09-26):** W2.5 loads `VfxGallery` through a dynamic `import()` gated on `import.meta.env.DEV`, as `TextureLab` already was, so production and Foundry builds drop it. A deployed web build no longer serves `?vfx`.

### m15. Colours and shadows bypass tokens — Hard Code `[cross-cutting]` `[partial]`
- **Where:** `SaveLoadPanel.svelte:117` uses the undefined `--danger` (`--bad` exists); `BoardPopup.svelte:78-99` and `ArmyReel` hard-code palettes; 10 distinct shadow values and 4 scrim alphas have no token.

**Resolution (2026-09-26):** W2.5 switched `SaveLoadPanel`'s error colour to `--bad`. The hard-coded palettes, shadows and scrims remain for W8.4.

## Nits
- `TroopPicker.svelte:92` `[local]` `[partial]` — `signed` prints `+-2` for a negative; `signed` is defined 5 times.
  **Resolution (2026-09-26):** W1.4 gave `TroopPicker`'s `signed` the sign-aware form, so a negative prints `−2`. The sweep of the five copies remains for W2.5.
  **Resolution (2026-09-26):** W2.5 exports the sign-aware `signed` from `presentation.ts`, and `TroopPicker`, `BattleReport`, `Place`, `UnitSheet`, `BattleOrders`, the drag controller and `result-words.ts` read it. `BattlePins.svelte` keeps two inline sign formats for W6.2.
- `foundry/battleSitePicker.ts:27` and `troopLibrary.ts:37` `[local]` `[done]` — the same actor-to-card reader twice; `BattleSiteArmy` and `KingdomArmy` are identical, as are the two `PLAYER_KINGDOM` constants.
  **Resolution (2026-09-26):** W2.6 dropped `BattleSiteArmy` for `KingdomArmy`, kept one `PLAYER_KINGDOM` in `kingdomArmies.ts`, and moved the actor reader into `foundry/armyActor.ts`, which both callers use.
- `Interaction.ts:172-183`/`424-435` `[local]` `[done]` — zoom-about-point math twice; `board/index.ts:330-347` duplicates `connectedCells`.
  **Resolution (2026-09-26):** W2.4 extracted `scaleAbout` for both zoom paths and rebuilt `region()` on `connectedCells`.
- `EdgeLayer.ts:467` `[local]` `[partial]` — the cliff test restates `barrierBetween`; `Token.ts:267,272` decide routed without `status`.
  **Resolution (2026-09-26):** W2.4 routed the cliff test through `barrierBetween`. `Token`'s routed test remains for W9.2.
- `ring-controller.svelte.ts:5` `[local]` `[done]` — unused `stage` import.
  **Resolution (2026-09-26):** W2.5 removed the import.
- `types.ts:383-386` `[local]` `[done]` — `BANDS` square and hex rows are identical.
  **Resolution (2026-09-26):** W2.1 collapsed `BANDS` to one `Record<Reach, number>`; every reader indexes it by reach alone.
- `tsconfig.json` `[cross-cutting]` — Foundry types load for all of `src/**`, so the compiler cannot catch a leak; the app store shares the name `game` with the Foundry global.

## Project conventions
- `battle.ts:87` `[local]` `[done]` — `createBattle(setup, _rng?)`: a `_var` rename hack for a parameter no caller passes.
  **Resolution (2026-09-26):** W2.1 removed the parameter.
- `Token.ts:550,707,742`, `TokenLayer.ts:218`, `FallenLayer.ts:58` `[local]` `[done]` — `.catch(() => {})` without a `proto:` mark.
  **Resolution (2026-09-26):** W2.4 marked every silent catch in `src/board` with `proto:`.
- `Token.ts:220`, `TokenLayer.ts:37`, `board/index.ts:141,165`, `theme.ts:51-53`, `hit.ts:11` `[local]` `[done]` — wave-history commentary.
  **Resolution (2026-09-26):** W2.4 rewrote these comments to state the present reason.
- `LayerManager.ts:174` `[local]` `[done]` — a leftover "Logging removed" stub.
  **Resolution (2026-09-26):** W2.4 deleted the stub with the dead `LayerManager` methods.
- `EdgeLayer.ts:389` `[local]` `[done]` — uppercase `WEB`/`DEBRIS` labels break the no-caps rule.
  **Resolution (2026-09-26):** W2.4 changed the labels to `Web` and `Debris`.

## Clean
- Layering: the engine imports no DOM, PIXI, Svelte, app or board code; all hex math goes through `Grid`.
- One executor: `repository.save` is called only there; no view writes `game.*`.
- Foundry globals appear only in `src/adapters`; no `any` in adapters, app, runtime or services.
- Services hold no private battle copy; every engine mutator clones its input.
- Runtime ports are small and segregated; no adapter stubs a method.
- Product components use `--type-*` throughout; no uppercase transforms or letter-spacing in components.
- Control flow: no arrow code, no exceptions as flow control. Inheritance: `BaseGrid` is sound; no Liskov, Yo-Yo or Refused Bequest.
- Race hazards: every async texture load checks a generation or destroyed flag.
- Chat, ReignMaker and socket errors are handled deliberately.
- `presentation.ts`, `targeting.ts`, the shell, `PixiBoard.svelte`, `scope.ts`, the PF2e adapter and the vite configs.

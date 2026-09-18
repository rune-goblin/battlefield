# Service architecture — judgment calls, ledger, and open questions

Dated bullets, appended by whoever runs a wave of `docs/service-architecture-plan.md`. One line each: what was decided and why. Never reopen a decision here; put a doubt under "Open".

## Decided in the plan (2026-09-18)

- The app runs in its own `ApplicationV2` window with its own `PIXI.Application`. The scene canvas costs a shared-scene requirement, an input contest with Foundry, and a second host for the DOM preview boards.
- Foundry's hex grid API stays unused. `engine/grid.ts` covers both grid kinds plus edges and corners, and the engine stays free of Foundry.
- The persisted record is the only state channel. Persist-first makes a snapshot broadcast redundant.
- The session is one serialized string in a world setting. One active battle per world.
- Saved battles: ten slots in a second world setting, file export and import beyond that. Load is a GM command under the next revision.
- `expectedRevision` plus twenty recent command IDs replaces receipts. Chat delivery records are deferred; event IDs on messages keep that door open.
- The GM draws d20s through `Die#randomFace()` and chat rolls are rebuilt from the recorded faces.
- Undo history stays in the authority's memory, as the prototype's does.
- Five services. Selection and activation end live in `ActionResolutionService`.
- Typed events come from a state comparison plus log tags at free strikes, spell resolution, and secondary dice.
- Default seating: the GM picks a side and every player takes the other. Manual seating is the edge case.
- Turn rotation runs on across rounds and days, so players sharing fewer armies act equally often.
- An offline seat is skipped when its turn opens. A side with nobody online falls to the GM.
- A GM may issue any command for either side; `turn.reassign` hands an open turn to another seat.
- Side-level decisions accept any user seated on that side; the last submission before the side confirms stands.
- Notifications use the app's own host (`src/app/notifications.ts`) on both hosts. Foundry's sits outside the window and takes a bare string.
- Notices are derived per client from adopted records and never enter the session or the socket, so each viewer reads their own part in the turn.
- The one Foundry notification is the turn notice for a player whose window is hidden; a missed turn stalls the table.
- Activity notices expire; every other notice ends by dismissal or by its trigger clearing, as the drag-feedback work decided.
- The session orchestrates with the built-in Workflow tool, one phase per workflow, writing its script from the plan. A saved 280-line orchestrator script was written and removed on 2026-09-18 as more machinery than the job needs.
- The outcome operation ID derives from the battle ID, so a reloaded battle cannot apply its outcome twice.
- ReignMaker owns writes to ReignMaker data through `applyBattleOutcome`; Battlefield reads no ReignMaker flags.

## Judgment calls

- 2026-09-18, Wave 0.1: `assetUrl` computes at each call site rather than caching a module-level `DIR`/`BASE` constant, so a `setAssetBase` call still reaches art requests from modules already imported (`paper.ts`, `ink-sheet.ts`, `terrain-sheet.ts`, `EffectLayer.ts`). `terrain-textures.ts`'s `TEXTURE_CHOICES` stays an eager module-load computation, matching its prior behaviour.
- 2026-09-18, Wave 0.1: exported `setAssetBase` from `src/board/index.ts`'s public barrel, since Foundry's adapter (Wave 0.2) calls it from outside `src/board`.
- 2026-09-18, Wave 0.2: the module id is `battlefield`, so the link in `Data/modules` must carry that name — `assetUrl` resolves art at `modules/battlefield/art/...`. `vite.foundry.config.ts` fails the build if `module.json` and `src/adapters/foundry/module-id.ts` disagree.
- 2026-09-18, Wave 0.2: `app.css` is scoped with `:where(.battlefield-root)`, which adds no specificity, so every selector weighs what it did before and component styles still override it. Foundry's own stylesheet sits entirely in cascade layers and unlayered rules beat every layer, so the module needs no extra weight to hold its own inside the window.
- 2026-09-18, Wave 0.2: the browser's `html, body` rules moved to `src/app/page.css`, which `main.ts` imports and the module build leaves out; its pre-paint background is a literal, since the palette tokens now live on the app root.
- 2026-09-18, Wave 0.2: the app root is `display: contents`, so the browser's layout is untouched and the shell's fixed layers resolve against `.battlefield-content`, which carries `contain: layout`.
- 2026-09-18, Wave 0.2: `withinApp` reads the last pointer press to place a key that lands on `<body>` with nothing focused; containment alone would silence the board's own keys in both hosts.
- 2026-09-18, Wave 0.2: `setAssetBase` runs from `install-asset-base.ts` at load, the first import in the Foundry entry, because `terrain-textures.ts` builds `TEXTURE_CHOICES` the moment it is evaluated. It imports `board/asset-base.js` directly: the barrel would pull in the modules it has to precede.
- 2026-09-18, Wave 0.2: the PIXI shim enumerates the members the app uses rather than re-exporting a namespace, since a runtime global has no static exports; `npm run check` checks that list against pixi.js 7.4.3's own types.
- 2026-09-18, Wave 0.2: `grep -c "PixiJS" dist-foundry/*.js` stands as written — the marker appears 5 times in the browser bundle and 0 in the module bundle, so it separates the two.
- 2026-09-18, Wave 1.1: **reserved, `// proto:`** — the save migration reads the v4 `{ stage, setup, battle }` and derives the lifecycle stage from the battle alone, ignoring the old `stage` string. The old value named a setup tab, which is local state; a v4 save mid-setup therefore reopens at the first unfinished stage rather than the exact tab, until the navigation store of Wave 2.5.
- 2026-09-18, Wave 1.1: **reserved, `// proto:`** — `battleId` is `battle-<base36 time>-<6 random base36>` and `rulesVersion` is the date `2026-09-18`, since the rules document carries no version of its own. Both ride with the ID formats reserved for Wave 2.2.
- 2026-09-18, Wave 1.1: the session key is `battlefield.session.v1` and the record carries `schemaVersion` as well, so the key names the envelope and the field names the shape; `reviveSession` refuses any other `schemaVersion` and the load falls back to `battlefield.v4`, then to a fresh session.
- 2026-09-18, Wave 1.1: the old key is removed inside `load`, after a session revives from the new key — not after `save` — so a write that never comes back intact leaves the v4 save in place.
- 2026-09-18, Wave 1.1: `Setup`, `SetupUnit`, `SetupEngine`, `defaultSetup`, and `randomSeed` moved into `runtime/session.ts` (`Setup` is the review's `BattleSetupDraft`); `game.svelte.ts` re-exports the three types so its consumers keep their imports. `defaultSetup` now states `size: 11`, the value every reader already defaulted to, so a fresh record round-trips unchanged.
- 2026-09-18, Wave 1.1: the repository exposes `loadSessionSync` beside the async port, and `game.svelte.ts` seeds from it. Module-level `$state` is built at import, and a promise would render the default board first; Wave 1.4's read store adopts published sessions and retires this.
- 2026-09-18, Wave 1.1: `// proto:` — a rejected save stays silent, as it was before. Wave 1.4 raises it under the `storage` notice.
- 2026-09-18, Wave 1.1: `BattleEvent` is `{ id, type }` until Wave 3.1 names the ten event types; `lastCommit` carries the shape from the start so the record does not change again.
- 2026-09-18, Wave 1.2: `expectedRevision` rides on every envelope and the executor does not yet enforce it — Wave 3.3 owns that, along with answering a resent command ID. Enforcing it here would refuse the second of two commands issued together, which is this wave's own ordering test.
- 2026-09-18, Wave 1.2: the executor's validation covers the battle ID, a known command type, and a battle under way. Stage, seat, and turn permissions arrive with the policy in Wave 3.3.
- 2026-09-18, Wave 1.2: `recentCommandIds` is recorded at each commit and capped at twenty, so the list Wave 3.3 reads exists from the first command.
- 2026-09-18, Wave 1.2: a rejection resolves as `{ ok: false, reason, message }` rather than throwing, so Wave 1.4 reads the reason to choose between the `command` and `storage` notices, and one lost command cannot break the queue.
- 2026-09-18, Wave 1.2: `ActionResolutionService` takes and returns the whole `BattleSession`, not the `BattleState`. It shares the executor's working record that way, and a later workflow that touches more than `battle` needs no new signature.
- 2026-09-18, Wave 1.2: **reserved, `// proto:`** — a command ID is `cmd-<base36 time>-<6 random base36>`, matching the battle ID of Wave 1.1. It rides with the ID formats reserved for Wave 2.2.
- 2026-09-18, Wave 1.2: `TacticalAction = Action & { unit: string }` in `runtime/commands.ts` holds the requirement at the boundary until Wave 1.3 makes `Acts.unit` required in the engine.
- 2026-09-18, Wave 1.2: `DicePort` is declared in `runtime/ports.ts` with the engine's `Rng` shape rather than re-exporting `Rng`, so Wave 3.1 can wrap it to record faces without touching the engine. `createRuntime` defaults it to `randomRng`.
- 2026-09-18, Wave 1.2: undo history is pushed for `action.resolve` and `activation.end` alone, capped at thirty, which is what the prototype's store did; a selection is not an activation.
- 2026-09-18, Wave 1.2: `createRuntime` takes the loaded session rather than awaiting `repository.load`, since the browser store is seeded before its first render (the Wave 1.1 call); it exposes `submit`, which fills the envelope from the committed record, beside `execute` for a client that builds its own.
- 2026-09-18, Wave 1.3: the measured census undercounted by two — `melee-plan.test.ts:30` and `movement-control.test.ts:49` also omit `unit` — found by an exhaustive grep of `act(` rather than the census table, then confirmed complete by a clean `tsc --noEmit -p tsconfig.engine.json` and `npm run check`.
- 2026-09-18, Wave 1.3: `Battle.svelte`'s `advance` and `charge` literals (lines 632–633) also need `unit`, since `Acts.unit` is required for every action type, not only `move` and `maneuver` as the wave text named; `commit()` and `performManeuver()` now guard `if (!active) return;` before naming `active.id`, matching `performActivity`'s existing guard, instead of asserting a possibly-null unit non-null.
- 2026-09-18, Wave 1.3: `battle.test.ts`'s `refresh` helper resolves its unit via `activeUnit(state)!.id` before calling `act`, since the helper is generic over any battle state and previously relied on the engine's own fallback.

## Open, for Mark

- **Save migration shape** (Wave 1.1). The v4 stage is dropped, the lifecycle stage comes from the battle, `battleId` is `battle-<base36 time>-<random>`, and `rulesVersion` is a date. **Decision:**
- **Stable ID format** (Wave 2.2). Wave 1.2 draws command IDs as `cmd-<base36 time>-<random>`, the battle ID's pattern. **Decision:**
- **Event types and log tag names** (Wave 3.1). **Decision:**
- **Player-facing wording for turns, seats, and notices** (Waves 3.5, 3.6, 4.4). **Decision:**
- **Window title and scene-control tooltip** (Wave 0.2 drafted "Battlefield"; outside the reserved list, offered at gate 0). **Decision:**

## Ledger

One line per wave: date, wave, model, commits, gate, verdict, escalations with their cause.

- 2026-09-18, Wave 0.1, Sonnet, 0b6b3c0, gate pass, APPROVE, no escalation. Reviewer note for 0.2: `TEXTURE_CHOICES` bakes its URLs at module evaluation, so `setAssetBase` must run before the barrel loads.
- 2026-09-18, Wave 0.2, Opus, 61b86f9 a4404f6 81bb941 + a674697 (svelte autofixer), gate pass with `build:foundry`, APPROVE, no escalation. Reviewer notes carried forward: `withinApp` returns true with no root, so the ctrl-wheel listener installed at `init` cancels page-wide before the window opens (masked by Foundry's own handler); two quick `open()` calls can mount the shell twice before `rendered` flips; `VfxGallery.svelte`'s `svelte:window` keydown is ungated; `_preClose` unmounts before the close animation, so the window shrinks empty.
- 2026-09-18, Phase 0 stopped at Human gate 0. Link `dist-foundry` into `Data/modules/battlefield` (the id `assetUrl` depends on).
- 2026-09-18, Mark's instruction: run Phases 1–5 overnight without stopping. Human gates 0–5 are deferred to one play session after the run; reserved calls stay open with `// proto:` choices in the code; the `CLAUDE.md` amendment for Phase 1 was made by the session; Wave 5.3 (ReignMaker) is skipped and Wave 5.5 reaches `applyBattleOutcome` through a port so ReignMaker can attach later.
- 2026-09-18, Wave 1.2, opus, 9441d4f 754379b, gate pass, APPROVE, no escalation. approved. Reserved: Stable ID format: a command ID is `cmd-<base36 time>-<6 random base36>`, matching Wave 1.1's battle ID. Marked `// proto:` in src/runtime/commands.ts, recorded in the todos, and appended to the open 'Stable ID format' question for Wave 2.2.; Command ID format `cmd-<base36 time>-<6 random base36>` (src/runtime/commands.ts:38, `// proto:`), folded into the open Stable ID format item for Wave 2.2 in docs/plans/service-architecture.todos.md. Reviewer notes: src/runtime/executeCommand.ts:88-89 — Listeners run inside `run` with no try around them; docs/plans/service-architecture.todos.md:58 — The todos bullet says the cap of thirty is what the prototype's store did; docs/plans/service-architecture.todos.md:50-51 — `expectedRevision` rides on every envelope but is neither compared nor used to answer a resent command ID from `recentCommandIds`; docs/plans/service-architecture.todos.md:55,65 — The command ID format `cmd-<base36 time>-<6 random base36>` is marked `// proto:` at `src/runtime/commands.ts:38`, recorded as a dated reserved bullet, and appended to the open Stable ID item for Mark.

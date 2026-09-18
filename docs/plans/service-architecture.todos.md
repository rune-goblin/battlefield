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

## Open, for Mark

- **Stable ID format** (Wave 2.2). **Decision:**
- **Event types and log tag names** (Wave 3.1). **Decision:**
- **Player-facing wording for turns, seats, and notices** (Waves 3.5, 3.6, 4.4). **Decision:**
- **Window title and scene-control tooltip** (Wave 0.2 drafted "Battlefield"; outside the reserved list, offered at gate 0). **Decision:**

## Ledger

One line per wave: date, wave, model, commits, gate, verdict, escalations with their cause.

- 2026-09-18, Wave 0.1, Sonnet, 0b6b3c0, gate pass, APPROVE, no escalation. Reviewer note for 0.2: `TEXTURE_CHOICES` bakes its URLs at module evaluation, so `setAssetBase` must run before the barrel loads.
- 2026-09-18, Wave 0.2, Opus, 61b86f9 a4404f6 81bb941 + a674697 (svelte autofixer), gate pass with `build:foundry`, APPROVE, no escalation. Reviewer notes carried forward: `withinApp` returns true with no root, so the ctrl-wheel listener installed at `init` cancels page-wide before the window opens (masked by Foundry's own handler); two quick `open()` calls can mount the shell twice before `rendered` flips; `VfxGallery.svelte`'s `svelte:window` keydown is ungated; `_preClose` unmounts before the close animation, so the window shrinks empty.
- 2026-09-18, Phase 0 stopped at Human gate 0. Link `dist-foundry` into `Data/modules/battlefield` (the id `assetUrl` depends on).

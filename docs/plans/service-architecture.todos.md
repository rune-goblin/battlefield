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
- The outcome operation ID derives from the battle ID, so a reloaded battle cannot apply its outcome twice.
- ReignMaker owns writes to ReignMaker data through `applyBattleOutcome`; Battlefield reads no ReignMaker flags.

## Open, for Mark

- **Stable ID format** (Wave 2.2). **Decision:**
- **Event types and log tag names** (Wave 3.1). **Decision:**
- **Player-facing wording for turns, seats, and notices** (Waves 3.5, 3.6, 4.4). **Decision:**

## Ledger

One line per wave: date, wave, model, commits, gate, verdict, escalations with their cause.

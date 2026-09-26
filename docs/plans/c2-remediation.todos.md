# C2 remediation — work still to do

Written 2026-09-26. Each wave's ledger step removes the tasks it finished and adds the questions it
could not answer. An item leaves this list when it is done or answered.

## Waves

- W9 — Board structure: W9.1–W9.2
- W10 — Recovery from an unreadable save: W10.1

## Carried forward from W1

- `createJsonArchive`'s accept checks only for a string `slot`. An entry with a string slot and
  no string `name` passes, and `filenameFor` throws on it during Foundry eviction.

## Open question from W2

- Water-sealed maps: `ConnectionWarning` checks river maps alone. A sweep of 86,400 non-river
  boards found four with no ground route, all sealed by a lake and ponds: swamp/lakeside/9/square
  seeds 20 and 129 (no fort), and swamp/lakeside/9/hex seeds 47 and 132 (fort tier 4; tier 3 also
  seals at seed 47). They show no warning. Should the warning cover every map, or should the
  generator drain a pond that seals a map?

## Open question from W4

- A corrupt saved session can be rebuilt and saved over. `migrateSession` falls back to
  `migrateLegacySave` for any envelope that `reviveSession` refuses, so a schema-1 or schema-2
  record with a valid setup but a broken body (a schema-2 record with no `sources`, say) is rebuilt
  from its setup and battle. The rebuild takes a new battleId, revision 0 and hot-seat control, and
  the Foundry store accepts it and saves over the original. The browser store reads through
  `reviveSession` and refuses such a record. Should the legacy fallback run only for records that
  predate the envelope, leaving a corrupt envelope unreadable for W10.1 to handle?

## Carried forward from W4

- `docs/pixi-board.md:99` names "`battle/combat.ts`'s Pace step" as the caller of `beyond`. The
  caller is `giveGround` in `combat.ts`; the Pace step wording predates W4.
- `src/tests/morale.test.ts` and `src/tests/targeting.test.ts` each import from
  `'../engine/index.js'` twice; merge the imports.

## Carried forward from W5

- `Unit.flies`: nothing in `src` outside tests sets it to `true`. It looks like dead state; decide
  whether to delete it.

## Open question from W6

- `UnitSheet.svelte` calls engine stat getters in its markup (`movementSpeed`, `shootModifier`,
  `wallsFor(...).fortifiedAt`, `castCeiling`, `shootFloor`, `shootCeiling` and the save
  modifiers). Each is the engine's own answer, so no rule is copied, but the plan's invariant says
  no view imports an engine function that decides anything. Should `UnitSheet` get a controller
  that hands it finished rows, or do stat readouts fall outside the invariant? W8 left it open:
  M7 does not cover it, so W8.1 fixed only the unkeyed `each` blocks.

## Carried forward from W6

- `commitment()` prices an option as `cost ?? index`; the old `BattlePins` code used `cost ?? 3`.
  For a cast tier I or II the unit cannot reach (cost `null`), the engine returns a commitment
  where the view once hid the picker. Only activities the unit cannot take are affected.
- `activation().melee` ignores waypoints. The drag controller still calls `meleePlans` itself
  for a melee dragged or dropped with waypoints; fold that into the engine answer if a second
  caller appears.

## Open question from W7

- Browser startup: the store now opens on a placeholder, and the record `bindClient` delivers
  picks the stage, as in Foundry. A browser save whose units carry `faction` with none placed
  reopens on Sides where it used to reopen on the first unfinished stage, and a resumed battle's
  `nav.visited` is `['board', 'battle']` until setup reopens. Is Sides the right stage for that
  save?

## Carried forward from W7

- Live check: no one has played W7 in the browser or in Foundry, and no screenshot exists. Check
  browser startup and resume, the GM's one-click begin, and a player's "My army is ready".
- `src/runtime/servicePorts.ts:49`: the `declareReady` comment says `battle.start` waits for it;
  since W7.5 it gates nothing.
- `src/runtime/ports.ts:70-73`: the `TransportPort` comment says a reply names a revision and
  nothing more; since W7.6 it also names the minted pieces in `added`.
- `onListenerError` has no guard of its own, so a host handler that throws still rejects a
  committed command.
- `sessionFromRequest` and `sessionAtSite` build on `freshSession`, which draws a seed and six
  unit IDs for the example setup and then overwrites them.
- `session.moveTo`'s `prepare` in `src/runtime/commandTable.ts` asserts `s.site!` after
  `departure` returns `'remove'`; `departure` guarantees it, and the type system does not know.
- The combat text queue moved to `src/app/combat-text.ts` and kept the names
  `CombatTextService` and `createCombatTextService`.

## Carried forward from W8

- Live check: no one has played W8 in the browser or in Foundry, and no screenshot exists. Check
  the Place stage (adding a unit or engine selects it), the Quit, End battle, Seating and Save/Load
  frames, the Sides and Summary cards, and the new shadows. Escape now closes an open Seating or
  Save/Load popover.
- Three shadows in `src/app/battle/` stay hard-coded: `BattlePins.svelte:304`
  (`0 2px 8px rgba(0, 0, 0, .25)`), `BattlePins.svelte:322` (`drop-shadow(0 2px 3px #0004)`) and
  `ActivityChoices.svelte:35` (`0 3px 10px #0004`). Switch them to `--shadow-1` and
  `--icon-shadow`, which now exist.
- `battle/battle-controller.svelte.ts` builds unit tokens by hand. It picks the engine with
  `engineOn`, which also checks board engines on the unit's square; it could adopt `unitToken(u,
  cell, extra)` from `presentation.ts`.
- `src/app/targeting.ts:41` deep-imports `targetAnchor` from `board/target-point.js`, marked
  `proto:`. The barrel cannot load under node, because `src/board/Token.ts:145` builds a
  `ColorMatrixFilter` at import. W9.2 splits `Token`; building the filter lazily there would let
  this import go through the barrel.
- `onEscape` in `src/app/keys.ts` listens on the window with no guard, so Escape pressed anywhere
  on a Foundry page closes an open dialog or popover.
- `Place.svelte` passes the store's commands to the place controller with a namespace import
  (`import * as store`) spread into its dependencies.
- Two shadows moved to shared tokens: `Dock`'s all-round glow now reads `--shadow-2`, and the
  `MapControls` grid dialog reads the deeper `--shadow-3`. `MapControls`' `::backdrop` reads
  `var(--scrim)` with no literal fallback.

## Unreadable save recovery (W10.1)

The user asked for this on 2026-09-26. When a stored session, archive or battle-site record is
unreadable, the store refuses writes (W1.1), and every commit shows "Changes could not be saved"
until someone clears the key from the console.

- In Foundry, the GM sees a notice naming the unreadable record, with two buttons:
  - "Export the broken save" downloads the raw stored value as a file;
  - "Start fresh" clears the stored value, and the table carries on from a blank record.
- In the browser, the local user sees the same notice for local storage.
- Players see only that the GM must act.
- "Start fresh" asks for confirmation in the app's own UI, with no browser `confirm()`, and
  nothing is cleared until the user confirms.
- Each unreadable store (session, archive, sites) is handled on its own, and clearing one
  leaves the others untouched.

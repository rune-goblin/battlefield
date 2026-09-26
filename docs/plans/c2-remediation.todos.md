# C2 remediation — work still to do

Written 2026-09-26. Each wave's ledger step removes the tasks it finished and adds the questions it
could not answer. An item leaves this list when it is done or answered.

## Waves

W10 was the last wave in `docs/plans/c2-remediation.md`, and every task in it is done.

## Carried forward from W1

- `createJsonArchive`'s accept checks only for a string `slot`. An entry with a string slot and
  no string `name` passes, and `filenameFor` throws on it during Foundry eviction. Tightening
  `isStoredEntry` to demand a name would make such an archive unreadable, so it would reach the
  W10.1 recovery notice.

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
  predate the envelope, leaving a corrupt envelope unreadable? W10.1 recovers only what the
  stores already refuse, so such a record would then reach its recovery notice.

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
- `onEscape` in `src/app/keys.ts` listens on the window with no guard, so Escape pressed anywhere
  on a Foundry page closes an open dialog or popover.
- `Place.svelte` passes the store's commands to the place controller with a namespace import
  (`import * as store`) spread into its dependencies.
- Two shadows moved to shared tokens: `Dock`'s all-round glow now reads `--shadow-2`, and the
  `MapControls` grid dialog reads the deeper `--shadow-3`. `MapControls`' `::backdrop` reads
  `var(--scrim)` with no literal fallback.

## Carried forward from W9

- Live check: no one has played W9 in the browser or in Foundry, and no screenshot exists. Check
  token moves, rings, the flag, status bars, the engine chip and its hit box, a routed unit's
  grey-out, and a stage switch that tears the board down.
- `src/board/status-bars.ts` sizes the morale track with `ROUTED_AT` and labels a unit at Morale 0
  " — routed" without checking `status`; `PixiBoard.svelte` shows that label. The routed word
  could come from the token model's `routed` flag.
- Board teardown destroys the token layer after the fallen layer, so `FallenLayer.destroy` hands
  its held pieces back to `TokenLayer`, which renders them once before its own destroy.
- `src/board/index.ts`: both `setTerrainAppearance` guards test `currentBoard &&` after a
  non-null layer context, which already implies a board.
- `dev/two-clients/ClientPanel.svelte` is not type-checked and has gone stale: it builds
  `UnitTokenModel` without the required `routed` flag and passes `prop: null`. The fixture
  `dev/foundry-mount/battle-state.json` has no `disorder` or `routed` field and still carries
  `shaken`.

## Open question from W10

- `applyLaunchChoice` in `src/app/launch.ts` writes `SESSION_KEY` straight to local storage on
  `?new` and `?example`. That overwrites an unreadable browser session with no export and no
  notice. It is an explicit landing-page choice, so W10.1 left it alone. Should it go through the
  store, so an unreadable session refuses it and the recovery notice shows?

## Carried forward from W10

- Live check: no one has played W10 in the browser or in Foundry, and no screenshot exists. Corrupt
  each stored record in turn and check the GM's notice, export, confirm, cancel and clear, a
  player's notice, and the GM-only Foundry toast. The notice wording is marked `proto:`.
- The record names ("battle session", "saved battles", "battle sites") appear twice: in each
  store's `name` option and in the `NAMES` map in `src/app/store-recovery.ts`.
- Nothing marks a clear in flight: the confirm notice stays on screen until `port.clear` settles,
  so a double click can call clear twice. The second clear writes the same empty value.
- A GM with the Battlefield window open when a record turns unreadable sees both the Foundry toast
  and the in-app notice.

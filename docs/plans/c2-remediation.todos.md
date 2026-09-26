# C2 remediation — work still to do

Written 2026-09-26. Each wave's ledger step removes the tasks it finished and adds the questions it
could not answer. An item leaves this list when it is done or answered.

## Waves

- W6 — Engine answers, thin views: W6.1–W6.3
- W7 — Runtime and services: W7.1–W7.7
- W8 — App structure: W8.1–W8.4
- W9 — Board structure: W9.1–W9.2
- W10 — Recovery from an unreadable save: W10.1

## Carried forward from W1

- `createJsonArchive`'s accept checks only for a string `slot`. An entry with a string slot and
  no string `name` passes, and `filenameFor` throws on it during Foundry eviction.
- W6.1 and W6.3: the engine status label should treat a `left` unit as routed and gone. The
  audit's routed claim in M4 was false on current code.
- W6.1: `doAdvance` still accepts `[1, 2, 3]` for both finishes. A charge finish with 3 now fails
  in `doCharge` after `doStride` has run on the clone, with the text "invalid charge activity".
- W6.1: the comment above `ACTIVITIES` in `drag-controller.svelte.ts` still describes the charge
  activity, which no longer lives there.

## Open question from W2

- Water-sealed maps: `ConnectionWarning` checks river maps alone. A sweep of 86,400 non-river
  boards found four with no ground route, all sealed by a lake and ponds: swamp/lakeside/9/square
  seeds 20 and 129 (no fort), and swamp/lakeside/9/hex seeds 47 and 132 (fort tier 4; tier 3 also
  seals at seed 47). They show no warning. Should the warning cover every map, or should the
  generator drain a pond that seals a map?

## Carried forward from W2

- W6.2: `BattlePins.svelte` keeps two inline sign formats (near lines 220 and 236); switch them to
  `signed` from `presentation.ts`.
- W8.2: `Place.svelte` keeps two `ENGINES.find` calls (lines 248 and 263); switch them to
  `engineNamed` from `src/engine/siege-engines.ts`.
- W8.3: app files deep-import board internals `art`, `asset-base`, `terrain-textures`,
  `status-bars`, `color`, `paper`, `ink-map`, `selection`, `preload` and `target-point`; route
  them through the `src/board/index.ts` barrel.
- W7.7: `npm run check` and `npm run build:foundry` print Svelte `state_referenced_locally`
  warnings in `src/app/game.svelte.ts` and `src/app/TextureLab.svelte`. They predate W2.

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

- W6.1 keeps the `healableConditions` export W5.1 added. W6.3 moves `HealingChoices.svelte`'s call
  to it behind the report and healing controller.
- `Unit.flies`: nothing in `src` outside tests sets it to `true`. It looks like dead state; decide
  whether to delete it.

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

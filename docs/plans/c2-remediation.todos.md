# C2 remediation — work still to do

Written 2026-09-26. Each wave's ledger step removes the tasks it finished and adds the questions it
could not answer. An item leaves this list when it is done or answered.

## Waves

- W2 — Dead code, conventions, small duplication: W2.1–W2.6
- W3 — Shared primitives: W3.1–W3.2
- W4 — Engine structure and the migration seam: W4.1–W4.2
- W5 — Engine types: W5.1–W5.2
- W6 — Engine answers, thin views: W6.1–W6.3
- W7 — Runtime and services: W7.1–W7.7
- W8 — App structure: W8.1–W8.4
- W9 — Board structure: W9.1–W9.2
- W10 — Recovery from an unreadable save: W10.1

## Answered by the user (2026-09-26)

- Push and pull: a rooted target resists a troop-ability push or pull, as it resists a siege
  push. The ability path must refuse rooted targets; update the Push / Pull row in
  `public/rules.html` to say so.
- Ground connectivity (W2.3): one rule, stated in elevation terms, not feet. A map is connected
  when a walking route runs from the attacker's deployment zone to the defender's, and no step on
  it enters water or crosses a cliff (a change of two or more elevation levels) or a wall. The
  generator and the warning both use it. Describe it this way in code comments and in
  `public/rules.html`; never as "30 ft". The rule concerns walking units only, because the
  generator runs before armies exist: swimmers enter water, and fliers cross water, walls and
  cliffs, as the movement rules already say. Movement rules stay as they are.

## Carried forward from W1

- `createJsonArchive`'s accept checks only for a string `slot`. An entry with a string slot and
  no string `name` passes, and `filenameFor` throws on it during Foundry eviction.
- W6.1 and W6.3: the engine status label should treat a `left` unit as routed and gone. The
  audit's routed claim in M4 was false on current code.
- W6.1: `doAdvance` still accepts `[1, 2, 3]` for both finishes. A charge finish with 3 now fails
  in `doCharge` after `doStride` has run on the clone, with the text "invalid charge activity".
- W6.1: the comment above `ACTIVITIES` in `drag-controller.svelte.ts` still describes the charge
  activity, which no longer lives there.

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

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

## Questions for the overseer to settle from the rules page, or to raise here

- Push and pull: does a rooted target resist a troop-ability push or pull? The rules page says
  siege forced movement respects roots, and the troop-ability Push / Pull row says only "one legal
  hex". The ability path keeps today's answer, no; the siege path refuses rooted targets.
- Ground connectivity: which rule holds — the generator's (from rank 0, water and cliffs block)
  or the warning's (between deploy zones, any step over 30 ft blocks, walls included)?

## Carried forward from W1

- For play: nothing lets a GM clear or export an unreadable world setting, and the browser
  cannot clear an unreadable session or archive key. Recovery needs the console, and every commit
  shows "Changes could not be saved" until the key is cleared.
- `createJsonArchive`'s accept checks only for a string `slot`. An entry with a string slot and
  no string `name` passes, and `filenameFor` throws on it during Foundry eviction.
- W6.1 and W6.3: the engine status label should treat a `left` unit as routed and gone. The
  audit's routed claim in M4 was false on current code.
- W6.1: `doAdvance` still accepts `[1, 2, 3]` for both finishes. A charge finish with 3 now fails
  in `doCharge` after `doStride` has run on the clone, with the text "invalid charge activity".
- W6.1: the comment above `ACTIVITIES` in `drag-controller.svelte.ts` still describes the charge
  activity, which no longer lives there.

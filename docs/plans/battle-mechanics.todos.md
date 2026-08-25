
## Troops-only notes

Wave 3 (troops only, pulled forward, run in parallel with Wave 1).

- Removed the "Your own" hand-built-unit section from `Place.svelte`: the `custom` state
  object, name/level/role inputs, Salvo select, Pace/Fear checkboxes, the tactics checkbox
  grid, the derived-stats preview line, and "Add New Unit". The roster picker, the generate
  button, siege-engine attachment, and the placed-unit list are untouched.
- Deleted `ROLES`, `REACHES`, `TACTICS` (the array), and `ROLE_BLURBS` from
  `src/engine/cards.ts` — grep confirmed no caller remained anywhere in `src/` once the
  custom-unit form controls that were their only consumers were gone.
- Kept `ROLE_PROFILES`, `deriveStats`, `cardTraits`, `derivation`, `paceReason`: `battle.ts`
  calls `deriveStats`/`cardTraits` to drive every roll from troop stats, and `Place.svelte`
  still renders `derivation`/`paceReason` as the "Battle ·" preview line for every roster/
  official/placed troop, including generic-roster troops that have no full sheet and derive
  from the level table alone. `ROLE_PROFILES` is an internal helper those three share. The
  `Role`, `Reach`, `Tactic` *types* also stay — used throughout `UnitCard` and `battle.ts`.
- Kept `FALLBACK_ART` in `src/engine/art.ts`: custom units are gone, but generic `ROSTER`
  troops (and any troop missing a specific art entry) still fall back to a role-based image.
- No test exercised the custom-unit-creation UI — there was no `Place.svelte` test — so
  nothing needed rewriting. The `UnitCard` object literals in `battle.test.ts`,
  `engines.test.ts`, `force.test.ts`, `cards.test.ts` are plain data fixtures for engine
  functions, unrelated to the deleted feature; left untouched (and `battle.test.ts` is a
  concurrent agent's file regardless).

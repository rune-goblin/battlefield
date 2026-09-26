# C2 remediation — work still to do

Written 2026-09-26. Each wave's ledger step removes the tasks it finished and adds the questions it
could not answer. An item leaves this list when it is done or answered.

## Waves

W1–W11 are done. No task failed or went unrun.

## Open questions from W11

- `src/tests/e2e/vfx.spec.ts` skips, marked `proto:`. W2.5 gated `?vfx` to dev builds, and
  `npm run test:e2e` serves the production `build:foundry`, so the harness lost its PIXI-shim burst
  coverage. Delete the spec, or give the harness a dev build for it?
- The "Escape inside the Battlefield window" keybinding shows in Foundry's Configure Controls and
  cannot be edited. Other core keybindings, map pan and tool letters, still fire for keys typed
  with focus inside the window. Should the window consume those too?
- At a 1280px window the drag HUD, bottom left, overlaps the HexInfo bar; `board.spec` writes
  `W8-drag-hud.png` under `test-results/live-check/`. Move one of them?
- The army reel overlays the board's top left. A piece centred there has its engine chip under a
  reel card, where it cannot be clicked. Should the board keep pieces clear of the reel?

## Carried forward from W11

- Some views still call engine functions, the concern W11.4 fixed for `UnitSheet`:
  `TroopPicker.svelte` (`deriveStats`, `abilitySummary`), `HexInfo.svelte` (`at`, `gridOf`) and
  `ArmyReel.svelte`'s routed test (`u.disorder >= ROUTED_AT`). Each needs a controller or model
  that hands the view finished values.
- The Overrun detail in `src/engine/ladders.ts:58` reads "A blocked retreat causes no extra Morale
  loss". The Cornered row in `rules.html` costs 1 extra Morale, so the in-game text disagrees with
  the rules page.
- The End battle dialog reports unsaved moves right after a Save and Load, because the load bumps
  the revision.
- A schema-2 saved unit whose card carried the old `fly` flag keeps no `sourceSpeed.otherSpeeds`
  after the schema-3 step, so `UnitSheet`'s Army Speed label shows land speed alone for that saved
  battle. Its rates are right.
- `src/app/battle/drag-controller.svelte.ts` imports `parse` from the engine and never calls it.
- A dragged melee with waypoints rebuilds the whole `activation()` answer on each waypoint change.
  The performance tests time only the waypoint-free path; time a long waypoint chain.
- `dev/foundry-mount/battle-state.json`'s `u4` token has `"ring": "highlighted"`, which is no
  `TokenRing` value. Sweep the dev fixtures for stale enum values.
- No screenshot shows the Battle stage's unit sheet since W11.4 moved it onto a controller.
- A resumed browser battle's ticked steps cannot be checked: the rail hides during a battle, and
  End battle resets the wizard to Battlefield. `browser.spec` asserts the setup resume's ticks
  alone.
- One run of `recovery.spec` logged a transient "Failed to load resource: 429" from an unknown
  resource. It did not recur in three runs, but `collectErrors` would fail the spec if it did.

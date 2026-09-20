# Foundry seam — work still to do

Written 2026-09-20, after the first live Foundry test of v0.1.0. Every bug that test found sat
at the boundary with Foundry, and `npx vitest run`, `npm run check` and both builds caught none
of them. The items below are in the order to do them. Item 2, the PIXI shim, was done on 2026-09-20:
`vite.foundry.config.ts` generates the shim's export list from the installed `pixi.js` and fails
the build on an import that resolves to nothing.

## 1. Live smoke test

A Playwright run against a real Foundry world with a GM client and one player client.

The harness is in place (ported from `rune-goblin/runegoblin-foundrytemplate`, 2026-09-20):
`npm run test:e2e` boots a cloned `stolen-lands` on :30005 with a GM client and a player client.
`src/tests/e2e/README.md` has the account. Three specs exist:

- `launch.spec.ts` — the scene control opens the window; the player client joins.
- `battle.spec.ts` — the GM walks the seven wizard steps with the rail's label and hint checked
  for overlap on each, begins the battle, the player's window opens once with reel art loaded,
  the reopen chip shows in `#ui-right-column-1` while that window is shut and brings it back,
  and End battle clears the player's window and chip. It relies on the deployed setup the world
  clone already holds.
- `vfx.spec.ts` — `/game?vfx` plays every spell burst and asserts an empty console.

All four tests passed in one run on 2026-09-20 (4.2 minutes; the gallery spec takes two of them,
a third Foundry canvas on software GL).

Still to write:

- The save prompt in End battle. The spec takes whichever of End battle and End without saving
  the dialog offers.
- On the kingdom map, pick a hex with armies, then a second hex, then the first again. The
  first battle comes back as it stood, the `sites` setting holds the other, and the player
  client follows each switch without a reload. The spec runs against the installed ReignMaker,
  a built copy the harness clones with the other modules. It lacks `getArmies()` and
  `getFactions()`, so the spec exercises the kingdom-flag fallback until ReignMaker ships them.
- A damage popup with an empty console. `PopupLayer` reads `TEXT_GRADIENT` and `TextMetrics`,
  and the gallery plays bursts alone. It needs an attack played through the canvas, or a
  popup added to the `?vfx` gallery. `play.spec.ts` drags a move and spends Guard; a Strike
  needs a fixture with an enemy in reach at the start.
- A setup the spec builds for itself, so a fresh world clone needs no hand deployment.
- The release workflow has never run. The next tag is its first test.

## 3. One shell, stages as views

Done 2026-09-20: `App.svelte` mounts the one `AppShell` and the one
`PixiBoard`; a stage renders nothing and presents its snippets, board props and handlers through
`src/app/stage-view.svelte.ts`. `shared-board.ts` and the `shared` prop are gone, and
`clearEffects()` drops bursts and popups on a stage switch. `Battle.svelte` is a view over
`src/app/battle/battle-controller.svelte.ts`, which composes the drag, ring and picker
controllers.

- `Place.svelte` carries deployment logic of the same kind and takes the same split.
- The camera now carries over from one stage to the next, since the view is never re-attached.
  Decide at the table whether a stage should refit on entry.

## 4. `// proto:` items at the seam

- `src/app/game.svelte.ts` builds the browser runtime and reads `localStorage` on every host,
  and a Foundry client replaces it through `bindClient`. The host should supply the first
  client.
- `battleUnsaved` knows only the saves this client made since it loaded. A save from another
  GM client or from before a reload prompts again.

## 5. Battle sites, from the 2026-09-20 multi-battle change

- Battles show on the kingdom map during the pick alone, as hover text. A standing marker on
  every battle hex needs a ReignMaker API (`setBattleMarkers(hexIds)` or an overlay); its
  `existingHexes` option pre-selects hexes and cannot serve.
- No UI removes a planned battle. `api.removeBattle(site)` exists for a macro; a list of
  battles in the app's top bar could offer Open and Remove.
- The `sites` setting holds every parked record in one string and has no cap.
- Never run in a live Foundry world.

## Not verified live, from the 2026-09-20 changes

- The `all: revert` rule in `foundry.css` against pf2e's and other modules' unlayered CSS.
- The baked terrain (`TerrainLayer.ts`): tree-shadow alpha, relief at the board edge, softness
  past 2× zoom.
- Foundry's own canvas renders under the window at full rate. Pausing `canvas.app.ticker`
  while the window is maximized was considered and left alone.
- The ReignMaker armies tab against a live kingdom. `getArmies()` and `getFactions()` exist in
  the ReignMaker checkout only, uncommitted on `master`; the installed copy lacks them and the
  tab reads the kingdom flag as a `// proto:` fallback.
- Georgia is a system font and is absent on Linux. No font is packaged for the app's text.

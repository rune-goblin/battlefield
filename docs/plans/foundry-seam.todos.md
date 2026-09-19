# Foundry seam — work still to do

Written 2026-09-20, after the first live Foundry test of v0.1.0. Every bug that test found sat
at the boundary with Foundry, and `npx vitest run`, `npm run check` and both builds caught none
of them. The four items below are in the order to do them.

## 1. Live smoke test

A Playwright run against a real Foundry world with a GM client and one player client.

- First, port the pieces of `rune-goblin/runegoblin-foundrytemplate` that Battlefield lacks.
  Battlefield began as a browser app and was never built from the template. Keep this repo's
  layout (`engine/`, `board/`, `runtime/`, `services/`, `adapters/`) and its browser build.
  - The e2e harness: `playwright.config.ts`, `src/tests/e2e/` with the `foundry-clients.ts`
    fixture and `global-setup.ts`, `scripts/setup-test-env.ts`, `scripts/start-test-env.sh`.
  - `scripts/setup.ts` (the symlink for live editing) and `scripts/deploy.ts` (a link-free
    copy), in place of the hand-made symlink from `Data/modules/battlefield` to `dist-foundry`.
  - `.github/workflows/release.yml`, in place of the zip, upload and manifest edits done by
    hand for v0.1.0. Each release attaches `battlefield.zip` and `module.json` and bumps
    `version` and the tag inside `download`.
  - The `.claude/skills/foundry-pf2e` skill and its references.

- Open the window from the scene control. Walk the wizard: Battlefield, Paint, Siege engines,
  Sides, both army steps, Review.
- Start the battle. The player's window opens once and the round chip sits in
  `#ui-right-column-1`. The player shuts the window and the chip stays.
- The GM presses End battle, answers the save prompt, and the player's window and chip go.
- Assert layout, since leaked host CSS was the largest bug: the wizard rail's step buttons hold
  a label and a hint without overlap, a reel card shows its art, and `getComputedStyle` of a
  button under `.battlefield-root` reports no fixed `height`.
- Assert the console holds no error after a damage popup and a spell burst. The PIXI shim's
  missing names failed there.
- The ReignMaker checkout at `/Users/mark/Documents/repos/pf2e-reignmaker` has a
  `playwright.config.ts` to copy from. Foundry 14.365 is installed locally and
  `Data/modules/battlefield` symlinks to `dist-foundry`.

## 2. The build fails on a missing shim name

`src/adapters/foundry/pixi-shim.ts` lists its exports by hand. A name the board imports and the
shim lacks compiles to `undefined` with a warning. `TEXT_GRADIENT` and `TextMetrics` were
missing until 2026-09-20. Make `vite.foundry.config.ts` turn that warning into an error, or
generate the shim's export list from the board's imports.

## 3. One shell, stages as views

- Every stage mounts its own `AppShell` and its own `PixiBoard`. The six main boards already
  share one PIXI application through `src/app/shared-board.ts` (`attach`/`detach` on the view
  `createBoardView` returns). The structure still says otherwise.
- Hoist one `AppShell` and one `PixiBoard` into `App.svelte`. A stage becomes a view that
  supplies panels, board props and event handlers. `shared-board.ts` and the `shared` prop then
  go away.
- Split `src/app/Battle.svelte` (1,937 lines) in the same pass.
- A popup or spell burst in flight when the stage changes pauses with the ticker and resumes on
  the next stage. Clear them on the switch.

## 4. `// proto:` items at the seam

- `src/app/game.svelte.ts` builds the browser runtime and reads `localStorage` on every host,
  and a Foundry client replaces it through `bindClient`. The host should supply the first
  client.
- An emplaced engine still stores a `side`; a new one files under `'attacker'` until a unit
  claims it, so an engine nobody claims at deployment favours the attacker. A neutral owner
  needs an engine change.
- `battleUnsaved` knows only the saves this client made since it loaded. A save from another
  GM client or from before a reload prompts again.
- The header-controls menu is built once per frame render, so Call and Dismiss both always
  show. Move both into the app's own top bar, beside End battle.

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

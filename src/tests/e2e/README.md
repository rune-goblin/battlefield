# Playwright e2e harness

These specs drive the built Foundry module in a headless Foundry v14 with a GM client and one
player client. The vitest suite covers the engine, runtime and services in Node. Every bug the
first live test found sat at the boundary with Foundry, and this tier covers that boundary.

The tier needs a licensed local Foundry v14 and a migrated world, so CI runs vitest alone.

## Structure

```
playwright test
  ├─ webServer:   bash scripts/start-test-env.sh  → Foundry on :30005, --world=$TEST_WORLD
  ├─ webServer:   npx vite --port 5199            → the browser app, for browser.spec.ts
  ├─ globalSetup: src/tests/e2e/global-setup.ts   → join as GM, enable the module, fail loud
  └─ specs:       *.spec.ts                       → drive the window, assert game.* and the DOM
```

The test Foundry serves `dist-foundry` through a `modules/battlefield` link. `npm run test:e2e`
runs `npm run build:foundry` first, so specs exercise current source. `browser.spec.ts` drives
`play.html` on the Vite dev server instead, with a fresh `localStorage` per test.

## Isolated test data

`npm run test:e2e:setup` builds `test/foundry-data/` (gitignored): its own `Config/options.json`
on port 30005, a copy of `license.json`, and no `admin.txt`. It reads the Foundry data path from
`.dev-paths.json`, which `npm run setup` writes, or from `FOUNDRY_DATA`.

`systems`, `modules` and the test world are cloned from that data dir. A running Foundry locks
every world database and every compendium pack it can see, so a shared directory stops the
second instance from booting. With clones, the desktop Foundry runs beside the suite. APFS
clones are copy-on-write and take seconds.

`start-test-env.sh` re-clones `systems` and `modules` on every boot; `TEST_FOUNDRY_SKIP_SETUP=1`
skips that. A sibling module whose `packs` links into its repo gets that entry cloned. The world
is cloned once and kept, since it holds the module-enabled setting and the `__e2e_player` user.
`npm run test:e2e:setup -- --reset-world` clones it afresh.

From a git worktree, link `test/foundry-data` to the main tree's copy. The clone's
`modules/battlefield` link names one checkout's `dist-foundry`, so point it at the worktree's for
the run and back afterwards, or the run exercises the other build.

## The test world

`TEST_WORLD` defaults to `stolen-lands`, the world ReignMaker's harness uses, because the
battle-site specs need a kingdom map.

- Its GM user has no password.
- It is already on the running Foundry's core and system version. `--world` refuses a world
  that needs migration, and `global-setup` then reports `No active world at this port`. Open
  the world once in the desktop Foundry, let it migrate, and run the setup again with
  `--reset-world`.
- On first run `global-setup` sets `core.moduleConfiguration` to enable Battlefield in the
  clone, and the `playerPage` fixture creates a password-less player named `__e2e_player`.
- The join screen works with the user list shown or hidden.

## Commands

```bash
npm run setup                     # once: caches the Foundry data path, links the module
npx playwright install chromium   # once
npm run test:e2e                  # build dist-foundry, then run the specs
npm run test:e2e:run              # skip the rebuild
npm run test:e2e:ui               # Playwright UI mode
npm run test:e2e:report           # open the last HTML report
npm run test:foundry              # boot the test Foundry alone, for manual poking
npm run check:e2e                 # type-check the specs and the scripts
```

## Harness health

`reuseExistingServer` is on locally, so a stray Foundry on :30005 gets reused. `global-setup`
asserts `game.world.id === TEST_WORLD` and logs the world and module version it exercised.
Kill a stray with `lsof -ti:30005 | xargs kill`.

## Spec conventions

- Use the `gmPage` and `playerPage` fixtures from `fixtures/foundry-clients.ts`. Both are
  worker-scoped: one login each for the whole run.
- `collectErrors(page)` gathers `console.error` output, uncaught exceptions and failed requests
  for the module's own files, for a spec to assert empty.
- `shot(page, name)` saves `test-results/live-check/<name>.png`, one for each screen a live check
  covers. Playwright empties `test-results/` at the start of a run, so the last full run's set is
  the record.
- Select by stable hooks: the window is `#battlefield`, the app root is `.battlefield-root`,
  the scene control is `button[data-tool="battlefield"]`.
- The world clone persists across runs. A spec ends its battle and closes the window.
  `battle.spec.ts` and the rest need the clone's deployed setup, so a spec that writes a world
  setting reads it first and restores it in a `finally`. After restoring the session it reloads
  the GM, whose executor would otherwise save the session it holds over the restored one.

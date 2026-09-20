# Testing: the two tiers

| Tier | Command | Runs on | Proves | Needs |
|------|---------|---------|--------|-------|
| **vitest** | `npm test` | Node | engine rules, runtime commands, services | nothing |
| **Playwright e2e** | `npm run test:e2e` | a headless Foundry v14 | the built module loads, the window renders under host CSS, two clients stay in step | a licensed local Foundry v14 and a migrated world |

Reach for vitest first. The repo's `CLAUDE.md` sets the testing bar per folder: prototype mode
for most of the app, direct tests for every invariant in `src/runtime/` and `src/services/`,
no tests for PIXI code. Use e2e for the Foundry seam: hooks, settings, sockets, the scene
control, leaked host CSS, the PIXI shim.

## vitest tier

`npm test` runs `src/tests/**/*.test.ts` (configured in `vite.config.ts`). e2e files end in
`.spec.ts`, so vitest skips them.

## Playwright e2e tier

```bash
npm run setup                     # once: caches the Foundry data path, links the module
npx playwright install chromium   # once
npm run test:e2e                  # build dist-foundry, then run the specs
npm run test:e2e:run              # skip the rebuild
npm run test:e2e:ui               # Playwright UI mode
npm run test:e2e:report           # open the last HTML report
npm run test:foundry              # boot the test Foundry alone
npm run check:e2e                 # type-check the specs and scripts/*.ts
```

```
playwright test
  ├─ webServer:   scripts/start-test-env.sh      → Foundry on :30005, --world=$TEST_WORLD
  ├─ globalSetup: src/tests/e2e/global-setup.ts  → join as GM, enable the module, fail loud
  └─ specs:       *.spec.ts                      → drive the window, assert game.* and the DOM
```

The test Foundry serves `dist-foundry` through a `modules/battlefield` link inside
`test/foundry-data/`. `systems`, `modules` and the world are cloned (copy-on-write) from the
real data dir, because a running Foundry locks every LevelDB it can see; the desktop Foundry
runs beside the suite. `src/tests/e2e/README.md` has the full account.

### Preconditions

- A licensed Foundry v14 installed locally. `start-test-env.sh` finds the app bundle;
  `FOUNDRY_APP` overrides it.
- `TEST_WORLD` (default `stolen-lands`) has a GM with no password and is already on the
  running core and system version. A world that needs migration fails with
  `No active world at this port`.
- The first run enables the module in the world clone and creates the `__e2e_player` user.

## Harness health

`reuseExistingServer` is on locally, so a stray Foundry on :30005 gets reused.

- `global-setup.ts` asserts `game.world.id === TEST_WORLD` and logs the world and module
  version it exercised. Read that line.
- Kill a stray: `lsof -ti:30005 | xargs kill`.
- The clone is a point-in-time copy. A change made in the desktop Foundry reaches the harness
  after the next setup run; a world change needs `--reset-world`.
- When a result surprises you, suspect the harness first.

## Writing a spec

Add `src/tests/e2e/<operation>.spec.ts`, one operation per file.

- Use the `gmPage` and `playerPage` fixtures from `fixtures/foundry-clients.ts`. Both are
  worker-scoped. Don't re-implement login.
- `collectErrors(page)` gathers `console.error` output and uncaught exceptions.
- Reach Foundry through `page.evaluate(() => game.…)`. Select by stable hooks: `#battlefield`,
  `.battlefield-root`, `button[data-tool="battlefield"]`, `data-*` attributes.
- The world is shared across specs (`workers: 1`) and persists across runs. A spec ends its
  battle and closes the window.
- Keep `global-setup.ts` and the fixtures generic; feature setup belongs in the spec.

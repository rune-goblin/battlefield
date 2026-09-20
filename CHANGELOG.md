# Changelog

Notable changes to Battlefield. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions track `module.json`.

## [Unreleased]

### Added

- Many battles on the kingdom map, keyed by hex, with one open at a time (`session.moveTo`,
  `api.battles`, `api.openBattleAt`, `api.removeBattle`).
- A Playwright e2e tier: `npm run test:e2e` drives a headless Foundry with a GM client and a
  player client.
- `npm run setup` links the module and the PF2e and Foundry references; `npm run deploy`
  installs a link-free copy.
- `npm run dev:foundry` serves the module with HMR in front of a running Foundry;
  `npm run watch:foundry` is the rebuild-on-save loop it replaces.
- The PIXI shim's export list is generated from the installed `pixi.js`, and the Foundry build
  fails on an import that resolves to nothing.
- A tag-driven release workflow and a CI workflow.
- The `foundry-pf2e` typedefs check every Foundry call in `src/adapters/`.
- `LICENSE` ships in the module.

### Changed

- One shell and one board for every stage: `App.svelte` owns them and a stage presents its
  panels and board props through `stage-view`. A burst or popup in flight is cleared on a
  stage switch.

- The GM's Call players and Dismiss players sit in the app's top bar as one button that follows
  the call. Foundry builds a window's header menu once, so both entries always showed there.

- An emplaced engine no unit claims at deployment is nobody's: it does nothing, and at the end
  of a round it goes to the army that alone stands by it. It used to start as the attacker's.

### Fixed

- Foundry's element rules leaked into the app and broke its layouts; `foundry.css` reverts them
  under `.battlefield-root`.
- The PIXI shim lacked `TEXT_GRADIENT` and `TextMetrics`, so a damage popup threw.
- The reopen chip follows a battle under way as well as the GM's call, and sits in
  `#ui-right-column-1`.
- The GM's End battle prompts to save.
- The window's `render` call passed `focus`, an option ApplicationV2 lacks.

## [0.1.0] — 2026-09-19

First release as a Foundry module: the battle window from a scene control, the store bound to
the Foundry host, the GM's call to the table, the Sides step, and the ReignMaker hex pick.

---
name: foundry-pf2e
description: >-
  Authoring Foundry VTT Pathfinder 2e (PF2e) modules with TypeScript, Svelte 5, and
  Vite, targeting Foundry v14 APIs only (ApplicationV2 / DialogV2 / DataModel — never
  the v1 namespace). Use whenever working inside a Foundry/PF2e module repo: editing
  module.json, src/ esmodules, hooks, settings, document flags, compendium packs (the
  fvtt CLI), a Svelte UI mounted in ApplicationV2, the Vite lib build, or multi-client
  state sync. Trigger even when the user only mentions Foundry, a PF2e module,
  ApplicationV2, foundry packs, hooks, or a module.json — don't wait to be named.
---

# Foundry VTT PF2e module authoring

Conventions and APIs for Battlefield's Foundry module, ported from the
`rune-goblin/runegoblin-foundrytemplate` skill. Battlefield began as a browser app and keeps
both builds: `npm run build` emits the browser app into `dist/`, and `npm run build:foundry`
emits the module into `dist-foundry/` (`battlefield.js`, `battlefield.css`, `art/`, `fonts/`
and a copy of `module.json`). That folder is the whole module.

Foundry globals appear in `src/adapters/` alone (`foundry`, `pf2e`, `reignmaker`). The engine,
board, runtime, services and Svelte stages stay host-free; see the repo's `CLAUDE.md` for the
layout. The module ships no compendium packs and no `lang/` file.

## Two rules that override defaults

**1. v14 only — no v1 APIs.** Use only current Foundry APIs under the `foundry.*`
tree. Never the v1 namespace or deprecated globals: no `foundry.appv1`; no bare
`Application` / `FormApplication` / `Dialog`; no bare `mergeObject` / `duplicate` /
`getProperty` (use the `foundry.utils.*` forms). Every window is an **ApplicationV2**
(`foundry.applications.api.ApplicationV2`); dialogs are **DialogV2**
(`foundry.applications.api.DialogV2`); structured data is `foundry.abstract.DataModel`
with `defineSchema()`. If a class seems to exist only in v1, find its V2 replacement
before writing it — don't fall back to v1.

**2. New tooling is TypeScript.** App code, both Vite configs, and the Foundry scripts
(`scripts/setup.ts`, `deploy.ts`, `setup-test-env.ts`) are TypeScript. Run them with
`node scripts/foo.ts`; Node ≥22.18 strips types by default, so no `tsx`/`ts-node`. The older
import and bake scripts are `.mjs` and stay as they are.

## Reference files — read the one that fits the task

Load these as needed; don't read all of them up front.

- **`references/foundry-api.md`** — the API surface: `foundry.*` namespaces, `game.*`,
  hooks and lifecycle, documents & flags, settings, the packs runtime API, ambient
  globals, and where the authoritative docs live. Read when writing hooks, settings,
  flags, or any Foundry API call.
- **`references/svelte-in-applicationv2.md`** — the Foundry UI glue: a thin
  ApplicationV2 shell that `mount()`s a Svelte 5 component (`unmount()` on close), the
  `*.svelte` shim, and Svelte's own AI tooling (`@sveltejs/mcp` autofixer) for the
  language itself. Read when building or editing any UI.
- **`references/vite-build.md`** — the Foundry build: `vite.foundry.config.ts`, the PIXI
  shim, what lands in `dist-foundry`, `npm run setup` and `npm run deploy`, and the release
  workflow. Read when touching the build, the shim, or a release.
- **`references/multi-client-sync.md`** — keeping state consistent across connected
  clients: document-flag propagation vs. raw socket, GM-authority request/reply, race
  safety. Read only when state must sync across clients.
- **`references/testing.md`** — the two-tier verification harness: `npm test` (vitest,
  zero-setup, the CI tier) vs. `npm run test:e2e` (Playwright against a real headless
  Foundry), what each proves, commands + preconditions, checking harness health before
  trusting green, and how to author a spec. Read when verifying a change, adding tests,
  or wiring CI.

## Essentials worth knowing without opening a file

**Module identity.** The module id `battlefield` is the key for flags, settings and the
socket channel (`module.battlefield`). Import `MODULE_ID` from
`src/adapters/foundry/module-id.ts`; the Foundry build fails when `module.json` disagrees.

**Public API.** `game.modules.get(MODULE_ID).api` holds `BattlefieldModuleApi`
(`src/adapters/foundry/moduleApi.ts`). Don't attach to `game`.

**Localization.** The app's strings are hard-coded English, shared with the browser build,
and the module ships no `lang/` file.

**State.** The battle record and the parked `sites` live in world settings
(`worldSettings.ts`, `worldSessionRepository.ts`, `worldSites.ts`). Document flags
(`doc.getFlag(MODULE_ID, key)`) suit state that belongs to one document.

**Authoritative docs.** Official reference: https://foundryvtt.com/api/ (pick the v14
build). The `foundry-pf2e` typedefs (`node_modules/foundry-pf2e/types/`, named in
`tsconfig.json`'s `types`) are what `npm run check` checks the adapters against, and they add
PF2e types. On conflict, trust the typedefs for what compiles and the Foundry source
(`_pf2e-source`, and the app bundle's `client/`) for what runs. A module's `api` goes through
`src/adapters/foundry/hostModule.ts`, since `Module` has no such field.

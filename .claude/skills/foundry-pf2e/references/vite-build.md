# Vite builds

The repo has two builds.

- `npm run build` (`vite.config.ts`) emits the browser app into `dist/`. `npm run dev` serves it.
- `npm run build:foundry` (`vite.foundry.config.ts`) emits the Foundry module into
  `dist-foundry/`. `npm run watch:foundry` rebuilds it on save. `npm run dev:foundry` is the
  HMR dev server (see Dev reload).

## The Foundry build

A Vite library build with one entry, `src/adapters/foundry/index.ts`, and two outputs,
`battlefield.js` and `battlefield.css`. A plugin copies `public/art`, `public/fonts`,
`module.json` and `LICENSE` beside them, so `dist-foundry` is the whole module and `module.json` names its
files without a `dist/` prefix.

- **PIXI shim.** Foundry publishes pixi.js 7.4.3 as the global `PIXI`: a script, with no ES
  module to import. The board imports `pixi.js` as a module, which the browser build bundles
  from npm. For the Foundry build a plugin in `vite.foundry.config.ts` resolves `pixi.js` and
  `@pixi/core` to a virtual module that re-exports the global's members, so the module ships
  no second copy of PIXI. The plugin takes the export names from the installed `pixi.js`, and
  the build fails on any import that resolves to nothing (`IMPORT_IS_UNDEFINED`). Keep
  `package.json`'s `pixi.js` on the version Foundry bundles.
- **CSS.** `cssCodeSplit: false` yields one stylesheet. Svelte's scoped classes take the
  `svelte-bf-` prefix. `src/adapters/foundry/foundry.css` guards the app against host CSS;
  every app rule sits under `.battlefield-root`.
- **Module id.** The config throws when `module.json`'s `id` differs from `MODULE_ID`.
- Vite does no type-checking. `npm run check` runs `svelte-check` (with the `foundry-pf2e`
  typedefs) and the engine `tsc`. The root `tsconfig.json` leaves `verbatimModuleSyntax` off,
  because the typedefs ship `.mts` sources that fail under it; `tsconfig.engine.json` keeps it.

## Dev install and deploy

- `npm run setup` finds the Foundry data dir, caches it in `.dev-paths.json` (gitignored), and
  symlinks `Data/modules/battlefield` to `dist-foundry`, and links `_pf2e-source`,
  `_foundry-data` and `_foundry-modules` into the repo.
- `npm run deploy` builds, then replaces that link with a link-free copy of `dist-foundry` —
  the same files the release zip holds.

## Dev reload

`npm run dev:foundry` runs Vite on :30002 in front of a running Foundry on :30000
(`DEV_PORT` and `FOUNDRY_PORT` override both). Launch a world with the module enabled, then
browse `http://localhost:30002/game`.

- Foundry's page asks for `modules/battlefield/battlefield.js`; a middleware answers with the
  source entry, `src/adapters/foundry/index.ts`. `battlefield.css` answers empty, since the
  entry injects the styles in dev.
- Vite serves `/src`, `/node_modules`, `/@vite`, `/@id` and `/@fs`. Every other path, the socket
  included, proxies to Foundry. Art and fonts come from the last `npm run build:foundry`
  through the `dist-foundry` link, so build once first.
- The PIXI shim plugin serves the same virtual module in dev. The pixi packages are excluded
  from dependency pre-bundling, which would resolve `@pixi/core` past the shim.
- A `.svelte` or CSS edit hot-swaps in place. An edit to any `.ts` module (engine, runtime,
  services, board, adapters) reloads the page, which is a full world load.
- `import.meta.env.DEV` is true, so the texture lab and effects links show.
- Fallback: `npm run watch:foundry`, browse :30000, and press F5 after a rebuild.
- `npm run dev` stays the faster loop for UI work that needs no Foundry.

## Release

`.github/workflows/release.yml` runs on a `vX.Y.Z` tag. It stamps `version` and the tag inside
`download` into `module.json`, runs `npm ci`, `npm run check`, `npm test` and
`npm run build:foundry`, zips the contents of `dist-foundry` as `battlefield.zip`, and attaches
the zip and `module.json` to the release. `manifest` stays on `releases/latest`.

To release: `git tag v0.2.0 && git push origin v0.2.0`. The `version` in the checked-in
`module.json` is whatever the last hand edit left; the workflow's stamp is what ships.

## TypeScript tooling

Both Vite configs and the Foundry scripts are TypeScript, run as `node scripts/foo.ts` on
Node ≥22.18 (`.nvmrc` pins 24). `tsconfig.node.json` covers them; `npm run check:e2e` checks it.

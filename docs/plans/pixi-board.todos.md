# pixi-board — open questions and wave notes

Reserved judgment calls (decide at review, not inside a wave):

- Hex deployment: keep "three rows a side" (rows 1–3 and 6–8), or three columns? Rows keep
  the rules text unchanged.
- Pace on hex: "two cells in a straight cube direction" — confirm in play that it does not
  make cavalry too fast across a 6-neighbour board.
- Art licence: pf2e-trooper's `LICENSE` (see below) decides whether `public/art/` is committed
  or fetched at build time.
- `Board.svelte`: delete after Wave 5, or keep as a text fallback for screen readers and
  print?

Notes:

- pf2e-trooper `LICENSE` is MIT (copyright Mark Pearce, 2024–2026) for the template's own
  code; it says nothing about the art in `assets/`. The art is Mark's own generated work in
  his own repo, so it is safe to commit under `public/art/`; note the source in README.

## Wave 0 notes (2026-08-24)

- Reignmaker has no `src/services/map/styles/colors.ts`; `TERRAIN_OVERLAY_COLORS` actually
  lives in `src/styles/colors.ts` and is re-exported through
  `src/view/kingdom/utils/presentation.ts`. Used the real path.
- `LayerManager.ts`'s `../types` import (Reignmaker's `LayerId`/`MapLayer`) carries Foundry
  kingdom-map layer names and icon-path exports that don't apply here. Inlined a `LayerId`/
  `MapLayer` pair scoped to this board (`terrain`/`edges`/`overlay`/`tokens`/`labels`, plus a
  `grid` id for the Wave 0 stub) instead of importing Reignmaker's file, and rewrote
  `getDefaultZIndex`'s switch for those names. Dropped the unused `logger` import (dead in
  the Reignmaker source too — never called in the class body). Everything else in the class
  is untouched, including its original JSDoc, for backport parity.
- `theme.ts`: only `forest`/`swamp`/`water` have a direct Reignmaker analogue (their hex
  vocabulary is plains/forest/hills/mountains/swamp/marsh/water/desert/tundra/ruins/cave/
  wasteland; ours is open/forest/swamp/shallows/water/settlement). Rather than inventing a
  palette from nothing for `open`/`shallows`/`settlement` and for the light-mode variant
  (Reignmaker has none — Foundry's canvas is always dark), reused `Board.svelte`'s existing
  `app.css` light/dark hex values, since those already read as a dark/desaturated pairing of
  Reignmaker's hues and keep the Pixi preview visually matched to the DOM board it sits next
  to in this wave's screenshot. Revisit in Wave 2 when fills go opaque + textured.
- `Board.svelte` "board stage" = `BoardSetup.svelte` (stage `'board'`, where the DOM board
  first appears). Toggle is a plain `$state(false)`, not persisted to `localStorage` —
  it's a dev preview switch, not game state.
- Screenshot gate used Playwright + a cached Chromium build (`chromium-1234` under
  `~/Library/Caches/ms-playwright`); `playwright-core` isn't a project dependency, it's a
  throwaway install under the session scratchpad, not committed.

## Wave 1 notes (2026-08-24)

Judgment calls taken inside the wave:

- The cell type stays `Square { file, rank }`, not the plan's `{ col, row }`. `grid.ts` owns it
  (plus `SIZE`, `FILES`, `notation`, `parse`, `inBounds`, `edgeKey`, `allSquares` — all identical
  on both grids) and `board.ts` re-exports the module wholesale, so every existing
  `from './board.js'` import and `engine/index.ts` are untouched.
- `Board.grid` is the kind string, not a `Grid`: boards are JSON in localStorage and go through
  `JSON.parse(JSON.stringify(...))` in `battle.ts`'s `clone`. `gridOf(board)` resolves it and
  treats a missing kind as square, which covers boards saved before this wave.
- Pace's second cell is `grid.beyond(from, through)` — the reflected cell on square, the same
  cube direction on hex. `withdrawTargets` and `retreat` read `grid.homeward`.
- Hex geometry: pointy-top odd-r, `size` is the cell pitch (hex width), circumradius
  `size / √3`, and rank 0 sits at the bottom of the screen so the Wave 2 renderer matches
  `render()` and the DOM board. Verified by a throwaway probe (5 000 random points resolve to
  the nearest centre on both grids); the committed test only round-trips the 64 centres.
- `layRidge` still steps `file + 1` / `rank ± 1` directly. On odd-r both are genuine neighbours,
  so the ridge stays connected on hex; the plan already said the generator needs no hex code.
- No grid dropdown yet (Wave 3 owns the board stage), so hex is reachable only from code and
  tests. `BoardSpec.grid` is threaded through so a setup persists the choice.

Reserved and rule questions raised here:

- Hex deployment is implemented as rows 1–3 and 6–8, as instructed. Open: with six neighbours
  the two front rows interlock more than on square, so the opening contact is wider.
- Volley and Demoralize bands are unchanged numbers on cube distance, but hex holds 18 cells
  within distance 2 against the square grid's 12. Ranged units cover far more ground on hex —
  watch in play before changing the bands.
- An unengaged Withdraw offers two homeward cells on hex against one on square, on top of the
  Pace question already listed.
- `docs/design.md` and `public/rules.html` still say "orthogonal" and "diagonal neighbours are
  distance 2". Wave 6 owns the hex sidebar; nothing was edited here.

## Wave 4 notes — art pipeline (2026-08-24)

Ran the art half of Wave 4 (`scripts/import-art.mjs`, `src/engine/art.ts`) ahead of and in
parallel with Wave 2, per instruction; did not touch `src/board/`, `Token.ts`, `TokenLayer.ts`,
the Place stage, or `src/app/`.

- Confirmed the licence finding above by hand: `pf2e-trooper`'s `LICENSE` is MIT for the
  module's own code and silent on `assets/`; the repo's git history and `LICENSE` are both
  authored as Mark Pearce (`mark.pearce72@gmail.com`), matching this session's user, so the
  art is his own generated work in his own repo. Same author for the two Reignmaker fallback
  images (`pf2e-reignmaker`'s `LICENSE` is proprietary but copyright Mark Pearce). Committed
  all of it under `public/art/`.
- pf2e-trooper's `assets/troops/` has three subtrees: `cavalry/<slug>/`, `infantry/<slug>/`,
  and `official/<slug>/`, each with `<slug>_portrait.webp`, `<slug>_strategy.webp`,
  `<slug>_token.webp`. Only `_strategy.webp` (the top-down game-piece art the plan asks for)
  was fetched; portrait and token variants were left alone.
- For `data/troops/*.json` (custom troops), skipped slug-guessing entirely: every actor
  already carries `flags['pf2e-reignmaker'].creatureData.strategyTokenImage`, a full
  `modules/pf2e-trooper/assets/troops/...` path pointing at its own art, generated when that
  JSON was captured. The script strips the `modules/pf2e-trooper/` prefix and fetches that
  exact path — no dependency on the filename matching the in-repo slug (it does, in all 38
  cases, but the script no longer assumes it).
- For the 39 official troops, `scripts/import-official.mjs`'s `SELECTION` array (bestiary
  path -> role) is the only source of which 39 of pf2e-trooper's ~150 `official/` slugs to
  fetch; `import-art.mjs` reads that file as text and regex-extracts the array rather than
  importing/running it, since importing would execute the whole official-troops regeneration
  (and its `PF2E_SOURCE` requirement) as a side effect just to read one literal. It still
  needs `PF2E_SOURCE` itself, to read each selected actor's `name` for the art.ts key (the
  card's display name, not its pf2e-trooper slug — see below); same default path as
  `import-official.mjs` assumes (`../../pf2e-reignmaker/_pf2e-source/packs/pf2e`), overridable
  with the same env var.
- Card `name` and pf2e-trooper slug diverge: e.g. `data/troops/basic-infantry.json`'s in-game
  name is "Line Infantry" (pf2e-trooper's own `official/line-infantry` is a different,
  unrelated actor). `art.ts` is keyed by the exact `UnitCard.name` string each generated
  troop list (`combatants.ts`, `official.ts`) already carries, resolved via the JSON source
  files, not by re-deriving a slug from the name — a naive `slugify(name)` would have fetched
  the wrong art here.
- Verified before committing: all 39 official SELECTION slugs, all 38 `data/troops/` slugs
  (via their embedded `strategyTokenImage`), and all 59 `src/engine/engines.ts` names
  (slugified: lowercase, apostrophes deleted, non-alnum runs -> `-`) resolve to a real file in
  the pf2e-trooper tree (checked against the repo's full git tree via the GitHub API before
  fetching anything) — 0 misses across 136 files.
- `public/art/`: 136 fetched files (77 troop `_strategy.webp` = 38 custom + 39 official, 59
  engine `.webp`) plus the 2 Reignmaker fallback tokens = 138 files, 17 MB total (troops 8.3
  MB, engines 8.2 MB). Below "tens of megabytes" but not trivial; flagging per the brief in
  case the concurrent Wave 2/4 work wants a lighter set later (e.g. re-encoding the strategy
  webps smaller — they range roughly 65 KB–225 KB each — or lazy-fetching instead of
  committing). `npx vite build`'s `dist/` grows by the same ~20 MB (webp doesn't gzip further).
- Fallback filenames confirmed in `/Users/mark/Documents/repos/pf2e-reignmaker/img/army_tokens/`:
  `army-infantry.webp` and `army-calvary.webp` (Reignmaker's own misspelling of "cavalry", not
  a typo introduced here). Copied into `public/art/` under the corrected names
  (`army-infantry.webp`, `army-cavalry.webp`) so nothing downstream has to know about the
  source typo; the script comment and README both call this out.
- `src/engine/art.ts` paths are root-relative without a leading slash (`"art/troops/x.webp"`,
  not `"/art/troops/x.webp"`), because `vite.config.ts` sets `base: './'` and
  `tsconfig.engine.json` has `"types": []` (no `vite/client`), so `art.ts` can't use
  `import.meta.env.BASE_URL` itself to build a base-safe absolute path and stay engine-pure.
  Flagging for whoever writes `Token.ts`/`TokenLayer.ts`: prefix these with
  `import.meta.env.BASE_URL` (available under the main `tsconfig.json`, which does include
  `vite/client`) rather than using them as-is or as root-absolute paths, or a non-root deploy
  will 404 on every token.
- `troopArt(name, role)` falls back to `FALLBACK_ART[role]` for any card not in the generated
  map — currently that's every `src/engine/roster.ts` entry (11 hand-authored cards with no
  pf2e-trooper counterpart, e.g. "Peasant Levy", "Knights"); verified with a throwaway vitest
  test (not committed) that every card in `LIBRARY` (`COMBATANTS` + `OFFICIAL` + `ROSTER`)
  resolves to a truthy path and every `ENGINES` entry resolves to a non-null one.
- Added `"import:art": "node scripts/import-art.mjs"` to `package.json` alongside the other
  three `import:*` scripts, matching their naming.

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

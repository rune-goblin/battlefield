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

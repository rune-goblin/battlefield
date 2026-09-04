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

## Wave 2 notes (2026-08-24)

Judgment calls taken inside the wave:

- Terrain texture cache key is the terrain type alone, not type+size: each procedural texture
  (tree dots, reed strokes, ripple lines, cobbles) is generated once at a fixed 32 px tile via
  `generateTexture`, then tiled with a `TilingSprite` regardless of the board's current cell
  size — matches the plan's "cached per type" literally and means a window resize never
  regenerates a texture, only rescales how many tiles show per cell.
- The texture overlay for a terrain type is masked by a *second* `Graphics` of the same shape,
  not by the type's own flat fill. Reusing the fill was tried first and rendered every textured
  terrain colourless: PIXI v7's `mask` setter sets `renderable = false` on whatever it is handed
  (`@pixi/display/lib/DisplayObject.mjs:352`), so a fill used as a mask stops drawing. A
  `DisplayObject` cannot be both a visible child and a mask. `TerrainLayer.clear()` nulls every
  child's `.mask` before destroying, since destroy order would otherwise leave a `TilingSprite`
  pointing at an already-destroyed clip.
- Elevation slope hatching (`TerrainLayer`) only draws for a single-level drop (`diff === 1`);
  a 2+ drop renders as a cliff instead (`EdgeLayer`), and an edge already carrying a wall bar
  skips hatching entirely so the two treatments never stack on the same edge.
- Breached walls: the plan's literal "broken bar at 40% alpha" (i.e., the same stone-grey as a
  standing wall, just fainter) was visually indistinguishable from open terrain in testing —
  verified with pixel-targeted Playwright crops before and after. Switched to `theme.accent`
  (a warm hue distinct from the cool wall-grey) at 0.75 alpha, still drawn as the two-segment
  broken bar. Flagging in case a reviewer wants the literal grey-at-low-alpha look restored for
  a reason not visible from testing alone.
- `setSelected(id)` is read as a cell key (`grid.parse`) rather than a token id: Wave 2 has no
  tokens, and this keeps the method meaningful now. An id that doesn't parse to an in-bounds
  cell — a future token id, say — just draws nothing; once TokenLayer (Wave 4) exists the
  token itself can carry the selection ring instead, so this doesn't need to change later, just
  stop being the only thing `setSelected` does.
- "Deploy wash" (Terrain rendering section) is described as "translucent side-coloured", but
  `setHighlight(cells, style)` carries no side parameter and the plan lists exactly three
  styles. Implemented `deploy` as one fixed neutral-gold colour; the caller (the Place stage,
  Wave 4/5) is expected to pass only the currently-placing side's cells. Making the wash itself
  side-coloured would mean extending `HighlightStyle` or the method signature — flagging for
  whoever wires Place rather than deciding it here.
- Removed the Wave 0 `'grid'` `LayerId` stub and its `getDefaultZIndex` case, per that wave's
  own note that it "folds into terrain in Wave 2".
- Added `BoardApp.viewport`, a stand-in for Wave 3's real pan/zoom container (today just
  `get viewport() { return this.app.stage }`, scale always 1) so `LabelLayer`'s zoom-invariant
  text has a seam to read now; Wave 3 only needs to change what the getter returns, not every
  caller.
- `MapTextUtils` lift dropped `getHexCenter` (Foundry's `canvas.grid` API — this board resolves
  centres through `Grid.center` instead) and `updateTextScale` (dead code in Reignmaker too,
  never called outside that file). Added a `coordinateLabel` text style since Reignmaker has no
  chessboard-style label preset to lift.
- Screenshot gate: reused Wave 0's Playwright + cached-Chromium approach, but through a
  throwaway Vite entry (`dev/_wave2-preview/`, deleted before commit) that calls
  `createBoardView` directly, since nothing in the app wires `setHighlight`/`setSelected` yet
  (that's Waves 3–5). The demo board is `{ base: 'mountains', feature: 'river', construction:
  { kind: 'fort', tier: 2 }, seed: 25 }` with one wall's `remaining` set to 0 by hand — chosen
  because that combination naturally produces a cliff (a ridge peak at elevation 2 sits beside
  the river at elevation 0) alongside forest/water/shallows/settlement variety, with no
  elevation hand-editing needed.

## Wave 3 notes (2026-08-24)

Judgment calls taken inside the wave:

- Erase is a brush kind, not a flag. The plan fixes the `BoardEvent` union, and its `paint`
  member carries only `{cells, edges, brush}`, so the brush has to describe the whole
  operation. `Brush` is `terrain | elevation | wall | wall-clear | erase`, and a right-drag
  emits `eraseForm(brush)` (open / elevation 0 / wall-clear). The stage applies `event.brush`,
  never its own palette state, so a right-drag needs no special case there.
- Keyboard brush changes reach the palette through `createBoardView`'s `onBrush` option, not
  a new `BoardEvent` member — the union stays exactly as the plan fixes it. `Esc` sends
  `onBrush(null)` and an `onClear()` that drops the overlay selection.
- `X` (erase) is a cell brush only, so it never removes a wall; wall removal is a right-drag
  with a wall brush or the palette's "remove wall" (`wall-clear`). Making `erase` an edge
  brush too would have made every erase stroke near a boundary eat walls by accident.
- A wall stroke takes the nearest edge whether or not it is inside the band: the band is a
  hit-priority rule (cell vs edge), and with a wall brush the cell is never the target.
  On top of that a stroke prefers edges parallel to its travel (|cos| ≥ 0.45 against the drag
  vector, falling back to the plain nearest for a click). Without that filter, the first
  capture run showed a straight drag down the b|c boundary also laying `b4|b5`, because the
  pointer passes exactly through the corner where the perpendicular edge is nearest. 0.45
  keeps a hex's 60° edges, which its zigzag row boundaries need.
- Double-click refits only when no brush is set. In paint mode every cell is a paint target,
  so "empty space" does not exist there and a refit would fight the painter; `Esc` clears the
  brush and then double-click refits.
- Pan and zoom move the board under a stationary pointer, so `viewportChanged()` recomputes
  the hover as well as rescaling the labels. Verified: after wheel-zoom, middle-drag pan and a
  double-click refit, the board screenshot is pixel-identical to the pre-zoom one.
- `BoardApp.viewport` is now a real container between the stage and `BoardContainer` (Wave 2
  left it aliased to the stage). `Interaction` is its only writer. `MapTextUtils` applies the
  inverse scale at creation only, so `LabelLayer.rescale()` reapplies it on every zoom.
- Token hit-testing is live but token *rendering* is not: `createBoardView` takes a
  `tokenBounds` provider (discs in board-local coordinates) that Wave 4's TokenLayer fills in;
  `setTokens` stays a stub. The `press → drag → drop` path and the `drop` event work today;
  the lift visuals (scale 1.08, shadow, tween-back) are Wave 4's.
- `OverlayLayer.setHover` and `setPaintPreview` gained an edge argument, since walls are edges
  and the plan asks the overlay to show "the nearest edge in wall brush". The hovered edge
  draws in the selection colour, a pending stroke's edges in the brush colour.
- Shift-click fill is a `region(cell)` callback passed in from `index.ts` (flood fill over
  `grid.neighbours` by terrain), so `Interaction` never holds a `Board`.
- The paint stage keeps five whole-board snapshots for undo rather than inverse strokes:
  `$state.snapshot` is already a deep plain copy, an 8×8 board is tiny, and one assignment
  per stroke is the "one store write" the plan asks for.
- The grid dropdown regenerates on change. `Board.grid` is baked in at generation, so letting
  the spec and the drawn board disagree would be a lie; regenerating is one click's work.
- `Board.svelte` is gone from the board and paint stages; Place and Battle still use it until
  Waves 4–5 replace them.
- The one PIXI-free piece of this wave (`hit.ts`) got a small `describe.each` test on both
  grids, since the band rule (0.18 of a cell *and* closer than the centre) is a rule this wave
  invented and nothing else records it. No tests for `Interaction` or the layers.
- Gate artifact is `docs/plans/pixi-board-shots/wave3-paint.png`, a six-panel composite rather
  than a GIF: drag stroke (painted with the keyboard's `2` brush), a tier-2 wall dragged up an
  edge band, a right-drag erase, a shift-click region fill, and a hex board taking a water
  stroke and a tier-3 wall. Playwright drove the real app; the harness lives in the session
  scratchpad, not the repo.

Verified by dumping localStorage during the capture run:

- Hex renders, paints and takes walls through the renderer for the first time: the hex run
  ended with `grid: 'hex'`, 8 water cells from one drag, and a tier-3 wall on `e3|e4` (a
  row-boundary edge, i.e. one of the 60° ones).
- A three-cell wall drag on square lays exactly `b4|c4 b5|c5 b6|c6`.
- The keyboard brush reaches the palette: pressing `2` on the focused canvas leaves
  "2 · forest" as the active palette button.

Open questions raised here:

- Zoom is capped at 2.5× against a board that already fits the container, so zooming in is
  only useful for inspecting one corner. If the board ever gets bigger than 8×8, revisit.
- `setSelected` still reads its id as a cell key (Wave 2's note). `Esc` clears it through
  `onClear`, which is the only writer of it from inside `src/board/`.
- Touch: `pointer*` listeners mean a finger drags-paints, but there is no pinch-zoom and
  `touch-action: none` on the canvas kills page scrolling over the board. Mobile is a
  non-goal, but that is the trade as it stands.

## Wave 4 notes — tokens (2026-08-24)

Ran the token half of Wave 4 (`Token.ts`, `TokenLayer.ts`, `setTokens` wired for real, the
Place stage's tray) against the already-committed art half (`99a7b54`).

Judgment calls taken inside the wave:

- `TokenModel` is a discriminated union on `kind`: `UnitTokenModel` (side, name, role, level,
  cell, wounds, shaken, `engine: string | null` for the crewed-engine chip, `ring`) and
  `EngineTokenModel` (side, name, cell, `ring`) for an abandoned/captured engine standing
  alone, per the plan's "Abandoned engines are their own tokens". `broken`/`routed` are not
  fields — `Token.draw` derives them itself from `wounds`/`shaken` against `MAX_WOUNDS` and
  `ROUTED_AT` (imported from `engine/types.ts`), the same thresholds `battle.ts`'s
  `isBroken`/`isRouted` use, so the two can't drift by drawing on different constants even
  though `Token.ts` doesn't call those functions directly (they take a full `Unit`, which the
  Place stage doesn't have yet — pre-battle units carry no wounds/shaken at all).
- `ring: 'active' | 'selected' | 'highlighted' | null` is one field, not three booleans — the
  plan's states are visually exclusive rings (a pulsing outline vs. a solid one vs. a thin
  one), so nothing is lost by making a token wear at most one at a time. `broken` (desaturate)
  and `routed` (grey base + arrow) stack independently on top since they're derived, not
  chosen.
- `Token`'s own draw method is named `draw`, not `render` — `PIXI.DisplayObject` already owns
  `render(renderer)` as part of its own draw call; a same-named override compiles (structural
  typing) but silently breaks PIXI's rendering, and `svelte-check` catches the signature
  mismatch even before that. Named it `draw(model, grid, size, theme)` instead, matching
  `TerrainLayer`/`EdgeLayer`'s own `draw(...)` naming.
- Sprite cache diff follows `FogOfWarRenderer` but is an instance field (`TokenLayer.cache`),
  not the module-scoped `Map` Reignmaker uses — Reignmaker has exactly one Foundry canvas, this
  app can (and, in earlier waves' screenshots, does) mount more than one `BoardView` at once,
  and a module-level cache would let two boards' tokens collide on id.
- Art anchor: pf2e-trooper's `*_strategy.webp` renders put the miniature's own base ellipse
  about four-fifths of the way down a square image, not centred — confirmed by eye against six
  samples (three troops, one engine, both Reignmaker fallbacks) before picking one tuned
  constant (`ART_ANCHOR_Y = 0.8`) for anchoring every sprite, since there's no per-image crop
  data to anchor exactly. The coloured base disc (`TOKEN_DISC_RATIO = 0.82`, matching the
  plan's number) is sized independently of the art, so it shows as a coloured rim around
  whatever the art's own base looks like rather than trying to align disc-to-base pixel-for-
  pixel. Confirmed by screenshot (`wave4-place.png`) rather than measurement.
- `PIXI.Assets.load` is called with a plain `import.meta.env.BASE_URL`-prefixed string every
  `Token.draw`, guarded by a path-equality check plus a per-token "generation" counter (bumped
  on every new load, checked in the `.then`) so a token destroyed or given a new path mid-load
  can't have a stale texture land on it later — `PIXI.Assets`' own cache means a second token
  requesting the same path doesn't refetch, only the generation guard is Token's own.
- `Interaction.ts` gained one new callback, `onDrag(id, point | null)`, fired on drag
  start/move/end — not a new `BoardEvent` (the plan fixes that union; Wave 3's notes call this
  out explicitly). It's wired straight to `TokenLayer.setDrag` inside `createBoardView`, so
  Svelte never sees it; the existing `drop` event still carries the result to the stage.
  Without this, "move follows the pointer" had nothing to drive it — Wave 3 built the hit-
  testing and the final `drop` event but explicitly left "the lift visuals ... are Wave 4's".
- **Bug caught by the interactive Playwright check below, fixed before committing**: the first
  cut of `Token.endDrag()` only reset scale/alpha/zIndex and relied on the caller's next
  `draw()` (via the reactive `setTokens` the `drop` event triggers) to put the token back at
  the right cell. That's true for an *accepted* drop — the model's `cell` changes, Svelte's
  `$state` mutation fires the effect, `draw()` runs. It's false for a *rejected* one: the
  stage's drop handler returns early without mutating anything, so nothing reactive fires, and
  the token was left stranded exactly where the pointer let go, forever (or until some
  unrelated redraw). Fixed by having `endDrag(grid, size)` immediately re-place the token at
  its own last-drawn `model.cell` — correct at once for a rejection, and for an accepted drop
  it lands there for one flush and then jumps again when `draw()` reruns with the new cell,
  which reads as a single snap in practice. No separate tween either way, matching "a
  drag-drop snap is in scope, move tweens are Wave 5's".
- Place stage: kept the existing sidebar list (not a separate tray section) and just made its
  *unplaced* rows `draggable`, since that list already sits beside the board and already is a
  DOM list — the plan only asks for "a DOM list is fine", not a new UI area. Placed rows are
  represented purely as board tokens; dragging one off the board is the canvas-internal
  `Interaction` drag, not a second HTML5-drag code path.
  - `PixiBoard.svelte` gained `highlight`/`highlightStyle`/`selected` passthrough props (it
    had none before — Wave 3's paint/board stages never needed `setHighlight`/`setSelected`)
    and one new prop, `ontraydrop`, which converts a native `DragEvent`'s client point to a
    cell key via a new `BoardView.cellAt(clientX, clientY)` method and hands back
    `(cell | null, DataTransfer | null)`. `cellAt` reuses the exact same `toLocal` +
    `grid.fromPoint` path `Interaction` uses internally, so tray-drop and canvas-drag hit-test
    identically.
  - Two independent validity checks, not one: `highlight` (deploy cells for the sidebar's
    `selected` unit) gates tray drops, since `dragstart` is a real Svelte hook and sets
    `selected` to the dragged row immediately. A board-internal token drag has no such hook —
    `Interaction` never tells Svelte a drag started, only that it ended — so `onTokenDrop`
    instead computes deploy cells for *that specific unit's own* side/ambush on the spot
    (`deployCells(u.side, ambush(u), i)`), independent of whatever `selected` happens to be.
    Using the sidebar's possibly-stale `highlight` for that check would validate a defender's
    drag against the attacker's ranks whenever the toggle/selection didn't happen to match.
    One consequence, left as-is: the gold deploy-wash shown *while* free-dragging an existing
    token (not the sidebar-selected one) can be stale/wrong-side — only the actual accept/
    reject decision is guaranteed correct.
  - `deployCells(side, ambush, excludeIndex)` excludes one unit's own square from "taken"
    (the original inline version excluded nothing, so a selected-and-already-placed unit's own
    square never counted as available). That's needed for a move to validate a same-square or
    swap-adjacent drop at all, and as a side effect also slightly changes old click-to-place
    behaviour: reselecting an already-placed unit now shows its own square as part of the
    highlighted set. Not expected to matter in play; flagging since it's a small, deliberate
    deviation from the pre-Wave-4 semantics.
- Engine chip only ever shows `u.engines[0]` — `SetupUnit.engines` is an array (the UI lets
  more than one attach) but the plan's spec describes one chip singular. A second attached
  engine has no visual today; revisit if multi-engine units turn out to matter.
- Theme: added a `token` sub-object to `BoardTheme` (`routed`, `ringActive`, `ringSelected`,
  `ringHighlight`, `pipFilled`, `pipEmpty`, `badgeFill`, `badgeText`) rather than overloading
  the existing `overlay`/`terrain` groups, so Wave 5's battle-mode rings have named colours to
  reach for instead of repurposing the paint-mode selection colour.
- Screenshot gate: `docs/plans/pixi-board-shots/wave4-place.png`, captured the same
  Playwright + cached-Chromium way as Waves 0/2/3, seeding `localStorage['battlefield.v2']`
  directly with a hand-built flat 8×8 board and eight `SetupUnit`s (four a side, two carrying
  an engine, one — "Peasant Levy" — a `ROSTER` card with no pf2e-trooper art) rather than
  driving the board/paint stages through the UI first; the harness lived in the session
  scratchpad and is not part of this commit.
- Verified interactively (also scratchpad-only, not committed): a real native-drag tray drop
  places a unit on the exact cell under the pointer; a canvas-internal drag then moves that
  same token to a different cell (state updates, token follows visually, ends up on the right
  square); a third drag to a cell outside the deploy wash is rejected and the token stays at
  its last valid square — this last case is what caught the `endDrag` bug above.

Open questions raised here:

- The stale-highlight gap noted above (deploy wash can lag the unit actually being dragged on
  the canvas) has no `BoardEvent` to fix without widening the plan's fixed union; a
  `dragstart`-only hook would need one. Left as a known trade, not a rule question.
- Pulsing `active` rings and the `routed` grey-base-plus-arrow treatment are implemented but
  unexercised by anything in this wave (Place has no wounds/shaken/active unit) — first real
  look at them is whenever Wave 5 wires a live `Unit[]` through.

## Wave 5 notes (2026-08-25)

Judgment calls taken inside the wave:

- **`Board.svelte`: deleted.** After this wave nothing imports it — Battle.svelte was its last
  consumer (Board/Paint stages moved to Pixi in Wave 3, Place in Wave 4). The reserved question
  was "delete, or keep as a text fallback for screen readers and print"; nobody proposed an
  actual consumer for a fallback (no print stylesheet, no a11y text view exists anywhere else
  in the app), so keeping it would mean a dead file with no caller, which is worse than deleting
  it — a real fallback is a feature to design, not a leftover component to keep warm. Deleted,
  and removed its now-dead CSS from `app.css` (`.boardwrap`/`.ranks`/`.files`/`.grid`/`.sq`/`.sq
  .chip`/`.sq .wall`/`.sq .cliff`/`.sq .handle`, plus the unscoped `.chip`/`.pips`/`.pip`/
  `.walls` rules that only it used — confirmed by grep, nothing else referenced any of them).
  If a text/print fallback is ever wanted, it should be designed against the Pixi board's own
  state (`BoardView`-shaped), not resurrected from the old DOM component, which read `Board`
  and a bespoke `BoardUnit[]` shape that no longer matches how Battle/Place model tokens.
- **Hover → highlight mapping.** Only the *hovered* action row highlights anything — no default
  "show every possible move" wash the old DOM board didn't have either, come to think of it (the
  old code's default was the union of all square-kind targets, always on). Dropped that default
  deliberately: with up to three movement rows (`Advance`, `Advance into slow ground`,
  `Withdraw`) plus `Retreat` all unioned together, the always-on version was busy and didn't
  read as "this option does this." One row hovered → one target set shown. `targetKind: 'square'`
  rows (advance/withdraw/retreat) call `setHighlight(cells, 'move')` — there's no square-kind
  action in this engine that's offensive, so `'move'` covers all of them; `'attack'` is unused
  by `setHighlight` in Battle. `targetKind: 'unit'` rows set the matching tokens'
  `ring: 'highlighted'` instead (composite `cavalry-charge` targets like `"e4>u3"` are split to
  the unit id first). `targetKind: 'wall'` rows (`engine-bombard`) get **no** visual highlight —
  `BoardView.setHighlight` is cell-keyed only per the plan's fixed interface (`grid.parse` on an
  edge key like `"e4|e5"` would just fail to resolve), and extending the interface for one
  action kind felt like more surface than this wave should add. The click still works (see
  below); a hovered wall row just doesn't light anything up first. Flagging for whoever revisits
  `OverlayLayer`/`BoardView` next — an edge-highlight set is the natural extension if this turns
  out to matter in play (siege engines are rare enough in a given battle that it may not).
- **`ring: 'highlighted'` recoloured** from green (`0x3f7d4f`/`0x5fbf7f`, matching the `move`
  cell wash) to the same red as the `attack` cell wash (`0xb23b3b`/`0xe0685a`), since in Battle
  every token that gets `'highlighted'` is a unit-kind action's target — offensive in all but
  two rows (`defend-allies`, `battlefield-medicine`) — and green read as "you can move here"
  when hovering, say, `Strike`.
- **Free strikes flash the striker's ring** — new `TokenRing` member `'flash'`
  (`src/board/Token.ts`), a fast hard blink (260 ms cycle, thicker line) in a new theme colour
  (`token.ringFlash`, warm yellow) distinct from the slow `active` breathing pulse and the
  steady `highlighted`/`selected` rings. `battle.ts`'s `LogEntry` doesn't flag a strike as free
  vs. chosen, so detection is a regex over the three label phrases `resolveStrike`'s
  `reactionsOnEntry`/`reactionsOnLeaving` callers use (`"reacts and strikes"`, `"strikes from
  its brace at"`, `"strikes the withdrawing"`) against the log entries `act()` appended for that
  one `takeAction` call (`Battle.svelte`'s `go()` diffs `game.battle!.log` before/after). This
  is a real coupling from display code to `battle.ts`'s exact wording — flagging rather than
  fixing, since the alternative (an engine change to return which units struck for free) is
  more than this wiring wave should touch; a future wave could have `act()` return that list
  directly. **Not captured in the gate screenshot** — the required panel list didn't ask for it,
  and reliably timing a screenshot inside a 700 ms window against real (non-seeded) dice felt
  like more capture-tooling effort than the "couple of attempts" budget allows. Verify in play:
  any `Withdraw`/`Retreat` while engaged provokes every engaged enemy's free strike
  (`reactionsOnLeaving` has no tactic/brace gate, unlike entry), so it's easy to trigger by hand.
- **Move tween** lives on `Token` itself (`place()` diffs the model's `cell` against the token's
  own last-drawn cell; a change starts a 200 ms ease-out-cubic tween from wherever the token is
  *actually* sitting right now — which may itself be mid-tween — to the new centre; no change
  or a first mount snaps straight there). `TokenLayer`'s per-tick callback now calls `token.tick()`
  on every cached token every frame instead of skipping all but the dragged one — needed since a
  tween or a flash can be running on a token that isn't the one being dragged, and the old
  drag-only gate would have frozen everything else's animation mid-drag. Side effect, not
  Wave-5-scoped but free: Place's own token-drop "snap" (Wave 4's `endDrag` re-place) now
  animates too, since it's the same `place()` path — a dropped/moved token in Place eases into
  its cell instead of jumping. Not asked for, not a regression either; left as-is.
- **Abandoned/captured engines as standalone tokens**: `Battle.svelte`'s `tokens` derivation
  emits an `EngineTokenModel` for every `u.engines` entry with `status !== 'crewed'`, id
  `` `${u.id}:engine:${i}` ``, on the engine's own `cell` (its state's `square`, frozen at the
  square it was abandoned on). Side colour is the *original owning unit's* side — `EngineState`
  records `status: 'crewed' | 'abandoned' | 'captured'` but not *who* captured it (only
  `captureEngines()`'s local `captor` variable, used for the log line, is thrown away), so
  there's no side to recolour a captured engine to without an engine change. Flagging as a
  small, honest gap: a captured siege engine still shows its original owner's colour.
- **Board-click execution** (`Battle.svelte`'s `onCell`/`onToken`/`onEdge`) resolves the same
  way the pre-existing select-based click already did: search the hovered/focused row first (so
  hovering the intended row disambiguates when two rows could share a target), then fall back to
  every available option. This is a deliberate continuation of the original DOM board's
  behaviour, not a new design — clicking the board and picking from the row's `<select>` are two
  paths to the same `go(option, target)`, so both stayed.
- **`Interaction.edgesLive()`/hover fixed to also cover `'battle'` mode**
  (`src/board/Interaction.ts`): it previously only competed edges against cells in `'view'` mode
  or under an edge brush, so a wall was never hit-testable in `'battle'` mode at all — clicking
  near a wall would always resolve to the cell behind it, which would have made `engine-bombard`
  impossible to trigger by clicking the board (only the list button would have worked). This is
  a real fix needed for the plan's explicit "clicking a highlighted cell, token or **edge**
  performs the action," not a style choice.
- **Dragging a token in Battle mode is inert, not implemented.** `mode === 'battle'` already lets
  `Interaction` start a token press/drag (shared code with `place`, from Wave 3/4), so a player
  who drags instead of clicking sees the token lift, follow the pointer, and snap back on
  release — `TokenLayer`/`Token.endDrag`'s existing rejection-snapback (Wave 4) handles this for
  free, since Battle never calls `setTokens` off a `'drop'` event (no `ondrop` handler is wired).
  The plan's Battle scope says "clicking ... performs the action," not dragging, so this wasn't
  built out; flagging in case drag-to-move reads as more natural than click-a-list-target once
  Mark plays with it.
- **Active unit's live status** (`braced`/`exposed`/`suppressed`/`outflanked`) is no longer
  visible via a hover tooltip — the old DOM board's chip had a `title` attribute; Pixi canvas
  tokens have none, and the plan's Token spec doesn't define a tooltip-carrying state. Added a
  `Status` row to the active-unit panel instead (same four flags the old `tags()` helper
  computed, minus wounds/broken/routed/pace/fear, which are now visible on the token itself via
  pips/desaturation/the routed arrow, or are static card traits already shown via `Tactics`).
  This covers the *active* unit only — a non-active unit's braced/exposed/suppressed state has
  no display anywhere now (previously visible by hovering its board chip). Flagging as a known
  reduction, not fixed: a hover-driven DOM tooltip keyed off `BoardView`'s `hover` event would
  restore it but felt like scope beyond "wire the battle stage."
- **`cavalry-charge`'s implied destination square isn't separately highlighted** on hover — its
  `ActionOption.targets` are composite `"square>unitId"` strings (`targetKind: 'unit'`), so
  hovering the row highlights the enemy token like any other unit-kind action, but the square
  the charge passes through has no cell wash. `ActionOption` doesn't expose that square as a
  distinct target to highlight separately without inventing a new shape for one action kind.

Screenshot gate: `docs/plans/pixi-board-shots/wave5-battle.png`, a four-panel composite (built
the same Playwright + cached-Chromium way as Waves 0/2/3/4, harness in the session scratchpad,
not committed) — the app's own default setup (4 troops, `plains`/`none`, seed 1, verified
water-free at the default deploy squares on both grids by a throwaway vitest probe, not
committed) driven through the real UI (Generate → Next → Next → Begin the battle) rather than
hand-seeded `BattleState` JSON, since `createBattle()`'s derived stats/initiative/order aren't
simple to hand-author correctly. Panels: (1) the active unit's pulsing ring on a fresh square
battle; (2) hovering "Advance" washing its four neighbours green; (3) after clicking the actual
board cell (coordinates computed from `SquareGrid`'s own `center`/`bounds` formulas against the
canvas's bounding rect — the same math `fromPoint` uses, run in reverse) — the unit's token
sitting on its new square, tween complete; (4) a fresh hex battle, same default setup, showing
hexagonal cells, the active ring, both sides' units and a water hex. Initiative is real
(unseeded) dice, so which of the four units is active differs between the two panels/runs — not
controlled for, since the panels only need to prove the mechanism works, not depict a specific
matchup.

No new rule questions this wave — Wave 5 is wiring, not new rule logic. The `docs/design.md`/
`public/rules.html` hex sidebar remains Wave 6's, untouched here.

## Wave 6 notes (2026-08-25)

Judgment calls taken inside the wave:

- **The actual portability gap, found as the plan predicted it would be.** Before this wave,
  `BoardContainer` itself was already a plain `PIXI.Container` with no stage/DOM assumptions
  (Wave 0 got that right), but the only code that wired a `BoardContainer` to its five layers
  and to `Interaction` was `createBoardView`'s body, which also unconditionally built a
  `BoardApp` (a `PIXI.Application`, a canvas, a `ResizeObserver`). There was no way to drive a
  mounted board without paying for a second renderer. Fixed by extracting that wiring into a
  new exported `mountBoardView(opts)` (`src/board/index.ts`), parameterized on `parent:
  PIXI.Container`, `canvas: HTMLCanvasElement`, `ticker: PIXI.Ticker`, `renderer: PIXI.IRenderer`,
  `size(): {width,height}` and `theme`; `createBoardView` is now a thin wrapper that builds a
  `BoardApp` and calls `mountBoardView` with `parent: boardApp.viewport`. No layer or
  `Interaction` needed to change — they already took every dependency as an injected argument,
  never reached for a global.
- **`TerrainLayer.draw`'s first parameter narrowed from `app: PIXI.Application` to `renderer:
  PIXI.IRenderer`.** It was the one place anything in `src/board/` asked for a whole
  `Application` when a renderer (`app.renderer.generateTexture`) was the actual dependency — a
  host has a renderer, not a spare `Application`. This is the one non-mechanical code change
  the wave made outside `index.ts` itself; everything else the mount page needed already existed.
- **The mount page nests its own pan/zoom container (`boardViewport`) one level inside the
  stand-in "primary" container**, rather than passing `primary` straight to `mountBoardView` as
  `parent`. `Interaction` is the only writer of whatever container it's given as `viewport`
  (wheel-zoom, drag-pan write directly onto it), so passing `primary` itself would mean this
  demo's own pan/zoom rescales the container standing in for Foundry's scene root — surprising
  for a real host to inherit. `mountBoardView` doesn't build this extra container itself
  (`BoardApp` already owns an equivalent one for the in-app board, so `mountBoardView` just
  takes whatever `parent` it's handed); the demo's own `main.ts` builds it, which is exactly
  the point — nesting depth and who owns the pan/zoom container are host decisions, not
  something `src/board/` needs an opinion on.
- **Verified, not assumed: `Interaction`'s existing `toLocal: (screen) => boardContainer.toLocal(screen)`
  needed no change at all** to work through the mount page's extra nesting (`stage → primary
  (0.5×, offset) → boardViewport → BoardContainer`). `PIXI.Container.toLocal` walks the full
  `worldTransform` chain back to the stage on every call, regardless of depth, so a `screen`
  point (CSS pixels relative to the one real canvas, via `getBoundingClientRect`) resolves
  correctly no matter how many ancestors sit in between or what their scale/offset is. Confirmed
  interactively (scratchpad Playwright, not committed): hover, click and paint-drag inside the
  mount page's shrunk/offset board all landed on the correct cell.
- **`battle-state.json` is a hand-written snapshot, not a generated one used live.** Built once
  with a throwaway `tsx` script calling the real `generateBoard`/`render` (hex, `hills`/`river`/
  fort tier 1, seed 7), then hand-adjusted one token's cell off a water square; the script itself
  is not committed, only its JSON output, matching how earlier waves' hand-built demo boards
  were captured. Five tokens: two attacker units (one carrying a crewed engine, "Door Ram"),
  two defender units, one abandoned engine standing alone — exercises `UnitTokenModel` and
  `EngineTokenModel` and all four `TokenRing` states (`active`, `selected`, `highlighted`, and
  `null`) in one static scene.
- **`dev/` needs no `vite.config.ts` change to be served.** Vite's dev server transforms any
  `.html` file under the project root on request, not only the one at `/` — confirmed by
  `curl`ing `/dev/foundry-mount/` and `/dev/foundry-mount/index.html` against `npx vite`, both
  200. It is equally excluded from `npx vite build` for the same reason in reverse: the default
  production build only follows the root `index.html`'s own script graph, and nothing links
  `dev/foundry-mount/index.html` into it, so it's never visited. Confirmed `dist/` is
  byte-identical in file count/shape (`index.html`, one JS bundle, one CSS file) with `dev/`
  present.
- **The hex sidebar/paragraph settle the two debts exactly as flagged, without inventing new
  numbers.** `docs/design.md` gets one paragraph in "The battlefield" section; `public/rules.html`
  gets a dashed-border `.aside` box after section 3. Both: (1) say "orthogonal" reads as
  "adjacent" on hex and the diagonal-distance-2 clause is square-only, (2) name the three
  known geometry properties from Wave 1's notes (18 vs. 12 cells within distance 2; wider
  opening contact from front-row interlock; two homeward cells on an unengaged Withdraw) as
  properties of the grid, explicitly not rule changes, and point at this file for the open
  question of whether the numeric bands should move for hex play. That question is *not*
  resolved here — see "Reserved judgment calls" at the top of this file and Wave 1's notes,
  both unchanged by this wave.
- **`docs/pixi-board.md`** documents the `BoardView`/`Grid` interfaces as they actually ended up
  (`setSelected` reads a cell key not a token id; `setBrush`/`cellAt` exist and aren't in the
  plan's sketch; no `BoardEvent` members for brush/drag state, those are constructor-option
  hooks instead), the layer list, the `mountBoardView` recipe, the Reignmaker lift-and-diff per
  file, the `pixi.js@7.4.3` pin rationale, the PIXI v7 mask trap (Wave 2's note, restated where
  a porter will actually look for it), and the `public/art/` size note the brief asked for.

No new rule numbers changed and no new engine code — this wave touched `src/board/index.ts`,
`src/board/layers/TerrainLayer.ts` (signature only), `dev/foundry-mount/`, `docs/pixi-board.md`,
`docs/design.md`, `public/rules.html`, `README.md`. `npx vitest run` stayed at 79 (no PIXI
tests, per prototype mode); `npx vite build` stayed clean and the same shape (single JS/CSS
bundle) before and after. The existing in-app board was screenshotted again after the
`mountBoardView` extraction to confirm `createBoardView`'s behaviour didn't move (scratchpad
Playwright, not committed) — square board, Generate flow, renders identically to Wave 5.

Open question carried forward, not resolved here (per the wave's own instruction — this is
Mark's playtesting call, not an executor judgment call): whether Volley/Demoralize bands,
deployment shape, or Withdraw's homeward count should change for hex, given the geometry
Wave 1 and this wave both document. See "Reserved judgment calls" above.

## Canvas mat and elevation highlight (2026-08-30)

Two judgment calls, outside any wave:

- `BoardTheme` gained a `canvas` colour (very dark gray, `0x141210`, same value in both
  themes), and `BoardApp` now paints the PIXI renderer background with it instead of
  `theme.background`. The two used to be the same field, and `background` sits close to
  `terrain.open` in both palettes, so the mat behind the hex grid read as more board. `canvas`
  is deliberately theme-invariant — it's a mat, not a themed surface — while `background`
  keeps its existing job as `LabelLayer`'s text-stroke colour, unrelated to the renderer's own
  background.
- `TerrainLayer.drawElevation`'s tint switched from `theme.ink` to a fixed white
  (`ELEVATION_HIGHLIGHT`) at the same per-level alphas. `theme.ink` is dark in the light theme
  and light in the dark theme, so the old tint darkened higher ground in one theme and
  lightened it in the other — opposite readings depending on which theme happened to be
  active. A fixed white wash always lightens, so elevation 0 stays each terrain's own (darkest)
  colour and levels 1/2 layer a highlight on top, consistently in both themes and over every
  terrain including water.

## Elevation display rework and grid toggle (2026-08-31)

Mark's design review of the elevation display (wash + edge hachures) went through two passes:
first toning the hachures down, then dropping them outright as "hideous and overpowering." The
final scheme, plus one unrelated addition Mark asked for alongside it:

- `TerrainLayer.drawElevation` no longer computes per-edge slope hachures at all (`drawHatch`/
  `drawTaper` and the `HATCH_*` constants are gone, along with the `diff === 1` edge walk that
  fed them). Elevation is a fill wash (`min(0.6, 0.1n)` alpha at level *n*) plus a contour
  outline, both the fixed white `ELEVATION_HIGHLIGHT` wash (not `theme.ink` — see the Wave note
  above this one) so it lightens consistently over every terrain in both themes. The values
  line up with what Mark asked for at level 1 (2px/25%/10%) and level 2 (originally 4px/50%,
  then "let's try a 2px line for lvl 2 as well" — the outline holds at a flat 2px for every
  level now, alpha alone scaling as `min(1, 0.25n)`; a widening line at level 2 read as just
  another heavy line, indistinguishable in kind from a cliff's own weight).
- First cut drew a full hex outline on every elevated cell, so a same-level pair of neighbours
  each drew their own outline and doubled up on the internal edge between them — Mark caught
  this from a screenshot ("we shouldn't make hexes with the thick lines... an outline of the
  shape, not every hex that's higher") and asked for a true contour instead. Fixed: the outline
  is now drawn only on edges where elevation actually changes between the two neighbours (same
  `seen`-edge walk the old hachure code used), styled by the *higher* side's level — so two
  same-level cells share a seamless interior, and a level-2 patch inside a level-1 one gets its
  own nested 4px/50% ring inside the level-1 area's 2px/25% one, like stacked contour lines. The
  fill wash stays per-cell (unaffected by this — nothing in the feedback was about the wash).
- The in-cell elevation numeral (added earlier in this same pass, kept through the rework) is
  unaffected — it's the part that actually answers "how high," now more useful still since the
  outline alone doesn't distinguish e.g. two adjacent level-2 cells from one continuous level-2
  area.
- New `GridLayer` (`src/board/layers/GridLayer.ts`): an optional, off-by-default faint hex
  hairline (`theme.rule` at a fixed 0.4 alpha, width configurable), kept as its own layer/
  container rather than folded into `TerrainLayer` so toggling it or dragging its width slider
  never re-touches terrain fills or regenerates procedural textures. Sits at z-index 4 — above
  terrain (0), below edges (10) — so walls/cliffs still draw over the hairline where they cross
  it.
- Grid visibility/width lives in `MapControls.svelte` local state (`gridVisible`, `gridWidth`),
  not in `game.svelte.ts` or either stage — it's a map-display preference, not game state, and a
  session-only one (`// proto:` — doesn't survive a reload; revisit if that turns out to
  matter). An eye-icon button next to the existing zoom/frame buttons toggles it directly; a
  separate gear icon opens a `<dialog>` with the same checkbox plus a line-weight slider
  (0.5–2px). Both write through `PixiBoard.setGrid()` → `BoardView.setGrid()` →
  `GridLayer.setSettings()`.
- `EdgeLayer.drawCliff` (the 2+ elevation-drop barrier — mechanically identical to a wall,
  `stepFeet` in `path.ts` and `isEngaged` in `battle.ts` both treat it as impassable) also came
  up in review: with the elevation wash/outline now much bolder, its old stroked zigzag read as
  just another "heavy line" indistinguishable in kind from the new elevation outline. Reworked
  as a row of solid trapezoid teeth biting from the edge into the lower side, alternating tall/
  short for a broken-rock silhouette — same `rock`/`shadow` ink-shade colours as the wall's
  masonry, but a jagged filled shape rather than coursed rectangles, so a cliff still reads
  distinctly from both a wall and the new elevation contour at a glance. Tooth count, depth and
  taper are judgment calls (`len / 9` teeth, tall depth capped at 9px, short at 45% of tall) —
  not something Mark specified a number for, unlike the elevation outline/fill values.
- The elevation contour's edge walk originally skipped a cliff edge (`Math.abs(diff) >= 2`),
  leaving the raised area's outline with a gap exactly where its boundary happened to be a
  cliff rather than a single-level step. Mark asked for the outline on cliff edges too, so the
  walk now only skips a same-level edge (`diff === 0`) — a cliff edge gets both the contour
  outline (from `TerrainLayer`) and the rock teeth (from `EdgeLayer`), stacked.

## Prototype-mode debt

### Spell resolution sprites — 2026-08-31

- The spell sprite sheets remain in `public/art/spell-vfx-spritesheets/` and
  `public/art/spell-vfx-spritesheets-64f/`, but `EffectLayer` no longer loads or draws them.
  They remain source material for a possible later art pass. Runtime spell feedback uses
  deterministic `Graphics` compositions only.
- `CastLayer` keeps the live caster-to-target aim line while aiming. Confirmation accelerates
  its particles into the target over 350 ms and fades the line instead of removing both at
  once. This overlaps the resolution effect's opening and connects the aimed cast to its result.
- Each tree has its own procedural placeholder composition. Blast uses an additive core,
  shockwave, and 28 seeded sparks. Healing uses three elliptical pool rings, two redrawn spiral
  ribbons, eighteen rising bubbles, and a brief cross-shaped glint. Controlling assembles an
  orb from three rotating elliptical rings and orbiting shards before releasing a lock pulse.
  Offense crosses two energy slashes through a central flash and throws sparks. Defense
  assembles a translucent shield and five hex cells, ripples on impact, then sheds fragments.
  Movement draws five live wind ribbons, a brief pair of wings, and directional streaks.
  Random values derive from tree and cell, so repeated playback follows stable paths.

### Spell sprite hybrid — 2026-09-01

- `EffectLayer` now draws the 64f sheets again, as the body of each effect, with the
  procedural accents kept on top: blast keeps its shockwave + sparks, healing its bubbles,
  controlling its lock pulse, offense its flash + sparks, defense its impact ring +
  fragments. The dropped procedural pieces (blast core, heal rings/ribbons/cross, control
  orb/rings/shards, offense arcs, defense shield/hex cells) duplicated what the sprites
  already show.
- Frame index is driven through a per-tree piecewise-linear `FrameCurve`, never linear
  playback: the sheets bake a slow bloom peaking ~60% in, so the curves rush the growth
  frames, dwell on the peak band, and spend the tail on decay. Durations kept at the old
  1.3–1.8 s values. Control's curve stops at frame 54 (grey matte blobs after) and
  offense's at 58 (cleanup leaves almost nothing in its splatter tail).
- Blend judgment: buff-attacks and control render additive-only — their baked pale matte
  halo reads as glow under ADD and as mushy fringe under NORMAL. Blast, heal and defense
  keep a NORMAL base (smoke/pool/shield need dark tones) plus an additive copy whose alpha
  bells through the first 75% of the effect.
- `scripts/clean-spell-vfx.py` (Pillow) crushed sub-56 matte alpha with a smoothstep
  shoulder and dropped components confined to a 10 px strip at left/right frame edges
  (clipped neighbor slivers); it rewrote the sheets in place and regenerated
  `validation.json`. Git holds the pre-clean sheets at commit `acc5e23`.
- `blast-alpha-fixed.png` was byte-identical to `blast.png` — the fix described in
  `ALPHA_FIX_PROMPT.md` never landed — so both files are gone.
- buff-movement stays fully procedural and its sheet is not fetched: near-invisible
  (peak alpha energy 0.11), tiny footprint, and frames carry misregistered fragments.
  Regenerate the sheet before wiring it.
- Sheets load once per page via `PIXI.Assets`, kicked off at layer construction. A cast
  resolving before the fetch finishes plays accents only — accepted, since the first cast
  is always many seconds after mount. A failed fetch clears the shared promise so the next
  mount retries.

For whenever prototype mode ends and a hardening wave runs. `grep -rn "proto:" src` today:

```
src/board/BoardApp.ts:24:      // proto: cap at 2x so a 5K display doesn't blow the canvas budget; autoDensity keeps
src/board/layers/LayerManager.ts:15:// proto: lifted verbatim from pf2e-reignmaker src/services/map/core/LayerManager.ts
src/board/theme.ts:33:// proto: seeded from pf2e-reignmaker's TERRAIN_OVERLAY_COLORS (src/styles/colors.ts) —
src/board/Token.ts:38:// proto: pf2e-trooper's *_strategy.webp renders put the miniature's own base ellipse about
src/board/Token.ts:221:        // proto: a missing texture leaves the coloured base disc as the placeholder; no error UI.
src/board/layers/MapTextUtils.ts:1:// proto: lifted from pf2e-reignmaker src/services/map/utils/MapTextUtils.ts (2026-08-24).
src/board/layers/TerrainLayer.ts:121:    if (type === 'open') return null; // proto: open ground stays a flat fill, no overlay
src/board/layers/OverlayLayer.ts:43:  // proto: Wave 2 has no tokens yet, so `id` is read as a cell key. A key that doesn't parse
```

(`dev/foundry-mount/main.ts` carries one more, outside `src/` and not part of the shipped app —
its own bare `PIXI.Application` standing in for Foundry's ambient one.)

What each one means for hardening, beyond the marker's own comment:

- **`BoardApp.ts`'s resolution cap** — a real setting, not a shortcut to remove; revisit only
  if a target device profile changes.
- **`LayerManager.ts` and `MapTextUtils.ts`, "lifted verbatim"** — not a shortcut either, a
  provenance note for backport parity; keep as-is unless Reignmaker's own files diverge and a
  reconciliation pass is wanted.
- **`theme.ts`'s seeded-not-designed palette** — `open`/`shallows`/`settlement` and the whole
  light-mode variant have no Reignmaker source and were never run past anyone but the executor;
  a hardening (or just a "does this look right") pass should look at them with fresh eyes.
- **`Token.ts`'s `ART_ANCHOR_Y = 0.8`** — one tuned constant standing in for real per-image crop
  data across 138 art files; likely fine forever, but the honest fix (if any image reads
  wrong) is per-image anchor data, not a bigger constant.
- **`Token.ts`'s silent art-load failure** — no error UI, no logged warning, just the
  placeholder disc forever. Fine for a prototype; a hardening wave should decide whether a
  missing texture should be visible to the GM (a console warning at minimum) before this ships
  anywhere art might legitimately go missing (e.g. a custom card with a typo'd name).
- **`TerrainLayer.ts`'s flat-fill-only `open` terrain** — deliberate (open ground needing no
  texture), not likely to need revisiting, but grep will surface it, so it's listed.
- **`OverlayLayer.ts`'s `setSelected` reading a cell key** — already tracked above and in
  Wave 2/3's notes as a "doesn't need to change, just stop being the only thing it does" note,
  not a defect; a hardening pass can leave it exactly as documented in `docs/pixi-board.md`.

Beyond the grep: the plan's own "Prototype mode" section names one more thing a hardening wave
owns that no `proto:` marker will surface, since it's an absence, not a shortcut —
`describe.each` geometry sweeps and per-cell property tests for `Grid` (Wave 1 skipped these
deliberately; only round-trip/neighbour-count smoke tests exist). `npm run check` was never
gated on during any wave but ran clean (0 errors) when tried at the end of Wave 6, for what
that's worth against six waves of un-gated drift — it doesn't cover `dev/`, which isn't in
either tsconfig.

### Spell VFX kit — 2026-09-02

- The interpolated 64-frame sheets are gone (`public/art/spell-vfx-spritesheets-64f/`, with
  `scripts/clean-spell-vfx.py`; git holds them at `7e201a2`). Sixteen unrelated stills
  cross-dissolved into sixty-four frames is a morph, not motion, and every curve, blend and
  alpha-crush around them was compensation. The 16-frame originals in
  `public/art/spell-vfx-spritesheets/` are real key poses and stay: `EffectLayer` now plays
  runs of them as hard-cut flipbooks (12–18 fps) or holds single frames as decals.
- `src/board/vfx/`: `textures.ts` paints eight soft white primitives onto one canvas atlas at
  startup (no asset fetch); `Effect.ts` turns a track list into `ParticleContainer`s, decal
  sprites, a token reaction and a board shake; `recipes.ts` is one track list per tree. A
  particle's position is an analytic function of its age (drag as an exponential, gravity as
  a quadratic), so an effect is a pure function of time: deterministic under the same
  `hash(tree:cell)` seed, and slow motion is a single multiplier.
- Blend policy: normal-blended, saturated colour throughout, additive only for brief hot
  cores. The light theme's cream board turns any large additive glow into a white disc and
  hides additive fire entirely (first screenshots confirmed it). Each recipe opens with a
  dark ground wash (`dim`) so the colours have something to sit on there; in the dark theme it
  reads as a spotlight.
- Ground vs air: a second effects container sits at `tokens - 1` for the wash, cell light,
  pools and the blast's scorch, so the piece stands in the effect rather than under it.
- Token reactions (`Token.react`): a damped-sine squash/pop, a hop through `pivot`, a jitter,
  and a brightening via a per-token `ColorMatrixFilter` whose `alpha` fades — the filter
  offsets multiply by the sprite's alpha so transparent pixels stay clear. `applyFilters`
  composes it with the broken-unit desaturate.
- Blast flies in: `BoardView.burst` takes an optional `from`, defaulting to the cast being
  aimed (`CastLayer.resolve` now returns its caster cell). Frame 4 of the blast sheet is the
  projectile, rotated to the flight (`heading` = π/4, the way the art points), with a glow
  trail whose births walk the line.
- `?vfx` opens `VfxGallery.svelte`: six panes, one small board per tree framed on a caster
  at d3 and a target at d6, a play button per pane (or click the pane, or press its number),
  ¼×/⅒× slow motion, loop and a from-caster toggle. Six `BoardView`s mount at once, one
  `PIXI.Application` each. `setVfxTimeScale` is exported from the board index for it and
  nothing else.
- Screenshot gate: Playwright (`playwright-core` under the session scratchpad, cached
  `chromium-1234`, `--use-angle=swiftshader`) drove the lab at ¼× and shot four moments per
  tree in both colour schemes (`page.emulateMedia`). Effect time lags wall-clock there
  because PIXI's ticker caps `deltaMS` while a screenshot stalls the frame.
- Open: cast-line motes are the old swirl on glow sprites, not a recipe yet; no heat-shimmer
  `DisplacementFilter` under the blast; the flare/ring primitives could use a hand-painted
  pass; the smoke still sits on the piece for its first half-second.
- Sheet registration: the six atlases all declared `anchor: {0.5, 0.5}` per frame, and none of
  them held it. Measured on a luminance²-weighted core, the per-sheet means ran from
  (0.485, 0.393) on buff-defenses to (0.558, 0.469) on buff-attacks, and the core wandered
  0.10–0.20 of a frame *within* a sheet — every one of them creeping upward as the effect
  grew, because an effect grows more up than down inside a fixed box. `spell-vfx-frames.mjs
  register` measures each frame and translates it by whole pixels so its core lands on the
  frame centre; the sheets in `public/art/` are the registered ones and the claim in the JSON
  is now true (means exactly 0.500, residual spread under one pixel). Judgment calls: the
  weight is alpha × luminance², so the hot core outvotes the smoke and the outermost sparks;
  a frame too faint to measure (alpha mass under 0.02 — the first and last of most sheets)
  carries its neighbour's offset rather than chasing a centroid that rides on a few dozen
  stray pixels; shifts are held back from pushing content off the frame, which no frame
  needed — every sheet had margin. The pass is idempotent: a second run measures the centre
  it just created and shifts by nothing.
- Stabilizing moved the composition, because a sheet that sat high was buying lift for free.
  Effects centre on the cell; a piece stands on it (`ART_ANCHOR_Y` = 0.8), so its body is
  above the cell centre and a centred effect now reads low against it. Defense is where this
  shows: the ward used to enclose the piece and now sits at its feet, and the `y: [-0.08]`
  its four tracks already carry is no longer enough on its own. That lift is about the token,
  not the sheet, so it belongs in the recipe — open.
- The ward kept wobbling in x after that pass, because a centroid is the wrong landmark for
  it: the ward's glow is a broad symmetric haze that outweighs the shield and stays put while
  the shield slides inside it, so the core read as rock-steady (spread 0.007) while the shape
  moved. Its rim is no better a landmark — the ward shatters right-hand-side first, so a rim
  centroid slides left whether or not the shield does. `register --sym-x` takes x from the
  frame's axis of mirror symmetry instead, which is what "centred" means for an object drawn
  symmetric, and needs no landmark to be found. Frames 3–11 went from an axis spread of 3.5px
  (61.5–65.0, with a 3px lurch between frames 8 and 9 — and frame 9 is the one the recipe
  holds for 280ms) to 0.5px (64.0–64.5). y still comes from the core, and x and y are gated
  separately so a shattering frame keeps its sound centroid height after it has stopped
  having an axis. Only buff-defenses is registered this way: a crescent and a wing are not
  symmetric objects, and asking for their axis would be meaningless.
- Cross-correlating each frame against its neighbour was tried for this and rejected. On an
  effect that grows it mistakes growth for movement: chained over a sheet it claimed 38px of
  drift in blast and 8px in control, both of which are correctly registered.
- Open: buff-movement frame 11 is a dud (alpha mass 0.016 between neighbours at 0.089 and
  0.030) and `movement()` plays it through `range(10, 12)`, so the wing blinks.

## Terrain scatter (2026-09-04)

Two chroma-keyed sheets replace the procedural tiling patterns. `art-src/terrain/*.png` are the
sources; `npm run bake:terrain` writes `public/art/terrain/*.webp` and `frames.json`, and only
the baked files are read at runtime. Judgment calls made while wiring it:

- **The key comes out offline.** The sheets ship as opaque RGB on magenta, which is what makes
  them editable and exactly what a lossy codec destroys, so keying at load time meant shipping
  PNG: 4.5MB for the two. Baking the alpha in first lets WebP carry it losslessly beside lossy
  RGB — 937KB, a 79% cut — and spares every page load a key pass and a flood fill over 1.5M
  pixels. `WEBP_QUALITY` in the script is the knob. The sheets are also 2.7× oversampled
  against their on-screen size at a typical zoom, so halving them is the next lever if wanted.
- **Alpha comes from magenta-ness, not from distance to the key colour.** Distance is not
  linear in how much key a pixel is mixed with: a half-and-half blend of the near-black outline
  with magenta still lands 160 away from it, reads as solid, and rims every sprite in purple —
  which is what the first pass did. `(r + b) / 2 − g`, over the same for the key, is linear in
  the mix. Both sheets are strongly bimodal on it: art at or below 0.2, background at 0.94 and
  up, only the antialiased fringe between. The knee at the art end is what keeps the badlands'
  red-brown — the one part of the palette with real magenta in it — fully opaque.
- **The transparent background is bled over before encoding.** WebP quantizes RGB everywhere,
  including where alpha is 0, so a sprite left sitting on raw magenta gets its halo handed back
  at every edge.
- **Frames come from the ink, not from the sheets' 8×8 grid.** Several tree crowns overrun
  their cell: cutting on the pitch clipped them and pulled the neighbour's edge in — six of the
  sixteen tree frames came out exactly cell-sized, the signature of a clip. Flood-filling every
  blob and gathering blobs by the cell their centre lands in gives exactly 16 frames per
  quadrant on both sheets, 88–154px, none touching a cell edge. It also keeps a swamp tuft with
  its pads and pebbles as the one composition it was drawn as; that quadrant alone is 34 blobs.
  Sheet 2 was delivered at 1254² rather than the 1536² its geometry was specified at, which
  cost nothing — nothing in the pipeline reads a fixed pixel size.
- **Sheet 2's desert, water and plains are ground cover, not props.** They are whole patches of
  surface and want to overlap into a continuous field, so they take a wider footprint, a
  smaller gap, no shadow, and paint under everything else — a wood stands on its field rather
  than under it. Badlands are drawn in three-quarter view with one light direction, so like the
  swamp reeds they only mirror; every other quadrant is top-down and turns freely.
- **Terrain mapping.** open → plains, forest → trees, swamp → swamp, water → water, shallows →
  the water art at a thinner, smaller setting (broken water over the pale bed). Settlement
  keeps its procedural pattern — there is no art for it. Boulders and mounds hang off elevation
  rather than terrain, since `SquareTerrain` has no mountain or hill: level 1 gets mounds,
  level 2 and up gets boulders. Open: whether a level −1 pit should get anything, and whether
  boulders on a forest cell should thin the trees rather than sit among them.
- **Desert and badlands have nowhere to land.** Neither is a `SquareTerrain`, and adding one is
  a rules change — movement, cover, the lot — not a rendering change. Both are baked, named and
  styled, and go live the moment the vocabulary grows. Open.
- **Scenery is never masked to its area.** A tree cut in half by a straight line reads as a
  rendering fault; the same tree leaning over the boundary reads as a wood that spills into the
  field. Containment is a placement constraint instead: a piece is rejected unless its outline
  sits inside the area dilated by 16px. The outline sampled is the frame's inscribed ellipse,
  not its corners — every quadrant is blob-shaped, and the corners of a tree crown's bounds are
  empty, so testing them pushed scenery needlessly far off every boundary.
- Placement is seeded per cell (`style:cell`), so a wood grows in the same shape on every
  redraw and simply scales with the board. Jitter is a fraction of the cell pitch; the 16px
  allowance is not, so a rejection can flip at the extremes of the zoom range.
- Dark theme tints scenery to 58% — the sheets' light olive and sand glare against the dark
  terrain fills at full brightness.

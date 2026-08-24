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

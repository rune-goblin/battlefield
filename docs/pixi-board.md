# The PIXI board

`src/board/` renders the battlefield: a nine-by-nine store holding either a square grid or the
hexagon of sixty-one hexes, painted terrain, walls,
tokens. It depends on `pixi.js` only — no Svelte, no DOM beyond a canvas element and whatever
container it is given. `src/app/PixiBoard.svelte` is the only Svelte wrapper; every stage
(board, paint, place, battle) uses it. This doc describes the API as it actually ended up —
several names differ from the aspirational sketch in `docs/plans/pixi-board.md`, noted inline — plus
the mount recipe for embedding the board somewhere this code doesn't own the stage (Foundry,
Reignmaker), what Wave 6 had to change to make that true, and what was lifted from
`pf2e-reignmaker` and what changed on the way in.

## `BoardView`

The one surface Svelte (or any other host) touches — stages never reach into layers directly.
Built by `createBoardView(canvas, container, opts)` in `src/board/index.ts`:

```ts
interface BoardView {
  setBoard(board: Board | null): void;
  setTokens(tokens: TokenModel[]): void;
  setFallen(fallen: FallenModel[]): void;                         // ground marks where units died; takes no pointer
  setHighlight(cells: string[], style: HighlightStyle): void;   // see HIGHLIGHT_STYLES
  setSelected(sel: { cell: string; side: Side } | null): void;   // a cell, not a token id — see below
  setMode(mode: BoardMode): void;                                 // 'view' | 'paint' | 'place' | 'battle'
  setBrush(brush: Brush | null): void;                            // paint mode only
  setPickableEdges(keys: readonly string[]): void;                // the walls a press may take
  on<T extends BoardEventType>(event: T, handler: (e: BoardEventOf<T>) => void): () => void;
  cellAt(clientX: number, clientY: number): string | null;       // native DragEvent -> cell key
  resetView(): void;                                              // undo pan/zoom
  resize(): void;
  destroy(): void;
}
```

Differences from the plan's sketch, and why:

- **Selection has one shared treatment.** Set a unit or engine token's `ring` to `'selected'`
  for a steady ivory outline with a dark edge. DOM objects use `data-selected="true"` within
  the app root. Both use the palette in `src/board/selection.ts`; custom canvas shapes call
  its `drawSelection` helper with their outline. The `'active'` ring and acting-cell wash
  retain their army colour to indicate whose turn it is.

- **`setSelected` takes a cell and a side, not a token id.** It predates `TokenLayer` (Wave 2);
  by the time tokens existed (Wave 4) the selection ring had moved onto the token itself
  (`Token`'s `ring` field), so nothing needed `setSelected` to mean "token" instead. It marks
  the acting piece's own hex, washed and outlined in that side's colour — the one place a
  side's colour touches the ground.
- **`setBrush` and `cellAt` are real methods**, not in the plan's sketch at all. `setBrush`
  is how a stage's palette drives paint mode; `cellAt` is how a native HTML5 `DragEvent`
  (a sidebar tray item, in Place) resolves to a cell without going through `Interaction`,
  which only sees pointer events already inside the canvas.
- **An `edge` event only ever arrives for an edge the host asked for.** `setPickableEdges` is
  the whole list a press may hit: in battle the walls the armed action can reach, and nothing
  otherwise. A wall brush is the one exception — it paints any edge — so `view` and `place`
  stages have no edge hover and no edge hit at all, and a wall there is scenery like the rest
  of the board.
- **No `BoardEvent` members for brush or drag state.** The plan's `BoardEvent` union is fixed
  and deliberately narrow (`hover`, `cell`, `edge`, `token`, `paint`, `drop`); keyboard brush
  changes and board-internal token drags reach the host through two constructor options
  instead — `onBrush(brush)` (`CreateBoardViewOptions.onBrush`, wired to `Interaction`'s own
  keyboard handling) and an internal `onDrag(id, point)` hook `Interaction` uses to drive
  `TokenLayer`'s lift/follow visuals directly, never surfaced to Svelte at all.
- **`resetView`** exists because Wave 3 added real pan/zoom; the plan didn't anticipate it
  needing an explicit reset (double-click empty space calls the same thing).

`HighlightStyle` is `'deploy' | 'move' | 'attack' | 'moveFar' | 'moveFar3' | 'valid' | 'invalid'`
(`HIGHLIGHT_STYLES` in `theme.ts`). The first five are ink washes; `valid` and `invalid` are the
green and red verdict on a drop cell, washed and outlined. There is no side parameter, so a "your
side's deploy zone" wash is the caller's job (pass only that side's cells).

## The `Grid` interface

`src/engine/grid.ts`, pure math, no PIXI, tested in `src/tests/`. Both `squareGrid` and
`hexGrid` (pointy-top, odd-r offset) implement it; `gridFor(kind)` / `gridOf(board)` resolve
which one a given `Board` uses.

```ts
interface Grid {
  kind: 'square' | 'hex';
  cells(): Cell[];
  key(c: Cell): string;                    // 'e4' on both grids
  parse(text: string): Cell;
  inBounds(c: Cell): boolean;
  neighbours(c: Cell): Cell[];              // 4 on square, up to 6 on hex
  distance(a: Cell, b: Cell): number;       // Manhattan on square, cube on hex
  edgeKey(a: Cell, b: Cell): string;        // sorted pair, e.g. 'e4|e5'
  rank(c: Cell): number;
  homeward(c: Cell, side: 'attacker' | 'defender'): Cell[];
  beyond(from: Cell, through: Cell): Cell | null;   // next cell along the line from→through
  center(c: Cell, size: number): Point;
  vertices(c: Cell, size: number): Point[];
  fromPoint(p: Point, size: number): Cell | null;
  edgeSegment(a: Cell, b: Cell, size: number): [Point, Point];
  bounds(size: number): { width: number; height: number };
}
```

`beyond` is the one addition against the plan's sketch: it wasn't listed, but `battle/combat.ts`'s
Overrun push (`giveGround`) and `siege-targets.ts`'s line-shaped target areas both need "the cell one step past this
one, continuing the same line," which is a reflection on square and a cube-direction step on
hex — different enough per grid that it earns its own method rather than being reimplemented
at each call site.

## Layers and pieces

Gates use double doors viewed from above. Closed leaves meet in a solid line across the opening; open leaves swing 90 degrees outward, away from the interior hex. Hinge marks anchor both states. Brass ring handles mark the interior face of each leaf; a thick dark iron strip reinforces the outside face. Both turn with the doors as they open. The same timber color serves both states, so shape conveys the difference. Breached gates remain rubble. `gate-geometry.ts` keeps the swing direction consistent across square and hex wall orientations. The walls service infers the initial gate interior from a closed enclosure. Gate painting cycles open A, closed A, open B, closed B, then no gate; its explicit facing overrides inference and persists into battle. Open wall runs and partitions retain their chosen default facing. The Fortified condition uses the gate icon and appears in the selected unit's status display.


```
src/board/BoardApp.ts          owns PIXI.Application, canvas, resize, theme — the in-app board only
src/board/BoardContainer.ts    a plain PIXI.Container + LayerManager; mountable anywhere
src/board/layers/LayerManager.ts   adapted and trimmed from Reignmaker; owns LAYER_ORDER, the board's whole z-order
src/board/layers/BoardLayer.ts     the contract every layer implements: setGeometry(LayerContext | null) and destroy
src/board/layers/TerrainLayer.ts   cell fills, procedural texture overlays, elevation, slope hatching
src/board/layers/InkLayer.ts       the illustrated map: one wash per hex under one pencil drawing
src/board/layers/EdgeLayer.ts      walls, breached walls, cliffs
src/board/layers/MapLineLayer.ts   terrain-area and elevation rings, above every other layer with the grid
src/board/layers/GridLayer.ts      the reference hex outline, one weight for every hex
src/board/layers/OverlayLayer.ts   hover, selection, highlight washes, paint preview
src/board/layers/TokenLayer.ts     Token sprites, sprite-cache diff, per-tick animation
src/board/layers/ShotLayer.ts      the aimed shot's arc
src/board/layers/CastLayer.ts      the aimed cast's line and glow motes
src/board/layers/EffectLayer.ts    spell resolutions: plays a vfx recipe on a cell, ground + air containers
src/board/vfx/textures.ts       the soft white primitives (glow, spark, smoke, ring, streak...) on one atlas
src/board/vfx/Effect.ts         track specs (particles, painted frames, token reaction, shake) and their runner
src/board/vfx/recipes.ts        one track list per tree; the painted 16-frame sheets are referenced from here
src/board/Token.ts              one battlefield piece: cast shadow, art, flag and badge, bars, spell reactions; composes token/
src/board/token/geometry.ts     the piece's footprint, flag, status and engine-chip ratios; no PIXI
src/board/token/MoveTween.ts    a piece's slide to a new cell, or its paced walk along a queued route
src/board/token/StatusColumn.ts the status icons under the flag, and each one's arrival
src/board/token/RingGlow.ts     the selection outline, the active glow and the free-strike flash
src/board/token/EngineChip.ts   the crewed engine's framed icon and its hit box
src/board/piece-shadow.ts       the board's one light, the shear that lays a piece's silhouette on the ground, the silhouette bake
src/board/Interaction.ts        pointer state machine on the host canvas -> BoardEvents
src/board/hit.ts                pixel -> cell, then what that cell holds: token | edge | cell
src/board/brush.ts              paint-mode brush type and its derived colours/erase forms
src/board/ink-map.ts            the illustrated map's settings and its stable per-hex placement
src/board/map-lines.ts          the outlines both styles share: a ring around each terrain area and each height
src/board/ink-sheet.ts          loads the baked pencil atlas (scripts/bake-ink.mjs)
src/board/theme.ts              light/dark palettes
src/board/art.ts                BASE_URL-prefixed art paths (src/engine/art.ts stays Vite-free)
src/board/index.ts              createBoardView / mountBoardView (the mount seam, see below)
```

`src/app/PixiBoard.svelte` is the only file outside `src/board/` that imports it; every stage
passes it `board`, `tokens`, `mode`, `brush`, `highlight`, `selected` as props and gets
`BoardEvent`s back as Svelte event callbacks.

## Mounting: `createBoardView` vs. `mountBoardView`

`createBoardView(canvas, container, opts)` is what the app uses: it owns a `PIXI.Application`
(so it needs a canvas element to render into and a container element to `resizeTo`), a
`ResizeObserver` on that container, and the DOM pointer/keyboard listeners `Interaction` adds
to the canvas. That bundle is the wrong seam for a host that already owns its own
`PIXI.Application` — Foundry has exactly one, for the whole page — because using
`createBoardView` there would mean constructing a *second* `Application`/canvas nested inside
the first, which defeats the point of "the container makes no assumptions about owning the
stage."

The view `createBoardView` returns also has `attach(container, onBrush?)` and `detach()`, for a
host that moves one canvas between elements: `detach` stops the ticker and keeps the GL context
and its uploaded textures. The app has no use for them now. `App.svelte` mounts one `PixiBoard`
for every stage's main board and the stages present their props to it
(`src/app/stage-view.svelte.ts`); `clearEffects()` drops the bursts and combat text in flight when
the stage changes. Every other `PixiBoard` (the battle report's previews, the labs) builds and
destroys its own view.

`mountBoardView(opts)` is the lower seam `createBoardView` is built on, and the one a host
calls directly:

```ts
function mountBoardView(opts: {
  parent: PIXI.Container;    // where BoardContainer attaches, and what Interaction pans/zooms
  canvas: HTMLCanvasElement; // receives the pointer/keyboard listeners; not created here
  ticker: PIXI.Ticker;       // drives token tweens/ring pulses off the host's render loop
  renderer: PIXI.IRenderer;  // generates TerrainLayer's procedural textures
  size(): { width: number; height: number };  // the area BoardContainer fits itself into
  theme: BoardTheme;
  onBrush?: (brush: Brush | null) => void;
}): BoardView;
```

It constructs a `BoardContainer`, adds it to `opts.parent`, wires the five layers and
`Interaction` to it, and returns the same `BoardView` shape — but its `destroy()` only tears
down what it created (`BoardContainer`, its layers, `Interaction`'s listeners on `opts.canvas`)
and never touches `opts.parent`, `opts.canvas`, `opts.ticker` or `opts.renderer`, since the
host owns those. `createBoardView` is now a thin wrapper: build a `BoardApp`, call
`mountBoardView` with `parent: boardApp.viewport`, and layer a `ResizeObserver` and
`boardApp.destroy()` on top.

### What Wave 6 had to change to make this true

Before this wave, `mountBoardView` didn't exist — `createBoardView` did all of the above
inline, and nothing else in `src/board/` assembled a `BoardContainer` + layers + `Interaction`
without also `new PIXI.Application(...)`-ing a canvas first. That was the actual portability
gap: `BoardContainer` itself was already a plain `PIXI.Container` (Wave 0 got that right from
the start), but there was no public seam to *drive* one without paying for a whole second
renderer. Extracting `mountBoardView` from `createBoardView`'s body — parameterizing
`boardApp.viewport` → `parent`, `boardApp.app.screen` → `size()`, `boardApp.app.ticker` →
`ticker`, `boardApp.theme` → `theme` — is the whole fix; every layer and `Interaction` already
took injected dependencies (`toLocal`, `viewport`, `canvas`) rather than reaching for a global,
so nothing inside them needed to change.

One more thing did: `TerrainLayer.draw`'s first parameter was `app: PIXI.Application`, used for
exactly one call, `app.renderer.generateTexture(...)`. A host doesn't have — and shouldn't be
asked for — a second `PIXI.Application`; it has a renderer. Narrowed the parameter to
`renderer: PIXI.IRenderer`, the actual dependency, so `mountBoardView` (and any future caller)
supplies a renderer, not an `Application`. Nothing else in `src/board/` took an `Application`
directly.

### The mount recipe (`dev/foundry-mount/`)

`dev/foundry-mount/main.ts` is the prototype this wave asks for: it builds its own
`PIXI.Application` (standing in for Foundry's ambient one — a real port passes
`canvas.app.view` / `canvas.app.renderer` instead of constructing a second `Application`), adds
a `primary` container at 0.5× scale with a fixed offset (standing in for whatever scene-level
container Foundry nests its content under), nests one more container (`boardViewport`) inside
that for `Interaction`'s own pan/zoom so a wheel-zoom in the demo doesn't rescale the host's
`primary` container, and calls `mountBoardView({ parent: boardViewport, canvas: app.view,
ticker: app.ticker, renderer: app.renderer, size: () => ({ width: 800, height: 800 }), theme })`.
It then fetches `battle-state.json` (a `{ board, tokens }` snapshot — a hand-built hex board and
five tokens including one crewed engine and one abandoned engine) and calls `setBoard`/
`setTokens`/`setHighlight`. Pointer hover/click/paint all work unmodified through this nesting,
because `Interaction`'s `toLocal` is `(screen) => boardContainer.toLocal(screen)` — a PIXI
`Container.toLocal` call walks the full `worldTransform` chain back to the stage regardless of
how many containers sit in between, so a `screen` point in CSS pixels relative to the one real
canvas resolves correctly no matter how deep `BoardContainer` is nested or what its ancestors'
scale/offset are. That is the "injected `EventTarget` and `toLocal`" portability claim the plan
names, made concrete.

Screenshot: `docs/plans/pixi-board-shots/wave6-foundry-mount.png`. Reachable at
`npx vite` → `/dev/foundry-mount/` — Vite's dev server transforms any `.html` file under the
project root, not only the one at `/`, so no `vite.config.ts` change was needed to serve it.
It is equally unreachable from `npx vite build`'s output on purpose and for the same reason:
the default production build only follows the root `index.html`'s own script graph, and
`dev/foundry-mount/index.html` isn't linked from anywhere in it, so it's simply never visited
during a build. Verified: `dist/` after a build is unchanged (`index.html`, one JS bundle, one
CSS file) whether `dev/` exists or not.

## Interaction

`Interaction.ts`'s constructor takes a `canvas: HTMLCanvasElement` for its `pointer*`/`wheel`/
`dblclick`/`contextmenu`/`keydown`/`keyup` listeners, a `viewport: PIXI.Container` it is the
only writer of (pan/zoom), and `toLocal(screen): Point`. It never touches
`PIXI.InteractionManager`/`EventSystem` on the stage — deliberately, since Foundry owns the
stage's own interaction system for its scene, and a board that only asks for "some canvas
element to listen on" and "a function that maps a screen point to board-local coordinates"
ports across without needing to know anything about what else is listening on that same canvas.

## Lifted from Reignmaker, and what changed

Surveyed `pf2e-reignmaker`'s `src/services/map` (~15.8k lines, all against the ambient global
`PIXI`, v7.4.3). What actually got lifted, and the edit each one needed:

- **`LayerManager.ts`** (`core/LayerManager.ts`) — adapted, then trimmed to what this board
  calls. Added the `import * as PIXI from 'pixi.js'` line Reignmaker doesn't need (ambient
  global there), and swapped its Foundry kingdom-map `LayerId`/`MapLayer` types (which carry
  icon-path exports that don't apply to a battle board) for a pair scoped to this board's
  layers. The singleton `createLayer` and z-index handling stayed; the methods this board
  never calls (`getLayer`, `removeLayer`, `clearLayerContent`/`clearLayer`, and the id/count/
  visibility queries) did not.
- **Terrain palette** (`src/styles/colors.ts`'s `TERRAIN_OVERLAY_COLORS`) — only
  `forest`/`swamp`/`water` map onto Reignmaker hexes with the same name; this board's other
  three terrains (`open`/`shallows`/`settlement`) have no Reignmaker counterpart, so those
  three (and the light-mode variant — Foundry's canvas is always dark, this app isn't) are
  original, tuned to sit next to the rest. Alpha is dropped: Reignmaker's overlay is
  translucent over a base map image; this board's fills are opaque, since there's no base map
  underneath them.
- **Sprite-cache diff pattern** (`renderers/FogOfWarRenderer.ts`) — `TokenLayer`'s
  `renderAll()` follows the same shape (diff wanted-ids against cached sprites; destroy what's
  gone, create what's new, redraw the rest in place), but the cache itself is an *instance*
  field, not Reignmaker's module-scoped `Map` — Reignmaker has exactly one Foundry canvas ever;
  this app can and does mount more than one `BoardView` at once (see the wave screenshots), and
  a shared cache would let two boards' tokens collide on id.
- **Commit-on-pointerup paint pattern** (`editors/TerrainEditorHandlers.ts`) — the shape (queue
  a stroke's cells/edges in a preview layer while dragging, commit once on pointerup) is
  `Interaction`'s `Stroke`/`extend`/`onPointerUp` handling; the preview layer is
  `OverlayLayer.setPaintPreview`. Reignmaker's version edits a Foundry scene flag directly on
  commit; this one emits a `paint` `BoardEvent` and lets the caller (the Paint stage) own the
  store write, since there's no Foundry document to write to here.

Foundry-bound and deliberately **not** lifted: Reignmaker's token layer (its armies are Foundry
Tokens, a different object model entirely), `EditorModeService` (listens on `canvas.stage`,
the exact pattern this board avoids), scene controls.

## `pixi.js@7.4.3`, and the mask trap it led to

Pinned to `7.4.3` to match Foundry v14's bundled runtime exactly (its `foundry-pf2e` types
declare that version), so Reignmaker code lifted here runs unedited, and code written here
moves back into a real Foundry module without a v7→v8 port. A version bump is a separate,
deliberate plan, not something to drift into.

One cost of v7 specifically: `PIXI.DisplayObject`'s `mask` setter sets `renderable = false` on
whatever object it's handed
(`@pixi/display/lib/DisplayObject.mjs:352`), unconditionally. `TerrainLayer`'s procedural
texture overlays are a `TilingSprite` masked to a cell's shape; the first attempt used the
cell's own fill `Graphics` as that mask, on the theory that a shape already being drawn could
double as its own clip. Every textured terrain rendered colourless — the fill had gone
invisible, not just "used as a stencil." A `DisplayObject` in PIXI v7 cannot be both a visible
child and a mask at once. The fix is a *second* `Graphics` of the same polygon, added to the
layer but used only as the mask, never drawn for its own sake
(`src/board/layers/TerrainLayer.ts`'s `shapeOf`, called twice per textured terrain type). Worth
knowing before reusing this pattern in v8, where masking is reworked.

## The illustrated map

`setInkMap(appearance)` swaps `TerrainLayer`'s textured surfaces for `InkLayer`'s: a faint wash
shaded once per connected patch of a terrain, a scatter of pencil marks over the patch, and a
drawing standing for every couple of hexes of it. Only one of the two layers ever holds anything; setting an
appearance clears the other. The sprites come from two atlases under `public/art/terrain/ink/`,
`ink.webp` for the drawings and `fill.webp` for the marks, both baked by `scripts/bake-ink.mjs`
(`npm run bake:ink`) out of the white-page sheets in `art-src/terrain/ink-sprites/` and
`art-src/terrain/ink-fills/`.

`inkPatch` in `ink-map.ts` places a patch as one canvas: the patch's cells sorted by key, its
lowest key the seed, so a patch keeps its scatter while the board resizes and no two patches
share one. Each hex adds one chance in `heroes.perHexes` of a drawing, at least one per patch;
the first drawing stands at the deepest of sixteen points sampled over the whole patch, the
rest at the one farthest from those standing, and every drawing's foot must lie wholly on the
patch, with no regard for hex centres. Fills are then sampled
the same way as a Poisson disc: of twenty candidates, any within a standing mark's radius or a
drawing's body is refused, and the most open of the rest wins.

The bake turns graphite into **alpha over flat white RGB**, so a sprite carries coverage and no
colour of its own. That is what lets the ink take any colour the board sets: `sprite.tint` is a
vertex colour in Pixi, so a whole map of differently-tinted drawings still batches into one
draw call. Multiply-blending the sheets as they ship would have been cheaper to prepare and
would have fixed the ink at the graphite it was drawn in. All ninety-six frames sit on one
2304×1536 texture for the same reason — one base texture is one batch.

Water, shallows and settlement have no art in the library and are carried by their wash alone.

## Sizing `public/art/`

`public/art/` is 136 fetched `pf2e-trooper` strategy sprites plus 2 Reignmaker fallback tokens,
17 MB committed. `npx vite build`'s `dist/` grows by the same amount — webp doesn't gzip
further, so it's not a build-time cost, just a repo- and deploy-size one. Anyone vendoring
`src/board/` elsewhere without this art directory needs their own `src/engine/art.ts`-shaped
map and image set; the board code itself has no hard dependency on any particular art — a
missing texture just leaves a token's coloured base disc as the permanent placeholder (see
`Token.updateArt`'s `.catch(() => {})`).

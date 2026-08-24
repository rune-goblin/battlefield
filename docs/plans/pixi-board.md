# Pixi Board — Implementation Plan

## Context

The app draws the battlefield as a DOM grid (`src/app/Board.svelte`): CSS cells, chips for
units, tiny edge handles for walls. It works as a form, not as a game board. Painting is
click-per-square, tokens are text, and none of it carries over to Foundry.

Decision (Mark, 2026-08-24): render the board with PIXI so the work is portable to Reignmaker
and Foundry, which both run on Foundry's ambient PIXI. Support an 8×8 square grid and an 8×8
hex grid behind one interface so the two can be compared in play. Use the pf2e-trooper
game-piece art (`*_strategy.webp`, a miniature on a base) for every army and siege engine.

Survey of `/Users/mark/Documents/repos/pf2e-reignmaker` (2026-08-24): ~15.8k lines of PIXI
map code under `src/services/map`, none of it imports `pixi.js`; all use the ambient `PIXI`
global (v7.4.3 via `foundry-pf2e` types) and Foundry's `canvas.grid` for hex geometry. Liftable
as-is: `core/LayerManager.ts`, `utils/MapTextUtils.ts` (one `canvas.stage.scale.x` seam),
`styles/colors.ts` terrain palette, `editors/TerrainEditorHandlers.ts`'s queue-paints-then-commit
pattern with a preview layer, `renderers/FogOfWarRenderer.ts`'s sprite-cache diff, and
`renderers/ArmyCountRenderer.ts`'s badge text. Foundry-bound and not lifted: the token layer
(armies are Foundry Tokens), `EditorModeService` (listens on `canvas.stage`), scene controls.

## Goals

1. A board that looks and behaves like a game board: textured terrain, height, walls as
   drawn barriers, tokens that are miniatures, hover and selection feedback, drag-to-paint.
2. One `Grid` abstraction with `square` and `hex` implementations; the engine and the view
   both read it, so switching is a dropdown on the board stage.
3. `src/board/` depends on `pixi.js` only — no Svelte, no DOM beyond the canvas element it is
   given. Svelte components wrap it. The same container can be added to a Foundry layer.
4. Pin `pixi.js@7.4.3` to match Foundry v14's runtime, so lifted Reignmaker code runs unedited
   and code written here moves back without a port. A v8 migration is a separate plan.

## Non-goals

Animation polish beyond move tweens, sound, mobile touch gestures, a Foundry module build.
Foundry mounting gets a prototype smoke test (Wave 6), not a shipped integration.

## Architecture

```
src/engine/grid.ts        Grid interface + squareGrid + hexGrid (pure math, tested)
src/engine/board.ts       Board = { grid: 'square'|'hex', squares, walls, spec }  (existing, adapted)
src/engine/battle.ts      reads Grid via board.grid: neighbours, distance, edges   (existing, adapted)

src/board/BoardApp.ts     owns PIXI.Application, resize, viewport (pan/zoom), theme
src/board/BoardContainer.ts   PIXI.Container: layers below; mountable anywhere
src/board/layers/LayerManager.ts     lifted from Reignmaker
src/board/layers/TerrainLayer.ts     cell fills + textures, elevation shading
src/board/layers/EdgeLayer.ts        walls, cliffs, breached walls
src/board/layers/OverlayLayer.ts     hover, selection, highlight sets, paint preview
src/board/layers/TokenLayer.ts       Token sprites, sprite cache diff
src/board/layers/LabelLayer.ts       a–h / 1–8, MapTextUtils lifted
src/board/Token.ts        base disc, miniature sprite, side ring, pips, badges
src/board/Interaction.ts  pointer state machine → typed events (BoardEvent)
src/board/hit.ts          pixel → cell | edge | token
src/board/theme.ts        colours, sizes, textures (light/dark)
src/board/index.ts        createBoardView(canvas, opts): BoardView

src/app/PixiBoard.svelte  thin wrapper: props in, events out, lifecycle
```

`BoardView` API (the seam every stage uses):

```ts
interface BoardView {
  setBoard(board: Board): void;                 // full redraw of terrain + edges
  setTokens(tokens: TokenModel[]): void;        // diffed; moves tween
  setHighlight(cells: string[], style: HighlightStyle): void;
  setSelected(id: string | null): void;
  setMode(mode: 'view' | 'paint' | 'place' | 'battle'): void;
  setBrush(brush: Brush | null): void;          // paint mode only
  on(event: BoardEvent, handler): () => void;   // cell, edge, token, paint, drop
  resize(): void; destroy(): void;
}
type BoardEvent =
  | { type: 'hover'; cell: string | null }
  | { type: 'cell'; cell: string; button: 0 | 2 }
  | { type: 'edge'; edge: string }
  | { type: 'token'; id: string }
  | { type: 'paint'; cells: string[]; edges: string[]; brush: Brush }   // once, on pointerup
  | { type: 'drop'; id: string; cell: string };                         // token drag end
```

### Grid interface

```ts
interface Grid {
  kind: 'square' | 'hex';
  cells(): Cell[];                          // 64 cells, {col, row}
  key(c: Cell): string;                     // 'e4' for square; 'e4' for hex too (col letter, row)
  parse(key: string): Cell;
  neighbours(c: Cell): Cell[];              // 4 or 6, in bounds
  distance(a: Cell, b: Cell): number;       // Manhattan or cube
  edgeKey(a: Cell, b: Cell): string;        // sorted pair
  rank(c: Cell): number;                    // row, for deployment and "homeward"
  homeward(c: Cell, side: Side): Cell[];    // neighbours that move toward the side's edge
  // geometry for the view
  center(c: Cell, size: number): {x, y};
  vertices(c: Cell, size: number): {x, y}[];
  fromPoint(p: {x, y}, size: number): Cell | null;
  edgeSegment(a: Cell, b: Cell, size: number): [{x, y}, {x, y}];
  bounds(size: number): {width, height};
}
```

Hex grid: pointy-top, odd-r offset, 8 columns × 8 rows, so ranks stay rows and deployment
stays "three rows a side". Cube distance. Reuse `offsetToCube`/`cubeToOffset` from
Reignmaker's `src/services/pathfinding/coordinates.ts` (odd-q there; transpose for odd-r).

Rules text says "orthogonal"; on the hex grid read it as "adjacent". Diagonals do not exist
on hex, so the "diagonal neighbours are distance 2" clause is square-only. Volley bands,
engagement, outflanking, walls and cliffs all go through `neighbours`/`distance`/`edgeKey`
and need no rule change. Pace's two-square Advance is "two cells in a straight line": on hex,
the second cell continues in the same cube direction.

### Interaction model

Pointer state machine in `Interaction.ts`, DOM `pointer*` events on the canvas element
(never `PIXI.InteractionManager` on the stage — keeps the Foundry port simple, matching how
`EditorModeService` attaches capture listeners):

- **Hover**: every move → hit test → `hover` event; overlay draws the hovered cell (and, in
  wall brush, the nearest edge) at 60 fps without touching Svelte state.
- **Click**: down + up within 4 px → `cell` / `edge` / `token` by hit priority token > edge
  (only when an edge brush is active or in view mode within the edge band) > cell.
- **Drag-paint** (paint mode, brush set): down starts a stroke; each move adds the cell under
  the pointer (or the nearest edge for wall brushes) to a pending set and paints the preview
  layer; up emits one `paint` event with the whole set. Right-drag with the same brush erases
  (open / elevation 0 / remove wall). Shift-click fills a connected region of the same terrain.
- **Drag-token** (place mode, and battle mode for the active unit's legal squares): down on a
  token lifts it (scale 1.08, shadow), move follows the pointer, up snaps to the cell under it
  and emits `drop`; the caller validates and calls `setTokens` — an invalid drop tweens back.
- **Pan/zoom**: wheel zooms about the pointer between 0.6× and 2.5×; middle-drag or
  space+drag pans; double-click empty space resets to fit. The board fits the container by
  default so pan/zoom are optional.
- **Edge hit band**: an edge is "hit" when the pointer is within `0.18 × cellSize` of the
  segment and closer to it than to the cell centre. No handles.
- **Keyboard** (when the canvas has focus): `1–6` terrain brushes, `Q/W/E` elevation 0/1/2,
  `R` wall brush (tier cycles with repeated presses), `X` erase, `Esc` clears brush/selection.

### Tokens

`Token` is a `PIXI.Container`: base disc (side colour: attacker blue, defender red; routed
grey), the miniature sprite anchored at the base centre and scaled so the base fills
`0.82 × cellSize`, a level badge bottom-right, wound pips (squares) along the bottom-left and
shaken pips (circles) below them, an engine chip (small siege sprite) top-left when a crewed
engine rides with the unit. States: `active` (pulsing ring), `selected` (solid ring),
`highlighted`, `broken` (desaturate filter), `routed` (grey base + arrow).

Abandoned engines are their own tokens (siege sprite, no ring) on the square they were left.

Art: `scripts/import-art.mjs` fetches `*_strategy.webp` for every troop in `data/troops/`
and the official selection, plus `assets/siege-engines/*.webp`, from
`github.com/rune-goblin/pf2e-trooper` into `public/art/{troops,engines}/` and writes
`src/engine/art.ts` mapping card name → path. Custom units fall back to
Reignmaker's `img/army_tokens/army-infantry.webp` / `army-calvary.webp` by role. Textures
load through `PIXI.Assets` with a placeholder disc until ready. Check pf2e-trooper's licence
before committing the fetched files; if it is not redistributable, the script runs at build
time and the files stay out of git.

### Terrain rendering

Per cell: a flat fill from `theme.ts` (start from Reignmaker's `TERRAIN_OVERLAY_COLORS`, but
opaque and darker so tokens read against it), with a procedural texture overlay per type
generated once via `renderer.generateTexture` (tree dots for forest, reed strokes for swamp,
ripple lines for water/shallows, cobbles for settlement) — no image assets. Elevation: a
lighter tint per level plus a hatched slope along edges where the level drops. Walls: a thick
stone-coloured bar with tier ticks; breached = broken bar at 40 % alpha. Cliffs: a dark
jagged line. Deployment ranks in place mode: a translucent side-coloured wash.

## Execution model

**Prototype mode is on** (Mark, 2026-08-24). This is exploration, not delivery. The mode
overrides every gate and test instruction below until it is switched off here:

- Tests: write none for PIXI code. For engine changes, keep the existing suite green and add
  at most a handful of cases where a rule is genuinely unclear (hex distance, hex Pace).
  Do not write the `describe.each` matrix or the per-cell geometry sweeps listed in Wave 1;
  a single smoke test per grid is enough.
- Gates: `npx vite build` clean and one screenshot or GIF that shows the wave works. Skip
  `svelte-check` unless a type error blocks the build; skip the light/dark and square/hex
  screenshot matrices — one shot of whichever case the executor used.
- Reviews: no `wave-reviewer` pass. Mark looks at the screenshot and plays with it.
- Judgment calls: decide and note them in `docs/plans/pixi-board.todos.md`; do not stop to
  ask. The "reserved" list is advisory.
- Code: skip polish (placeholder discs instead of art, flat fills instead of textures) when
  it gets the interaction in front of Mark sooner; leave a `// proto:` marker so the shortcut
  is findable later with `grep -rn "proto:" src`.
- Commits: one per wave is fine, subject `pixi-board Wave N (proto)`.
- Models: Sonnet for every wave, including 1 and 3. Escalate to Opus only after a wave
  fails twice.

When prototype mode ends, the sections below are the definition of done: a hardening wave
runs `grep -rn "proto:"`, fills in tests for whatever survived, and restores the gates.

Standard protocol for `wave-executor` (applies when prototype mode is off):

- One wave per executor run. Commit subjects `pixi-board Wave N: <unit>`.
- Never edit `docs/design.md` rules inside a wave; note rule questions in
  `docs/plans/pixi-board.todos.md`.
- Gates before "done": `npm run check`, `npx vitest run`, `npx vite build`, plus the wave's
  named visual gate (a `visual-qa` screenshot saved under `docs/plans/pixi-board-shots/`).
- Reserved judgment calls (flag, do not decide): hex deployment shape, whether Pace on hex
  needs a rule change, art licensing, whether to keep `Board.svelte` as a text fallback.

Model guidance per wave, for cost:

| Wave | Model | Why |
|---|---|---|
| 0 Scaffold | Sonnet | Mechanical: dependency, files, wiring |
| 1 Grid + engine | Opus | Touches rules; hex distance/adjacency must be right |
| 2 Rendering | Sonnet | Well-specified drawing; visual gate catches errors |
| 3 Interaction | Opus | State machine and hit-testing subtleties |
| 4 Tokens + art | Sonnet | Sprite work and a fetch script |
| 5 Stages on Pixi | Sonnet | Wiring existing stages to the new view |
| 6 Portability + docs | Sonnet | Smoke prototype and documentation |
| Review after each wave | Opus (`wave-reviewer`) | Cheap relative to a wrong wave |

## Invariants

- `src/board/` imports nothing from `src/app/` or Svelte. It may import types from
  `src/engine/`.
- `src/engine/` never imports PIXI.
- Every square rule in `battle.ts` goes through `Grid`; no `file ± 1` arithmetic remains.
- `BoardView` is the only surface Svelte touches. Stages never reach into layers.
- Tests: grid math and engine on both grids run in vitest (node). PIXI code is not unit
  tested; it is gated by screenshots.

## Wave 0 — Scaffold

- `npm i pixi.js@7.4.3`. Confirm `vite build` tree-shakes it acceptably (< 500 kB gz is fine).
- Create `src/board/` with `BoardApp.ts` (Application with `resizeTo` the container, background
  from theme, `devicePixelResolution`), `BoardContainer.ts`, `layers/LayerManager.ts` lifted
  verbatim from Reignmaker `src/services/map/core/LayerManager.ts` with `import * as PIXI from
  'pixi.js'` added, `theme.ts` with the terrain palette, `index.ts` exporting a
  `createBoardView` stub that draws an empty 8×8 square grid of lines.
- `src/app/PixiBoard.svelte`: mounts `createBoardView` in `onMount`, destroys in cleanup,
  forwards props to `setBoard`/`setTokens`. Add it to the board stage beside the DOM board
  behind a "Pixi preview" toggle so nothing regresses.
- Gate: build clean; screenshot `wave0-empty-grid.png` shows the grid in light and dark theme.

## Wave 1 — Grid abstraction and engine on hex

- `src/engine/grid.ts`: `Grid` interface, `squareGrid`, `hexGrid` (pointy-top odd-r), cube
  helpers ported from Reignmaker `coordinates.ts`. Tests: neighbour counts (4/6, edges and
  corners), distance symmetry, `parse(key(c)) === c`, `fromPoint(center(c)) === c` for every
  cell at three sizes, `edgeKey` order-independence.
- `board.ts`: `BoardSpec.grid: 'square' | 'hex'` (default square); `Board.grid`; replace
  `neighbours`/`distance`/`edgeKey`/`inBounds` with `grid.*`. The generator's ridge and river
  walk by `neighbours` and rows, so they need no hex-specific code; lakeside uses "columns 0
  or 7", which on hex is still a column.
- `battle.ts`: replace every direct coordinate computation (`advanceTargets`' straight-line
  Pace step, `withdrawTargets`' homeward test, `retreat`'s second step) with `Grid` calls.
  Add `grid.homeward`.
- Tests: run `battle.test.ts` scenarios that do not depend on geometry on both grids via a
  `describe.each`; add hex-specific cases: six engaged neighbours can outflank, cube distance
  bands, Pace straight-line step.
- Gate: all tests pass on both grids; `render()` in `board.ts` prints hex boards with row
  offset so the text preview stays readable.
- Reserved: whether hex deployment stays "three rows" (rows 1–3 and 6–8) — record the
  question; implement rows.

## Wave 2 — Rendering

- `TerrainLayer`: one `PIXI.Graphics` per terrain type (Reignmaker's grouping), polygon from
  `grid.vertices`; procedural texture overlays via `generateTexture` cached per type; elevation
  tint and slope hatching.
- `EdgeLayer`: walls, breached walls, cliffs from `grid.edgeSegment`.
- `LabelLayer`: coordinates using `MapTextUtils` lifted from Reignmaker with the scale seam
  pointed at `BoardApp.viewport.scale`.
- `OverlayLayer`: hover cell, selection, highlight sets with three styles (deploy wash, move
  target, attack target), paint preview.
- `setBoard` redraws; `setHighlight`/`setSelected` touch only the overlay.
- Gate: screenshots `wave2-square-{plains,forest-river,hills-fort,swamp-lake}.png` and the
  same four on hex, light and dark; the fort's walls, a breached wall and a cliff all visible.

## Wave 3 — Interaction

- `hit.ts`: `hitTest(point) → {kind:'token'|'edge'|'cell', id}` using `grid.fromPoint`, the
  edge band, and token bounds.
- `Interaction.ts`: the state machine above; emits `BoardEvent`s; owns pan/zoom via a
  viewport container (no external viewport library — 60 lines).
- Paint stage: replace the DOM board with `PixiBoard`; palette becomes `setBrush`; a `paint`
  event applies all cells/edges in one store write (Reignmaker's commit-on-pointerup); undo
  stack of five strokes.
- Board stage: the Pixi preview becomes the only board; grid kind dropdown next to base.
- Gate: a `visual-qa` recorded GIF `wave3-paint.gif` of a drag stroke, a wall placed by edge
  band, an erase, and a region fill; keyboard brushes verified.

## Wave 4 — Tokens and art

- `scripts/import-art.mjs`; `src/engine/art.ts`; licence check recorded in the todos file.
- `Token.ts` and `TokenLayer.ts` (sprite cache diff from `FogOfWarRenderer`); placeholder
  disc until `PIXI.Assets` resolves; level badge, pips, engine chip, state rings.
- Place stage: tokens for unplaced units sit in a tray beside the board (DOM list is fine);
  dragging a tray item onto a highlighted cell places it; dragging a placed token moves it;
  drop outside the deploy wash returns it.
- Gate: screenshots `wave4-place.png` with eight tokens including two engines; a custom unit
  showing the generic fallback art.

## Wave 5 — Battle on the board

- Battle stage: `PixiBoard` replaces `Board.svelte`; the active unit has the active ring;
  hovering an action row highlights its targets on the board; clicking a highlighted cell,
  token or edge performs the action; move actions tween the token (200 ms ease) and free
  strikes flash the striker's ring.
- Abandoned and captured engines as standalone tokens.
- Remove `Board.svelte` unless review keeps it as a text fallback (reserved).
- Gate: `wave5-battle.gif` of one full round on square and the same on hex.

## Wave 6 — Portability prototype and docs

- `dev/foundry-mount/`: a Vite page that creates a bare `PIXI.Application`, adds a stand-in
  "primary" container with a scale of 0.5 and an offset, then mounts `BoardContainer` into it
  and drives it from a JSON battle state — proves the container makes no assumptions about
  owning the stage or the DOM events (it takes an `EventTarget` and a `toLocal` function).
- Write `docs/board.md`: the `BoardView` API, the grid interface, how to mount in Foundry,
  what was lifted from Reignmaker and what changed.
- Update `README.md`, `docs/design.md` (hex option, one paragraph), `public/rules.html`
  (a sidebar on the hex variant).
- Gate: the mount page renders; docs reviewed.

## Cost notes

Waves 0, 2, 4, 5, 6 are specification-heavy and screenshot-gated: Sonnet with the
`visual-qa` agent for the gate. Waves 1 and 3 carry the logic that is expensive to get wrong
twice: Opus. Run `wave-reviewer` (Opus) after every wave; a review costs less than a wave
redone. Expected order of magnitude: Sonnet waves 30–60k output tokens each, Opus waves
60–120k, reviews 10–20k.

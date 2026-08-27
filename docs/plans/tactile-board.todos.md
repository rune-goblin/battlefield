## Wave 1 notes — the flag token

- `TOKEN_DISC_RATIO` is now `TOKEN_FOOTPRINT_RATIO`. There is no disc; the number still sets
  the miniature's width, where the markers hang, and `TokenLayer`'s hit-test radius, so it
  kept its value and lost its name.
- The banner template lives at `src/board/faction-banner.svg` and is imported `?raw`, not
  served from `public/art/`. It is a source template that gets its colour substituted, not an
  image anything loads by path. Copied from pf2e-reignmaker `img/effects/faction-banner.svg`
  with `width`/`height` added to the root tag: without them an SVG with only a `viewBox` has
  no intrinsic size, and what a rasterizer picks is its own business.
- `PIXI.Texture.from` on a `data:image/svg+xml` URI resolves to an `SVGResource` (its `test`
  matches the prefix), which rasterizes a frame or two later. `layoutFlag` waits on
  `baseTexture.once('loaded')` rather than scaling off the 1×1 placeholder frame.
- Rings kept, all four kinds. The plan retires `selected`/`highlighted` in Wave 5; until the
  popup lands, the `highlighted` ring is still how a focused rung names its unit targets, and
  dropping it now would take feedback away with nothing to replace it.
- Routed reads as a colourless flag, where it used to read as a grey disc. The rout arrow and
  the desaturation filter are untouched.
- The level moved onto the cloth at `size * 0.19` (was `0.26` in its own circle), clamped
  8–13px. `theme.token.badgeFill` now only backs the engine chip; `badgeText` has no reader
  left, and `bannerText` is the new light-on-cloth colour. Both kept — Wave 3's popup may
  want the pair back for a DOM badge.
- The ring tightened from footprint + 6% to footprint + 1%, and the flag pushed out to
  `r * 0.88`. At the old numbers the active unit's ring ran straight through the level on the
  cloth. The ring now traces the piece's hit area, which is a better thing for it to mean
  anyway.
- `FLAG_RATIO` settled at 0.32 of cell size. 0.36 crowded the miniature's shoulder.

## Wave 2 notes — the arrow, the ghost, and a drop that parks

- `previewAt(cell)` is now the single reading of "what does a drop here mean", shared by the
  live drag and the release. `onBoardDrag` and `onBoardDrop` had each carried their own copy
  of the charge/move/push cascade, and the two had to agree.
- The drag preview and the parked drop are the same shape, so `preview = drag ?? pending`
  drives the arrow, the band wash, the Move row, and the HUD. Wave 3 swaps the HUD's confirm
  bar for the popup and nothing else has to move.
- Confirming: Enter, a click on the parked destination, or the button. Cancelling: Esc, the
  button, or a click anywhere else — which then means whatever that click would have meant.
  A charge parks on its approach cell, so clicking the *enemy* is what confirms it.
- The arrow follows the route, not the straight line, and its head stops a fifth of a cell
  short of the destination's centre so it points at the cell instead of covering it.
- The ghost is a sibling sprite owned by `TokenLayer`, not a child of `Token` — the token
  container itself is what follows the pointer. Captured before the lift, while the piece
  still stands on its own cell.

### A crash the parked drop uncovered

`moveBands` indexed `bands[Math.min(3, m.actions)]`, and `moveActionsFor` returns **0** for a
destination covered by banked feet — so the first move that banked any movement threw
`bands[0].push is undefined` inside a derived, which froze the panel and the board while the
strip kept updating. Pre-existing, and nothing to do with the drop parking; it just needed a
move that left change. A reach now floors at the 1-action row (`bandOf`), and a free move
reads as "free, on banked movement" rather than "0 actions".

### Verification

Driven live in Chrome: the ghost, the arrow with its head, the parked HUD, Enter to commit,
Esc to cancel. The band-clamp fix landed after that run; the reload confirms the crash is
gone and the move commits, but synthetic pointer events stopped landing on the right cell
afterwards, so there is no post-fix screenshot of the parked bar.

## Wave 3 notes — the popup

- `rowsAt(cell)` replaces `previewAt`: every reading of a drop, not just the first. Dropped on
  a piece there is one row and it is a charge; on an empty cell the rows are the move (or the
  push, which is a disjoint set), then a charge for every `act.charges` entry whose *approach*
  cell is this one, then the withdrawal if this cell is one of its targets.
- Withdrawing by drag is new. `moveReach` and `pushReach` both return nothing while a unit is
  engaged, so before this a drag out of contact meant nothing at all and the panel was the
  only way out. Its arrow is a straight two-point line: a withdrawal has no traced route.
- The chosen row drives the board, so picking the charge turns the wash and the arrow red
  before anything is committed.
- The charge's Fight rung rides in the popup as three chips. `rungAccess(u, type, index)` is
  now exported from `battle.ts` — `rungOption` used to hold that rule inline, and a charge
  carries a Fight rung with no `ActionOffer` around it. The chips default to the granted rung,
  which is what `doCharge` picks when told nothing.
- `BoardView.screenOf(cell)` is `cellAt` inverted. Anchoring is a `requestAnimationFrame` loop
  while a popup is open — marked proto in `Battle.svelte`. Pan, zoom, a window resize and
  `centerOn` all move the cell under the popup and no one event covers all four.
- The popup sits above its cell and can cover a piece behind it (the origin, usually). Left
  as is; a flip-to-below rule already handles the top edge, where it would be off-screen.

### Two bugs fixed on the way

- Click-to-confirm never worked in Wave 2: `onCell`/`onToken` cleared `pending` *before*
  calling `commit()`, which then found nothing parked and did nothing. Only Enter worked, and
  Enter is what I had tested.
- The popup would not appear at all: the anchor's previous position started as `{x: NaN, y:
  NaN}` and `Math.abs(NaN) > 0.5` is false, so the guard meant to skip redundant writes
  skipped every write forever. It is a null now.

### Verification

Driven live in Chrome, with a temporary `window.__view` hook so synthetic drags could land on
exact cell centres (removed afterwards): the two-row popup on a charge's approach cell, the
rung chips, the wash turning red as the charge row is chosen, arrow keys moving the choice,
and Enter resolving the charge — "Line Infantry presses into Troll Marauders … critical
success", which is the granted rung the chips had selected.

## Wave 4 notes — offersAt

- `offersAt(state, target, unitId?)` returns every legal rung that can act on one board
  object, grouped by its offer. It is a filter over `availableActions`, but it is the seam the
  whole design turns on: the UI used to answer "can this click resolve?" itself, against
  whichever type the panel happened to have open.
- Your own piece is the target for the acts that name none. `own && !needsTarget` is the whole
  rule, and it is what puts Guard and a self-Rally on the piece rather than in a menu.
- `TargetRef` and `TargetOffer` live in `types.ts` beside `RungTarget`.
- The test settles the rule the design leans on hardest: **the rungs are the range.** Walking
  a target out of the close band drops Loose and leaves Volley and Barrage, so distance is
  taught by which rungs are offered rather than by grey buttons. It also pins down that an
  enemy is offered only what names it, that your own piece is never offered an attack on
  itself, and that an empty cell affords nothing — movement is not a rung.

## Wave 5 notes — the type row retired

- `openType`, `toggleType`, `openOffer`, `focused`, `focusedEntry` and `findMatch` are gone,
  along with the type-chip row and the ladder block in the panel. The panel keeps the stats
  card, the Move bands, Withdraw, and the log.
- Clicking a piece opens its ladder at the piece: an enemy gets the rungs that reach it, an
  ally the ones that help it, your own the ones that need no target. A wall's popup opens over
  the first of the two cells its edge divides.
- The dials came along. The selected row carries its `Commit actions` steppers, the reach
  gamble, and the totals line, so nothing that was reachable from the panel's ladder is
  unreachable now.
- `takeAim` passes the target id only where the rung's own `targets` name it. Guard takes
  none, and a Rally on your own piece must not arrive carrying your own id as the ally.
- The `highlighted` ring is gone, with `TokenRing` down to `active`, `selected` (Place's) and
  `flash`, and `theme.token.ringHighlight` with it. Nothing set it once the focused rung did.
- `BoardPopup` measures itself to decide whether to sit above or below its cell. The guess it
  replaced (`y < 180`) let the Shoot popup for a rank-7 target run off the top of the board,
  because a popup's height depends on how many rows and dials the offer has.

### Verification

Driven live in Chrome with the same temporary `window.__view` hook, removed afterwards.
Clicking the kobolds at five ranks offered Barrage alone, marked a gamble — Loose and Volley
do not carry that far — and Enter resolved it: "reaches for Barrage … success", then the
volley, the wound and the disorder. Clicking the unit's own piece offered Brace / Dig in /
Shieldwall with the Defence dial, and Enter logged "Line Infantry braces: +2 Defence."

## Action accounting

Mark reported a Rally clearing disorder and ending the activation instead of leaving two
actions. I could not reproduce it. Driven live: Kobold Warriors rallied with Steady and went
from three action pips to two, still activating; a Heavy Cavalry reached for Dig in, failed,
fell back to Brace, and also went three to two. The engine agrees — `doRung` returns
`offer.cost + spent(spend)`, and `BASE_COST` is 1.

Two things do spend the rest, both correct and both invisible at the moment of choosing:

- **Committing actions on a dial.** Each `+` is one more action. Pressing the Defence dial on
  a two-action Guard reads "Costs 2 of 2 actions" and ends the activation.
- **A push.** `doPush` returns `u.actions` — reaching beyond every action you have costs every
  action you have, win or lose.

So the fix was to put the price where the eye is rather than to change the arithmetic:

- Both popups' heads carry the unit's remaining action pips.
- Both feet read `N of M actions`, and add `— ends the activation` when the choice spends the
  last one.
- The push row now says outright that it spends every action left; before, only the panel's
  Push band hinted at it.

If it recurs, the two facts that would pin it are the pip count before the rally and whether
any dial had been raised.

## Walls as masonry, and a hexagonal board

Two changes, both self-contained.

**Walls.** `EdgeLayer.drawWall` used to stroke a 5px bar and hang tier ticks off it. Each wall
now gets its own `PIXI.Graphics`, positioned at the edge midpoint and rotated onto the edge,
so the masonry is laid out in local space — every hex edge is the same length and comes in one
of three orientations, which is what makes this cheap. One course of stone per damage box,
laid across the edge rather than up it: a tier-3 wall is four courses wide, and a battered one
thins as its boxes go. A breach draws rubble with a gap through the middle.

Judgment calls:

- **Remaining boxes are shown, tier is not.** A tier-3 wall battered to two boxes now looks
  exactly like an intact tier-1 wall. That is the more useful of the two numbers — what you
  must chew through is the remaining boxes, not the tier it started at — but it is a real loss
  of information, and it is the reason the tier ticks are gone.
- **Stone is mixed toward `theme.ink`, not shaded off `theme.rule`.** `shade` can only darken,
  and a darkened rule colour vanished against the settlement fill. `mix` (new, in `color.ts`)
  moves the stone toward the foreground colour, which lifts it in either theme.
- Sizes are fractions of the cell pitch, so the masonry holds up under the viewport zoom.
- Sprites are still the next step if the blocks want real texture: generate one tile with
  `renderer.generateTexture` the way `TerrainLayer.textureFor` does, then place three rotations
  of it. Graphics blocks were enough to see whether the idea reads.

**Hexagonal board.** `SIZE` is 9 and `FILES` is `a`–`i`; `inHexagon` masks the 9 × 9 store down
to a radius-4 hexagon of 61 cells, rows of 5·6·7·8·9·8·7·6·5. `HexGrid` overrides `inBounds`
and `cells`; the square grid keeps its rectangle. `board.squares` stays a dense 9 × 9 array, so
`at()` never sees a hole — the trimmed corners simply go unused.

Judgment calls:

- **The home ranks are the narrowest rows** (5 cells) and midboard the widest (9). The line
  widens as it advances and funnels again at the objective — the opposite of the rectangle.
  This is a rules change, not a paint job, and it is the thing to reconsider first if the
  deployment feels cramped: three deploy ranks give each side 5 + 6 + 7 = 18 cells for 6 units.
- **The neutral band is now three ranks** (4–6), not two, since 9 ranks minus two deployment
  zones of 3 leaves 3. `NEUTRAL_RANKS` derives it rather than hardcoding, and the river runs
  on it.
- **Generators had to learn the shape.** The ridge starts from its rank's own westmost cell;
  the river snaps a cell to whichever band rank actually holds that file, so it still reaches
  both flanks; the lake hugs each rank's outermost cell rather than a fixed file, because the
  hexagon's flank is a diagonal; the fort's block sits one file clear of the home rank's ends,
  or a flank neighbour is missing and the wall budget has nowhere to go.
- **Rank labels stagger** along the hexagon's left flank instead of forming a straight column,
  since rows 1 and 9 start three files in. Worth revisiting if it reads as ragged.
- **`public/rules.html` still draws an 8 × 8 board** in its SVG diagram. The prose numbers are
  updated; the diagram is not, and redrawing it is its own job.

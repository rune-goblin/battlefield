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

## Wave 6 notes — the props and the tray

- **A drag onto a creature is an attack, whether or not it has to close.** `chargeTargets`
  returns nothing while a unit is engaged — `moveReach` is empty in contact — so before this
  a drag onto the enemy you were already fighting parked no rows and did *nothing at all*.
  `onBoardDrop` now falls through to that piece's own ladder, which is the Fight rungs in
  contact and the Shoot rungs at range. Mark hit this and reported it as "if I drag onto a
  creature it'll trigger the attack action".
- The tray is status first. Every prop is lit or dim off `availableActions`, and Charge dims
  the moment a unit is in contact — which is the same instant Fight appears beside it.
- **A prop lights what it can touch; where that is one thing, it opens there at once.** Guard
  and a self-Rally name no target, so their cell list is the unit's own piece and one click
  still reaches the ladder — the tray never costs a click that the board did not.
- Charge is a prop with no `ActionOffer` behind it. Charging is the drag of the piece itself,
  so `Prop.offer` is null and `applyProp` parks the same `pending` a drop would.
- Move has no prop, and should not get one. You never pick up a "move tool" in chess; you pick
  up the piece. The five props are exactly the verbs that are not Move, which is a good sign
  the set Mark drew is the right set.
- **Cast has no prop.** Its tile falls back to a lettered disc. Only spellcasters ever see it.
- **The rules' words won, not the filenames'.** The props ship as `attack.webp` and
  `block.webp`; the tray, the log and `public/rules.html` all say Fight and Guard. Two names
  for one act is worse than an unfamiliar one — but Mark said "attack" and "block" twice
  unprompted, so this is the first thing to revisit if the vocabulary feels wrong.
- The popup's verb heading always renders, even for a lone verb. The rung rows used to read
  `Fight · Strike`; now they read `Strike`, so without the heading nothing in the popup named
  the verb at all.

### A wash that clobbered another wash

`PixiBoard`'s highlight effect built its map with `byStyle.set(g.style, g.cells)`, so the
*last* group of a given style won and the earlier one vanished. An armed prop and the aim
popup both wash in `attack`, and the popup's empty group wiped the prop's lit targets — the
tray armed correctly and lit nothing. Groups union now. The same bug sat latent in
`withdrawCells`, which shares `move` with the 1-action band; it never showed because a unit in
contact has no move band to clobber.

### Verification

`npx vite build` and `npx vitest run` green. Driven live in Chrome: the tray under the board
with Charge / Shoot / Guard, Guard opening its ladder in one click, Shoot arming and washing
both enemies red then opening Barrage alone at five ranks, Charge arming and parking the full
route arrow with its Strike / Press / Overrun chips, and — after that charge resolved — the
Kobolds dragged onto the Line Infantry they were now in contact with, which opened Fight.
Dragging the Rally prop out of the tray onto a piece opened the Rally ladder.
`docs/plans/tactile-board-shots/wave6-props.jpg`.

## Wave 7 notes — the ring, and the props on the pieces

- **The tray is gone.** It had one job the ring cannot do — glanceable status — and the pieces
  took that job over instead. `Prop`, `takeProp` and `applyProp` all survived the move; only
  the row of buttons and the drag-a-prop-from-the-tray gesture went with it.
- **Click, not press-and-hold.** `Interaction` already escalates a press into a drag the moment
  the pointer moves and emits `token` when it does not, so click-the-piece and drag-the-piece
  are two clean signals with nothing between them. A hold timer would have been a third
  concept competing for the same input, and it would have made the fastest verb in the game
  wait for a timeout. A second click on the same piece closes the ring.
- **`Token.prop`** carries one icon and two meanings: the verb being aimed at that piece right
  now, and the shield a guarding unit keeps until it acts again. The aim wins where both apply,
  since a pending choice is the more urgent of the two. Bottom right, clear of the flag
  (top right), the engine chip (top left) and the pip rows (bottom left).
- The hub in the ring's middle names whatever the pointer is over, so the ring reads on first
  use without permanent labels crowding five props into a small circle. It covers the piece
  while a slice is hovered; left as is, since it appears only on hover.
- Slices bloom with a 28ms stagger, and the whole animation drops under
  `prefers-reduced-motion`.
- The board wears a crosshair while a verb is armed. The lit target cells are still the real
  signal — the cursor says *you are aiming*, the wash says *at what*, and the second is the
  one that teaches range.
- **Cast still breaks the ring.** Five slices is the sweet spot and a caster has Shoot, Guard,
  Rally plus Blast, Ward, Mend, Bless and Compel. Every spell now shows the one `cast` prop and
  is told apart only by its label, so a caster would ring nine near-identical slices. One Cast
  slice opening a second ring is the usual answer, and it is still open.

### Verification

`npx vite build`, `npx svelte-check` and `npx vitest run` green. Driven live in Chrome: the
ring blooming on the Line Infantry with Charge, Shoot and Guard; Guard opening its ladder in
one click and the shield landing on the piece before the Brace was even confirmed, then
staying there once it was; the ring reopening with Charge dim once two actions could no longer
buy a three-action charge; Shoot arming, washing both enemies red, and the archery butt landing
on the Troll Marauders as its ladder opened; the hub naming "Shoot · Long band" on hover.
`docs/plans/tactile-board-shots/wave7-ring.jpg`.


## Wave 8 notes — Withdraw and Cast take their props

Mark drew `withdraw.webp` (a boot kicking up dirt) and `cast.webp`, so both got slices.

- **Withdraw needs no Move counterpart after all.** `withdrawOffer` already returns null unless
  a unit is engaged or routed, so the slice appears exactly when it applies and the
  *Move when free, Withdraw when engaged* pairing solves a problem that does not exist. Move
  still has no slice; the drag says it better.
- A withdrawal is a destination, not a target, so its slice lights ground and washes in `move`
  rather than `attack`, and applying it parks the same `pending` a drag to that cell would.
- **The Withdraw panel card is gone.** Its escapes, the four degrees, both dials and the totals
  all moved into that popup, so the panel is now stats, the Move bands and the log. `chosen`
  and `dialSum` went with it — the card's `<select>` and its per-dial running total were their
  only readers.

### The withdrawal that silently did nothing

Picking a far cell off the Withdraw wash and confirming did nothing at all: no log line, no
move, no error on screen. `doWithdrawAction` throws when the destination is further than the
committed distance carries you (`battle.ts:1001`), and `commit()` clears `pending` *before*
performing, so the throw surfaced as a popup that closed and a board that did not change.

The engine is right and the UI was wrong. `withdrawOffer.targets` is the reach at *full*
commitment — every cell two spare actions of Stride could buy — so a wash built from it offers
ground the default allocation of zero cannot reach. `withdrawFloor` now finds the fewest
committed actions that carry the unit to the chosen cell, and `withdrawSpend` floors the
distance dial there, so the popup quotes the whole price of the destination the way a Move row
quotes the whole route. The dial cannot be turned below the floor, and it names what the cell
needs beside it.

Distance takes its share of the budget before the roll dial, so a run already chosen is never
quietly shortened; `DIALS` puts `roll` first, and reading the allocation in that order would
otherwise let the escape bonus eat the ground under a parked withdrawal.

No new engine test: `battle.test.ts`'s "buys distance with the other dial, and refuses a cell
further than it bought" already pins the rule, and it is the test that named the bug.

### Verification

`npx vite build`, `npx svelte-check` and `npx vitest run` green. Driven live in Chrome up to
the point the bug appeared: the ring on an engaged unit showing Charge dim, Withdraw, Fight and
Guard; Withdraw arming and washing the escape ground; the popup at b4 carrying the Escape check
against Line Infantry (DC 21 · d20+12), the no-retreat tag, the four degrees, both dials and
the totals. The floor fix landed after that run and is verified by build and typecheck only —
Mark drives the board from here.

## Wave 7b — Six slices, always

### The ring was showing three verbs, and the player had lost the other three

Rally, Cast and Withdraw were absent because `availableActions` never offered them: Rally is
pushed only when `u.disorder > 0` (`battle.ts:680`), a Cast offer exists once per entry in
`u.spells` (`battle.ts:684`), and `withdrawOffer` returns null unless something holds the unit
(`battle.ts:984`). The engine is right — those verbs are situational — but `props` built the
ring out of whatever came back, so a slice that went away rotated every other slice onto a new
angle. A ring learned by direction cannot afford that.

`props` now returns exactly six, always in this order: **Fight/Charge, Shoot, Cast, Withdraw,
Rally, Guard** — clockwise from twelve, offence on the right, support and retreat on the left.
A verb the situation forbids dims in place and says why (`UNAVAILABLE`, per slot), rather than
vanishing.

Two merges made six out of seven verbs:

- **Charge shares the melee slice with Fight.** One direction means "hit them"; whether it
  costs an approach is the board's business, not the menu's. The slice wears the charge prop
  and reads "Charge" out of contact, the attack prop and the fight offer's label in it. Cells
  are the union, and `applyProp` reads a charge off the cell rather than off the slice, so an
  attacker beside a wall can still fight the wall while a charge is on offer elsewhere.
- **A caster's whole book sits behind one Cast slice.** Five spells were five slices. The aim
  popup already groups by verb across the top, so arming Cast lights every cell any spell
  reaches and the spell is chosen on the target.

### Icons only, and the name on the pointer

Every slice carried a permanent label under its icon, and the hub in the middle repeated the
label plus its note on hover — six labelled discs and a caption box for a menu meant to be
read by direction. The hub is gone. A slice is an icon disc; hovering reveals its name below
it, absolutely positioned so nothing in the ring moves. The note stays on `title`.

Dim slices use `aria-disabled`, not `disabled`: a disabled button swallows pointer events in
most browsers, and hovering a dim slice is exactly how the player learns why it is out.

### Verification

`npx vite build` and `npx svelte-check` green. Not yet driven in the browser.

### The ring owns the board while it is open

Touching a piece opened the ring, but the board underneath stayed live: cells lit under the
pointer, tokens took clicks, and a drag through the ring moved the unit. A menu that the board
argues with is not a menu.

`Interaction` grew a `frozen` flag (`Interaction.ts:setFrozen`), plumbed through `BoardView`
and `PixiBoard` as `frozen={radial !== null}`. Frozen, it answers no pointer, key, wheel or
double-click, and clears the hover on the way in — the pointer sits still over whatever was
just clicked, and no later move arrives to clear it because the events stop at the freeze.

A press anywhere off the ring closes it and does nothing else (`onWindowPointerDown`). The
canvas ignored that press, so its release finds no gesture to resolve and emits nothing: the
click that dismisses the ring never also picks a cell.

### Every step back out, one click at a time

The chain the ring starts is popup → wash → ring → nothing, and nothing is committed until the
last click, so `stepBack` walks it in reverse. Escape takes one step. So does a click that means
nothing where it landed: a cell the armed verb cannot touch, a token that is not a target, a
click off a parked destination. A verb picked by mistake now costs one click to undo instead of
dropping the player back to bare board.

The arm outlives the popup it opened — `armed` survives, and `arming` is the narrower state
where the board is actually waiting to be touched. Cancelling an aim lands back on that verb's
wash rather than on nothing. A performed action clears the arm outright.

### Verification

`npx vite build`, `npx svelte-check` and `npx vitest run` (155) green. Not yet driven in the
browser.

### The piece walks the route it was given

A move tweened straight from the old cell to the new one, cutting across whatever the drag had
just traced. `Token` now carries a one-shot route (`setRoute`, plumbed through `TokenLayer` and
`BoardView`), and `Battle.commit` hands it the committed row's own `path` — the same cells the
router produced and the drag drew — just before the action lands.

Judgment calls: the walk holds a steady pace per cell (150 ms, capped at 900) rather than
stretching one tween over the whole distance, and eases in and out over the route as a whole
instead of per step, so a long charge reads as travel rather than as a stutter. The route is
trimmed at wherever the piece actually ends up rather than required to end at its last cell, so
a push that fails walks the part of the route it covered and stops at its fallback. A redraw
that does not move the piece no longer cuts a running tween short, and leaves a queued route
queued.

`npx vite build` and `npx svelte-check` green. `npx vitest run` 153/155 — the two failures are
the uncommitted Rally work (`rally` now offered with no disorder to clear), untouched here.
Not yet driven in the browser.

## Rally as the support verb

Rally was invisible unless a unit was already disordered, and a troop with a poor ladder had
nothing to do but attack badly. Both problems have the same fix: **an order lifts the troop
beside you, whether or not you have anything to clear.**

`RallyEffect` grew a second scope, `heart`, alongside the one that clears disorder:

| Rung | Clears | Hearts |
| --- | --- | --- |
| Steady | this unit | one adjacent ally |
| Rally | this unit, one adjacent ally | that ally |
| Inspire | this unit, every friendly within 2 | all of them |

`heart` reaches one step further out than `scope` at the bottom of the ladder on purpose. A
levy has rally grade 1, so under the old scoping it could not touch an ally at all without
reaching for rung 2 — a check it usually fails, which would have made the supporting role a
coin flip. At rung 1 the gift is certain, and grade still buys the reach and the clearing.

**What heart is worth.** `heartened` is a per-activation mark like `warded` and `blessed`:
+2 (`HEART_BONUS = ACTION_BONUS`) on the unit's attacks — strike, shot and blast — cleared in
`finish` at the end of its next activation. It is one action's weight, lent rather than spent,
which is exactly the trade: a weak troop gives up its own poor attack to put an action's worth
behind a strong one's good attack. It sits clear of Bless, which buys a free rung instead, and
it complements Guard's shieldwall — Guard shields the neighbours, Rally sharpens them.

**Availability.** `availableActions` pushes `rally` unconditionally now. `offerFor` blocks the
whole offer with "no disorder to clear, and nobody near to lift" when the unit is in good order
and alone, so the ring's Rally slice dims with a reason instead of vanishing. Rally's adjacent
targets no longer filter on `a.disorder > 0` — a steady ally is still worth naming.

### Judgment calls

- **Heart weighs attacks only**, not reach checks, rally checks or escapes. Putting it in
  `reachModifier` would have spread it across half the engine for one sentence of rules text;
  "+2 on its next attack" is what a player can hold in their head.
- **It does not stack.** `hearten` returns early on a unit that already has it, so two Steadys
  into the same troop is a wasted action, not +4.
- **The board does not show it yet** — only the status line under the unit does
  (`heartened +2`). A pennant on the token is the right home, next to the guard shield, but
  `Token.ts` was under edit; left for the next pass.
- `docs/design.md` and `public/rules.html` still describe pre-ladder Rally (shaken −2 / −1) and
  were already stale before this change. Not touched: the ladders in `ladders.ts` are the
  living rules, and half-updating one row of an outdated table would read as if it were current.

### Verification

`npx vitest run` (156, one new), `npx vite build` green. `npx svelte-check` reports one error in
`App.svelte:33` (`STAGE_SIDE[game.stage]` typed `never`) from an edit of yours in flight — no
file of this change is involved.

## A shell that fits the screen, two deployment stages, and emplaced engines

### The buttons were below the fold

Every setup stage was one long scrolling document with Back/Next at the bottom, so on a laptop
the board pushed them off screen and the player could not tell the stage had a way forward.
The shell is now a fixed-height grid — `body` never scrolls, `.wrap` is `100dvh` over rows
masthead / rail / content, and each stage scrolls its own pane (`.stage-scroll`). Back and the
forward button live in the stage rail, pushed right of the step chips; the forward button reads
its label, its enabled state and its action off `forward()` in the store, so a stage no longer
carries navigation of its own. The masthead lost about 90px (h1 to 1.5rem, tagline inline).
Boards take the space that bought: `BoardSetup`, `Paint` and `Place` all pass `fill` and sit in
a `flex:1` pane instead of the old capped 40rem square.

### Place split into Attackers and Defenders

`Stage` is now `board | paint | attackers | defenders | battle`, and `Place.svelte` takes a
`side` prop: it shows one side's roster, lights only that side's deployment ranks, and only its
own tokens answer a click. Both sides' pieces draw on the board throughout, so the defender
deploys against what the attacker actually did.

### Emplaced engines

`EngineState` gained `side` and `emplaced`; `BattleState` gained `engines`, which holds the
emplaced ones only (an attached engine still lives on its unit's `engines`). An emplacement has
no owner: `crewOf` finds the standing friendly in or beside its square, `enginesOf` unions that
with the unit's own, and `refreshEmplacements` recomputes crewed/abandoned after every action.
`seizeEmplacements` runs in `endRound`, before the rout check, and flips `side` when only the
enemy stands by.

### Judgment calls

- **Both deployment kinds, not one.** The picker offers "on its own square" or "with <unit>",
  so the two rules in `design.md` both stay reachable. A fixed ram is nearly useless — it can
  only ever batter a wall on an edge of its deployment square — which is exactly why attaching
  had to survive rather than be replaced.
- **Crewing is adjacency, not an action.** Consistent with "siege engines are stats, not verbs"
  from the battle-mechanics notes: no Crew verb, no ownership, nothing to forget to do.
- **One crew, first in deployment order**, where two friendlies both stand beside an
  emplacement. Arbitrary but deterministic; the alternative is letting the player pick, which
  is a new decision per round for no interesting choice.
- **A captured engine cannot fire the round it is taken** (`seizeEmplacements` sets `fired`
  after the round's reset). Taking a loaded piece and shooting with it immediately felt like it
  skipped a beat.
- **Capture ignores numbers.** One friendly beside the engine holds it against any number of
  enemies. Contesting it by count would need a rule for ties and would make the piece a
  second combat system.
- **`status` on an emplacement is derived, never authored.** Nothing sets crewed/abandoned by
  hand; a test that moves a unit directly has to run an action to see the consequence
  (`refresh` in `battle.test.ts`).
- **No board treatment for an abandoned engine yet.** `TokenRing`'s `flash` animates for as
  long as it is set, so it is wrong for a standing state; an emplacement draws with no ring
  whoever holds it. A dimmed or greyed engine token is the right answer and wants `Token.ts`.
- **Save key stayed `battlefield.v3`.** The change is additive — `emplacements` defaults to `[]`
  and a stored `'place'` stage maps to `'attackers'` — so a board in progress survives.

### A stale expectation in the tree, not this change

`battle.test.ts`'s two menu-filter cases expected Rally to appear only with disorder, which the
uncommitted Rally work above had already made unconditional. Updated to match the comment in
`availableActions`; the rule itself was not touched.

### Verification

`npx vitest run` (160, four new on the emplacement rule), `npx vite build` and
`npx svelte-check` all green. Not yet run in a browser.

### Contact tells you it is holding you

Dragging an engaged unit did nothing and looked broken. `moveReach` and `pushReach` both return
empty in contact (`battle.ts:444`, `:476`), so `rowsAt` found no move or push reading and the
token snapped back with no explanation; the Move card meanwhile showed four bands all reading
"0 cells reachable". The rule stands — the Move card now names the holders and points at
Withdraw instead of rendering the empty bands.

Judgment call: the notice sits in the Move card rather than on the board, because that is where
the player already looks for reach, and the Withdraw destinations are still just a drag away.

### The lit piece glows from under, in its side's colour

The acting/held piece traded its stroked ring for a filled disc drawn under the miniature —
red for the attacker, blue for the defender — swelling 6% either way of the footprint while it
fades, both off the same sine so it breathes rather than blinks. `flash` keeps its stroke over
the top, so a free strike still reads on an already-lit piece.

Red now means attacker and blue defender everywhere — the flags, the board theme, the sidebar's
`--att`/`--def`, and `rules.html`'s diagrams all swapped, so the glow reads its colour straight
off `theme.attacker`/`theme.defender` rather than carrying a pair of its own.

Judgment call: `selected` (placement) got the same treatment as `active`, since both mean "the
piece in hand".

### Reach is shaded, not coloured

Six coloured washes at 0.35 left the map unreadable — green, amber and red bands fighting the
terrain's own palette and each other. The bands are now plain ink at three alphas (0.1 / 0.17 /
0.26), so the terrain under them still reads: the free step sits most solid, and each extra
action costs a step of contrast. `push` and `attack` add a thin ink outline, which is the one
thing three greys alone cannot say — ground past every action you have, and ground under
threat. `theme.overlay.highlight` is gone with the colours.

Washes are 8% / 16% / 24% ink. `push` and `attack` add a thin ink outline, which is the one
thing three greys alone cannot say — ground past every action you have, and ground under
threat.

Even in grey the standing wash was unreadable, so selecting a unit no longer paints its reach
at all: the drag arrow says where a move goes, and hovering a Move row is how you ask to see
the band behind it. What remains on the board is the deploy band, the aim, and the drag's own
path.

Judgment call: colour on the board now means terrain and side, nothing else. The sidebar keeps
its amber move-band text (`--warn`/`--warn2`); it no longer matches the board, and that pairing
should probably go next.

### A Move action buys a square, not a Speed

The bands sprawled because the board spent the sheet's Speed against a 10 ft cell: a 25 ft troop
covered two and a half squares an action, cavalry four. `squaresPerAction` now reads the Speed
in bands of thirty feet — 30 ft and under one square, 60 ft two, 90 ft three — and `speedOf` is
that count in board feet. A troop is a formation, not one creature, so thirty feet of the
actor's Speed carries it one square.

Judgment call: the band is `ceil(speed / 30)` rather than a three-entry table, so a 120 ft
outlier gets four squares instead of silently capping at three. Cards with no sheet (the roster
and the generator) still fall back to type: cavalry two, infantry one.

Terrain prices itself off that square: difficult ground (forest, shallows) costs two squares'
worth and swamp three, so a troop spends two actions entering forest and three entering swamp,
while a Pace unit spends one and two. Climbing a level costs a square's worth on top, which is
what cancels Pace uphill. `docs/design.md` and `public/rules.html` are updated to match — both
previously described swamp as "the whole Advance and one more action".

Flight buys no distance — it is a terrain modifier and nothing else, which `Unit.flying` already
carried: open ground for every square, and walls, cliffs and water crossed. The unit's `pace`
flag comes off `squaresPerAction` too, so one place decides how far anything moves. Move rows quote actions alone: with a
square costing 10 ft, "20 ft · 2 actions" was saying the same thing twice, and the withdrawal
dial counts squares.

### Dragging the map, and room to drag it in

Panning was middle-drag and space-drag only, and both were undiscoverable. Right-drag pans
now, and a two-finger trackpad drag pans as well: `Interaction.isPanWheel` sends a wheel event
to the pan when it carries a horizontal delta or a vertical one under 40 pixels, and to the
zoom otherwise. A pinch arrives as a ctrl-wheel, so pinch still zooms.

Judgment call: the right button pans everywhere except under a paint brush, where it stays the
eraser — a brush in hand is the one time the right button already means something. A right
click that never moves now does nothing, so the `cell` event lost its `button` field; nothing
read it, and right-clicking a deploy cell used to place a piece there by accident.

Judgment call: the 40-pixel wheel threshold is a guess at where a mouse notch stops and a
trackpad starts. A mouse with smooth scrolling will pan when it means to zoom; the fix if that
shows up is a preference, not a better guess.

The fit reserves two cell pitches of empty board on every side (`PAD_CELLS` in
`src/board/index.ts`) in place of the old 0.86 margin fraction. Panning has to be able to grab
somewhere, and the outermost hexes sat against the viewport edge with nothing beside them. It
costs about a fifth of the resting board size, which the zoom buys back.

### The map moves inside a window, and only the map

Free panning lost the board: two-finger drags walked it off the canvas with nothing to walk it
back. `Interaction.clamp` now holds the padded board rect against the canvas after every pan,
zoom, `centerOn` and refit — larger than the canvas it may slide until an edge would come
inside, smaller than the canvas it sits centred. At the resting fit there is nothing to pan,
which is the point: everything is already on screen.

A trackpad pinch is a ctrl-wheel, and anywhere but the canvas Chrome answers it by zooming the
whole document — panel, radial menu and canvas together, and the zoom outlives a reload.
`main.ts` swallows the ctrl-wheel window-wide, so the board is the only thing that scales.
⌘+/− still works, which is how you undo one that already stuck.

### The action popup can be moved off the thing it is about

Both board popups — the parked row/withdrawal one and the aim one — are draggable, and each
carries an X in the top-right beside a Cancel in the foot. Judgment calls:

- The whole card is the handle. A press on a button, input, select or link is left alone, so
  the rows, dials and rung chips still work; anything else grabs. A separate title bar would
  have cost a row of height the popup does not have to spare.
- Once moved, the tail is hidden. It pointed at the cell, and a dragged popup is no longer
  over it.
- A new anchor resets the offset, so the next popup opens on its own cell rather than where
  the last one was left. Switching verbs or rungs inside one popup keeps the position.
- X and Cancel both run `stepBack`, the same walk out Escape and a click off the target take:
  the popup closes and the wash stays armed.

### The action popup sits in the top-right corner

Both board popups now open pinned to the top-right of the board area instead of over the cell
they are about, so the offer never covers the move it is offering. Judgment calls:

- The tail is gone, along with the above/below flip and the height measurement that drove it.
  Nothing points at the cell any more; the highlights already do that.
- The drag survives — the corner is a starting point, not a cage. The offset now resets on a
  new cell rather than on a new anchor, so switching verbs or rungs still keeps the position.
- The per-frame anchor read is down to the ring alone, which is the only thing left that has
  to track its cell through a pan, a zoom or a recentre.

### A shot arcs from the shooter to the target

Aiming a shot draws the shot's own flight path: a red arrow that leaves the shooter's cell
thin, rises over the ground between, and plunges into the target's cell head first. The shoot
prop becomes a bullseye in the middle of the target's hex, at 0.6 of a cell, and the arrow
points at it. Judgment calls:

- The arc is a quadratic curve lifted straight up, `LIFT_SPAN` of the span between the two
  cells, floored and capped in cell sizes so a two-hex shot and a ten-hex shot both look like
  they were thrown rather than fired flat.
- Red, from a new `overlay.shot` theme colour. It is the one thing on the board that colours
  for danger — every other overlay is ink at some alpha — and the alternative, ink, would have
  sunk into the terrain it flies over.
- Its own layer (z 35) above the pieces, not the overlay layer: a shot passing over a crowded
  middle has to stay one readable line rather than duck behind whoever stands under it.
- The bullseye is the one prop that centres rather than hanging off the piece's corner. It
  covers the miniature it is aimed at, which is the point: the mark is on that unit.
- The tip stops `TIP_INSET` short of the target's centre — the bullseye's own radius — so the
  head lands on the mark instead of covering it. The two constants live in different files
  (`Token.SHOT_PROP_RATIO`, `ShotLayer.TIP_INSET`) and have to be moved together.
- Only `shoot` draws one. Fight and cast land on things already touching or already washed.

### The ring names its slice and nothing more

The hover label on a radial slice is the verb alone. The second line — "Close and fight",
"Choose a spell on the target" — is gone, and with it the `note` field on `Prop`, the
`UNAVAILABLE` map behind it and the reason lookup that fed a dim slice. A dim slice still
answers the pointer and still reads greyed, but it no longer says why it is out.

### The deployment card carries the piece

A unit that ends up unplaced — never dragged out, or unplaced by `generate()` when a reroll
put water under it — was invisible: the board draws only pieces with a square, and the tray
row was a wall of text with no obvious way to get it down. The row now shows the miniature and
carries a Place button.

- The whole row drags, placed or not, not just an unplaced one. Dragging a placed piece moves
  it (`onTrayDrop` writes the same array entry, so no duplicate is possible) and its own
  square counts as open, since `deployCells` excludes the piece being dragged.
- `setDragImage` is set to the row's icon for a row-body drag. Dragging the icon itself
  already carries the miniature; without this, dragging the text carried a snapshot of the
  whole card.
- Place picks the open deploy cell nearest the piece's own edge, then nearest the centre file:
  a click fills the back rank outward from the middle. Rank order matters more than file, so a
  force placed entirely by button lines up behind its own edge rather than spread across the
  band.
- Place is disabled with the deploy ranks full, and it is not offered for a placed piece — ↩
  takes it off the board and the button comes back.

### The card is the piece

The tray row became a card: name and grip top-left, the six battle stats under it as a labelled
grid, the miniature and its deploy button down the right, sheet and pace lines in a footer.
`STAT_LABEL` gained `reflex`, which `derivation()` has always returned and the row rendered as
`undefined +12`.

- Off the board reads as *off the board*: the card is dashed and hatched, and its footer line
  is italic. Putting it down makes the card solid and stamps the square on the button. The
  whole complaint that started this was a piece that had quietly lost its square, so the two
  states have to be tellable apart across the room.
- The deploy button is the state, not two controls: `Place` while it is in hand, `c7 ↩` once it
  is down. One slot under the portrait, one thing to look at to answer "where is it?".
- The level rides the portrait's corner as a chip in the side's colour, the way the flag rides
  the token on the board — the same number in the same place in both views.
- A rail down the card's left edge carries the side colour; an emplacement's rail is broken
  rather than solid. Between the rail, the chip and the wash on the board, a side is never
  named twice in the same words.
- No new typeface. The app is Georgia-and-friends with no webfont, so the card gets its
  character from letterspaced small caps on the stat labels and tabular numerals on the values,
  not from a font that would have to be loaded.
- The grip is decorative: the whole card drags, so the dots say "this moves" without becoming
  a second tab stop for the same job the card already does.

### The map became a layer

The setup stages sat in a centred `.wrap` with the board in a box, while `Battle.svelte` broke
out with `position: fixed; inset: 0; z-index: 20` and built its own three-area grid. Two
shells, one of them an escape hatch. Both are gone: every stage now mounts
`src/app/shell/AppShell.svelte` and fills its layers. `docs/plans/app-shell.md` is the model
and the multiplayer seams; the judgment calls are here.

- Docks are glass over the map. They do not resize the canvas, and — after a first pass that
  had them do it — they do not re-fit the board either. The board fills the viewport and holds
  still; a panel opening moves no hex. A re-fit on a panel toggle is a camera jump with a
  different trigger, and in a tactical game the pieces staying put is worth more than the screen
  a dock covers.
- The pan clamp had to loosen for that to be liveable: content smaller than the canvas used to
  be pinned centred, so nothing could be dragged out from under a panel. It now slides and
  stops at the canvas edge instead.
- The bottom bar sits between the docks, not under them. The unit strip is about the map, so
  it lives in the map's column; the top bar spans everything because the app's identity does.
- Three dock states, not two: hidden is a real state, and it is the one the top bar's toggle
  reaches. `[` and `]` walk open → rail → hidden, which is the fastest way to a big map.
- Dock state persists under `battlefield.ui.v1`, not in `game.save()`. The moment a second
  player exists, "which panels are open" must not be in the document both seats share.
- The pin layer is inset 0, so board coordinates from `screenOf` land unchanged. Things that
  want a corner instead read the `--inset-*` variables — the action popup opens in the map's
  top-right, not behind the orders dock.
- The battle log moved to the left dock. It was at the bottom of the right panel, below the
  active unit and the move bands, where it was the first thing scrolled away from.
- `float` and `modal` are declared and empty. They are the two layers the next feature will
  want (a torn-off panel, a roll both seats watch), and naming them now is what stops the next
  overlay from being another `position: fixed` escape hatch.

### Viewport controls, and who decides where a frame lands

Zoom in, zoom out, frame everything, frame my army — a floating cluster in the shell's `float`
layer, bottom-right, offset by the same `--inset-*` variables the popups use, so it slides
clear of the orders dock and takes the true corner when the docks are hidden.

- The board gained `zoomBy(factor, into)` and `frame(cells, into)`, and both take the target
  rectangle from the caller. That keeps the rule intact: the board has no idea a panel exists,
  but a command the player pressed can still land in the part of the map they can see. Framing
  everything with both docks open now shows the file labels that the unit strip normally
  covers.
- `Interaction.frame` clamps to the same `MIN_ZOOM`/`MAX_ZOOM` as the wheel, so "frame my army"
  on two adjacent units stops at 2.5× rather than filling the screen with one hex.
- The framed box is the cells' own bounding box grown by one cell, because a piece's art and
  its flag stand well outside its hex and would otherwise be cropped by the frame.
- No disabled state at the zoom limits: the board's scale is PIXI's, not Svelte's, and the
  wheel can change it behind the toolbar's back. A no-op click beats a button that lies. If it
  starts to matter, the fix is for `BoardView` to publish zoom changes, not for the toolbar to
  poll.

### A frozen board still lets the middle button pan

The radial menu's `frozen` flag was all-or-nothing: while a ring was open, `Interaction`
dropped every pointer/wheel/key event, including a pan, so a ring that opened near an edge and
spilled offscreen had no way to be dragged into view. The ring itself was never the reason —
`Battle.svelte`'s `anchor` already re-reads `screenOf(cell)` every frame while a ring is open,
specifically so it tracks a live pan.

Judgment call: only the middle button escapes the freeze, not right-drag or the two-finger
wheel pan the rest of the board uses. Right-drag and wheel-pan both run through paths (`hitAt`,
brush state) that stay untested with a DOM menu on top of the canvas; middle-drag is a pure
viewport translate with no hit-testing in its way, so it was the one gesture safe to carve out
without auditing the other two. Space-drag stays blocked too, since `spaceDown` can only be set
from a keydown and keydown is still fully frozen — reaching it would mean punching a second
hole in the freeze for one more gesture nobody asked for yet.


## Cast and Rally activity pickers — 2026-09-14

- Rally opens Steady, Rally and Inspire immediately. Cast opens the chosen tree's activities; Blast keeps its existing level and shape picker.
- Both use the same activity rows as Shoot, with action costs, descriptions and reasons for unavailable options. Self and area Rally activities resolve on the activity click. Activities that name targets then accept a board click or a target-list choice.
- Healing groups and Translocate pairs use exact engine target IDs. A board cell shared by several choices filters the list instead of choosing the first match. Hover previews the complete target. Escape returns through target filtering, activity selection and the tree or action ring. Cancel spends nothing.
- The change affects interaction only; action costs, ranges and effects remain in the engine.


## Picker visual treatments — 2026-09-14

- Cast uses violet accents, a double frame, a tree emblem and circular action badges. Blast and target-first Cast share this treatment.
- Rally uses gold accents, a command banner and pennant action badges. Shoot uses a compact angular frame with a sight motif and olive accents.
- The treatments support both system color schemes and preserve activity selection, costs and targeting. Visual checks covered Cast and Rally on the battle board.


## Shared targeting service — 2026-09-14

- `src/app/targeting.ts` converts engine activity targets into exact hex, edge, corner or group choices. Cast, Blast, Rally and target-first actions share target matching, icons, preview anchors and action/effect plans. Ambiguous board picks retain all matches for an explicit choice.
- `TargetMarkers` draws the action icon at the service's anchor. Cast uses its tree icon; Rally uses its banner; Shoot uses a larger bullseye. The overlay replaces transient token props so previews do not draw two icons on a unit. Persistent Guard and drag props remain on tokens.
- Hex icons sit at cell centres, edge icons at midpoints and Burst icons at shared corners. Shot arcs and cast lines use that same projected anchor. Translocate previews and effects land at the chosen destination. Resolution retains the actor's origin and the exact target ID before the battle state changes.
- The engine still applies costs, saves and effects. One UI dispatcher submits the service's action and plays its feedback. No combat rule changed.

## Spell target surfaces — 2026-09-14

- Every spell activity exposes its legal locations through the shared board surface and uses its tree icon. Tests cover all six trees at all three activity levels.
- Healing selects recipients one hex at a time. Selected units retain their icons; the final pick casts on the exact group. Clicking a selected unit removes it. Resolution marks every recipient at its own hex.
- Translocate first picks the unit, then exposes only that unit's legal destination hexes. This replaces hidden overlapping destination markers and keeps the entire choice on the board. The target list remains an alternative.
- Target-first menus show the spell icon on the touched unit even when several groups match. Switching verbs selects the first legal activity so an unavailable first row cannot hide the targeting preview.

## Stable selection shadows — 2026-09-15

- Anchor the shared token-shadow filter to the renderer's screen rectangle. Automatic filter bounds changed with the outermost token's selection pulse and shifted sampling for stationary shadows as well.
- Preserve the selection pulse and each token's own shadow motion. The filter frame stays fixed during animation, pan and zoom; the renderer updates its rectangle on resize. This uses a viewport-sized filter pass to keep overlapping shadows at their existing shared opacity.

## Battle log turn sections — 2026-09-15

- Record activation start and end as explicit log boundaries. Keep enemy reactions, saves and end-turn effects within the acting army's section. Automatic completion and passing use the same boundaries.
- Show a provisional turn header as soon as an army is selected. Switching or clearing an uncommitted selection replaces that header without adding empty turns to saved history.
- Give attacker turns a red wash and defender turns a blue wash, with army names, side labels, round numbers, top rules and end-turn dividers. Use system sans-serif for the log, tabular numerals, quiet row separators and compact round labels. Preserve the rest of the game's typography.
- Follow new entries while the reader is at the bottom. Preserve their position while they read older entries and offer a Latest entries button.
- Older saves lack activation boundaries. Keep those events in their original order rather than guessing turn ownership from reacting units. New turns receive explicit grouping; undo restores the boundaries with the battle snapshot.
- Reserve an extra inline gutter inside the log for overlay scrollbars, which ignore `scrollbar-gutter`. Use a thin thumb in the sidebar palette so the scrollbar stays separate from turn panels and text.
- Close each turn section with 1px side and bottom borders; retain the stronger 2px top border in its side's color.

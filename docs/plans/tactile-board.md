# Tactile Board — Design

## The problem

The board is an illustration of the panel. To shoot, you find the Shoot chip in the
right-hand column, open its ladder, hover a rung to light up its targets, then click one —
`findMatch` in `Battle.svelte` refuses any board click that the open type does not already
claim. The panel is the subject and the board is the object. Only Move escapes this: it is
drag-driven, and it is the one verb that feels like a game.

Move also shows the cost of the escape. Its drop commits the instant you release, so the
board's most tactile gesture is also its least forgiving, and the two readings of one drop —
a move, or a charge on whoever stands there — are decided for you by where the pointer
happened to land.

## The one rule

**The board object you touch decides what you are offered, and the ladder comes to the
touch.** Every popup answers one question: what can this piece do to *that*?

| Gesture | Popup |
|---|---|
| Drag your piece → empty cell | Move here · Push here · Change to a charge on X |
| Drag your piece → onto an enemy | Charge: the movement cost, and the fight ladder inline |
| Click your piece, click an enemy | Shoot ladder — or Fight if adjacent, Blast if a caster |
| Click your piece, click an ally | Ward · Mend · Bless · Rally |
| Click your own piece | Guard · Rally · the acts that need no target |
| Click a wall edge | The rungs that target a wall |

`openType`, `findMatch` and the type-chip row all go. The right panel keeps stats, the log
and Undo, and stops driving.

## The drag

The token lifts and follows the pointer, as it does now, but the departure cell keeps a ghost
of the miniature, so the origin and the destination are both on the board at once. The route
draws as a tapered stroke with an arrowhead on its last segment.

A straight chess arrow would lie: `movePath` bends around terrain, and the honest arrow is
the one that follows the route the unit will actually walk. The band colours stay
(`move`/`moveFar`/`push`), so the stroke says both *where* and *how dear*.

Release parks a pending drop and opens a card anchored to the destination cell:

```
d4 ────────────────────────────────────
▸ Move here     20 ft · 1 action
  Push here     DC 18 · a fail stops you at c3
  Charge Dwarf Battalion   2 actions incl. melee  ▸
────────────────────────────── Esc to cancel
```

The first row is pre-selected, so Enter or a second click on the same cell confirms. Rows
with a ladder behind them expand in place — Charge opens Strike / Press / Overrun with their
reach badges and action dials, which `ChargeAction.rung` already accepts. Esc, right-click,
or a drop back on the origin cancels, and nothing is spent.

## The shot

Click your piece, then an enemy. The popup lists the shoot rungs against *that* unit, and the
band does the teaching: Loose reaches the close band, Volley the long, Barrage your full band
ignoring cover. The distance to the target decides which rungs are live, so the ladder
explains the range instead of a legend. Hovering the enemy first draws the attack arrow and
shows the numbers, so the click is never a surprise.

## The pieces

The coloured base disc and the level-badge circle go. The miniature keeps a soft elliptical
shadow, so it stands *on* the board rather than inside a token.

| Slot | Before | After |
|---|---|---|
| Side | A big coloured disc behind the mini | A small tinted flag, top right |
| Level | Its own badge circle, bottom right | Riding on the flag's cloth |
| Engine | Chip, top left | Unchanged |
| Wounds, disorder | Pips below the disc | A tighter bar at the piece's feet |
| Rings | Active, selected, highlighted, flash | State only: the active pulse and the free-strike flash |

The flag is `img/effects/faction-banner.svg` from pf2e-reignmaker, tinted the same way:
substitute the `#a50707` sentinel for the side colour and load the result as a data URI. The
cloth carries an overlay-shading layer, so any tint reads correctly. Two sides, two cached
textures.

Identity moves to the flag; detail moves to a hover card. That is what pays for the chrome
being gone.

## Waves

**Wave 1 — Flag token.** `Token.ts`, `theme.ts`, `src/board/faction-banner.svg`, a
`bannerTexture(colour)` helper in `src/board/art.ts`. Drop the base disc and the level badge;
add the flag, the level on its cloth, and the shadow. The rings stay until Wave 5: the
`highlighted` ring is how a focused rung still names its targets, and the panel is still the
driver until then. Gate: `npx vite build` and a screenshot.

**Wave 2 — Arrow and ghost, and a drop that does not commit.** `OverlayLayer` grows an
arrowhead and an origin ghost; `Interaction`'s `drop` event stays as it is, and
`Battle.svelte` holds a `pendingDrop` instead of calling `takeAction`.

**Wave 3 — The popup.** One `BoardPopup.svelte`, positioned over the canvas. Needs
`BoardView.screenOf(cell)`, the inverse of the existing `cellAt`, and a reposition on the
`onViewport` hook `Interaction` already fires. Content: move, push, charge, withdraw.

**Wave 4 — `offersAt(state, unitId, target)`.** The pure "what does this target afford"
query, in `battle.ts`. Both popups read it. This is the one place a test settles a rule.

**Wave 5 — Retire the type row.** The panel drops to stats, the Move bands, Withdraw and the
log; every ladder moves to the piece it acts on, and the untargeted acts to your own.

**Wave 6 — The props and the tray.** The five action icons are painterly objects, not glyphs:
crossed swords, a heraldic shield, a lance charge, a war horn, an archery butt. They read as
pieces on a table, so they get a tray along the board's foot and a heading inside the popup,
never a 20px bullet.

Chess has one verb, so the destination carries the whole meaning: an empty square is a move,
an occupied one a capture. This board has six, and chess's own answer to an ambiguous move is
the promotion dialog — it appears at the square, only where the move is ambiguous, and it
offers *pictures*. That is `BoardPopup`, and that is where the props belong.

What the tray adds is what a chessboard's edge adds: it tells you where you stand without
being a control you can get stuck in. Each prop is lit or dim by what `availableActions`
allows this instant, and picking one up lights every board object it can touch — the reach
that pure object-first hides until you happen to touch a distant enemy. Touching a board
object still opens its whole ladder, so the tray is a second road, never the only one.

**Wave 7 — The ring, and the props on the pieces.** The tray goes. Touching your own piece
blooms its verbs around it, so the menu arrives at the piece instead of the player travelling
to the board's foot. A ring is learned by direction rather than position, which is what makes
it faster than a row on the second use and every use after.

The tray could only go because the pieces took over its job. A guarding unit now wears its
shield, and the verb being aimed rides on whatever it is aimed at — the shoot butt lands on
the enemy the moment you pick it, before anything is spent. State the board can show is state
no panel has to.

The ring holds verbs only. Choosing one either acts on your own piece at once, or arms itself
against a target; either way the ladder that follows is the same stack of rungs it has been
since Wave 5. A ring is for six equal choices learned by muscle memory; a ladder has unequal
rows, gambles, detail text and action dials, and it stays a card.

Six, always the same six, always at the same angle: Fight/Charge, Shoot, Cast, Withdraw, Rally,
Guard, clockwise from twelve. Charge shares the melee slice because one direction means "hit
them", and a caster's whole book sits behind one Cast slice because the spell is chosen on the
target. A verb the situation forbids dims in place — a slice that vanished would rotate the
rest, and direction is the whole point. Each slice is an icon; its name appears under the
pointer.

Move gets no slice. You never pick up a "move tool" in chess — you pick up the piece — and the
drag already says it better than a menu could.

## Judgment calls

- The popup pre-selects its first row, so a plain move stays one gesture plus Enter.
- **One drag chains as many Move actions as the route costs.** Drag three actions' worth and
  the popup says `60 ft · 3 actions` on a single row — never three prompts, never three
  drags. `MoveReach.actions` already counts them and `takeAction({ type: 'move' })` already
  spends them; the popup only has to name the price. The same holds for a charge, whose row
  quotes the movement plus the one action the melee costs.
- The ghost marks the origin; there is no separate straight-line tether. Two arrows saying
  the same thing is one too many.

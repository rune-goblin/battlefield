# app-shell — open questions and wave notes

Reserved judgment calls (decide at review, not inside a wave):

- Map controls in the right dock's foot (2026-08-28). They were a floating card parked in the
  map's bottom-right corner; they are now the right panel's footer, so hiding the panel takes
  the zoom buttons with it. That is what "open and close with it" asks for, but it means a
  player with the Orders panel hidden has no zoom buttons — the wheel and the keys still work.
  If that bites, the fallback is a `rightFoot` that survives `hidden` as a stub strip.
- Stages with no right panel (Place, BoardSetup, Paint) keep the floating card, since there is
  nothing there to attach to. Giving them a right dock purely to hold the controls is the
  other way; it costs each of them a panel they have no content for.

## Battle orders move to a top reel and the docks swap sides (2026-09-01)

- The side on turn shows its armies as cards floating across the top of the map. This is the
  seat-by-seat shape: a player who sees this screen picks from what is left, whoever held it
  last round.
- Orders are the left dock and the battle log is the right one. The orders first hung off the
  chosen card as a popover, which put them over the board and made their position a measuring
  problem; a dock costs nothing to place and the reel above it already says which army they
  belong to.
- Nothing is selected until the player selects it. `activeUnit` still falls back to the first
  army yet to act — the engine needs an answer — so the UI reads `b.active` directly and the
  left dock shows the prompt when it is null. If a second seat ever drives the engine, that
  fallback is the thing to revisit.
- The pick stands once an action is spent (`b.begun`): the engine refuses a second `select`
  mid-activation, so the other cards go dim rather than throwing.
- Spent armies stay in the reel as small grey chits after a divider, so a player can see who is
  left without counting. They are not clickable, and they carry no stats.
- The reel sizes like the Dock: the chosen card grows, the rest sit small, and a hover shows
  what picking one would do. There are no stepper arrows — the size is the selection, and a
  card is the only way to change it. Every card carries the same fields at every size; only the
  scale changes, so nothing pops in or out as the selection moves.
- The reel lives in the `float` layer, not the top bar: it adds nothing to `--inset-top`, so the
  board keeps the whole canvas, and the ground shows between the cards. Cards are `--glass` (a
  translucent `--card` behind a blur) and the strip around them takes no pointer, so a click
  between two cards reaches the board.
- `visibleRect()` still measures only the docks, so "frame my army" can land a unit under the
  reel. Giving the float layer a say in that rect is the fix if it bites.
- The drag readout moved to the map's bottom-left corner, out from under the reel.
- The result screen is a modal over the board rather than a dock's last card.
- The reel centres on the canvas, not on the strip the docks leave (2026-09-01). It was inset
  by `--inset-left`/`--inset-right`, so opening or closing a panel slid every card sideways
  while the board under them stayed put. The docks now cost the reel nothing. The price is that
  a long roster with both panels open can run under a dock — the reel draws over it, since the
  float layer sits above the chrome. If that bites, clamp the reel's width before restoring the
  insets.
- The pick still stands once an action is spent: `select` throws, `pickUnit` returns early, and
  the other cards are `disabled` and carry the reason as a title. Only ending the activation or
  undoing the action frees it.
- `UnitCarousel` is now `ArmyReel`, its root class `.army-reel` (2026-09-01). Earlier notes in
  this file call it the carousel or the reel; the file is history and keeps its wording.
- The reel's hover runs both ways (2026-09-01). A card lights its miniature with the `selected`
  ring; a miniature under the pointer lights its card with the same growth a mouse hover gives
  it. Only pieces that have a card — the pending side's armies still to act — take part, so an
  enemy under the pointer stays dark. Selecting off the board no longer recentres the map: the
  piece was already under the pointer.

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

lets giv# The app model

What the client is made of, and where multiplayer will attach. Wave 1 of this plan (the shell
and its layers) is built; everything under "Not built" is a proposal, in the order it should
land.

## The one rule

**The map is a layer, not a pane. The UI is glass on top of it.** One canvas, fixed to the
viewport, under everything, fit to the whole viewport. Panels, bars, popups and menus sit above
it and change nothing about it — not its size, not its scale, not where a hex is on screen.
Open a dock, collapse it, hide it: every hex stays exactly where it was, because the only thing
that moved was some glass.

The board is never told the UI exists. It has no inset, no safe area, no free rect. A first
pass gave it one — the shell measured its chrome, the board fit itself into what was left — and
that is the wrong model: a re-fit on a panel toggle is a camera jump with a different trigger.
Spatial memory in a tactical game is worth more than the few percent of screen a dock covers.

Two consequences, both wanted:

- **A fitted board pans.** The clamp used to pin content smaller than the canvas to the middle,
  so with panels over it there was no way to look underneath. Now content slides freely and
  only stops at the canvas edge (`axis` in `Interaction.ts`), so sliding out from under a panel
  is a drag — and where you leave it is where it stays.
- **The docks earn their three states.** Rail and hidden are how you get the screen back, and
  `[` / `]` reach them without moving the pointer.

The shell still measures itself, but only for the DOM: it publishes `--inset-top/right/bottom/left`
so that a *corner-parked* overlay picks the map's free corner instead of opening behind a dock.
Nothing in `src/board` reads them.

Shots in `app-shell-shots/`: `battle-docks-open.png` and `battle-rail-and-hidden.png` are the
same battle with the docks open and then railed/hidden — the board is pixel-identical across
the pair, which is the whole claim. `defenders-left-dock.png` and `paint-left-dock.png` are the
setup stages.

## The layers

`src/app/shell/AppShell.svelte`, bottom to top. Each is a snippet the stage fills.

| z | Layer | What lives there | Pointer |
| - | ----- | ---------------- | ------- |
| 0 | `map` | The PIXI canvas. One per stage today. | the board's |
| 1 | `pin` | Anchored to board coordinates: the radial menu at a piece, the drag readout, later the other players' cursors and pings. | none; children opt in |
| 2 | `chrome` | The top bar, the two docks, a bottom bar between the docks. | the bars' |
| 3 | `float` | Free windows above the docks — a torn-off panel, a rules card. Empty today. | none; children opt in |
| 4 | `modal` | Blocking dialogs: a confirmation, a roll every seat has to watch. Empty today. | all of it |

Two things want a corner rather than a cell, so the shell publishes its insets as CSS
variables (`--inset-top/right/bottom/left`) as well. `BoardPopup` and the drag readout park
themselves in the *map's* corner, not the viewport's, and so never open under a dock.

### Docks

`left` and `right`, each **open** (a panel), **rail** (a strip that names it) or **hidden**
(gone; the top bar's toggle or `[` / `]` brings it back). The state persists per browser under
its own key — see "View state" below. A stage that passes no snippet for a side has no dock
there, and the toggle greys out.

Stage by stage: the ground/brushes/force list go left; battle keeps its log left and the
active unit's orders right; the unit strip is the bottom bar, inset between the docks because
it belongs to the map rather than to the window.

### Viewport controls

`MapControls.svelte` in the `float` layer, bottom-right: zoom in, zoom out, frame everything,
frame my army. It parks itself with `right: calc(var(--inset-right) + .85rem)` and the same for
the bottom, so it slides over when the orders dock opens and takes the true corner when both
docks are gone — Google Maps' controls, and the same reason: the buttons belong to the map, and
the map's corner is wherever the glass ends.

The board still never frames itself. `BoardView.frame(cells, into)` and `zoomBy(factor, into)`
both take the rectangle to aim at, and the toolbar passes `visibleRect()` — the canvas minus
the chrome. So a *command* lands where the player can see it (frame everything and the file
labels come out from under the unit strip; see `frame-everything.png`) while an *opening panel*
still moves nothing. Which army the last button frames is the stage's business: the acting side
in battle, the side being deployed in a placement stage, and the button is absent where there
is no army.

`ui.chrome` in the layout store is that measurement. It is the app telling the board where to
aim, not the board reading the UI.

## The three kinds of state

The split matters more than the shell does, because it is what makes a second player possible.

**Rules state** — `src/engine`. Pure, serialisable, no DOM. `createBattle` builds a
`BattleState`; `act(state, action, rng)` returns the next one. This is already the shape a
server wants: one authoritative document plus a typed intent (`Action`).

**Session state** — who is at the table, which seat each holds, whose turn it is, whether the
connection is live. Does not exist yet. Today `game.svelte.ts` is both the session and the
store.

**View state** — selection, hover, the aim/dial scratchpad, camera, which docks are open.
Belongs to one client and must never travel: another player's open panel is not my business,
and syncing it would be a bug that looks like a feature. `src/app/shell/layout.svelte.ts` is
the first of it to be named as such, under its own storage key (`battlefield.ui.v1`), never
inside `game.save()`.

## Not built: what multiplayer needs

1. **A seeded RNG in the state.** `act(state, action, randomRng)` reads a nondeterministic
   source, so no one can replay a match or check a claim. Move the seed and cursor into
   `BattleState` and make `act` a pure function of `(state, action)`. This is the single
   biggest blocker, and it is worth doing before the rules grow further — every check written
   against the old signature is a call site to fix later.
2. **Actions carry a seat.** `Action` says what to do, never who asked. Add the actor, and
   validate it against `state.pending` in the engine rather than in the UI — the client must
   not be the thing that decides whose turn it is.
3. **The match is a log of actions, not a snapshot.** `game.history` keeps whole states for
   Undo. Keep a `MatchLog` of `(seat, action)` instead: the state is a fold over it, undo is a
   shorter fold, a replay is the same fold with a delay, and a late joiner gets the log.
4. **A `MatchClient` seam.** One interface — `submit(action)`, `subscribe(onState)`,
   `seat()` — with a `LocalMatch` (fold in the browser, both seats hot-seat) and later a
   `RemoteMatch` (send the intent, wait for the server's state). `game.svelte.ts` becomes a
   thin client of it, and nothing in `src/app` learns which one it is holding.
5. **Presence in the pin layer.** Cursors, hovered cells, "thinking" pings: ephemeral, synced,
   never part of the rules state, drawn where the board coordinates say. The layer is already
   there and already ignores the pointer.
6. **Fog and per-seat views.** A seat should be handed the state *it may see*. That is a
   projection function on the engine side (`viewFor(state, seat)`), not a UI filter — a client
   that holds the whole state and hides part of it has already lost the information.

## Not built: the client, further out

- **One canvas for the whole app.** Each stage mounts its own `PixiBoard` today, so moving
  between stages rebuilds the board and loses the camera. Hoisting the canvas into `App` and
  feeding it from a store would make the map genuinely persistent — worth doing when stage
  changes start feeling heavy, not before.
- **Floating windows.** The `float` layer exists and is empty. When the orders panel wants to
  be torn off, or a second unit sheet wants to sit beside the first, that is where they go,
  with a small window manager (position, z-order, focus) beside `layout.svelte.ts`.
- **A command palette / hotkey map.** `[` and `]` are hard-coded in the shell. A keymap in the
  view store would let the board, the shell and the stages register without colliding.

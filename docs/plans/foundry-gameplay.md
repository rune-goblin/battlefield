# Foundry gameplay: battle lifecycle and layout

Written 2026-09-27 after the first table test of v0.4.0. Two tracks run in parallel: the battle
lifecycle at the table (A) and the layout audit inside Foundry (B). Track R lists the changes in
the ReignMaker checkout that track A needs.

## Terms

- **Standing battle**: a battle stored at a kingdom hex. Its marker shows on the map for everyone.
- **Active battle**: the one standing battle the table is playing. The world holds at most one.
  Players see it only after the GM presses Start.
- **Stored copy**: the version of a standing battle kept at its hex. Save writes it; Close
  returns the battle to it.

## A. Battle lifecycle

### A1. One control

- Players get no scene control. Remove the rook `Open Battlefield` control for everyone.
- The GM gets one scene control, the crossed swords, which runs the hex pick
  (`src/adapters/foundry/index.ts:167`).
- Remove the swords button Battlefield registers on ReignMaker's map toolbar
  (`registerBattleSitePicker` in `battleSitePicker.ts`). The scene control covers it.

### A2. Hex pick

- A hex with no standing battle opens the create wizard, as now.
- A hex with a standing battle opens it on the **briefing** screen (A3), for the GM alone.
- A pick while another battle is active runs Close on it (A5) first, with the same prompt when
  it is unsaved, then opens the pick. Cancel leaves everything as it was. The prompt appears
  whether or not the GM's window is showing.

### A3. Briefing screen

A read-only screen built from the create wizard's `Summary.svelte`: the hex, the sides, each
side's armies and factions, the day and round the battle stands at. One button, **Start**, which
calls the table (`api.callTable`) and invites every connected player. The create wizard ends on
the same Start.

### A4. Show and hide

- While a battle is active, every client (GM included) shows the floating chip
  (`tableCall.ts`, `.battlefield-chip`). The chip takes the crossed-swords icon.
- The chip toggles the window: closing the window hides it and leaves the battle running; the
  chip reopens it. A player's close never touches the battle.
- The chip follows world state alone. A player who logs in or reconnects during an active
  battle gets the chip on `ready`, with the window closed.
- The window title icon becomes the crossed swords as well.

### A5. Save, Close, End battle

The live session writes to the world as play goes. The **stored copy** at the hex changes only
on Save. The battle is **unsaved** when the live session differs from the stored copy
(`battleUnsaved` in `game.svelte.ts` already tracks this).

The GM's top-bar menu holds three items during an active battle:

- **Save**: writes the live session to the stored copy. The battle stays active.
- **Close**: ends the table's session for every client and returns the battle to the map at its
  stored copy. An unsaved battle prompts first: Save and close, Close without saving, Cancel.
  Closing a new battle that was never saved removes it from the map.
- **End battle**: resolves the battle. A battle the rules already ended (rout, withdrawal,
  surrender) carries its winner. Otherwise the GM rules one: Attacker, Defender or Draw, with
  Cancel. The result goes to ReignMaker through the outcome port, `endedBy` gains `'ruling'`,
  and the marker leaves the map. `rules.html` records the GM ruling.

### A6. End of day

The dusk report (`rules.html`, "Dusk and recovery") keeps End battle and Continue to recovery
and gains Save and Close, the same pair as the menu. The GM cannot end a day early; the report
appears at the round limit as it does now. A battle closed at dusk reopens on the briefing
screen, and Start resumes at recovery, so the table can play the next day in a later session.
The next day runs as the rules already say: recovery, orders, Fight another day, map choice,
redeployment.

### A7. Player view of the map

Players see every standing battle's marker. Clicking one shows a popup with the sides, their
armies and their factions. The popup has no Start and no open button. ReignMaker draws the
marker and the popup (R1, R2); Battlefield supplies the content.

## R. ReignMaker map-marker API

ReignMaker owns the map: its layers, fog, canvas coordinates and hex popups. Battlefield owns
the battles. The API between them is generic and knows nothing of battles, so the popup matches
ReignMaker's other map UI and Battlefield never converts canvas coordinates.

```ts
setMapMarkers(source: string, markers: {
  icon: string;
  hexIds: string[];
  /** Built on click, on the clicking client. */
  describe(hexId: string): { title: string; sections: { heading: string; lines: string[] }[] } | null;
}): void;
```

- R1. A `map-markers` overlay, `alwaysOn`, with the fog filter `army-counts` uses
  (`src/services/map/overlays/ArmyCountOverlay.ts`): markers show on the kingdom map for
  everyone and hide on hexes a player has not revealed. It replaces the battle markers on the
  Fortifications overlay, and `setBattleMarkers` goes.
- R2. Marker sprites take clicks on every client and open ReignMaker's popup with `describe`'s
  content. Battlefield's `describe` lists each side's armies and factions from the stored battle.
- R3. Drop the toolbar-button registration Battlefield no longer uses, if nothing else calls it.

Its checkout has unrelated uncommitted work on `master`; this goes on its own branch.

## B. Layout inside Foundry

The 2026-09-19 fix scoped `all: revert` under `.battlefield-root` (`foundry.css`). The table
test still showed buttons that do not contain their labels and text that overflows cards.

- B1. **Survey.** An e2e spec walks every stage and dialog in the GM and player clients at the
  default window size and at 1024×700, saving a screenshot of each. The screenshots go in
  `docs/plans/foundry-gameplay-shots/`.
- B2. **Cause list.** For each fault, name the Foundry rule or missing declaration behind it.
  Suspects: popovers, modals and the chip mounted outside `.battlefield-root`; `rem` sizes
  resolved against Foundry's root font size; flex children without `min-width: 0`; buttons
  without `white-space` and `height: auto`.
- B3. **Fix at the shared layer.** Every root that mounts outside the app root gets the same
  reset. Sizes use the `--type-*` steps against a base the app sets itself. Button, card and
  chip classes declare wrap, overflow and sizing. No per-screen patches.
- B4. **Re-survey** and compare against B1.

## H. Test harness

The e2e world is a clone of `stolen-lands`, cloned once and kept. It holds the kingdom's armies,
but the `battle`, `setup` and `play` specs also read a deployed Battlefield setup someone left in
the world by hand. Runs overwrite it, and `--reset-world` copies whatever the desktop world
held, so those specs fail on master today. The harness builds its own battle instead.

- H1. **Clean start.** `global-setup.ts` resets Battlefield's world state in the clone before
  any spec: the session, the table call and the stored battles at sites. No spec depends on
  state an earlier run or the desktop world left behind.
- H2. **Lifecycle spec, first.** A Playwright project `lifecycle` runs before the rest and walks
  one battle end to end on two clients:
  1. The GM creates a battle at a kingdom hex from the world's armies through
     `api.createBattle`, the path the hex pick uses, and both armies deploy.
  2. Start calls the table; the player's window opens.
  3. The GM plays a turn, then Save and Close. The marker stays; the player's window shuts and
     the chip goes.
  4. The GM reopens the battle at its hex: the briefing shows, the player sees nothing.
  5. Start again, play to dusk, and Save and Close from the dusk report.
  6. Reopen: Start resumes at recovery. End battle with a ruling; the marker leaves the map.
- H3. **Specs build on it.** The spec saves a deployed battle at a known hex as a fixture step.
  `battle`, `setup`, `play` and `layout` depend on the `lifecycle` project and open that battle,
  replacing the "deploy both armies once by hand" note in `fixtures/battle-window.ts`.
- H4. Update `src/tests/e2e/README.md`: the clone's Battlefield state is disposable and each run
  rebuilds it.

## Order

A1, A2 and A4 first: they are small and fix the confusion at the table. Then A3 and A5, then A6.
R1 and R2 before A7. B runs beside A from the start; B1 needs nothing from A. H follows A5 and
A6, since its spec walks Save, Close and the dusk report; B4 re-surveys on H's battle.

## Gate

Per the prototype rules, plus: the whole e2e suite passes from a freshly reset world clone
(`npm run test:e2e:setup -- --reset-world`, then `npm run test:e2e`). The lifecycle spec (H2)
and `table.spec.ts` cover GM pick, briefing, Start, player hide and reopen, player reconnect,
Save, Close with the unsaved prompt, the dusk report, and End battle with a ruling.

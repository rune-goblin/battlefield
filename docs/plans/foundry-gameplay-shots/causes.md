# B2 cause list

Survey of 2026-09-27: `src/tests/e2e/layout.spec.ts` against the stolen-lands clone on :30005, GM and
player clients, Battlefield window at its default 1280×800 and at 1024×700 inside a 1440×900
viewport. Screenshot names read `<size>-<client>-<screen>.png`. Each screenshot has an audit beside
it in `test-results/layout-audit/<same name>.json` (every box whose content overruns it, with its
computed style); a run rewrites them. The causes below come from `getComputedStyle` and a walk of
`document.styleSheets`, cascade layers included, on the live GM client at 1024×700.

Page facts every entry leans on:

- `html` font size is `16px`, set inline by Foundry's `configureUI` from the per-client **Font Scale**
  setting (`client/game.mjs:1836`, steps 8, 10, 12, 14, 16, 18, 20, 24, 28, 32 px; 16 at the default 5).
- `body` has `color-scheme: dark` (Foundry: `body { color-scheme: var(--color-scheme) }`).
- Foundry's own rules all sit in cascade layers (`reset`, `elements.forms`, `elements.typography`,
  `blocks.base`). The `all: revert` in `foundry.css` beats every one of them inside `.battlefield-root`.

## Faults

### 1. The type scale is gone: every heading and every small label renders at 16px

- **Shows in:** every screenshot. The `Battlefield` title in the top bar, `Create a battle`,
  `The ground`, `Orders`, `Battle log`, the Summary card titles and body text all share one size.
- **Element:** `:where(.battlefield-root)`, the tokens in `src/app/app.css:16-30`.
- **Cause:** a missing declaration of the app's own. The tokens reference themselves:
  `--type-1: calc(var(--type-1) * var(--type-ratio))`, and likewise `--type-2` … `--type-14`;
  `--type-small` hangs off `--type-1`. A custom property in a cycle is invalid at computed-value
  time, so each one computes to the empty value. Measured: `--type-1`, `--type-2`, `--type-4`,
  `--type-7` and `--type-small` all read `""`; `--type-body` reads `1rem` and `--type-label`
  `calc(1rem / 1.125)`. Any `font-size: var(--type-N)` or `var(--type-small)` then falls back to
  `inherit`, which is 16px from the root. `h1` (meant `--type-4`), `h2` (`--type-2`), `h3`
  (`--type-1`) and `.muted` (`--type-small`) all compute to `16px`.
- **Origin:** commit `6850377` ("updates", 2026-09-26) rewrote `--type-small: calc(var(--type-body) / …)`
  and `--type-1: calc(var(--type-body) * …)`, `--type-2: calc(var(--type-1) * …)` into the
  self-references, and shifted the step names at the call sites in the same commit (for example
  `ArmyReel.svelte` moved `.unit-card` from `--type-label` to `--type-small`).
- **Foundry's part:** none; its heading rules (`elements.typography h1 { font-size: var(--font-h1-size) }`,
  `h1…h6 { line-height: 1 }`) match but lose to the `all: revert`.

### 2. Army reel names cut to two lines with an ellipsis

- **Shows in:** `*-battle*.png`, both clients and both sizes: "Apprentice Magician.." on the
  third card.
- **Element:** `.army-reel button.unit-card > span.name` (`src/app/ArmyReel.svelte:102-136`).
- **Cause:** fault 1 feeding a fixed clamp. `.unit-card` declares `font-size: var(--type-small)`,
  which is invalid, so the card computes to `16px` bold where it was laid out at `--type-label`
  (14.2px). The card takes `width: min-content; min-width: 5.4rem` (86px), so the name box is
  71px wide, and `.name` clamps at two lines (`-webkit-line-clamp: 2; overflow: hidden`). The
  third word of "Apprentice Magician Clique" has no room at 16px.
- **Foundry's part:** `elements.forms button` matches the card (`height: var(--button-size)`,
  `display: flex`, `font-size: var(--font-size-14)`) and loses to the revert; computed height is
  `121px`, set by content.

### 3. The board frames against the browser viewport and sits off-centre in the window

- **Shows in:** `1024x700-*-wizard-*.png` and `1024x700-*-battle*.png` most plainly: the hex field
  runs off the map's right and bottom edges and a pale copy shows under the left panels. The
  default size shows the same drift, smaller: the 1278px window is 162px narrower than the
  viewport, so the board lands about 81px right of centre (`default-gm-wizard-board.png`).
- **Element:** the Pixi canvas under `.battlefield-root .layer.map`; the frame comes from
  `visibleRect()` in `src/app/shell/layout.svelte.ts:35`, called from `App.svelte` with
  `window.innerWidth` and `window.innerHeight`.
- **Cause:** a missing measurement of the app's own. Measured at 1024×700: viewport 1440×900,
  `.battlefield-content` and the canvas both 1022×662 at (21, 57). The frame rectangle is the
  viewport less the docks, so it is 418px too wide and 238px too tall, and the board centres on
  a point about 209px right of and 119px below the map area's centre. A standalone page has no
  such gap, since there the viewport and the window agree.
- **Foundry's part:** Foundry supplies a window smaller than the viewport; nothing in its CSS.

### 4. Popovers paint under the army reel and the map controls, and run past the window's bottom

- **Shows in:** `default-gm-battle-seating.png` and `1024x700-gm-battle-seating.png`: the reel cards
  and `__e2e_player` badge cover the top of the Seating panel, the zoom and grid buttons cover its
  lower text, and at 1024×700 the "Seat players by hand" button is cut off at the window's edge.
  `*-battle-save-load.png` shows the same stacking, less of it.
- **Element:** `.topbar .tools .popover .panel` (`src/app/Popover.svelte:30`) inside
  `.shell .layer.chrome`.
- **Cause:** the app's own stacking and a missing height limit. `.panel` has `z-index: 10`, but it
  lives inside `.layer.chrome` (`position: absolute; z-index: 2`), which makes its own stacking
  context; `.layer.float` (`z-index: 3`, the reel) and the map controls paint above everything in
  it. The panel is `613px` tall from `y = 136` in a window whose content ends at
  `y = 719`; it declares no `max-height` or `overflow`, and the window content clips it.
- **Foundry's part:** `.window-content` clipping plus `foundry.css`'s `overflow: hidden; contain:
  layout` on `.battlefield-content` supply the clip edge.

### 5. The top bar takes three rows at 1024×700

- **Shows in:** `1024x700-gm-battle*.png`: status on row one, the tools on row two, `Rules` and
  `Source` alone on row three. The bar is `112px` of a `662px` window; the docks start at `y = 170`
  and the map is about 300px wide between them. The player bar holds fewer buttons and takes two
  rows (`1024x700-player-battle.png`).
- **Element:** `.shell .layer.chrome header.bar.top > div.topbar > div.tools` (`src/app/shell/TopBar.svelte`).
- **Cause:** the app's own width budget. `.tools` is `flex-wrap: wrap` with every button
  `white-space: nowrap` at `--type-body` (16px) and `.4rem .8rem` padding; the GM's nine controls
  plus the map-style group and the links need about 1100px. The battle docks keep their rem widths
  at every window size (`leftWidth: 24`, `rightWidth: 21` in `Battle.svelte`, 384px and 336px), so
  the map absorbs all of the loss.
- **Foundry's part:** none measured; each top-bar button computes to `height: 38.8px`,
  `display: block`, `white-space: nowrap`, with Foundry's `elements.forms button` rule reverted.

### 6. Native checkboxes, the range slider and scrollbars draw in the dark scheme on light cards

- **Shows in:** `*-gm-wizard-board-grid-settings.png` ("Show the reference grid" is a black square)
  and `*-gm-wizard-defenders-troop-picker.png` ("Has a volley").
- **Element:** `dialog.grid-settings input[type=checkbox]`, `input[type=range]`, and
  `.picker .filters input[type=checkbox]`.
- **Cause:** a Foundry rule and a missing declaration. Foundry's `body` sets `color-scheme: dark`;
  `color-scheme` inherits, and `all: revert` hands it back to the browser sheet, which declares
  none, so every element in the app inherits `dark`. Computed `color-scheme` is `dark` on the root,
  the checkbox and the range. The app declares no `color-scheme` and no `accent-color`, so native
  controls take the dark rendering. Foundry's `elements.forms input[type=checkbox] { appearance: none }`
  matches and loses to the revert (computed `appearance: auto`).

### 7. The troop picker's first column breaks the row lines

- **Shows in:** `default-gm-wizard-defenders-troop-picker.png` and the 1024 version: the Troop
  cell's bottom rule stops short of the row's height wherever the Source text wraps to two or three
  lines ("Mercenary Squad", "Zombie Leshy Horde"), and the cells drift out of line with their rows.
- **Element:** `.picker table td.troop` (`src/app/TroopPicker.svelte:144, 206`).
- **Cause:** the app's own rule. `.troop { display: flex }` on a `td` takes it out of
  `display: table-cell`; the browser wraps it in an anonymous cell, and the flex box keeps its
  content height instead of stretching to the row. Its border and background end with it.
- **Foundry's part:** none; Foundry's table rules are reverted.

### 8. Stat values clipped in the placement cards

- **Shows in:** audit only; the card sits below the fold in `*-wizard-defenders.png`
  ("+11 medium" in Orc Raiding Party's Shoot cell, 15px clipped).
- **Element:** `.unitlist .piece dl.stats .statcell dd` (`src/app/Place.svelte:357-360`).
- **Cause:** fault 1 and a fixed column. The grid is `repeat(3, minmax(0, 1fr))`, 89px per column,
  and `dd` is `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` at `font-size:
  var(--type-1)`, invalid, so 16px bold. The cell has `min-width: 0` already.

### 9. The grid settings Done button draws as bare text

- **Shows in:** `*-gm-wizard-board-grid-settings.png`.
- **Element:** `dialog.grid-settings > button` (`src/app/shell/MapControls.svelte:90, 110-118`).
- **Cause:** the app's own scoped rule. The dialog sits in the same component as the map-control
  buttons, so Svelte's scoped `button { … }` for the zoom strip (no border, no background) applies
  to Done as well. Computed: `border: 0px none`, `background-color: transparent`, `display: grid`.

### 10. The radial menu's tooltip sits under the neighbouring slices

- **Shows in:** `default-gm-battle-radial.png`: the shield of the next slice covers the left of
  the "Melee / No target in range" label.
- **Element:** `.radial .ring button.slice > span.name` (`src/app/RadialMenu.svelte:149-158`).
- **Cause:** the app's own stacking. `.name` is `position: absolute` with no `z-index`, inside a
  slice with none either; later slices in source order paint over it. The label itself fits:
  `span.name` 147px wide, its `small` 131px.

## Suspects the plan names

- **Roots mounted outside `.battlefield-root`.** Every popover, modal, `<dialog>`, board popup,
  the radial menu and the troop picker mount inside the root (`insideRoot: true` for each probe).
  Inside `#battlefield`, only Foundry's own `section.window-content`, `div.battlefield-mount` and
  `div.window-resize-handle` sit outside it. Two Battlefield surfaces live outside: the reopen
  chip (`.battlefield-chip`, prepended to `#ui-right-column-1`) and the switch prompt in
  `battleSitePicker.ts` (a Foundry `DialogV2`, styled by Foundry on purpose). The chip carries
  `foundry.css`'s unlayered rules, which beat Foundry's layered `elements.forms button`; it
  inherits Foundry's `font-family: Signika` and shows as intended in `*-reopen-chip.png`. The
  survey did not reach the switch prompt: it needs a ReignMaker hex pick on the kingdom scene.
- **`rem` sizes against Foundry's root font size.** Latent. At the default Font Scale the root is
  16px, which is what the app was laid out against, so no screenshot shows it. `--type-body: 1rem`
  and every rem padding, dock width and chip size follow the per-client Font Scale (8–32px), while
  the px sizes (the radial ring, whose slices measure 96px) stay put. A player on Font
  Scale 7 (20px) gets text 25% larger inside the same px boxes.
- **Flex children without `min-width: 0`.** No fault traced to it. The one flex child that
  truncates text, `.topbar .status`, declares `min-width: 0`; `.statcell` does too.
- **Buttons without `white-space` and `height: auto`.** No fault traced to it inside the root:
  Foundry's `elements.forms button { height: var(--button-size); min-height: var(--button-size);
  display: flex; padding: 0 .5rem }` matches every app button and loses to `all: revert` (measured
  heights follow content: top-bar buttons 38.8px, rail buttons 75px, reel cards 121px). The chip
  declares its own height.

## Also seen, outside Battlefield

- The player client opens Foundry's **User Configuration** dialog on join because `__e2e_player`
  has no character; it sits behind the Battlefield window in the player shots.
- The clone's world is paused, so Foundry's **Game Paused** banner shows behind the GM chip shot.

## B3 fixes and B4 re-survey

Re-survey of 2026-09-28: all four `layout.spec.ts` tests pass, at both sizes, against the same
clone. The B1 set is kept outside the repo; "before" below names a B1 screenshot and "after" the
file of the same name now in this folder. The folder holds 92 screenshots: the 72 of B1 and 20
new ones for the screens A3, A5 and A6 added.

New screens, both sizes: `*-gm-site-wizard-battle-menu`, `*-gm-briefing-setup`,
`*-gm-site-battle-menu`, `*-gm-site-close-prompt`, `*-gm-site-ruling-prompt`,
`*-gm-briefing-dusk`, `*-gm-dusk-report-recovery`, `*-player-dusk-report-recovery`,
`*-gm-dusk-report-survivors` and `*-gm-dusk-report-ruling-prompt`. The spec reaches dusk by
editing the stored copy, as `table.spec.ts` does.

### Shared-layer changes

- **App base.** `app.css` sets `--rem: 16px` on the root. A PostCSS plugin (`appRem` in
  `vite.config.ts`, used by both builds) rewrites every stylesheet `Nrem` to
  `calc(N * var(--rem, 1rem))`. Script-set sizes go through `rem()` in `src/app/rem.ts`: the
  Modal width, the Dock width and the ActionBudget size. Foundry's Font Scale no longer reaches
  the app. Media and container queries keep plain rem.
- **Type scale.** The step chain is restored: `--type-small = body / ratio`, `--type-label =
  small / ratio`, `--type-1 = body × ratio`, and each step after multiplies the one before. Commit
  `6850377` renamed every step one place up across the call sites (label→small, small→body,
  body→1 and so on), and the same rename caught the definitions. The call sites keep the rename,
  so every text now renders one step larger than before that commit, which was its aim.
- **Surfaces outside the root.** `.battlefield-surface` marks a Battlefield element mounted in
  Foundry's own interface. It takes the root's tokens (`app.css`) and the same `all: revert`
  (`foundry.css`), itself and its descendants; a Font Awesome glyph keeps Foundry's icon font.
  The reopen chip is the one surface today, and its colours, font and shadow now come from the
  tokens. The Close prompt of the hex pick stays a Foundry `DialogV2`, styled by Foundry.
- **Pseudo-elements.** The reset now covers `::before`, `::after` and `::placeholder` inside the
  root and on surfaces.
- **Colour scheme.** The root and surfaces declare `color-scheme: light` (`dark` under the dark
  palette) and `accent-color: var(--accent)`.
- **Buttons and cards.** The shared `button` rule declares `height: auto` and
  `overflow-wrap: break-word`. The shared `.card` declares `min-width: 0` and
  `overflow-wrap: break-word`.
- **Shell size.** `AppShell` measures its own box into `ui.size`. `visibleRect()` reads it and
  takes no arguments. `App.svelte` drops its window binding, and `MeleeChoices` clamps to the
  shell width.
- **Stacking and height.** The shell is a size container. While a popover is open, the chrome
  layer rises above the float layer. `.popover .panel` holds itself to the shell height below
  the top bar and scrolls.
- **Width budget.** A dock caps at `min(its width, 34cqw)` of the shell. Top-bar buttons use
  `--type-small` and tighter padding, and the top bar's `Battlefield` heading hides below 75rem
  of shell width, since Foundry's window header already names the app.

### Per fault

| # | Fault | Fix | Before (B1) | After (B4) |
|---|---|---|---|---|
| 1 | Type scale empty; every heading 16px | Chain restored; base `--rem` | `h1`, `h2`, `h3`, `.muted` all 16px; `--type-1` empty | Audit: `--type-1` resolves, `.muted` and buttons 14.2px, top-bar `h1` 18px; `default-gm-battle.png` shows serif dock titles above body text |
| 2 | Reel name "Apprentice Magician.." | Follows 1; the design clamps at two lines | Cut at 16px | Still cut at 14.2px (`*-battle.png`). The card is as wide as the longest word and `.name` clamps to two lines by design, so a three-word name loses its third word at any size. B2 misread this as fault 1; the clamp stands as designed |
| 3 | Board framed on the browser viewport | Shell measures itself | Board about 81px right of centre at default, 209px at 1024 (`*-wizard-board.png`) | Setup board centres in the map area at both sizes (`default-gm-wizard-board-grid-settings.png`, `1024x700-gm-wizard-defenders.png`) |
| 4 | Popovers under the reel and map controls; no height limit | Chrome rises while a popover is open; panel bounded and scrolling | Reel cards over the Seating panel; "Seat players by hand" cut off at 1024 | Seating panel paints over the reel and zoom strip, whole, at both sizes (`*-gm-battle-seating.png`) |
| 5 | Top bar in three rows at 1024 | Compact top-bar buttons; heading hides; docks cap | Three rows, 112px; map about 300px | Two rows at 1024 (`1024x700-gm-battle.png`); docks 347px each; map about 340px |
| 6 | Native checkboxes draw black | Pseudo-element reset; `color-scheme`; `accent-color` | Black squares in grid settings and the troop picker | Light checkbox and accent-coloured slider (`*-wizard-board-grid-settings.png`, `*-troop-picker.png`). The black square came from Foundry's `input[type=checkbox]::before` glyph, which the element reset left in place; `color-scheme: dark` was a second cause |
| 7 | Troop cell breaks row lines | `td` holds a `div.troop` flex box | Rule stops short on wrapped rows | Row rules run full height (`1024x700-gm-wizard-defenders-troop-picker.png`) |
| 8 | Stat value clipped | `dd` wraps | "+11 medium" clipped by 15px | Values wrap to a second line ("2 hexes" in `1024x700-gm-wizard-defenders.png`); in the last audit (the default-size stage run) the reel name is the only clipped box |
| 9 | Grid settings Done drawn as bare text | Map-control rules scoped to `.mapcontrols` | Bare "Done" | Bordered button (`*-wizard-board-grid-settings.png`) |
| 10 | Radial tooltip under the next slice | The labelled slice rises | Shield covers "Melee / No target in range" | Label on top (`default-gm-battle-radial.png`) |

### Left open

- The audit still flags the wizard rail's `li` boxes as spilling 7–8px downward. The screenshots
  show no fault there; the step button's box overhangs its row.
- The dusk report's recovery buttons read "⚑Morale" and "♥Health" with no space after the glyph.
- The troop picker's column header "source" is lowercase beside "Troop" and "Level".
- The site test at the default size ran before the pseudo-element fix; it shows no checkbox,
  so its screenshots stand.
- The survey drops ReignMaker's dialogs as they land (`dropForeignDialogs`, marked `proto:`),
  because ReignMaker's own suite ran against the same Foundry throughout.

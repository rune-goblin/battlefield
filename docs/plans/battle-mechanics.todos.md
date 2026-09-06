
## Troops-only notes

Wave 3 (troops only, pulled forward, run in parallel with Wave 1).

- Removed the "Your own" hand-built-unit section from `Place.svelte`: the `custom` state
  object, name/level/role inputs, Salvo select, Pace/Fear checkboxes, the tactics checkbox
  grid, the derived-stats preview line, and "Add New Unit". The roster picker, the generate
  button, siege-engine attachment, and the placed-unit list are untouched.
- Deleted `ROLES`, `REACHES`, `TACTICS` (the array), and `ROLE_BLURBS` from
  `src/engine/cards.ts` — grep confirmed no caller remained anywhere in `src/` once the
  custom-unit form controls that were their only consumers were gone.
- Kept `ROLE_PROFILES`, `deriveStats`, `cardTraits`, `derivation`, `paceReason`: `battle.ts`
  calls `deriveStats`/`cardTraits` to drive every roll from troop stats, and `Place.svelte`
  still renders `derivation`/`paceReason` as the "Battle ·" preview line for every roster/
  official/placed troop, including generic-roster troops that have no full sheet and derive
  from the level table alone. `ROLE_PROFILES` is an internal helper those three share. The
  `Role`, `Reach`, `Tactic` *types* also stay — used throughout `UnitCard` and `battle.ts`.
- Kept `FALLBACK_ART` in `src/engine/art.ts`: custom units are gone, but generic `ROSTER`
  troops (and any troop missing a specific art entry) still fall back to a role-based image.
- No test exercised the custom-unit-creation UI — there was no `Place.svelte` test — so
  nothing needed rewriting. The `UnitCard` object literals in `battle.test.ts`,
  `engines.test.ts`, `force.test.ts`, `cards.test.ts` are plain data fixtures for engine
  functions, unrelated to the deleted feature; left untouched (and `battle.test.ts` is a
  concurrent agent's file regardless).

## Ladder engine notes

Wave 1. `src/engine/ladders.ts` holds the seven ladders and the grade derivation; `battle.ts`
runs alternating activation, one action per activation, the reach check and disorder.

### Grade derivation, and the thresholds to tune

Measured over the 162 troop-trait creatures in the local PF2e checkout (`packs/pf2e`), not over
the 39 imported ones. Two of the obvious signals are dead ends:

| Signal | Spread within a level | Verdict |
|---|---|---|
| AC | 3.2 (level 7: every troop 24–25; level 11: every troop 30–31) | f(level), unusable |
| Attack DC | 2.6 (level 12: every troop exactly 29) | f(level), unusable |
| Will save | 5.1 (level 6 runs 11–16 across 22 troops) | usable |
| Speed | 20 ft ×18, 25 ×89, 30 ×36, 35 ×4, 40 ×12, 50 ×1 | usable |

So Guard and Fight are read off recurring action names instead, which an importer sees on any
troop ever published. `scripts/troop-signals.mjs` detects them and both importers emit them as
`UnitCard.signals`; nothing is keyed on a troop's name.

| Ladder | Rule | Grade 3 count of 162 |
|---|---|---|
| Move | Speed ≥ 40 → 3, ≥ 25 → 2, else 1; `mounted` → 3; Speed 0 → 1 and moving is illegal | 22 |
| Shoot | ranged band: extreme → 3, long → 2, close → 1; no ranged action → 1 and shooting is not offered | 5 |
| Fight | `melee-drill` or `fear` → 3, else 2; no melee strike → 1 | 30 |
| Guard | 1, +1 for `formation`, +1 for `shielded` or `magic-ward` | 7 |
| Withdraw | Move's speed bands, +1 when Perception is high for the level; `no-retreat` or Speed 0 → 1 | 27 |
| Rally | Will high or extreme for the level → 3, moderate → 2, else 1 | 12 |
| Cast | `caster` and level ≥ 15 → 3, ≥ 8 → 2, else 1; not offered without spells | 7 |

Signal detection, all from action names: `mounted` = Mounted Troop / First-class Charge (13);
`melee-drill` = Clash of Steel / Wild Swing / Strike as One / Trample / Attack of Opportunity
(23); `shielded` = Raise Shields / Shield Block (7); `formation` = Form Up / Drilled in
Formations (41); `magic-ward` = "+N Status to All Saves vs. Magic" (10); `no-retreat` = No
Retreat (6). `caster` = a `spellcastingEntry` item, any `spell` item, or a Troop Spellcasting /
Constant Spells action (36 of 162, 22%).

A troop with an empty tactic list — the normal case, since the importer emits `tactics: []` for
all 39 official troops — grades out fully: Goblin Rabble (no tactics, no signals) is
Move 2 / Shoot 1 / Fight 2 / Guard 1 / Withdraw 2 / Rally 1 / Cast 1. No troop in the corpus
grades all 1s.

The hand-authored `Tactic` flags stay as an override layer that only raises: `cavalry-charge` →
Move 3, `ambush`/`false-retreat` → Withdraw 3, `covering-fire` → Shoot 3,
`reactive-attack`/`dirty-fighting`/`feint` → Fight 3, `raise-shields`/`shield-block` → Guard 3,
`defend-allies`/`battlefield-medicine` → Rally 3. Three of them also grant one spell to a troop
with no magic: `battlefield-medicine` → Mend, `defend-allies` → Ward, `demoralize` → Compel.

Quality — the disorder a unit absorbs before it routs — is its Will band: low 3 (matching the
old `ROUTED_AT`), moderate 4, high 5, extreme 6, below-low 2.

### Judgment calls

- **Reach DC.** The level DC flat for rung 2, +2 for rung 3, carried on the rung as `reachDc`.
  The doc asks the rung to carry a DC modifier, and a uniform 0 would make the field pointless.
- **Movement is in points, not cells.** Advance 1, March 2 (3 with Pace); slow ground costs 2
  and uphill +1, so only a March wades into a marsh or climbs. This replaces "swamp costs an
  extra action", which had no meaning once an activation is one action.
- **Shoot bands are absolute, not capped by the unit's own reach.** Loose = close, Volley =
  long, Barrage = the extreme band and ignores cover. The unit's reach sets its *grade*, so
  equipment decides what is free and a reach roll throws further than the equipment should.
  Weakened no longer shrinks the band (it is already −2 to hit).
- **Overrun** inherits Press's +2 without the miss risk, plus the ground. The doc gives it no
  number; anything less made rung 3 worse than rung 2.
- **Rally does not roll.** The rungs clear disorder outright; the gamble is the reach. The old
  Will-vs-rout-DC check is gone, and with it the end-of-round rout check.
- **Disorder from wounds** is one point per attack that wounds, not per wound — except inside a
  melee exchange, where the exchange loss is the only morale event, so a bad exchange costs 1,
  not 2. Free strikes are outside an exchange, so a Scatter under two enemies that both wound
  costs 3 (two wounds plus the Scatter). That is the harshest number in the system.
- **Fear** costs 1 disorder to whoever enters contact with it, in either direction, once.
- **Half the army gone** now hands every standing unit of that side 1 disorder instead of
  triggering a rout check, keeping the old trigger in the new currency.
- **Charge** carries no attack bonus; the free melee is the reward. A charge that falls back to
  a March still closes to contact, and one that crits from a March fights whoever it lands on.
- **A rung the unit fell back to may not carry it**: a failed March moves as far toward the
  chosen cell as the smaller budget allows, and a shot beyond the fallback band falls short
  with no roll.
- **Siege engines are stats, not verbs.** A crewed artillery piece replaces the unit's shooting
  profile — launch bonus and reach band, so the reach band sets the free Shoot grade — and may
  target walls; a crewed ram adds +2 to a Fight against an adjacent wall. No engine actions.
- **`select(state, id)`** lets the UI choose which unit of the pending side acts; `activeUnit`
  falls back to the first un-activated unit, so tests and the engine never need the UI.
- **`routDc` survives as a proto alias** for the level DC, because `Battle.svelte` imports it
  and a missing export breaks the Vite build. Wave 2 owns that panel and should drop it.

### Rule questions for play

- Disorder arrives fast: a quality-3 troop routs on three wounding hits, which usually comes
  before four wounds destroy it. Units break before they die. Right, or should wounds only
  disorder on crossing the Weakened and Broken thresholds?
- Fight grade 2 is the default for 132 of 162 troops, so Press is the ordinary attack and plain
  Strike is the cautious one. Is that the right way round?
- Generic roster cards inherit their role's Will tier, and infantry's is high, so every
  sheet-less infantry card lands on Rally 3 and Quality 5. Only Peasant Levy, which overrides
  Will, reads as a levy. The roster may want real Will numbers.
- A caster knows all five spells, because troop statblocks name a spellcasting entry but not
  what it casts. Five menu rows for one caster is a lot; the importer could read the spell
  list and narrow it.
- The importer detects `no-retreat` but nothing reads it except Withdraw. `Trample` currently
  counts as melee drill; it might belong to Move.
- `README.md` still describes three actions, MAP and shaken. The docs wave owns it.

## Wave 2 notes

Full-screen battle. `src/app/Battle.svelte` is a fixed, full-viewport CSS grid (top bar / board
/ bottom strip / right panel) rather than the old in-column `.grid2`; `App.svelte` hides the
stage bar during battle and otherwise leaves the topbar in the DOM — `Battle`'s own
`position: fixed` overlay covers it regardless, so nothing needed removing there. The action
menu renders directly off `availableActions`: one block per `ActionOffer` (so casters already
get one row per spell, for free, from the surface), three `RungOption` rows each showing
`access` as a Free/Reach — gamble/Locked badge, the reach rung's DC, modifier, and all four
degree outcomes (crit → the rung above, fail → falls back, crit-fail → falls back + 1
disorder), and a locked rung's `reason` text.

### Judgment calls

- **"An end-activation control"** is read as the existing `Undo` button. Every legal rung,
  including Guard's free no-target Brace, is always available to the active unit — the engine
  has no pass/skip verb, so `act()` ending the activation is an inherent side effect of
  resolving any rung, not a separate step the UI gates. Undo is the only control in the surface
  that operates on an activation boundary (it rewinds the last completed one), so it fills that
  slot in the top bar. Flag if something more specific was meant.
- **"The player's units" (bottom strip)** is read as `b.pending`'s units only — hot-seat, so
  "the player" is whoever is about to activate. The strip swaps sides each activation rather
  than showing both rosters at once.
- **Wall targets have no board highlight.** `BoardView.setHighlight` only paints cells
  (`OverlayLayer.fillCell` calls `grid.parse` on the id, which a wall key like `a2|a3` doesn't
  parse as). Cell- and unit-kind `RungTarget`s highlight (a cell wash or a token ring); a
  wall-kind target still resolves correctly on an `edge` click, it's just not previewed on
  hover. A `centerOn`-style addition to `BoardView` would need a matching edge-highlight method
  to close this; didn't add one since no wall-fight scenario came up in the smoke-tested hex
  battle. `src/board/index.ts`, `OverlayLayer.ts`.
- **`BoardView.centerOn(cell)` is new** (`src/board/index.ts`), added to satisfy "clicking
  selects and centres" — panning `opts.parent` so the cell's centre lands under the viewport's
  screen centre at the current zoom, mirroring how `resetView`'s pan/zoom reset already works.
  Not in the wave 1 surface list since it's a board-view addition, not an engine one; still
  routed entirely through `BoardView`, so the "Svelte only touches BoardView" invariant holds.
- **`troopArtUrl`/`engineArtUrl` are now exported from `src/board/index.ts`** so
  `Battle.svelte` can draw unit-card portraits in the bottom strip. They're pure path-builders
  (no PIXI, no layer state) that `Token.ts` already called the same way; re-deriving the
  `BASE_URL` prefix logic in `src/app` instead would just duplicate it. If this is judged too
  loose a reading of "BoardView is the only surface Svelte touches," revert to duplicating the
  helper in `src/app` instead.
- **Move rung 1's optional bonus shot is not exposed.** `Action.shoot` (Advance-and-shoot at
  −2) has no UI this wave — Advance always resolves as a plain move. The rung itself, and every
  other rung, works; this is a scope cut, not a bug. `src/app/Battle.svelte`.
- **`UnitTokenModel.shaken` → `disorder`, plus a new `quality: number` field**
  (`src/board/Token.ts`), since routing is per-unit Quality (2–6) now, not the old fixed
  `ROUTED_AT = 3`. The disorder pip row on a token/card is `quality` pips long, so an elite
  unit visibly absorbs more before it routs. `types.ts`'s `ROUTED_AT` constant is now unused
  (only `Token.ts` read it) — left in place since it's harmless and out of this wave's engine
  scope; a later wave can drop it.
- **`routDc` alias removed** from `src/engine/battle.ts` per the wave's cleanup item; the panel
  now calls `levelDc(active.level)` directly.
- Target pickers for `needsTarget`/optional-target rungs use a `<select>` + "Go" button (same
  shape as the pre-Wave-1 UI), not per-target buttons — a March's reachable-cell list can run
  to dozens of entries on a hex board, too many to lay out as buttons. Hovering the rung and
  clicking the highlighted board cell/token is the primary path either way.

## Movement and actions notes

Wave 3. `src/engine/path.ts` is new; `battle.ts` runs three actions per activation and spends
movement in feet; Move's ladder is gone from `LADDERS`.

### `path.ts` — the ported model

Reignmaker's `PathfindingService` shape without its nav-grid rasterisation, its Foundry
`canvas` dependency or its 100k-iteration guard. Its naive `frontier.sort()` per pass is kept
verbatim: 64 cells never make a heap worth the loss of legibility.

```ts
stepFeet(board, from, to, flying?): number          // Infinity when blocked
reachable(board, start, { budget, flying?, occupied? }): Map<cell, { feet, from }>
pathTo(reach, to): string[]                          // start cell first, [] when unreachable
feetTo(reach, to): number
CELL_FEET = 10, CLIMB_FEET = 10, TERRAIN_FEET
```

Rasterisation existed to let a unit enter a hex from the non-river side of geometry drawn
across a scene. This board puts walls and cliffs on explicit edges (`a2|a3`), which is exact
where rasterisation approximates, so `barrierBetween` carries the whole edge model — and a
breached wall (`remaining === 0`) is already a crossing with no special case.

### Terrain costs, as implemented

| Entering | Feet |
|---|---|
| Open, settlement | 10 |
| Forest, shallows | 20 |
| Swamp | 30 |
| Water | impassable |
| Each elevation level climbed | +10 |
| Across a standing wall or a cliff | impassable |
| Across a breached wall | the terrain cost alone |

Flying returns 10 ft for any in-bounds neighbour and skips `barrierBetween` entirely, so a
flier crosses water, walls and cliffs at open-ground price.

### The reachability surface the UI wave binds to

`activation(state, unitId?)` is the whole surface for one unit:

```ts
{ unit, actions, feet, speed, offers: ActionOffer[], moves: Map<cell, MoveReach>, charges: ChargeOption[] }
MoveReach  = { feet, actions, from }
ChargeOption = { unit, cell, feet, actions }   // actions is the movement, before the melee's one
```

`movePath(moves, cell)` reconstructs the drag preview, start cell first. `moveReach(state, u)`
and `chargeTargets(state, u)` are exported separately for direct use. `ActionOffer` gained
`cost` (1 for all six ladders); `RungOption` / `RungTarget` are otherwise untouched.
`endActivation(state, unitId?)` is the end-activation control the doc's interaction section
asks for, and doubles as the pass.

### Judgment calls

- **Movement pools across the activation.** A Move action adds Speed feet to a pool that
  survives to the next action of the same activation and is lost at its end. PF2e loses the
  remainder of each Stride, which would make a 30 ft swamp cell permanently unenterable by a
  25 ft troop and would make "how many actions does this cell cost" depend on route
  segmentation rather than total cost. Pooling gives `ceil((feet − banked) / speed)` exactly,
  which is what the drag preview needs. Tunable: switch to per-Stride remainders if pooling
  reads as too generous.
- **Every ladder rung costs one action, and may be repeated.** The doc's "Move, Move, Move, or
  Move, Shoot, Guard" implies a flat price and no multiple-attack penalty was reintroduced.
  This triples attack throughput against the one-action economy the level-mismatch table was
  computed under — see the rule questions.
- **Charge is a compound, not a rung.** `{ type: 'charge', target }` pathfinds to the cheapest
  cell touching the enemy, spends that movement, then spends one more action on a Fight rung —
  the unit's granted rung by default, or `rung` to reach for a higher one. It is therefore
  exactly equivalent to Move-then-Fight and carries no bonus of its own, which is what the old
  "Charge carries no attack bonus" note said. It exists as a verb so a drag onto an enemy is
  one gesture, and so `chargeTargets` can tell the UI where contact is affordable.
- **`Unit.rooted` is a countdown, not a flag.** Digging in sets 2 and `finish` decrements, so
  the root covers the rest of the activation that dug in and the whole of the next one. A
  boolean cleared at the start of an activation would have been cleared by the same
  activation that set it once an activation is three actions long.
- **`Unit.flying` is new**, read off `sheet.fly`. `speedOf` already turns a fly speed into feet
  and is the only movement stat; `flying` is the bypass flag, not a second speed.
- **A unit in contact has no `moves` and no `charges`.** Leaving contact is the Withdraw
  ladder, which prices it. Withdraw still moves exactly one cell and ignores movement points.
- **`mounted` and `cavalry-charge` no longer feed any grade.** They fed Move 3, and Move has no
  grades now; speed carries it instead (cavalry 35 ft against infantry 25). Both are still
  emitted by the importers and by `ROLE_PROFILES`, now inert. Candidate: let them raise
  Withdraw, since horsemen break off well — not done, as the doc grants no such rule.
- **A Move takes no free strikes**, unchanged. Striding *into* contact is free; leaving is not.

### Shooting bands on hex — the new numbers, tunable

```
square: close ≤ 2, long ≤ 3, extreme unbounded     (unchanged)
hex:    close ≤ 2, long ≤ 3, extreme ≤ 5, beyond 5 nothing shoots
```

Hex distance is true range where square's Manhattan distance over-counts every diagonal, so
the same threshold covers far more ground: within distance 3 a hex shooter sees 37 cells
against square's 25, unclipped. Head-on reach is identical on both grids, though — three rows
is distance 3 either way — so the two lower thresholds stand: `close ≤ 2` still forces a
shooter
to advance one row before it can Loose at the enemy front line, and `long ≤ 3` still reaches
that line exactly. What is genuinely new on hex is the width of the fan, which no threshold
narrows, so the retune caps the top band instead. At 5 cells a Barrage still covers the whole
contested middle, and reaches the defender's back rank straight ahead from the attacker's own
front line — but no longer from the attacker's home rank (7 on hex), and not onto the far
zone's flanks at all (6 and up). `Range` gained a `'beyond'` member for this; `rangeRank`
scores it 4, so it fails every band test.

Note the scale mismatch this exposes: one cell is now 10 ft, so PF2e's own bands (`salvoFeet`
≤ 60 close, ≤ 120 long) would be 6 and 12 cells — most of an 8-cell board. The board's bands
stay compressed abstractions rather than literal reach. `BANDS` in `types.ts` is the one place
to retune.

### What the UI wave must fix first

- **A saved battle in `localStorage` will not load.** `Unit` gained `actions`, `feet`,
  `flying`, `rooted` changed from boolean to number, and `BattleState` gained `begun`. A state
  saved before this wave deserialises with `actions: undefined` and breaks on the first
  action. Bump `KEY` in `src/app/game.svelte.ts` (`battlefield.v2` → `v3`) or migrate. Left
  alone here because this wave may not touch `src/app/`.
- **Movement has no UI.** `availableActions` no longer offers a Move type, so `Battle.svelte`'s
  panel cannot move a unit at all; the drag in the doc's interaction section is the fix.
  `styleFor`'s `offer.type === 'move'` branch is dead.
- **There is no end-activation button**, so a unit must spend all three actions before the turn
  passes. `endActivation(state, unitId)` is the call.
- **Undo is now per action**, not per activation, because `takeAction` pushes history on every
  `act`. That may be what is wanted; decide in the UI wave.

### Rule questions for play

- Three attacks per activation. The level-mismatch table was computed at one attack per
  activation and concluded "morale is the primary kill mechanism"; at three, an even fight
  destroys a unit in under three activations. Should attack ladders (Shoot, Fight, Cast) be
  once per activation, SAGA-style, with Move and Guard repeatable? Or does MAP come back?
- Rally now costs one third of an activation instead of a whole one, so clearing all disorder
  is cheap and disorder may stop being the tempo weapon it was designed as.
- A charge that finds nobody — the target routed or the reach was miscounted — still spends the
  movement and refunds the melee action. Should it cost the full price anyway?
- Should Withdraw spend movement points rather than moving exactly one cell? A fighting retreat
  by cavalry moving one cell reads oddly next to a 40 ft Stride.
- Flying costs 10 ft a cell over everything, including water it could not land on. Should a
  flier be forbidden from ending a move over water?

## Drag interaction notes

Wave 3 (interaction). `src/app/game.svelte.ts`'s `KEY` is now `battlefield.v3`; a saved
`battlefield.v2` state is simply never read, not migrated — confirmed by seeding one and
reloading (no throw, no console error), see "Judgment calls" below for how that was verified.
`Battle.svelte`'s right panel is now progressive-disclosure (a type-row of chips, one ladder
open at a time); dragging a token is the only way to move, wired through new `BoardView`
members (`setDragPath`, `setDraggable`) and a new `'drag'` `BoardEvent` on `Interaction`.

### Judgment calls

- **Only the active unit's own token can start a drag, in battle mode.** `Interaction` gained
  `setDraggable(id)`; a press on any other token in battle mode never escalates past
  `CLICK_SLOP`, so it still resolves as a plain click (a target pick) on release, it just can't
  be picked up. This means pressing a *different* one of the player's own un-activated units
  (without first clicking it in the bottom strip) is a silent no-op rather than an implicit
  select-then-drag — click it in the strip first. Place mode is unchanged (any token drags, as
  before); this only gates battle mode.
- **The drag "must stop" rule is read as "the preview freezes," not "the preview clips to the
  nearest reachable cell along the ray."** `onBoardDrag` only updates `drag` when the hovered
  cell is a key in `activation().moves` (or a legal `charges` target); a cell beyond reach, or
  occupied, or the unit's own square, just leaves the last valid preview on screen rather than
  computing a nearest-reachable substitute. Cheap and correct (never draws an illegal path) but
  means dragging fast past the edge of reach can leave the preview looking stale for a moment
  until the pointer re-enters a reachable cell. Actually resolving the move still reads the
  real drop cell fresh against `activation().moves`/`.charges`, not the stale preview, so a
  stale-looking preview can never cause a wrong move.
- **"Reachable-this-action vs. reachable-with-more-actions" is painted on the traced path
  only, not as a standing move-range wash shown the moment a unit is selected.** Colouring the
  whole `moves` map (dozens of cells on hex) before any drag starts was cut as scope for this
  wave — the doc's wording ("Board support... for" the drag) reads as being in service of the
  drag preview, and the path itself is a small, legible run of cells, unlike the full reach set.
  `moveFar` (new `HighlightStyle`, `src/board/theme.ts`) is applied only to path cells whose
  `MoveReach.actions > 1`; if a persistent range wash is wanted later, the plumbing (per-style
  highlight groups on `PixiBoard`) already supports adding it as a third group.
- **The destination cell's own highlight is usually invisible** — `TokenLayer` draws above
  `OverlayLayer` (z-index 30 vs 20, pre-existing), and the dragged token sprite sits exactly on
  the destination cell while dragging, so its fill is hidden under the token. Judged
  acceptable: the token itself *is* the clearest possible marker for "here," and the polyline
  plus the HUD's cell name still name it explicitly.
- **A charge preview uses a single `attack`-styled run for the whole path**, not a near/far
  split — the movement cost is incidental to a charge (the point is contact plus the melee
  action), so one color reads as "this drag is aggressive" without the movement nuance a plain
  Move needs.
- **The `highlights` prop replaced `highlight`/`highlightStyle` on `PixiBoard`** (now
  `{ style, cells }[]`, one call to `BoardView.setHighlight` per known `HighlightStyle` every
  effect run) so the rung-hover wash and the drag-path wash can't race-clobber each other by
  writing the same style from two independent `$effect`s. `Place.svelte` updated to the new
  shape; no other caller existed.
- **A board click only resolves a rung of the currently *open* type.** Wave 2's `findMatch`
  searched every legal rung across every offer as a fallback ("same as clicking straight off
  the panel," when the panel showed every offer at once). With progressive disclosure that
  fallback would let a click resolve a rung the player was never shown — e.g. clicking an enemy
  token could fire a Strike nobody had opened the Fight ladder for — so `findMatch` now only
  searches `openOffer`'s rungs. Hovering a highlighted target still wins over a same-cell/unit
  match on a different (impossible, now, since there's only ever one open offer) rung.
- **Verified by driving the real UI with Playwright** (chromium + the GL args already recorded
  in this repo's tooling notes), not by unit test — per `CLAUDE.md`'s prototype-mode rule
  against PIXI unit tests. Confirmed live: a stale `battlefield.v2` save present at load time
  produces no console error or thrown exception (the app just lands on the board-setup stage,
  since `v2` is never read); the drag HUD read the exact feet/action numbers computed
  independently via `activation()` in a throwaway engine test first (`c5` from `c2` at 20 ft
  speed: 30 ft, 2 actions; `c6`: 40 ft, 2 actions), confirming the UI never recomputes the
  numbers it shows. The throwaway test and its Playwright driver script were not committed.
- **`docs/plans/battle-shots/wave3-drag.png`** shows a hex board mid-drag: a bent orange
  polyline from the unit's cell through a green ("near," one action) run into an amber ("far,"
  two actions) cell where the token now sits, the HUD reading "Move to c6 — 40 ft · 2 actions,"
  and the collapsed panel's type row (`Shoot`, `Guard`) un-expanded in the same frame.

## Move bands notes

Wave 4 (move bands + push). Reverses the previous wave's "path-only, no standing wash" call per
"The move ladder lives in the drag" in the doc, and folds in a mid-wave correction from Mark:
the ladders stay in the right panel, and Move comes back as a visible, always-open panel entry
whose four rows are the same bands the board washes — not a click-to-open type chip like the
other ladders.

### The push engine surface

`src/engine/battle.ts` gains, alongside the existing `moveReach`/`movePath`:

```ts
pushReach(state, u): Map<string, PushReach>          // PushReach = { feet, from, fallback }
pushPath(moves, push, to): string[]                   // start cell first, mirrors movePath
pushDcFor(u): number                                   // levelDc(u.level) — no rung modifier
pushModifierFor(u): number                             // reachModifier(u) + PUSH_BONUS if mounted/cavalry-charge
PUSH_BONUS = 2                                          // tunable
```

`pushReach` is a second `reachable()` pass at `movementBudget(u) + u.speed` (one further
action's worth, per the doc's bound), with everything `moveReach` already covers subtracted
out. `PushReach.fallback` is precomputed per cell by walking `pathTo` back to the start and
keeping the last cell that's in the affordable `moves` map — so `doPush` never has to search.
`activation()` now returns `push` alongside `moves`/`charges`. `Action` gained `PushAction =
{ type: 'push'; to: string }`.

**Move was deliberately *not* added back to `LadderType`/`availableActions`/`ActionOffer`.**
That shape is grade-based (`free`/`reach`/`locked` against a 1–3 grade), and Move's bands are
action-count bands with a fourth, ungraded "beyond your grade entirely" rung — forcing it back
in would resurrect exactly the "Move's ladder collapses into the action economy" concept the
design doc retired. Instead `Battle.svelte` builds the four-row Move panel straight off
`act.moves`/`act.push`/`act.actions` — grouping already-computed `MoveReach.actions`, never
recomputing pathing. If a future wave wants Move's rows to carry `RungOption`-style target
lists too, that's the point to revisit this call.

### Push's degrees, and why crit success and success read the same

Doc text: "Reuse the existing `reachFor()` machinery... the degree handling must match the
other ladders exactly." `reachFor`'s crit-success case is "the rung above the one reached for,
capped at the top of the ladder" — when the reach was already for rung 3, that caps right back
down to rung 3, so crit and plain success are already indistinguishable *for a top-grade unit*
elsewhere in the system (Overrun, Barrage, Shieldwall...). Push has no rung above the cell you
dragged to (the doc caps it at one further action's movement, explicitly to forbid an
unbounded gamble), so the same collapse happens by construction: crit success and success both
just land on the cell, no disorder either way. `doPush` (`battle.ts`) doesn't special-case this
— it's what naturally falls out of `reached = degree === 'success' || 'critical-success'`.

**Push always spends every action the unit has left, win or lose — a judgment call.** "Beyond
every action the unit has" is read as a cost, not just a distance description: attempting a
push commits the whole remaining activation, so a push is always the last thing a unit does
that turn (`s.activated` includes it immediately). The alternative — spending only the
fallback cell's actual action cost on a failure, leaving actions unspent — was considered and
rejected: it would make failing *cheaper* than a plain March to the same fallback cell would
have been (since you'd also get the option to try), which reads as a free option rather than a
gamble. Tunable if play finds the all-or-nothing framing too harsh.

**`pushDcFor` is the flat level DC, no reach-DC modifier.** The doc says "a Quality check
against the level DC," full stop, unlike the other ladders' rung-3 reaches which add the
rung's `reachDc` (+2). Push has no `Rung` to carry a modifier on, and inventing one unstated
felt like tuning by accident rather than by decision — if push reads too easy in play, add a
flat modifier here rather than reusing a `Rung.reachDc` that doesn't semantically apply.

### The mounted/cavalry-charge bonus

`PUSH_BONUS = 2`, applied to the check's modifier (not the DC), when `u.mounted ||
u.tactics.includes('cavalry-charge')`. Picked to match the +2 this system already reuses
everywhere a rung's hardest step needs a bump (Press, Overrun, Shieldwall, Barrage's
ignores-cover). **`Unit` gained a `mounted: boolean` field**, set at `createBattle` time from
`cardTraits(card).signals.includes('mounted')` — the `mounted` *signal* (detected off "Mounted
Troop"/"First-class Charge" action text by the importer) previously never survived onto `Unit`
at all, only `tactics` did. This is the second half of "restores meaning to `mounted` and
`cavalry-charge`, which the movement wave left inert" — `cavalry-charge` is a tactic already on
`Unit.tactics`, `mounted` needed its own field.

### The standing wash and the Move panel's live status

- **Hovering a Move row narrows the standing wash to just that band, rather than adding a
  second visual layer on top of it.** The wash is already showing all four bands the moment a
  unit is selected (the wave's core ask); "hovering a row lights the corresponding band" reads
  most usefully as *isolating* that band for a clearer look, not repainting cells that are
  already painted. `Battle.svelte`'s `standingHighlights` swaps between "all four bands" and
  "just `moveBands[hoveredBand]`" depending on `hoveredBand`.
- **A live drag suppresses the standing wash entirely** (`standingHighlights` returns `[]`
  once `drag` is set) in favour of the traced-path near/far/push colouring the previous wave
  already built — the path is the more specific, more relevant answer once a drag is under
  way, and painting both at once would double up the same colours confusingly.
- **The "other ladders" live-unaffordability note is a non-finding, recorded rather than
  silently skipped.** Every non-Move rung costs a flat 1 action (`ActionOffer.cost`), and
  `availableActions` is only ever non-empty while the unit still has actions (the activation
  ends via `finish()` the moment `u.actions <= 0`), so there's no state where an offered rung
  is currently unaffordable — legality is already binary. Nothing needed changing; flagged in
  case a future variable-cost rung reopens this.
- **Two new `HighlightStyle`s, `moveFar3` and `push`** (`src/board/theme.ts`), plus two new
  `--warn`/`--warn2` CSS custom properties (`src/app/app.css`) so the Move panel's row colours
  match the board exactly. First-pass colours (a muted maroon push, a subtle burnt-orange
  `moveFar3`) were nearly invisible once blended at the shared 0.35 highlight alpha over pale
  terrain — confirmed by screenshotting and cropping in close, not by eyeballing the full
  board. Retuned to more saturated hex values (push: light `0xc22f1f`, dark `0xe8503f`;
  `moveFar3`: light `0xa1490c`, dark `0xcf6a1f`) until a corner crop showed all three bands
  clearly apart. `OverlayLayer`'s shared 0.35 alpha constant was deliberately left alone —
  changing it would have also restyled `deploy`/`attack`, out of this wave's scope.

### The screenshot

`docs/plans/battle-shots/wave4-bands.png` is a two-panel composite, both hex, both the default
setup (Line Infantry at c2, 20 ft speed):

- **Left** — Line Infantry selected, no drag in progress: a green one-action band hugging c2,
  a tan two/three-action band covering most of the open middle, and a rose push band along the
  h-file at the board's far edge — all three visible with nothing dragged or clicked beyond
  the unit auto-selecting on battle start.
- **Right** — mid-drag toward g8 (hex-distance 7, 70 ft, inside Line Infantry's 61–80 ft push
  band), HUD reading "Push to g8 — DC 22 · fail and you stop at g7," with the push-coloured
  polyline running the whole route.

Driven with the same Playwright + chromium-1234 harness recorded in the wave 3 notes; the
harness script was not committed. One snag worth recording: `.locator(...).innerText()` on an
element that may not exist (`.drag-hud`, only rendered `{#if drag}`) uses Playwright's default
30 s auto-wait before rejecting — a first attempt that probed several candidate drag targets in
a loop each with an unguarded `.innerText().catch(...)` took several minutes doing nothing but
timing out. Pass an explicit short `{ timeout }` on any such probe, or compute the target cell
in advance (as the final script does, via the same cube-distance formula `grid.ts` uses)
instead of searching for one live.

## Actions buy weight notes

Wave 5. Three actions with no multiple-attack penalty gave three attacks an activation — 1.50
wounds a turn on an even matchup. `src/engine/battle.ts` now allows one attack an activation
and lets further actions buy +2 each, allocated by the player.

### The action shape

`RungAction` and `ChargeAction` gained `spend?: Partial<Spend>`, where

```ts
interface Spend { roll: number; push: number }   // src/engine/types.ts
```

Each point on either dial is one further action, so `cost + roll + push` is what the
activation pays, and `ACTION_BONUS = 2` is what each buys where it lands. `cost` is always 1:
`{ type: 'fight', rung: 3, target: 'u2', spend: { push: 2 } }` is a three-action commitment
reaching for Overrun with +4 on the reach check.

`ActionOffer` gained the matching surface for the UI wave to bind:

```ts
dials: { extra: number; step: number; roll: boolean; push: boolean }
```

`extra` is `u.actions - 1`, `step` is `ACTION_BONUS`, `roll` says the act has a roll of its own
(`OWN_ROLL` in `ladders.ts`, plus `Spell.rolls` so only Blast takes the dial among the five
spells), and `push` says a rung above the granted one is on offer with a check standing between.
Per-rung, the push dial bites exactly where `RungOption.access === 'reach'`; `commit()` refuses
a push allocation on any other rung, a roll allocation on a type with no roll, and any total
past the actions left.

`Unit.attacked` and `Activation.attacked` are new. `begin()` and `finish()` clear it.

### Where each type spends

| Type | Roll dial | Push dial |
|---|---|---|
| Fight | the strike, on top of the rung's own bonus | the reach from Strike toward Press or Overrun |
| Shoot | the shot, including an engine's bombardment | the reach toward Volley or Barrage |
| Cast | Blast's attack roll only | the reach on the spell's scope |
| Guard | — | the reach toward Dig in or Shieldwall |
| Withdraw | — | the reach toward Break off or Fighting retreat |
| Rally | a Quality check that clears further (see below) | the reach toward Rally or Inspire |
| Move | distance, by default — a Stride still buys a Speed's worth per action | `pushModifierFor(u, committed)` weights the push check by `(committed - 1) * 2` |

### Judgment calls

- **Rung access stays grade-gated and every act still costs one action.** The wave brief reads
  "a Fight-2 troop can choose Strike for one action, Press for two, or reach for Overrun with
  three", which could be read as rung index being a minimum action cost. The doc's own
  arithmetic rules that out: "a Fight-2 troop with three actions chooses between Press at +4,
  or reaching for Overrun at +4 on the reach check" only comes out at +4 if the extras are
  counted from the *first* action, i.e. `3 - 1 = 2` extras at +2 each, on a flat cost of one.
  The wounds table (+0/+2/+4 for 1/2/3 actions) says the same. So "Press for two" is read as
  the natural commitment, not a price, and the test asserts exactly that trio.
- **Fight rung 1's population is the move-then-strike case, not a cheaper price.** With one
  attack an activation, a unit that Strides twice has one action left and takes Strike at +0;
  Press at +0 costs a point of disorder on a miss, so the safe rung is a real choice when
  nothing is left to weight it with. It is thinner than "Press costs more" would have been —
  flag if rung 1 still reads dead in play.
- **A Blast spends the activation's one attack.** The brief says "a unit may Fight or Shoot
  once", but a caster left free to Blast three times reopens the exact hole this wave closes,
  and the doc's own line is "a unit attacks once per activation". `isAttack()` therefore covers
  Fight, Shoot and Cast/Blast. Attacking a wall counts too — it rolls an attack.
- **Rally's own roll had to be invented.** The doc's generalised table gives Rally "+2 to the
  Quality check", but wave 1 decided "Rally does not roll — the rungs clear disorder outright;
  the gamble is the reach", so there was no check for the dial to feed. Committed actions now
  buy a Quality check against the level DC *on top of* the rung's clear, which can only add:
  success clears one further point, a critical success two, failure nothing. No new failure
  mode, so the wave-1 call survives. It only bites on Steady — Rally and Inspire already clear
  everything — which makes the push dial the better buy at rung 1, mirroring Move. Revisit if
  Mark meant the reach check all along, in which case Rally's roll dial should just be dropped.
- **A push's weight comes from the actions it spends, not from a dial.** `doPush` already spent
  every remaining action win or lose (wave 4's call), so `pushModifierFor(u, committed)` reads
  the commitment straight off that: three actions is +4, one is +0. No `spend` field on
  `PushAction`, and the push band is still bounded at one further Speed — the choice the doc
  poses is Stride (certain ground) against push (gamble, weighted by what you commit), not a
  slider inside the push.
- **`Battle.svelte`'s push HUD is now understated.** It calls `pushModifierFor(active)`, which
  defaults `committed` to 1, so the modifier it shows omits the commitment bonus the resolution
  applies. Left alone deliberately — `src/app/` is the next wave's, and the signature is
  back-compatible so the build stays clean.
- **A charge that finds nobody refunds the actions committed to the melee**, returning only the
  movement's cost. There is nothing to weight, so charging the fear-routed or the already-dead
  does not also burn the dials.

### Tests

120 before, 132 after. Twelve added under `actions buy weight, not repetition` in
`src/tests/battle.test.ts`, covering one attack an activation (including the shot and the
Blast), +2 per action on the roll and on the push check independently, the 0.50/0.60/0.80
wounds-a-turn table measured over all twenty faces of the d20, both dials refused where they
have nowhere to land, a three-action commitment on each of Fight, Shoot, Cast, Guard, Rally and
Withdraw, the Scatter-against-Fighting-retreat contrast, Move still buying ground with a Strike
affordable after it, and the Fight-2 troop's Strike/Press/Overrun trio.

Four existing tests changed, all in `the push band`, all for the same reason: the commitment
bonus now turns their scripted rolls into successes. Three of them (`failure stops at the
furthest affordable cell`, `critical failure stops at the fallback`, `mounted and
cavalry-charge grant a bonus`) were written against a bare `mod 17 vs DC 22`, so they now run
through a new `oneActionLeft` helper — two Guards, since `act()` refills the activation to three
actions and a test cannot simply assign `u.actions`. A fourth, `every action after the first
weights the push check`, is new and asserts the same roll failing on one action and landing on
three. No coverage was deleted.

### Rule questions for play

- Rally's roll dial is dead weight at rungs 2 and 3, which already clear everything. Should
  Inspire's ally clause be what the check buys instead?
- Guard and Withdraw can only spend on the push, so a grade-3 unit of either has nowhere to put
  a second or third action at all. Is standing there with two unspent actions the right feel,
  or should a top-grade Guard buy something?
- Overrun still inherits Press's +2 (a wave-1 call). Stacked with two committed actions that is
  +6 on the strike, which is the biggest single number a unit can put on a roll.

## Dials notes

Wave 5b. Guard gained a Defence dial, Withdraw was rebuilt as an opposed check and left the
ladders entirely, and both dial sets were surfaced in `Battle.svelte`. 132 tests before, 142
after.

### The `Spend` shape

```ts
interface Spend { roll: number; push: number; defence: number; distance: number }
type Dial = keyof Spend;                       // DIALS, in that order
interface SpendDials { extra: number; step: number; roll: boolean; push: boolean; defence: boolean; distance: boolean }
```

Two new fields rather than an overloaded `roll`, per the brief, and `SpendDials` gained the
matching booleans so the UI iterates `DIALS` and asks each offer which of them it takes. Guard
offers Defence and push; Withdraw offers the Escape check and distance; nothing offers all four.
`commit()` refuses every dial the offer does not carry, and any total past the actions left.

### Guard's Defence dial

`perform`'s guard case writes `eff.defence + spend.defence * ACTION_BONUS` straight into
`u.guard.defence`, so a three-action Shieldwall is +7 (the rung's own +3 plus +4) and a
three-action Brace is +6. It therefore flows through `defenceOf`'s existing "circumstance
bonuses never stack, the highest applies" max, which means a heavily committed Guard also
swallows any aura or Ward — correct, since they are the same kind of bonus. It lasts exactly as
long as the rung did: `begin()` clears `u.guard` when the unit next activates.

### Withdraw is no longer a ladder

Per Mark's mid-wave redesign. `LadderType` is now five entries and `Grades` five keys; Withdraw
follows Move's wave-4 precedent of living outside `availableActions`/`ActionOffer` entirely,
with its own `WithdrawOffer` on `Activation.withdraw` and its own `WithdrawAction`.

- **The check**: `escapeModifier(u) = u.stats.reflex - u.disorder`, plus `+2` per action on the
  roll dial, against `escapeDcFor(holder) = holder.stats.strike + 10` — the holder's own attack
  DC. One check per holder, resolved in deployment order, each with its own free strike, all
  before any movement.
- **A holder with no melee strike cannot hold.** `holdersOf` filters `stats.strike === null`, so
  no check is rolled against it and it takes no free strike. Otherwise its DC would be a flat 10
  and its "strike" a +0 roll, which is noise rather than a rule.
- **A critical failure against any one holder cancels the whole movement.** "You do not break
  contact" read as the unit not moving at all, not as staying in contact with that one enemy.
  Two holders, one crit failure, means the unit is pinned however well the other check went.
- **Removed from derivation**: `gradesFor` lost its `withdraw` line, `TACTIC_GRADE` lost
  `ambush` and `false-retreat` (both bumped Withdraw to 3), and `speedGrade`/`perceptionBand`
  were deleted because the withdraw grade was their only consumer. **`ambush` still drives scout
  deployment** through `canDeploy`, so it is not inert; **`false-retreat` now does nothing at
  all** — flag it for a new home or deletion.

### `no-retreat` is a hold on others

Mark's correction: it is not a restriction on its owner. A `no-retreat` holder follows a
withdrawal that was not a critical success — one free Move of its own Speed through `path.ts`'s
ordinary terrain costs, dealing no damage.

- **The follow resolves after the withdrawer has moved**, so the follower paths to a cell
  *touching wherever the withdrawal ended*, not toward where it was going. It takes the cheapest
  such cell, ties broken by notation. If no cell adjacent to the destination is inside one move,
  contact is not re-established — which is what makes the movement delta the deciding rule, and
  what the distance dial buys.
- **A `no-retreat` troop may follow more than one withdrawal in a round.** Nothing tracks a
  budget. In practice it is self-limiting: following the first withdrawer usually breaks contact
  with the second, and `follow` skips a holder it is already engaged with. Tunable if two
  enemies peeling off a single anchor reads wrong.
- A follower that is routed, rooted or has Speed 0 does not follow. Rooted is the deliberate
  one: a troop that dug in chose to hold ground.
- `Unit.noRetreat` is a third ad-hoc signal field beside `mounted`. **If a fourth is ever
  wanted, lift `signals` onto `Unit` wholesale** rather than adding another boolean.

### Reflex on `UnitStats`

`reflex: card.sheet?.reflex ?? saveBonus(l, p.reflex)`, with `RoleProfile` tiers infantry
`moderate` and cavalry `high` — cavalry is the nimbler of the two. **This is the only stat
`deriveStats` reads off the sheet directly**; every other sheeted stat arrives through
`card.overrides`, which the two importers write. Doing it this way avoided regenerating
`combatants.ts` and `official.ts` for one number, but it is an inconsistency worth closing next
time either importer is touched. `derivation()` gained a Reflex row in both branches, so
`Place.svelte`'s preview line cites it.

### Withdraw's target set

The free cell is a neighbour, as before. Committed distance opens up everything a `reachable()`
pass at `distance * speed` covers. Cells that break contact with every current holder win; when
none do, the rest are offered instead, so a cornered unit is never stuck (the old "Scatter is
always available" floor, kept). Sorted nearest-first, so a `WithdrawAction` with no `to` steps
one cell rather than sprinting to a corner. A routed unit out of contact still runs homeward
only, distance dial or not.

### The panel

- **The allocation is stored per rung**, plus one entry for the withdrawal, so the push dial can
  be offered only on the rung a reach check actually stands in front of. A single per-offer
  allocation would have had to silently drop the push points when the player pressed Go on a
  granted rung.
- **Allocations are trimmed on read** against the offer's current `extra` rather than tracked as
  actions drain, and cleared outright after any action. The panel can therefore never propose
  more than the unit still has.
- Each dial row reads what one action buys ("+2 to the attack roll", "+2 to the reach check",
  "+2 Defence", "one more Speed's worth (20 ft)") with the running sum on the right. Below it a
  row of chips reads the result: `Press +6 on the attack roll` · `Reach DC 24 · d20+15` ·
  `Defence +6` · `Escape Kobold Warriors: d20+14 vs DC 17` · `Runs up to 40 ft` ·
  `Costs 3 of 3 actions`.
- The Withdraw card sits between Move and the type row, open by default, listing one line per
  holder with its DC and the live modifier, and tagging a `no-retreat` holder as one that
  follows. Its target cells wash the board while the card is open — no conflict with the Move
  bands, which are empty whenever a unit is in contact — and a board click on one withdraws.
- **Wave 4's understated push HUD is fixed**: `pushModifierFor(active, act.actions)`, since
  `doPush` commits every action left.

### The screenshot

`docs/plans/battle-shots/wave5-dials.png`, hex, Line Infantry at c2 held by Kobold Warriors at
c3. The Withdraw card shows the Escape check at DC 17 against d20+14 with one action on distance
(`Runs up to 40 ft`, `Costs 2 of 3 actions`); the open Fight ladder shows all three rungs with
their dials, Press carrying two actions on the roll for `Press +6 on the attack roll` and
Overrun carrying one on the push for `Reach DC 24 · d20+15`. Harness: the wave-3 Playwright
recipe, with the battle state written straight into `battlefield.v3` rather than driven through
setup. The generator script was deleted before committing.

### Rule questions for play

- The Escape DC is the holder's attack DC unmodified — no bump for outflanking the withdrawer,
  no reduction for a weakened or disordered holder. Deliberately flat for now.
- Withdraw's two dials compete for the same actions, and against a dangerous holder the escape
  bonus is almost always the better buy. Watch whether distance ever gets picked outside a
  deliberate outrun of a `no-retreat` troop.
- Guard's Defence dial and its push dial compete the same way, and at grade 3 the push dial is
  closed, which is exactly the case the doc opened this wave to fix. At grade 1 a Brace with two
  actions on Defence (+6) beats reaching for Dig in (+3), so the push dial may be the dead one
  now. Measure before tuning.
- Rally's roll dial is still dead weight at rungs 2 and 3 (carried over from the last wave).

## Rungs as effects notes

Wave 6. A rung's own number and the action dials were two sources for the same thing and they
stacked: three actions on Press read +6. Every number now comes from committed actions, and
every rung carries an effect. 142 tests before, 147 after.

### The ceiling, and how it is asserted

The most a single activation can put on any roll is **+4** — two spare actions at
`ACTION_BONUS`. `src/tests/battle.test.ts`, `rungs carry effects, actions carry numbers` →
`never puts more than +4 on a roll, whatever the rung` walks it: Strike and Press at two
actions on the roll both land on `strike + 4`; Overrun with two on the push reads
`[will + 4, strike]`, so the reach is weighted and the strike behind it is bare; Withdraw is
`reflex + 4` and Rally `will − 1 + 4`. The shot and the Blast are already asserted at `+ 4` in
`lets every type absorb a full three-action commitment`.

The wounds table is back to **0.50 / 0.60 / 0.80** for one, two and three actions, measured
over all twenty faces. The same test now runs the table twice, once on Strike and once on
Press, which is what says the rung adds nothing — the old Press read 0.60 / 0.80 / 1.00 there.

### Fight

`FightEffect` is `{ disorderOnLoss, takeGround }`. Overrun is unchanged minus the +2.

**Press's disorder is an extra point, not the exchange's own.** `melee` already gave the side
that took more wounds 1 disorder, so "the loser of the exchange takes 1 disorder" would have
been a no-op read literally. Press therefore makes losing cost **2**, whichever side loses it —
symmetric risk, and it replaces "1 disorder if you miss" with something that also bites when
you hit and get hit harder. A drawn exchange still costs neither side.

`resolveStrike` now returns the wounds that **landed** rather than the wounds rolled, so the
exchange is decided after the defender's Guard has taken its cut.

### Guard

Two mid-wave corrections from Mark; the second is what is built.

`GuardEffect` is `{ blunt, braces, rooted }` — no number anywhere.

- **Defence is bought with actions, the base act included**: `guardDefence(cost + spend.defence)`
  is +2 / +4 / +6 for one, two and three actions. Guard's base act produces Defence the way
  Fight's produces an attack, so nothing double-counts. Measured 0.40 / 0.30 / 0.20 wounds an
  attack against the bare 0.50 — each action removes exactly a tenth, asserted over the twenty
  faces in `scales Guard +2, +4 and +6 Defence on one, two and three actions`.
- **The rung is orthogonal to the action count.** A Guard-1 troop may commit three actions to
  Brace for +6 and get no protection; a Guard-2 troop gets +6 *and* the crit downgrade. This
  also kills the dead-dial problem the last wave flagged, since Defence is now on offer at
  every rung including grade 3.
- **Dig in** blunts: `reduceWounds` caps the hit at one wound, so a critical lands as an
  ordinary hit. **Shieldwall** braces adjacent allies, which is worth `guardDefence(1)` — one
  source for the number, not a literal 2 on the rung.
- **The damage path has exactly one hook.** `reduceWounds(target, n)` sits inside `applyWounds`,
  so every source obeys it: melee, the counter-strike, a shot, a Blast, a withdrawal's free
  strike. Mark's second correction dropped Shieldwall's flat −1, so the hook only expresses the
  crit downgrade today; it is the one place a further reduction would go.

**Rooted stays on Dig in.** It is no longer a bare downside on the weaker rung: Brace at the
same three actions buys the same +6 Defence with no root, so rooted is what the crit protection
costs, and Brace-against-Dig-in is a live choice for a Guard-2 troop. It is also thematic and
it keeps `rooted` reachable at all — nothing else sets it.

**The stall Mark asked about is gone.** Two opposing shieldwalls could not hurt each other under
the flat −1; with Defence scaling alone a three-action Guard is 0.20 wounds an attack, hard but
far from absolute.

### `false-retreat` removed

Deleted from the `Tactic` union and from Slingers and Light Horse. Giving it a job would have
meant a bonus on the Escape check, which this wave's brief puts out of scope, and it has done
nothing at all since Withdraw left the ladders. **`docs/design.md` line 146 still documents it**
— left alone, since the docs were out of scope; flag for the next docs pass.

### `reflex` on `deriveStats` — skipped

`reflex: card.sheet?.reflex ?? saveBonus(...)` is still the one stat read straight off the sheet
rather than through `card.overrides`. Closing it means adding `reflex` to what both importers
emit and regenerating `combatants.ts` and `official.ts`, which the brief rules out. Unchanged
and still worth doing the next time either importer is touched.

### Tests changed

Nine existing tests, all in the two describes that read Guard's or Fight's numbers:

- The four reach-degree tests plus `takes a granted rung with no roll at all` compared
  `u.guard` against `{ defence, aura }`. `Unit.guard` is now `{ defence, rung }`, so they read
  the rung they landed on and the Defence one action buys.
- `puts each action after the first on the push check instead` compared Defence numbers to tell
  Brace from Dig in; it reads `guard.rung` now, which is what actually differs.
- `buys Defence on Guard` is renamed "counting the first" and expects 2 / 4 / 6 rather than
  2 / 4 / 6 arrived at as `rung + dial`.
- `lets a Fight-2 troop Strike for one action…` expected `11 + 2 + ACTION_BONUS` on Press.
- `Press adds +2 and costs a point of disorder when it misses` is rewritten as
  `Press adds nothing to the roll and costs the loser of the exchange a further disorder`.
- The wounds-table test gained the Press run.

Five added, all in `rungs carry effects, actions carry numbers`: the +4 ceiling, Overrun taking
ground (the old assertion only looked for the word "overruns" in the log, which the verb alone
satisfies), the Guard Defence curve, Dig in blunting a critical and nothing else, and
Shieldwall's aura reaching one cell and no further. No coverage was deleted.

### The panel

`totals()` no longer adds a rung's own number to anything: the roll chip is `+${sp.roll * step}`
and the Defence chip is `guardDefence(offer.cost + sp.defence)`. The rung blurbs come straight
off `Rung.detail`, so they followed the engine. The status line reads
`dig in +6 Defence` rather than `guarding +6`.

### The screenshot

`docs/plans/battle-shots/wave6-effects.png`, hex, Line Infantry at c2 held by Kobold Warriors at
c3 with Dwarf Battalion beside it at b2. Left: the Fight ladder with two actions on Press —
**`Press +4 on the attack roll` · `Costs 3 of 3 actions`**, where the old code read +6. Right:
the same panel with Guard open, Brace at `Defence +2`, Dig in at `Defence +6` with the crit
downgrade, Shieldwall reading "Adjacent allies count as braced". One image, composed in the
browser from the two panel states, since the panel opens one ladder at a time. Harness in the
session scratchpad, nothing added to the repo.

### Rule questions for play

- Press doubles the loser's disorder either way. Against a weaker enemy that is nearly free;
  against a stronger one it is the riskiest rung in the game. Watch whether it reads as a
  gamble or as a default.
- Brace at three actions (+6, no root) against Dig in at three (+6, crit downgrade, rooted) is
  the new live choice. If rooted never gets picked around, drop it and let grade access be the
  whole price.
- Shieldwall's aura is the only thing rung 3 gives, and it needs an ally standing next to it. A
  lone grade-3 troop gets nothing rung 1 does not already give it.
- Rally's roll dial is still dead weight at rungs 2 and 3 (carried from two waves back).

## Rally notes

Wave 7. Rally is now a Quality check against the rout DC; the four degrees decide how much
clears (all / 2 / 1 / nothing-and-1), and the rungs carry scope instead of amount (self /
+1 adjacent ally / +every friendly within 2). 147 tests before, 151 after.

### `routDcFor`, reconstructed

The `routDc` helper the brief asked for did not exist — grepped clean, confirming the brief's
note that it was removed as a proto alias. Rebuilt in `battle.ts` next to `escapeDcFor` and
`pushDcFor`: the highest level among enemies within `BANDS[grid].close`, or across every enemy
on the field if none are close. `Math.max(0, ...pool.map(level))` mirrors `wallDc`'s existing
pattern and reads DC 14 (`levelDc(0)`) if somehow no enemy remains at all — untested, since it
never comes up while the battle is still running.

### Both dials, and how it was verified

The roll dial weights the self check (`reachModifier(u) + spend.roll * ACTION_BONUS`) against
`routDcFor`, unconditionally, on every rung — Steady, Rally and Inspire run the identical
check, so there is no rung where it goes quiet. The push dial needed no new code at all: it is
`doRung`'s existing reach-for-a-higher-rung machinery, which every ladder already gets for free
once a rung's own number stops depending on which rung was granted. Verified two ways: a new
test drives the same scripted roll at zero and at +4 (`spend.roll: 2`) across all three rungs of
a grade-3 troop and gets a different clear amount every time — under the old code rungs 2 and 3
would have cleared everything either way, so this is the regression test that would have failed
before this wave. Separately, the screenshot shows both dial rows live at once on one grade-1
troop's Rally offer: the roll dial bumped on Steady, the push dial bumped on Rally (rung 2, a
reach).

### Scope is unconditional on the self-check's degree

`eff.scope === 'adjacent'` and `'nearby'` clear their target(s) by a flat 1 regardless of what
the acting unit's own Quality check rolled — even a critical failure still passes the scope's
clear to allies. This reads as intentional rather than an oversight: the doc frames the two
dials as orthogonal ("the roll dial pushes toward clearing 2 instead of 1, or all instead of 2,
and the push dial buys scope"), and gating scope on the self-check's degree would recouple them.
Flag if Mark meant a botched Rally to fail its allies too — that would need the scope clear
moved inside `succeeded(c.degree)`.

### The rough cost of a full commitment

Design's flagged risk: how often does spending the whole activation on Rally still clear only
one point? Worked from the check itself, using the screenshot's own troop rather than a
simulation. Line Infantry (Will 13) at 2 disorder, full three-action commitment (`weight = +4`):
modifier `13 − 2 + 4 = 15` against a same-level enemy's rout DC 22 needs a 7 to succeed. That is
a failure (clears 1) on 5 of 20 faces — 25% — plus a further 5% (the natural 1) that clears
nothing and adds a point; success (clears 2) covers exactly half the die, and a critical success
the remaining 20%. Because `reachModifier` is `will − disorder`, the unit's own disorder
subtracts from that same roll, so a more-disordered troop needs a higher roll still — the unit
in the most trouble is both the one that most needs Rally and the one worst at rolling it. That
compounding is not a bug; it is what makes disorder a tempo weapon rather than a self-correcting
inconvenience, but it is worth watching in play in case it reads as a spiral rather than a
tension.

### The panel

`totals()`'s rally line now reads `routDcFor(b, u)` instead of `levelDc(u.level)` — the only
change there, since the dial-weighted check line already existed. Added one block, gated on
`openOffer.type === 'rally'`, directly under the offer's own detail line: the check's DC and
base modifier plus the four-degree breakdown in one `.gamble` paragraph, the same visual
register Fight/Shoot/Cast already use for their reach line. Rung `detail` text is scope-only
now ("This unit only." / "This unit, and one adjacent ally clears 1." / "This unit, and every
friendly unit within 2 clears 1."), matching every other rung description in the panel.

### Tests changed

Two of 147 were invalidated by the reordering (the check now runs before any clearing, where
the old rung-clears-then-checks order ran the other way):

- `lets every type absorb a full three-action commitment`'s Rally block asserted a fixed clear
  (rung's own 1, plus an on-top success). Rewritten to the same natural roll landing on failure
  unweighted and success once weighted — the roll dial changing the outcome, not just the total.
- `never puts more than +4 on a roll, whatever the rung` asserted the check's modifier against
  disorder *after* Steady's old pre-clear. Since nothing clears before the check runs now, the
  expected modifier reads off the unmodified disorder instead (`WILL - 2 + 4`, not `WILL - 1 + 4`).

Four added, in a new `Rally: the roll carries the amount, the rung carries the scope` describe:
the four degrees against a fixed roll each; the roll-dial-changes-the-outcome regression across
all three rungs; `routDcFor` reading the close Kobolds then falling back to the field once they
step out of band; and Rally's one-ally reach against Inspire's within-2 automatic sweep, with a
control ally at distance 3 that neither rung ever touches. No coverage was deleted.

### The screenshot

`docs/plans/battle-shots/wave7-rally.png`, hex, Line Infantry (Will 13, rally grade 1 — the
exact population the brief calls out as previously dead weight) at c2, disordered 2/3, held in
contact by Kobold Warriors at c3 (rout DC 18) with Dwarf Battalion adjacent at d2. Move and
Withdraw collapsed so the Rally ladder sits complete: the check-and-degrees line, Steady free
with its roll dial bumped to `Quality check d20+13 vs DC 18`, Rally flagged as a reach with its
push dial bumped to `Reach DC 22 · d20+13` and Dwarf Battalion selected as the one-ally target,
Inspire locked below. Harness in the session scratchpad (`wave7-shot.mjs`), nothing added to
the repo; state written straight into `battlefield.v3` via `page.evaluate` importing
`/src/engine/index.ts` directly, same recipe as wave 6.

### Rule questions for play

- A unit's own disorder penalises the very check meant to clear it, so a troop already deep in
  trouble rolls worse at fixing it. Intentional per the design's "expensive when already
  suppressed" framing for reaching, but Rally has no granted-rung floor to fall back to the way
  reaching does — a bad roll here can net *worse* than doing nothing. Watch whether it ever
  reads as punishing rather than tense.
- Scope clearing regardless of the self-check's degree (see above) means the push dial is
  strictly the safer buy at every rung — it never whiffs the way the roll dial can. Watch
  whether the roll dial gets picked at all once players notice this, which would just relocate
  the "dead dial" problem this wave was meant to close.

### Blocked-move feedback

A rooted piece dragged nowhere and the board said nothing: `moveReach` returns an empty map for
a root, Speed 0, a spent last action or a boxed-in square, and the Move card then read "0 cells
reachable" four times with no reason, exactly the way contact used to before `holders`. Battle's
`stuck` derivation names the reason once and both surfaces read it — a tag on the Move head with
a sentence in the card, and a HUD badge raised by a drag that finds no legal cell. Judgment call:
the drag still runs and the token still snaps back. Refusing the drag outright would be quieter
but would also teach nothing, and the snap-back is the gesture the answer hangs off.

The answer is `no.webp` (Mark's, matching the action-icon set) drawn in the cell the drag has
pulled to (`OverlayLayer.setBarred`), never on the piece's own square — an X under the token
would cover the thing it is about — plus the one-line reason in the drag HUD. It is the first
sprite `OverlayLayer` owns: `redraw` throws its Graphics away on every pointer move, so the
sprite is held across the clear and re-added rather than reloaded. `ActionIcon` gained `'no'`,
which names no action at all — the odd member of a union that otherwise maps to ladders. Contact is in `stuck` too, so a held unit dragged anywhere but
a Withdraw target gets the same X.

**A piece with nowhere to go does not lift.** `BoardView.setAnchored(id)` keeps the token on its
square while the drag still tracks and still emits `drag`/`drop`, so the X follows the pointer
and the piece never mimes a move it cannot make. It anchors only when no drop could land at all
— `stuck`, plus no charge and no Withdraw target — since a held unit still drags to its escape
cells and a rooted one might still charge.

**The X also marks ground an ordinary drag cannot take.** Past every action, walled off,
impassable, or an ally standing there: the arrow keeps the last legal cell it traced and the X
sits under the pointer, so the refusal names the ground refused rather than the whole gesture.
The piece's own square is exempt, and enemies are the `dragTarget` prop's business, not the
overlay's.

**The reason does not go in the combat log.** Mark asked for that; `log` lives on `BattleState`
(`types.ts:285`) and Undo rewinds whole states, so a refused gesture in the log would either
enter the undo history or be silently rewound by it. The log is what happened in the battle, and
a drag that took no action did not happen. If the wording wants to live in the left column
instead of the corner, it needs a UI-only notice list in `Battle.svelte`, not `state.log`.

### The root no longer outlives its Guard

Dig in set `rooted = 2`, which `finish` walked down over two activations: the rest of the
digging one and the whole next one. `begin` clears `u.guard`, so the Defence the root paid for
was already gone by the time the second activation started — the unit spent a whole turn nailed
down with nothing to show for it, which is Mark's call and plainly right. Now `rooted = 1`: the
root ends with the activation that bought it, while the +Defence still stands through the
enemy's turn, the way every Guard rung does.

This makes Dig in cheaper against Brace at the same action count, so the live choice the last
wave built (Brace +6 no root, against Dig in +6 with the crit downgrade) tilts toward Dig in for
any Guard-2 troop that was going to stand still anyway. Watch whether Brace has a reason to
exist at three actions; if not, the crit downgrade is what needs a price, not movement.

### A drag into a piece is a melee

Dragging the active token onto an enemy used to fall through to the general aim popup, which
groups every verb that reaches that target — so a drag onto a distant enemy opened Shoot and
drew its arc. A drag is the unit *going there*, so it can only ever mean melee. `onBoardDrop`
now reads an enemy cell itself: the charge that closes on it if one stands, otherwise the Fight
already in contact (`aimAt(..., 'fight')`), and nothing at all when neither does. Shooting is
now reachable only by touching a target or taking Shoot off the ring — Mark's call, and it also
makes the drag's meaning single.

The target wears the answer while the drag is live: crossed swords (`attack`) when the drop can
reach a melee, `no` when it cannot. Judgment call: the mark rides the piece as a prop rather
than going through `OverlayLayer.setBarred`, because the overlay draws under `TokenLayer` and an
X on an occupied cell would sit behind the token it is about. `blockedCell` keeps the empty
ground it already had.

Second judgment call: hovering an enemy leaves the drag trace where it stalled instead of
clearing it, so the arrow still says how far the drag did get while the badge says the piece is
out of reach. Only a charge redraws the route, and it draws it to the approach cell.

The "spend the move, then act to attack" case is already the charge: `doCharge` is the movement
plus one action for the melee, and `chargeTargets` only offers what the action count affords. A
unit in contact needs no ground crossed, which is why the fallback is Fight rather than a
synthesised move-then-fight.

## Rules-document notes

`public/rules.html` was rewritten against the engine as it stands (five ladders, grades and
reaches, the four dials, disorder against Quality, the hexagon). Writing it turned up four
places where the engine and its own presentation disagree, or where a rule has quietly gone
inert. None is a bug worth a wave on its own; each is a decision waiting to be made.

- **Weakened does not actually shrink shooting range.** `reachOf` drops a Weakened unit's band
  by one and `Battle.svelte` prints that on the unit card, but nothing reads it: the band a shot
  can carry comes from the Shoot rung, and the granted rung comes from `shootGrade`, which
  consults `grades.shoot` and the crewed engine and never the wound count. Either wounds should
  cap the Shoot grade or `reachOf` should go. The rules text says only "−2 to Strike and Volley",
  which is what the engine does.
- **Broken carries nothing.** At 3 wounds `isBroken` sets a label in the log and is read nowhere
  else. Under the old rules it stopped an Advance and forced a rout check every round. Disorder
  does the morale work now, so the question is whether the third wound should cost anything of
  its own or stay a warning light. The rules text describes it as the latter.
- **Perception is dead.** `deriveStats` fills it and `Place.svelte` shows it, but the alternating
  activation order removed the only rule that read it. Keep it as sheet colour or drop it from
  `UnitStats`.
- **`UnitCard.pace` is dead wherever a sheet exists.** `squaresPerAction` reads `sheet.speed`
  and only falls back to `pace` when there is no sheet, so Troll Marauders' `pace: true` against
  a 30 ft Speed resolves to one cell an action. The importer should stop writing the field for
  sheeted cards, or `paceOf` should say which one wins.

`docs/design.md` was then deleted outright — see the two sections at the end of this file for
what came out of it. `README.md`, `CLAUDE.md`, `docs/adapter-contract.md` and `docs/pixi-board.md` were
brought in line, and `rules.html` is now the only document that states a rule.

### Open rule questions, carried over from `docs/design.md`

`docs/design.md` is gone: its rules were superseded, and what survived went into
`public/rules.html` — the purpose, the principles, the lineage and the kingdom's own two
aftermath checks. These are the questions it left open that are still open. Two of its seven
are settled and dropped: a unit may not move diagonally, because the board is hexes and there is
no diagonal; and Pace is a Speed threshold, not a tag, though the dead `UnitCard.pace` field
above is the loose end that leaves.

- Whether shooting should be limited per battle, the way Kingmaker's five shots are, to reward
  closing. Nothing counts ammunition today.
- Whether a split army's halves should rejoin at average wounds, or whether splitting should
  cost upkeep so it is a real trade rather than free.
- Whether height should also shorten movement downhill, or only charge for the climb.
- Whether a commander, when commanders arrive, grants a free action, a rung granted outright,
  or a once-per-battle bonus. The old answer — a second reaction — died with reactions.
- Whether the last standing unit of a side at 3 wounds should rout on its own at the end of the
  round. This is the same question as "Broken carries nothing" above, asked from the other end.

### Playtest plan, carried over from `docs/design.md`

Four paper battles, each finishing inside six rounds and producing a result a GM accepts:

1. The worked battle in `public/rules.html`, which is a real engine transcript and should
   reproduce exactly on its seed.
2. An even three against three at equal level on a hills board, with two split units.
3. A river crossing with two fords, through swamp.
4. A level-4 garrison behind seven wall segments against a level-8 attacker with a catapult.

Every DC used must exist on a troop in `data/troops/`.

## Shaken and routed notes — 2026-08-29

Disorder used to end at Quality: reaching it routed the unit outright, and since Rally is the
only thing that clears disorder and a routed unit is offered no ladder at all, a unit that
routed could never bring itself back. Troll Marauders (Quality 2) hit that wall in two bad
exchanges and were effectively removed from play with actions still on the clock. Morale now
runs one point further and splits in two:

- **Shaken**, at `disorder === quality`. Rally or withdraw, nothing else. Still counts as
  standing, holds its hex, does not run homeward, does not leave at its own edge.
- **Routed**, at `disorder > quality`. The withdrawal alone, homeward only, leaves the field at
  its edge, and no longer standing. Disorder caps at `quality + 1`.

`isBroken` was already the wound band (wounds >= 3), so the morale band is `isShaken`. The name
comes off the lineage row in `rules.html`, which already called the old two states shaken and
routed.

### Judgment calls

- **A shaken unit gets Rally and nothing else** — not Guard as well, and not the full menu.
  Guard would let a shaken unit hunker and stall; the point of the band is that reforming costs
  the whole activation. Asked and confirmed with the user before writing it.
- **Shaken does not run homeward.** The homeward restriction and the rout arrow now mark the
  top band alone, so the arrow appearing means "this one is leaving" rather than "this one is
  in trouble". The colourless flag marks shaken, so the two bands still read apart on the board.
- **Neither band may Stride.** `moveReach` and `pushReach` never checked the rout at all, so a
  routed unit could stride in any direction while `withdrawTargets` sent its *withdrawal*
  homeward — the rules said "runs for its own edge and nowhere else" and the engine did not
  enforce it. Both are now closed to a shaken unit, which makes the withdrawal the only way
  either band leaves a cell. This was a live bug, not a consequence of the split.
- **Shaken counts as standing**, so a side reduced to shaken units has not lost and the
  half-army check still disorders them. Routed does not count, which is what still ends a
  battle.
- **A `no-retreat` holder that is shaken no longer gives chase.** It could not otherwise act;
  letting it follow would have been the one thing a shaken unit does off its own turn.
- Disorder caps at `quality + 1` rather than running unbounded, so a routed unit cannot be
  driven deeper and an ally's Rally always has a reachable ledge to pull it back to.

### The worked battle in `rules.html` is now hand-written past round 3

The transcript used to end in round 3, when the trolls took their second disorder and routed.
Under the split they are only shaken there, still standing, so the battle runs on. Rounds 4-6
are written by hand to show the recovery — the trolls spend a whole activation rallying back to
steady, close, and press the infantry into a rout of its own — and the attacker now loses.
**These rounds are not verified engine output.** The playtest plan below says the worked battle
should reproduce exactly on its seed; that is now false for rounds 4-6 and should be the first
thing replayed against the engine.

### Rule questions for play

- Whether a shaken unit should be able to Guard after all. It cannot brace while it reforms,
  which makes a shaken unit in contact very soft — it eats a full exchange at -Quality on its
  Defence with no way to raise it.
- Whether an ally's Rally should be able to lift a unit out of the rout band at all, or whether
  the rout should be one-way and only the shaken band recoverable. Today Rally and Inspire both
  reach a routed unit, which is the only thing that makes the top band survivable.
- Whether a shaken unit should be forced to withdraw when it has no Rally worth making, rather
  than being allowed to stand still and do nothing.

### Rally availability, said plainly — 2026-08-29

The band split already gave Rally to a shaken unit and withheld it from a routed one, but the
Rally subsection of section 9 never said who may take the act — a player looking up "can I
rally?" read only the check and the table. It now opens with the rule: every unit that is not
routed may Rally, and the rout takes away only the unit's own — an ally's Rally and Inspire
still reach a routed unit, which is the sole way back from the top band.

Two errors fixed with it, both introduced by the split itself:

- Section 2 read "the disorder it absorbs before it breaks". `isBroken` is the 3-wound band, so
  "breaks" pointed at the wrong track. Now "before it is shaken".
- The worked battle's closing paragraph said "fail the check twice and you are running for your
  own edge". Wrong: a plain Rally *failure* still clears 1. Only a critical failure adds a
  point. A shaken unit that rallies recovers on every degree but one.

### Rule question for play

- Rally may be too forgiving now that it is the shaken band's exit. Three of four degrees clear
  at least a point, so a shaken unit that spends an activation on the check is back in the fight
  unless it critically fails. The rout is then reachable almost only through combat disorder
  arriving faster than the unit can spend activations rallying. If the top band turns out to be
  unreachable in play, the lever is the failure row — make a plain failure clear nothing rather
  than 1, so the check can be lost without being fumbled.

### Fortitude stays imported — 2026-08-30

Decision (Mark): keep `fortitude` on `UnitStats` and every troop sheet even though nothing in
the engine reads it yet. `battle-mechanics.md`'s Guard/Withdraw wave already flagged it as
imported-but-unused, with the door left open for typed attacks (a Blast against Reflex, Fear
against Will); Cast is the likely home for a Fortitude-keyed effect (a poison or exhaustion
spell forcing the save), so it stays on the sheet rather than getting pruned as dead data.

`rules.html`'s "Numbers off the sheet" table (section 2) never got a Fortitude row when this was
decided — added now, next to Reflex, worded the same way as the existing dead-Perception note.
Also noted in passing: the decision's own wording says "on `UnitStats`", but `fortitude` only
ever landed on `TroopSheet` (`cards.ts:34`) — `UnitStats` (`cards.ts:18`) has `will`, `reflex`,
`perception` but no `fortitude`, and `deriveStats` doesn't carry it across. Not fixed here since
nothing reads it yet either way; worth closing when Cast actually grows a Fortitude-keyed effect.

### Range bands split from Shoot's grade — 2026-08-30

Decision (Mark): the three-band, grade-cumulative Shoot ladder is replaced with four purely
geometric bands — short (1-2), medium (3-4), long (5-6), extreme (7-8) — decoupled from a
troop's own reach entirely. Board radius is 4, so 8 is the farthest two hexes are ever apart;
extreme's own ceiling already reaches it, and beyond (9+) now never occurs on this board.

- **Reach becomes "effective range"**: one of the four bands, still one fact per weapon, still
  on the card. It no longer sets Shoot's grade — it anchors where Loose is free.
- **Volley and Barrage swing off that anchor, not up a fixed ladder**: one band either
  direction on a plain reach success, two on a crit, same single-roll mechanic every other
  ladder already used (`reachFor` in `battle.ts`, untouched). A short-reach troop's Barrage can
  reach as far as long; extreme takes a medium-or-longer reach pushing in, or a siege engine's
  own reach, which starts there for free.
- **Shoot's grade is uniformly 1** for every troop with an ordinary Salvo (`gradesFor` in
  `ladders.ts`) — effective range moved the "how far without a roll" question onto Reach, so
  grade no longer needs to encode it. `covering-fire` (hand-authored only; no imported troop
  carries it) is the one thing that still raises it, to 3.
- **A crewed engine still gets the full grade-3 spread free**, reflecting a gun crew working
  its whole engineered range without the gamble a troop's own reach check carries — `reach:
  'extreme'` is not exposed to any troop, only to `SiegeEngineCard`s, so extreme is siege-only
  by construction, not by a special-cased exclusion.
- **Barrage no longer ignores cover.** The user's call: cover shouldn't be a property of a
  particular range: "if they want to stack bonuses, they can do that by spending additional
  actions" — the existing weight dial (+2 per spare action, on the roll or on the push check)
  already does that job without a rung needing its own cover-piercing flag.
- Every import script that classifies a Salvo/engine range from raw feet (`troop-signals.mjs`,
  `import-troops.mjs`, `import-engines.mjs`) now caps a troop's own derivation at long — only
  `import-engines.mjs` can output `extreme`.

### Worked battle removed from `rules.html` — 2026-08-30

Decision (Mark): pulled the "Worked round" section (Line Infantry vs. Kobold Warriors, six
rounds) out of `rules.html` entirely rather than patch it. It narrated the pre-rework mechanic
verbatim — Shoot grade 2 for Line Infantry (now always 1), distance 4 called "the extreme band"
(now medium), reach/DC arithmetic keyed to the old close/long/extreme thresholds and the
grade-implies-reach coupling this rework removed — and the rules are still moving, so a hand-
patched worked example would likely go stale again before the next pass settles. Bring it back
once the range-band and Shoot rework stops changing under it; regenerate it against the real
engine rather than hand-simulating six rounds, so the numbers are provably right rather than
plausible.

The board figure in section 3 (the colored hex rings from c3) has a related but separate gap:
it still shows three band colors for what is now four bands, and needs a fourth ring computed
and drawn — that wants a small script rather than hand-edited SVG coordinates, and isn't tied to
the worked example's removal.

### Shoot's rungs renamed: Loose/Volley/Barrage → Fire/Aim/Snipe — 2026-08-30

Decision (Mark): now that Reach anchors Loose for free and Volley/Barrage merely swing off it
either direction (see "Range bands split from Shoot's grade", above), the old names read as
if they described a fixed far ladder — "Volley" and "Barrage" both evoke a farther, heavier
shot, not a swing that can land closer just as easily. "Volley" also already names the Shoot
attack stat (`stats.volley`, parallel to Strike), so the rung and the stat shared a name by
coincidence — renaming the rung removes that collision as a side effect.

- **New names, same three rungs**: `fire` (rung 1, free, your effective range) / `aim` (rung 2,
  one band off, either direction) / `snipe` (rung 3, two bands off, either direction, +2 to the
  reach DC). `RungId`, the `LADDERS.shoot` entries, and every comment/test naming a rung in
  `ladders.ts`, `battle.ts`, `battle.test.ts` and `offers.test.ts` were updated; the `volley`
  stat, `stats.volley`, `STAT_LABEL`, and the "Volley Gun" engine are untouched — that name
  refers to the attack bonus, not the rung, and stays.
- **`public/rules.html` picked up two stale leftovers from the range-band split while it was
  being swept for the rename**: the Terrain table and the quick-reference Forest row both still
  said cover doesn't apply "unless … loose a Barrage" — the old rule, already removed from
  `defenceOf` (`shootAt` never passes `ignoresCover`), but never cleared from these two rows.
  Dropped the exception; forest cover now only turns off from height, per the code.
- **Added a paragraph to the top of section 6** stating plainly that a spare action buys one of
  two things — a different rung (an effect) or weight on the roll (a bonus) — since the
  mechanic already existed (the Weight section's Roll/Push split) but wasn't named as a choice
  until a unit was already deep in "Reaching above your grade."

### Cast rework: six trees, four traditions, a caster's own push pool — 2026-08-30

Decision (Mark), reached over a long design conversation and written straight into
`public/rules.html` section 11 (no engine work yet — `src/engine/ladders.ts`'s `CastEffect`,
`SPELLS` and `LADDERS.cast` still implement the old model, so the doc and the engine now
disagree the same way the "Rules-document notes" gaps above already do). Cast stops being a
grade-gated three-rung ladder like Shoot/Fight/Guard/Rally. The base cast is free for every
caster — no roll, a fixed range, Tier 1 of whichever tree is chosen. Pushing (one of range,
duration, or effect — never more than one per cast) risks a **cast roll** (the existing reach
formula verbatim: Will − disorder vs. level DC, +2 at Tier 3, falls back to the free base on a
failure, the act never lost to the dice). A landed cast then resolves through six trees — Blast,
Healing, Controlling, and three buffs (Offense, Defense, Movement) — each its own three-tier
progression where a tier is a different kind of thing, not a bigger number. Morale was proposed
and dropped: its two jobs (clearing disorder, a check bonus) already belonged to Healing and the
buffs.

A caster also draws on a second action pool ordinary actions can't touch — level ÷ 5, rounded
down, spendable only on a Cast push, refreshing every activation. Cast's own grade retires
entirely with this: the pool is the one mechanic gating how far a push goes, not a grade and a
pool doing overlapping jobs.

Every caster belongs to one of four traditions (arcane, divine, occult, primal), and a tradition
caps the highest tier it may ever reach per tree — 0 meaning no access. The grid (`rules.html`
section 11) was hand-tuned to sum to 10 per tradition, a budget check rather than a claim of
equal power.

- **Blast and Controlling are the only trees needing an effect roll** — the other five apply
  automatically once the cast lands, since an ally has nothing to resist. Both are now the
  *target's* save, not the caster's attack roll, mirroring an Escape check's shape: Blast asks
  Reflex, Controlling asks Will, both against the caster's own level DC. This replaces Blast's
  old caster-rolls-vs-Defence resolution outright.
- **The five old named spells (Blast, Ward, Mend, Bless, Compel) are retired.** Every caster
  works through the six trees, not a spell menu. Lineage, not mechanic: Blast → the Blast tree,
  Mend → Healing, Ward → Defense, Compel → Controlling (its Tier 3, word for word), Bless → the
  Offense buff in name only — its old effect (a free rung-climb, no reach check) has no home in
  the new trees and does not survive. The three tactics that used to grant one of these spells to
  a non-caster (`battlefield-medicine`, `defend-allies`, `demoralize`) now grant a fixed,
  untiered effect instead: Healing's Tier 2, Defense's Tier 1, and Controlling's Tier 3
  respectively. Flagged as an approximate remap, not a careful one — nobody checked whether those
  three specific tiers are the right power level for a non-caster's one free trick.
- **Fortitude still has no tree.** Blast landed on Reflex and Controlling on Will, which was the
  natural read for a compulsion effect ("may not reach above its grade") but leaves Fortitude —
  kept on the sheet earlier today for exactly this kind of future use — still without one. A
  debuff tree (poison/exhaustion/disease — Fortitude's classic flavor) was raised and
  deliberately not built: "going too far" for one session, per the user.
- **Offense's Tier 3 went through two drafts.** First "a second attack" — rejected on sight,
  since it breaks this system's own stated principle that a spare action is never a second attack
  (Design notes, principle 4). Second, "the buffed unit's next hit lands as a critical" — also
  rejected, because this engine's wound model tops out at 2 wounds on a critical and Tier 2's own
  "+1 damage" already gets an ordinary hit there; there was no higher number left for a crit to
  reach. Landed on: if the buffed unit's next act is a Fight, the target does not strike back.
  Deliberately not also added to the Fight ladder itself when the same idea came up there a
  second time — the user's own call, on the principle that a twist repeated across two trees
  makes both of them less distinct.
- **A raw-data finding, not yet acted on**: the local `data/troops/*.json` files carry a genuine
  `spellcastingEntry` item per caster (`fey-host.json`, `veteran-war-priests.json`,
  `pixi-swarm.json` — 3 of the 38 local troops), each with its own `system.spelldc = { dc,
  value }`, entirely separate from Battle DC and from Will/Reflex/Fortitude. The entry's *name*
  already states the tradition in plain text ("Primal Innate Spells", "Divine Prepared Spells",
  "Cleric Domain Spells") — a real answer to where a troop's tradition should come from, found
  in the source data rather than needing a new hand-authored field or a derived signal.
  `scripts/import-troops.mjs` currently reads none of this (`spellAttack`, `spellDC`, or the
  entry name) — it only ever pulls `battleDc`, `salvoDc`, and the three ordinary saves. Veteran
  War Priests carries *two* spellcasting entries (Domain DC 32/atk 24, Prepared DC 35/atk 27)
  with no rule yet for which one an importer should prefer.

Decision (Mark), same day: yes, use the real numbers. `rules.html` now reads spell attack for
the caster's own cast-push roll (replacing Will, same as every other reach's formula otherwise)
and spell DC for what a target resists on Blast's and Controlling's effect rolls (replacing the
generic level-DC table there, the same way an Escape check already resists a holder's own attack
DC rather than a table value). Not yet built: `TroopSheet` (`cards.ts:28`) has no `spellAttack`/
`spellDc` fields, and `import-troops.mjs` reads neither `spellAttack` nor `spellDC` off
`spellcastingEntry.system.spelldc`, nor the entry's name for tradition — all three still need
doing before any of section 11 can run. Two loose ends for whoever picks this up: Veteran War
Priests' two spellcasting entries (Domain DC 32/atk 24, Prepared DC 35/atk 27) need a rule for
which one an importer keeps, and a caster with no sheet at all (the level-table fallback path)
needs its own formula for both numbers, the way Will/Reflex/Perception already have one.

### Cast range: a base band per tree — 2026-08-30

The six-trees writeup above left "a fixed range read off the caster" (section 11) undefined —
no tree ever got an actual band. Decision (Mark): Healing is Engaged, the three buffs (Offense,
Defense, Movement) are short, Controlling is medium, Blast is long. `rules.html`'s Cast · range
row in "The six trees" table now names all four; no new range word was needed, since "engaged"
is already the distance-1 band from section 3's own table (the same one that gates Fight and
blocks Shoot), not a fresh "touch" category.

Checked against the corpus before settling on long for Blast: of the 27 official troops with a
Salvo, reach splits 14 short / 11 medium / 2 long / 0 extreme. Medium is the second-most-common
*native* reach, so anchoring Blast there barely read as magical; long is the rare tier, so an
unrolled Blast reaching it is a genuine edge over ordinary shooting, and it keeps push-to-Extreme
symmetric with the siege-engine-only band. Controlling went to medium rather than short so it
doesn't clump with the three buffs, landing a four-band spread (Engaged/short/medium/long) with
a legible escalation: support closest, buffs a step out, control further, the damage tree
farthest.

One asymmetry flagged and left as-is: Blast's own Tier 3 range push (two bands from its long
base) overflows past Extreme, the board's own ceiling — Tier 2 already gets it there, so Tier 3's
range option buys nothing further on Blast specifically. Folded into the existing "legal, buys
nothing" clause in "The six trees" rather than treated as a special case, since the rules already
carve out that shape for a duration push on a Tier-1 Blast or either push on an ally tree with no
effect roll to bonus. Controlling's own two-band push (medium → extreme) doesn't hit this, since
medium sits one band further back from the ceiling than long does.

### Cast rework lands in the engine — 2026-08-30

`src/engine/battle.ts`, `cards.ts`, `types.ts` and a new `magic.ts` now implement section 11 as
written, closing the doc/engine gap the "Cast rework" entry above flagged. `SpellId`/`SPELLS`/
`spellsFor`/`u.spells` are gone; a caster now carries `tradition`, `trees` (every tree its
tradition or a tactic grants, Tier 1 included) and `castPool` (level ÷ 5, refreshed every
activation, its own budget alongside — never inside — the ordinary three actions). Cast keeps
its slot in `LadderType` so the existing offer/`ActionOffer`/`RungOption` menu machinery still
carries it (one row per tree, same as one spell per row before), but `Grades` dropped `cast`
entirely — every tree's Tier 1 is free the moment it's offered, gated only by
`TRADITION_TIERS`, not a per-troop grade. `reachFor`'s existing four-degree algorithm (crit
climbs a tier, failure falls back to Tier 1, critical failure adds 1 disorder) turned out to
fit Cast's own reach rule — "two rungs above is locked" everywhere else, but Cast may reach for
Tier 3 directly — without changes, once `gradeOf` reads 1 for cast and `reachDcFor` reads
`castRungOf`'s own +2-at-Tier-3 instead of a ladder's rung. `RungAction` grew an `axis?:
CastAxis` field (range/duration/effect, defaulting to `'effect'`) and `Spend`/`SpendDials` grew
a `pool` dial, validated against `u.castPool` rather than `u.actions` in `commit`.

Retired outright, per the rules' own "does not survive" note: the old Bless spell and the
`blessed` flag (free rung-climb, no reach check) — nothing in the six trees replaces it, so it
is simply gone, not remapped.

**What plays exactly as written:** tradition gating (0 means no access, capped tiers above
that); each tree's own base range band and a range push extending it (target lists in the menu
are an optimistic superset — the real band is re-checked at resolution and logs "cannot carry"
on a miss, the same pattern `perform`'s own Shoot case already used for "falls short"); the
caster's pool stacking with ordinary push actions on the same reach roll; Blast and Controlling
rolling the target's own save against the caster's spell DC (replacing the old caster-rolls-
vs-Defence Blast outright); the generic +2/+4 effect-roll bonus from a range or duration push,
and the tree-specific -1/-2 to the target's save from an effect push instead; Fortitude's own
wound-disorder save (this file, 2026-08-30 above) firing independently of Blast's Reflex save,
since a Blast is still "a wound from a Blast" once it lands.

**Deliberately simplified, marked `// proto:`** — none of these change what a rule *decides*,
only how faithfully a rare corner is modeled:
- Movement's own Tier 2 ("ignores terrain penalties") and Tier 3 (a movement-type grant) both
  ride the existing `flying` pathing rule rather than a new terrain-cost mode. A superset of
  Tier 2's own text (flight also ignores blocked edges, not just terrain cost), simpler than
  teaching `path.ts` a third movement mode for one buff.
- A lingering wound or regeneration ticks with no Fortitude save and no roll at all — read as
  covered by the rules' own "no roll" for the tick, not as a fresh wound event. Since a single
  cast never pushes both effect and duration, `durationRounds` almost always resolves to 1 tick
  in practice; the mechanism supports more if that changes.
- "The target's next save" (Healing Tier 2/3, Defense Tier 3) is one flag consumed by whichever
  save comes first, with no expiry of its own — including a reach roll, since this system reads
  Escape/Reach/Push/Rally/Cast through the same one formula family. A buff/debuff that instead
  "lasts until the target's own next activation" (Offense, Defense's AC, Controlling, the
  movement buffs) is a flat flag cleared at `begin`/`finish`, not a duration countdown — so two
  stacked buffs of the same kind replace rather than combine, and a third source landing before
  the first expires simply overwrites it. No case where two independent buffs are live on one
  unit at once was worth building for yet.
- Tradition data: no troop states one (see the spell-attack/DC entry above), so every caster
  still falls back to arcane. `Apprentice Magician Clique` in the tests exercises exactly this
  fallback — its own tests are the arcane baseline, not a hand-picked example.

**Not done, tracked separately:** the importer still doesn't read `spellAttack`/`spellDc`/a
tradition off a real troop's `spellcastingEntry` (see the entry above) — `TroopSheet` grew
optional `spellAttack`/`spellDc` fields for a hand-authored `overrides` to fill meanwhile, the
same way `official.ts` already overrides other derived stats.

### Rule questions for play

- Does Fortitude get a debuff tree, or stay imported-but-unused a while longer?
- Is the tactic → fixed-tier remap (Healing T2 / Defense T1 / Controlling T3) actually the right
  power level for a non-caster's one free trick, or was it just the nearest tier that matched the
  old spell's flavor?
- Duration only matters where an effect persists past the moment it resolves (the four buffs,
  Controlling, and a Blast or Heal that also reached Tier 3) — pushing it anywhere else is legal
  and buys nothing. Untested whether that reads as a trap for a player who doesn't already know
  which trees persist.
- One push per cast (range, duration, or effect, never more than one) was assumed rather than
  decided outright, on the precedent that every other ladder only ever reaches for one rung above
  grade in a single act. Revisit if splitting a caster's pool across two of the three ever comes
  up.
### Blast spell attack — 2026-08-31

Decision (Mark): Blast no longer asks the target for a Reflex save against spell DC. It now
uses the ordinary attack shape: the caster rolls spell attack, less its disorder, against the
target's current Defence. This lets Guard, Defense buffs, exposure, disorder, and outflanking
affect Blast through the same `defenceOf` calculation as Fight and Shoot. Blast's effect-push
bonus changes from a -1/-2 save penalty to a +1/+2 attack bonus; range and duration retain
their generic +2/+4 effect-roll bonus. Controlling remains a target Will save against spell DC.

### The per-ladder climb split — 2026-09-03

Decision (Mark): one uniform "reach is a free gamble" rule was wrong, because reaching was never
a decision. Measured across all 38 combatants against the real `degreeOf`, a reach came out at
10.5% critical success, 48.8% success, 35.3% failure, 5.4% critical failure — a 59% shot at a
better rung for an expected cost of ~0.01 disorder, since only a critical failure cost anything
at all. Nothing on the board made declining correct, so the panel could not make the choice
legible: there was no choice in it.

The four ladders no longer pay for the climb the same way, because they do not mean the same
thing by "one rung up" (`CLIMB` in `src/engine/ladders.ts`):

- **Fight — free gamble.** Press and Overrun ride an exchange that is happening anyway.
- **Cast — free gamble**, plus the caster's own pool. Unchanged; it already had its own economy.
- **Shoot — one more action, no roll.** Aim means taking time, not taking a chance. This is the
  change that makes a shooter's second action a real decision: +2 on the shot, or the band.
- **Rally — one more action, no roll.** Inspire lifts every friendly unit within 2, which is far
  too strong to hand over on a 59% freebie.
- **Guard — no climb at all.** A posture is not reached for. Grade gates the rung; Guard's spare
  actions go where its currency already is, on Defence.

Failure on the two ladders that still gamble now bites (`reachFor`): plain failure falls back to
grade with the act still happening, and a **critical failure costs 1 disorder and drops a rung
below the grade**. A unit already on the bottom rung has nothing to drop to, so it **forfeits the
act** rather than take a second point of disorder — Mark's call, over the alternative of 2
disorder. For Cast, whose base is always Tier 1, that means a critically failed push always
forfeits the cast.

Sequencing, also Mark's call: **commit, then gamble, then resolve.** Weight can land on the climb
check, so the actions have to be committed before the d20 is thrown; committing after would make
the purchase trivial. The left panel is built to that order.

Judgment calls taken here without asking:

- A charge whose Fight climb critically fails still lands the unit in contact — it arrives with
  no exchange to show for the ground it crossed, rather than having the movement refunded.
- A bought climb comes off the top of the activation, before the dials see the budget, so
  `rungDials` narrows `extra` by `climbCost`. A shooter with 3 actions therefore gets one
  weight action on an Aim, not two.
- A bought rung the unit cannot afford reads `needs 2 actions` rather than being hidden, so the
  price is visible on a rung that is out of reach for want of an action rather than for want of
  grade.

Open:

- 5.4% is still a rare penalty. If reaching on Fight still feels automatic in play, the next
  lever is plain failure costing something, not a harsher critical.
- Withdraw's dials still live in the board popup rather than in the left panel's ledger. Every
  other act composes on the left now; Withdraw should follow.
- Shoot and Rally have no use for the `push` dial any more. It is correctly switched off, but
  that leaves those two ladders with only the roll dial, which may be too thin a menu.

### Two gambles are not the same gamble — 2026-09-04

Mark, on the Cast popup: "I just see gamble, gamble... isn't pushing twice as hard as pushing
once?" Both true, and the second exposed a bug.

**The bug.** `ActionOffer.reachDc` was computed once, for `reachable` (grade + 1), while
`reachFor` rolled against the DC of the rung actually wanted. Every ladder offers only one rung
above a grade, so nothing showed — except Cast, which pushes from its free base straight to Tier
3. The panel displayed the Tier 2 DC while the engine rolled the Tier 3 one. `RungOption` now
carries its own `reachDc`, and both the popup and the panel read it.

**The rule.** `CLIMB_STEP = 4`, added to the DC for every rung of climb past the first. Only Cast
can climb two at once, so nothing else moves. Measured on the three casters in the roster, a Tier
3 push went from 70% lands / 5% botch to 40% lands / 15% botch — the failure rate exactly doubles
and the botch rate triples, which is the "twice as hard" reading. +2 alone was a 10-point nudge.

**The UI.** A bare GAMBLE badge said nothing about what was being risked. Every gamble row in the
board popup now carries its own stake, under its own odds bar: the DC, the share that lands, and
the share that botches with what the botch takes ("15% botched — 1 disorder, and the cast is
lost"). Two gambles on one ladder now argue for themselves; the choice is the shape of the bar.

Open: the stake phrase collapses the drop-a-rung and forfeit cases into one clause. Fine while
Cast is the only ladder with two gambles, thin if another ever gets one.

### Making the further gamble bite — 2026-09-04

Mark: "the lost action should only be on critfail, or gamble 2? how can we make that bite? more
gamble more risk? or the same"

More gamble, more risk — but the critical could never carry it. A one-rung climb critically fails
5% of the time and a two-rung climb 15%; neither is seen often enough to plan around. Plain
failure fires at 35% and 45%, and it cost nothing at all. Free failure is what made every gamble
worth taking regardless of how far it reached.

So the penalty now scales with the distance climbed, on the outcome a player actually sees:

- **Failure.** Falls back to grade, act still happens. Free on a one-rung climb. **1 disorder on
  a two-rung climb.**
- **Critical failure.** 1 disorder, and you fall back as far as you reached past — one rung below
  grade for a one-rung climb, two below for a two-rung climb. No rung that far down means the act
  is forfeit, as before.

The second rule generalises what was there rather than changing it: only Cast can climb two rungs,
and its grade is always 1, so a two-rung critical failure forfeited already. The rule now reads as
one sentence ("you fall back as far as you reached past") instead of a special case.

What this does to a Tier 3 cast, against Tier 2: 40% lands / 45% falls back for 1 disorder / 15%
botched for 1 disorder and the cast, against 70% / 30% free / 5%. Expected cost goes from ~0.05
disorder to ~0.60 against a Quality of 3–5. Tier 2 stays the cheap gamble and Tier 3 becomes a
real bet, which is the contrast that makes choosing between them a decision.

The stake line on each gamble row now prints both halves — "45% falls back — 1 disorder" against
"30% falls back, free" — because the difference between the two rows is now mostly in that clause
rather than in the odds bar.

Decision (Mark): **movement Push stays exactly as it is** — same cost (every action left), same
name. The earlier suggestion to rename it away from the ladder's "push" is dropped; the collision
is tolerable now that the ladder's version is called a climb in the rules and the UI.

### The climb is binary — 2026-09-04

Mark: "I think it's easier just to say 'action fails' instead of 'reducing effectiveness.'"

Right, and it collapses three rounds of accumulated patching into one sentence. A climb either
happens or it does not:

- Critical success — one rung further than reached for.
- Success — the rung reached for.
- **Failure — the act fails.** No lesser rung to land on; the action is spent regardless.
- **Critical failure — the act fails, and 1 disorder.**

Deleted with it: the fall-back-to-grade branch, the drop-N-rungs-below-grade branch, the
forfeit-when-there-is-nothing-below special case, the two-step fallback disorder rule, and the
`grantedBelow` / `stakeRung` / `stakeOf` helpers the UI needed to describe them. `reachFor` is
now nine lines. The wager panel lists two failure rows that say the same thing twice, and the
odds bar became a two-colour argument: what lands against what is thrown away.

`CLIMB_STEP` stays, and is still how "a harder push is a harder check" is expressed — Tier 3
climbs two rungs at +4 over Tier 2's own +2, so 70% lands becomes 40%.

**The balance consequence, measured and unresolved.** A one-rung climb with no weight lands 59%
across the roster, so reaching now stakes an entire act on a coin flip. That is a real decision
where the prize is large (Overrun taking ground, Inspire lifting the army, a Tier 3 Blast) and a
plainly bad one where it is small — Press adds 1 disorder to the loser of an exchange, which is
not worth a 41% chance of no attack at all. Fight's climb may be dead at grade 1.

Two dials, if it proves dead in play, in the order I would try them:

1. **Weight is the intended answer** and it now matters properly: 0/1/2 actions on the check give
   59% / 69% / 79%. The rule may be fine and the habit just has to change — reach *and* back it,
   or do not reach.
2. **Lower the climb DC** below the level DC. A −2 would put the unweighted climb near 69%.

Not tried, and worth naming: making the third rung of each ladder a bigger prize, so the stake
matches. Press being worth so little is arguably the real problem rather than the climb rule.

## Selection breath and the selected hex (2026-09-04)

With no piece picked, the ones you can still activate breathe — ±7% over 1.8s — and the ones
already spent sit at 80% and still, so the board answers "whose turn is left?" without reading
the reel. Pick one and the board goes still: every piece back to full size, and the chosen
piece's hex washed and outlined in its side's colour.

Judgment calls:

- **The window is `active`, not `begun`.** The breath is the question, and it ends the moment it
  is answered — even though the pick can still be swapped until an action is spent. Two signals
  at once (everything breathing *and* one hex lit) says less than either alone.
- **Only the acting side.** The enemy never scales; the signal is about your own choice.
- **The breath is slower than the ring's glow** (1.8s against 1.4s) so a lit, breathing piece
  reads as two signals rather than one confused one.
- **The pick is takeable back, once.** Bare ground under the click drops it, and so does one of
  your own pieces still waiting to go — that click now switches the selection instead of aiming
  at an ally. Verb-first aiming at an ally survives: an armed prop takes the click before the
  switch does, so Aid and the healing trees are reached by picking the verb and then the piece.
  Clicking the selected piece itself still blooms its ring; that is the whole board interface
  and toggling it off there would cost more than it gives.
- **A click is answered by the hex, never by the art.** The hit test was a disc on the cell
  centre while the miniature is anchored near its feet and drawn a footprint tall, so a click on
  a figure's chest fell through to the ground behind it — invisible until ground clicks started
  meaning something, at which point clicking a troop's body deselected instead of switching.
  `hitTest` now resolves the cell first and asks what stands in it, which is the same model
  hover has always used. The art overhangs its hex and no longer needs to be measured; the piece
  owns its whole cell and nothing more.
- **A wall under an occupied hex is clicked from the empty side.** The piece takes the edge band
  of its own cell along with the rest, and the shared edge keys the same either way. Both sides
  occupied leaves that wall unclickable — worth a fix only if it comes up in play.
- **`deselect` refuses once `begun`.** The engine, not the UI, holds the rule: actions already
  spent on a unit are that unit's turn, so a stray click reads as a miss.
- **A side's colour touches the ground only here.** Everywhere else the map owns the palette and
  reach is ink — the selected hex is the one exception, and it is the flag's own red or blue so
  the tie to the piece needs no learning. `OverlayLayer.setSelected` used to take a token id and
  read it as a cell key, which drew nothing; it now takes the cell and the side.

## Rungs are priced, the gamble and weight are gone, and a Fight is one roll (2026-09-05)

Mark, on the orders panel: "clear decisions, not a menu" and, on the free climb, "it's coming
from another system, and I'm beginning to question its relevance in the Pathfinder world."
Then: "the interesting benefits are not the +2" — bonuses are boring. Three decisions followed,
in this order, and each deleted the machinery of the last.

**1. Movement Push is gone.** This reverses the 2026-09-04 note that it stays. Every hex has a
price in actions and nothing else; the drag arrow and the three bands are the whole of Move.

**2. The gamble and weight are both gone.** Every ladder is priced the same way: the rung at the
grade costs one action, each rung above it one more, two above costs three (so a grade-1 levy
can Overrun with its whole activation, and "locked" leaves the game except for a compelled
unit and a tradition's cap). Nothing rolls for a rung, and nothing turns an action into +2 —
actions left over buy other acts. This is PF2e's one/two/three-action Heal shape. Cast tiers
cost 1/2/3 and the caster's pool became Cast-only actions, spent first. Rungs are cumulative:
Overrun includes Press, Shieldwall includes Dig in (rooted and all). A rung that is not "more
of the same" is a separate verb or tree, never a rung.

Deleted with it: `CLIMB`/`CLIMB_COST`/`CLIMB_STEP`/`OWN_ROLL`, `reachDc`, `reachFor`, the
`Spend`/`Dial`/`SpendDials` types and the `commit` allocation reader, the wager panel, the
ledger, every dial, the odds bar, `pushReach`/`doPush`/`PushAction`, and the 'push' highlight.
Withdraw keeps one number: further actions on distance, since ground is a real effect.

**3. A Fight is one roll, one way.** Mark: "instead of automatically taking a hit, if you fail
the exchange, you should roll for disorder instead of both taking injuries." The symmetric
exchange gave melee two wound events a round to a shot's one, and drew even ~40% of the time.
Now: a hit wounds and the target makes a Fortitude save or takes 1 disorder (the shot rule,
unchanged); a miss *repulses* the attacker, which makes a Will save against the target's level
DC or takes 1 disorder; a critical miss still exposes. Nobody strikes back. Press = the hit's
disorder needs no save (Intimidating Strike, two actions, hit → Frightened 1, no save, is the
level-2 ancestor). Overrun = Press plus a shove one hex directly away, attacker
takes the ground (Shove: "push 5 feet, you can Stride after it in the same direction");
nowhere to go = hold and take 1 disorder. A Defense buff's "next wound costs no disorder" still
beats a Press. The Offense buff's Tier 3 "no strike back" became "the next Fight's miss cannot
repulse it".

Measured, per attack, off the roster: Line Infantry into Kobolds hits 70% and risks 6%
attacker disorder; even (into Heavy Cavalry) 35% / 29%; Kobolds up into Line Infantry 20% /
48%. Strike alone loses the morale trade at parity (7% target disorder vs 29%); Press flips it
(35% vs 29%). That is the intended shape: the jab wins wounds and risks heart, the committed
blow breaks lines, and a grade-2 unit's every attack is a Press for one action.

Judgment calls:

- **Repulse fires on any miss**, not only a critical one (which would give 1 / 9 / 21) and
  without the critical costing a point outright (10 / 40 / 62).
- **The shove goes directly away from the attacker**, as Pathfinder's Shove does (Mark: "matching
  shove"). The target chooses nothing, and one blocked hex is enough to crush it for the point.
- **Wound throughput in melee halves.** Rout will decide more battles than destruction. Levers,
  untouched until a played battle: dusk at eight rounds, or three wounds instead of four.
- **The board popup takes the rung on touch.** The price is on the row as a Pathfinder action
  glyph (◆ ◆◆ ◆◆◆, from ReignMaker's SVGs, in `ActionCost.svelte`); there is no orders card any
  more, and the panel is pips, stats and the Move bands.
- **Spells were not revisited** beyond the two riders above; Mark: "we need to look at spells
  as well."

## Shoot review: a missed volley stays free, the extreme −2 goes (2026-09-05)

The first action through the process in `action-review.md`. Mark's brief for the session was
"proceed with the action review for the remaining actions"; the two questions were the ones the
queue already carried, and both calls below are mine.

The rule as it stood, in `shootAt` and `shootModifier`:

| Result | The target | The actor |
|---|---|---|
| Critical success | 2 wounds, Fortitude save or 1 disorder | — |
| Success | 1 wound, Fortitude save or 1 disorder | — |
| Failure | — | — |
| Critical failure | — | — |

| Rung | Cost | Adds |
|---|---|---|
| Fire | ◆ | The effective range band |
| Aim | ◆◆ | One band off it, either way |
| Snipe | ◆◆◆ | Two bands off it, either way |

Plus one number outside the table: a troop's own volley took −2 into the extreme band, and
artillery ignored it. Shooting downhill counted the range one band closer, but that shift only
ever cancelled the −2: the reach check itself ignored height.

**Ancestors.** A ranged Strike that misses costs nothing in Pathfinder, and nothing in it
rebuffs a shooter. Range increments are the ancestor of the ladder: "−2 per range increment
beyond the first", and Hunt Prey buys off exactly one of them ("you also ignore the penalty for
making ranged attacks within your second range increment"). Aim is the second increment and
Snipe the third, priced in actions rather than −2s. The nearer swing's ancestor is the volley
trait ("less effective at close distances... a −2 penalty"). Point-Blank Stance waives that.

**Numbers.** Volley equals Strike for nearly every troop on the roster, so Shoot and Fight land
identically and Shoot carries no repulse. The −2 at extreme, per attack: Line Infantry down
into Kobolds 0.90 → 0.70 wounds; even, 0.40 → 0.30; up, 0.25 → 0.15; an Archer Regiment (L12,
long reach, one of two troops that reach extreme by Aim) into Frost Giants (L14) 15% hits →
5%, for its whole activation.

Decisions:

- **A missed volley stays free.** The ancestor says so, and the repulse is a thing that
  happens in contact. The cost of a shot is positional: the shooter is out of contact, holds
  no ground, and eats −4 into a melee, while Fight buys Press for one action at grade 2 and
  Shoot never buys a rider. Nothing in the table changed.
- **The extreme −2 is gone.** Actions are the only currency, and a troop already pays two or
  three of them to reach extreme: the −2 was a second charge on one band, in the shape Mark
  had rejected ("the interesting benefits are not the +2"). With it goes artillery's
  exemption, which was a special case of a special case.
- **Height now buys a band.** With the −2 gone, "shooting downward counts the range one band
  closer" had nowhere to land, and the reach check had never honoured it. It does now
  (`shotRank` in `battle.ts`): a short-reach troop on a hill Fires at medium for one action.
  No Pathfinder ancestor; the justification is that hills otherwise give a shooter only cover
  denial, and a band is worth exactly one action, so the rule is priced in the same coin.
- **The nearer swing stays**, untested by play. A long-reach troop shooting at short pays Snipe,
  three actions, where the volley trait costs a Pathfinder longbow −2. It is the same price a
  short-reach troop pays at long, and only two roster troops have long reach. Open for play:
  if it reads as a trap, Fire covers everything at or under effective range and only distance
  is bought.

## Every remaining ladder proposed in one pass, for review in the rules (2026-09-05)

Mark: "take your best guess then on all of them and write them as ladders in the rules.html,
and I'll review them there. Remember that we want meaningful effects over flat bonuses." So the
one-action-per-session process is set aside for a draft: `public/rules.html` section 15,
"Proposed ladders, under review", holds a ladder for Guard, Rally, Withdraw, Charge and each
Cast tree, in the section-6 shape, with the changed cells, the ancestors and the edge cases
under each. Nothing in it is implemented; section 6 and the engine still agree.

The guesses, in one line each, so the review has a list to strike from:

- **Shoot**, revisited after the morning's review. Mark: "this is super boring. The additional
  range is not interesting at all... Why don't we just apply a -2 for every range category off,
  or should we say -4? And then just detach the range changing entirely from the actions."
  So: Fire at −2 a band beyond effective range (the range-increment rule; −4 rejected as a shot
  nobody takes), nearer bands free; Suppress, −2 to everything the target rolls until the
  shooter's next activation, hit or miss (Mark's own); Pin, the target must pass a Disengage check
  against Volley + 10 to Move or Charge next activation. Pin was drafted as outright and Mark
  softened it: "It's probably just too strong a control. I would make them roll as if they
  needed to disengage." Barrage (Press for shooters) and Spread (the roll read against a
  neighbour) were offered for the top rung and not taken.
- **Guard** keeps the +2. Mark: "Brace should be shield block. +2 to AC. This is an exception
  to the no numbers rule. This is just increasing your defenses. On the next level, you gain
  crit immunity. On the final level, you cannot be pushed and are rooted." Then, on the turtle:
  "if we should give 'take cover': 'brace, dig in and take cover.' Greater cover gives you +4 to
  AC and saving throws versus reflex. Let's also give the dig in level the +2 bonus to reflex
  saves." Then the Reflex half withdrawn: "The reflex save, I guess, isn't meaningful, so
  remove that benefit. It's already included in that the cast blast action will be resolving
  using an attack roll, so the + to AC will affect it." So Brace +2 Defence; Dig in caps
  criticals (standard cover); Take cover +4 Defence (greater cover), cannot be shoved, rooted.
  The root moves up a rung. Drafted and
  dropped on the way: Bulwark, a hit turned outright ("complete immunity to the next hit sounds
  too strong"), and Repel, a miss repulsed with no save. On Shieldwall: "an individual benefit
  would be better because adjacency may not be common, and that could be better off as a unit
  ability than a generally available ability." So the share moves to the defend-allies tactic
  (Shield Warden), whose one roster owner is the troop named Shield Wall; formation, on 31
  troops, was too common to carry it.
- **Rally**'s heart becomes "the next point of disorder does not land" and stops being +2.
- **Withdraw** keeps its check and free strike; the distance dial becomes Break off / Fall
  back / Flee, grade 1, grade 2 with pace.
- **Charge** is two Speeds and the Fight rung for two actions (Sudden Charge's discount).
  Cavalry charge makes the hit need no save; mounted makes it shove. Both together is an
  Overrun for two actions.
- **Cast** drops the range/duration/effect axis and every +N. Blast: Bolt / Burst (one roll
  read against the target's neighbours) / Storm (burns). Healing: Soothe / Heal (a wound) /
  Mass heal (adjacent allies; the throughput number is flagged). Controlling: Dread (Fear's
  point) / Slow (an action) / Hold (rooted). Offense: Sure strike (roll twice) / Wrath (the
  hit needs no save) / Haste (an extra action, never a second attack). Defense: Ward (no
  disorder from the next wound) / Stoneskin (cap) / Aegis (the first hit is turned).
  Movement: Sure footing (terrain is open) / Wings (flies) / Freedom (no Disengage check).
- Tactic grants move with the trees: demoralize → Dread, battlefield medicine → Heal;
  defending allies grants the Guard share instead of a Defense tier.
- **Free strike, no retreat, walls and siege engines** are left as they are.
- **The check is called Disengage now**, in the rules and the popup. Mark: "Escape checks are
  Athletics specifically in Pathfinder, so we need to be careful there because many units may
  not have Athletics as a stat." It never was Athletics here (Reflex against Strike + 10, every
  troop has a Reflex), so only the word changed. The engine's `escapeModifier`/`escapeDcFor`
  keep their names for now; `// proto:` rename when the Withdraw ladder is built.
- **A cast is one roll** (2026-09-05). Mark: "we're going back to a single roll instead of a
  cast and then effect." Section 11's cast roll followed by a separate effect roll goes when
  the trees are built; each tree's one gate is already the row above its table in section 15.
  The six trees are listed as ladders of their own in `ladder-review.md`.
- **Rally review** (2026-09-05). Heart is renamed and widened, and the draft's "a point of
  disorder not taken" is dropped. Mark: "take heart is +2. What if we just made it +2 to your
  next roll instead of attacks? It's a status bonus And I feel like we need a better name.
  Inspired is probably it for the condition that gets applied: 'You are inspired. Get +2 to
  your next roll.'" Whether rung 3 keeps the name Inspire is left open: "Whether this means we
  need to change the name of the last, we can decide."
- **Rally, second pass** (2026-09-05). The roll goes and one effect runs through every rung.
  Mark: "the steady behavior should be Recover 1 point of disordered. If you are not
  disordered or have 0 disorder, then become inspired. Then rally is the same effect on a
  single target. Then inspire is that effect on everyone within the range. So you can't
  become inspired if you are still in disorder." Written with the rules' verb, clears, for his
  recover. Read as no roll: section 9's rout-DC roll, its four degrees and the critically
  failed Rally's point go when Rally is built. Flagged: Steady on a unit in good order is one
  action for +2 on its next roll, which "nothing turns an action into a bonus" had ruled out.
- **Rally, third pass** (2026-09-05). The roll stays. Mark: "we still need to roll and success
  grid for all actions. That's just the success result." So clear 1 or inspired is the success
  row. Proposed around it, not yet decided: critical success clears 2 and inspires if none is
  left; failure nothing; critical failure nothing and 1 more on the rallying unit; one roll
  read for every unit the rung reaches.
- **Shaken and routed units may Move** (2026-09-05). Mark: "Section 7 is wrong. I think a
  shaken or routed unit should be able to move." Sections 6, 7 and 9 and the quick reference
  now say so, and `moveReach` no longer bars them. Judgment call: a routed unit's Move is
  unrestricted; only its withdrawal still runs for its own edge, and it still leaves the field
  when it reaches that edge. The withdrawal's ground-buying actions are now redundant for every
  unit, which is the Withdraw review's open question.
- **Withdraw review** (2026-09-05). Ground rungs are dropped. Mark: "there's no reason to fall
  back or flee because I can break off, and if I'm successful, I can move speed." Then: "What
  if, for two actions, they get the space without the roll, and instead the enemy must roll to
  see if they can move the following turn?" Written as Slip away: each holder rolls Reflex less
  disorder against the withdrawer's level DC, a failure roots it for its next activation and
  stops it following. Proposed for the top rung, not decided: Feigned retreat, a failing holder
  also takes 1 disorder. Names Slip away and Feigned retreat are mine.
- **Withdraw named** (2026-09-05). Mark: "I think the effects are okay", and "Let's go with
  break off, disengage, and fighting retreat." Break off makes the Disengage check; the rung
  Disengage is the sure break with the enemy's roll. Dropped names: Fall back and Flee (ground
  rungs), Slip away, Feigned retreat ("they are actually retreating, so it's not entirely
  feigned"), Give ground, Draw them on, Lure, Overreach. Every rung leaves the unit one hex
  clear; further ground is a Move.
- **One Disengage check, and a pin is a holder** (2026-09-05). Mark, on Break off's critical:
  "I'm considering giving them an entire move instead of only one square." Then: "What if we
  just made it one check against the highest holder instead of multiple checks?" Then: "if a
  pin effect is being applied by a shoot action, that's just counted as one of the holders."
  Section 7 now reads one check against the highest attack DC, read for every holder: a failure
  is a free strike from each, a critical a free Move of your Speed with every pursuer thrown
  off. Pin no longer has its own check; the shooter is a holder at Volley + 10 and lands no
  strike. The engine still rolls per holder, marked `// proto:` in `doWithdraw`, until Withdraw
  is built.
- **Grades go, the extra action replaces them** (2026-09-05). Mark: "One thing I think we need
  to remove is the grades. It's a concept that came with pushing, and I don't think it fits any
  longer." Challenged: grade is the whole price rule, `rungCost = 1 + max(0, rung − grade)`, and
  every tactic and signal acts by raising one. Mark: "rather than grade-reducing costs, I think
  it would be easier just for a higher-grade unit to get an extra action." So every rung costs
  its own number for every troop and a better troop has four actions. Proposed, not decided:
  the extra action is quickened's, one action restricted to the ladder its source names (fear
  and melee drill Fight, formation and shields Guard, covering fire Shoot, pace movement, Haste
  anything), never two. High Will grants nothing, since it already sets Quality. Section 15
  holds the table under "Grades become the extra action"; the build removes section 6's price
  table and `gradesFor`.
- **Charge review** (2026-09-05). Cavalry-only was proposed and dropped. Mark: "Just thinking
  from a wargame perspective, how does that fit with most tactical games?" It does not: every
  unit charges in the genre, and cavalry differs by reach and impact. Mark: "Okay, so charge for
  everyone, and that leaves us back at: two speeds of movement and an ordinary attack; two
  speeds of movement and a press; two speeds of movement and an overrun." One action of
  movement buys two Speeds when it ends in a Fight, then the Fight rung at its flat price, so
  Charge and Overrun is four actions and needs the extra action. Judgment calls: cavalry charge
  is the impact (no save on the charge's hit), the mounted signal goes, leftover charge
  movement does not bank, a pinned unit cannot charge. Dropped: the mounted rider's drive on
  any hit.
- **Charge has an edge** (2026-09-05). Mark: "how do we differentiate it from just a plain
  attack, though? That's kind of boring." Proposed: "+2 attack for the charging unit, -2 to the
  charging unit's AC, -2 to the target's disorder check." The −2 Defence is section 6's
  exposed, so the charger is exposed until it next acts: "if we already have a condition for
  that, then yeah, we should just give it `exposed`." The save penalty is dropped as doubling
  up on the same hit: "Let's take that out, and instead we'll go the other way. It's always
  easier to increase than to take things away." The +2 to hit stays and is the second flat
  bonus after Guard's; the save penalty is the first thing to add if charging proves weak.
- **Charge and ground** (2026-09-05). Straight line dropped: a two-hex charge cannot bend
  meaningfully and the approach already takes the cheapest path. Mark: "Yes, add the terrain
  line." A charge whose path enters forest, swamp or shallows, or climbs, lands no +2; the
  discount and the exposure stand. Mark: "What if we give the save penalty on a downhill
  charge?" Taken, and read from the start: "That would require that the charging unit start its
  charge from a hex that is at a higher elevation than the target." A charge whose starting
  hex stands above the target's puts the target's save against disorder at −2, whatever hex it
  ends on. Height had no melee value downward before this.
- **Charge table reads on its own** (2026-09-05). Mark: "I don't like having to look up what
  press is in the charge table, so let's move that rule over so we see clearly what the bonus
  is." Press and Overrun are spelled out in their rows. The melee's word stays Fight: it is the
  menu verb and section 6's; engaged is the state, Disengage the check. "Exchange" and
  "engagement" each appear once in the rules, in passing, and neither is a term.
- **Melee vocabulary** (2026-09-05). Mark: "Let's then stamp out exchange and engagement to
  make sure that we have clear terminology." Fight is the verb, engaged the state, Disengage
  the check. The two stray uses are gone: "two bad exchanges" is "two bad Fights" in section 2,
  and the cliff row of the quick reference says "nobody is engaged across it", section 10's
  own words.
- **Blast: shapes in hexes, no area** (2026-09-06). The draft's Burst read one roll against
  every enemy adjacent to the target: 2.50 wounds expected inside a block for two actions.
  Mark: "on a battlefield map, that's a lot of hexes." A save for the neighbours was raised and
  set aside as a second gate. Blazing Bolt's shape taken instead, one more hex per action:
  "missile, line, and burst." Missile is one hex, Line two in a straight line, "line needs to be
  direct from the caster," and Burst three: "What if we said that the last one could be
  three? We still leave it to hexes." Only the target takes 2 on a critical. Dropped: the
  full-ring area, and Storm's burn (1 wound at the start of the target's next activation).
- **Line is two full targets** (2026-09-06). Mark: "two hexes in a line from caster, either can
  be hit or crit. user specifies." The caster picks two hexes on one of the six straight lines
  out from its own hex; the one roll is read against each in full, 1 wound on a hit, 2 on a
  critical. The "directly beyond the target" reading is dropped.
- **Burst is a corner** (2026-09-06). Mark: "Maybe we say you pick one corner and get all
  three adjacent hexes?" The caster names a corner of the grid within range and the roll is
  read against the three hexes meeting there. Every hex is a full target, as Line's are; Mark
  confirmed: "You could crit on each." The "never 2" cap on the extras is gone with it. Blast is the activation's attack, so it was already once an
  activation.
- **A tree is cast once an activation** (2026-09-06). Mark: "I think you can only cast once per
  round? Or, at the very least, you cant cast the same tree." The weaker form is written into
  the Cast intro in section 15; section 6 today lets "the other spells" repeat. Whether a
  caster casts once an activation altogether is open.
- **Cast-only actions go** (2026-09-06). Mark: "we remove the extra actions awrded to casters
  now that we have only 1 tree to perform, previously we had cast then effect." Section 11's
  level ÷ 5 actions paid for a two-roll cast; with one roll a caster has the three actions
  every unit has, and a level-15 arcane caster no longer Bursts for free. Written into the
  Cast intro in section 15; section 11 stands until the build.

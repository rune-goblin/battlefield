
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

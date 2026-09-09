# Activities build — judgment calls and open questions

Dated bullets, appended by whoever executes a wave of `activities-build.md`. One line each:
what was decided and why. Never reopen a decision here; put a doubt under "Open".

## Decided in the plan (2026-09-08)

- Suppressed is −2 to every roll and to Defence: "disorder's temporary cousin, two points".
- A pin or a suppression ends when the shooter next acts or leaves play.
- Line, Burst and the Healing pairs and triples are offered as encoded targets (`a+b`), so the
  popup needs no multi-select. `// proto:`.
- Healing's critical ends the first condition present, in the order pinned, rooted,
  suppressed, exposed, frightened, persistent damage; with none, it clears a second wound.
- An attack Aegis refuses still spends the attack slot and the actions. A refused charge has
  already moved and is exposed.
- Wrath's persistent wound passes through the wound cap and Stoneskin like any wound.
- A tactic-granted tree uses the troop's Will for a Healing roll and its level DC for a
  Controlling save, once an activation, one action only.
- Code keeps `Rung`, `LADDERS` and the rest of the old identifiers until the last wave; the
  rules, logs and labels never say rung, ladder, grade or tier.

## Open, for play

Ten questions stand. Each carries a **Decision:** line to fill in; write the ruling there and
the build follows it. The three closed ones are at the bottom, kept for the record.

### Contradictions to settle

The document and the engine say different things. A player checking one against the other finds
them disagree, so one of the two is wrong.

- **D1 · The Controlling parity example.** `public/rules.html`'s Controlling parity example
  quotes a level-6 troop's Will as +13 and 15/50/30/5 odds off spell DC 21; the engine derives
  +17 for the same troop (`willModifier` on a level-6 infantry card), which shifts every one of
  those odds. Flagged in Wave 10's session, not fixed there. Either the worked example is stale
  or the derivation is too generous.
  **Decision:** Saving throws are a range. At level 7 a +17 save would be high whereas a 13 would be low. Probably balancing our things against moderate would be good. +14  ![image-20260909014557119](/Users/mark/Library/Application Support/typora-user-images/image-20260909014557119.png)

- **D2 · Fly's engagement clause.** rules.html's Fly carries a clause the engine does not:
  "Nothing engages it across a wall or a cliff it crosses." A cliff already breaks engagement
  for everyone (`isEngaged`), but a standing wall does not — section 10 makes contact across a
  wall hold. Honouring the clause as written needs the engine to remember which edges a flight
  crossed; the broad reading (a flier is never engaged across a wall) would change holders, free
  strikes and withdrawal for every native flier as well. The plan's own Wave 12 table omits the
  clause. Flagged, not built.
  **Decision:** walls do not hold engagement 

### Balance

- **D3 · Aegis can never be cast.** Defense index 3 costs three actions and no tradition's
  Defense cap reaches 3: `TRADITION_CAP` in `src/engine/magic.ts` reads arcane 2, divine 2,
  occult 1, primal 1, and the Tradition table in `public/rules.html` section 11 carries the same
  four numbers. The rules describe a three-action activity nothing may buy. Raising a cap moves
  a column off its total of 10, so the question is the Tradition table's, not the code's: which
  tradition should afford Aegis, and what it gives up for it. Both places hold the number and
  both must change together.
  **Decision:** divine: defense 3, arcane, movement 3, occult move 1, primal def 2

### Rules questions

- **D4 · Artillery and Pin.** Whether artillery needs a cheaper Pin now that the gun crew has no
  extra action (section 12).
  **Decision:**  no, we will revisit artillery later

- **D5 · Casting a tree twice in a battle.** Whether a Cast tree may be cast more than once a
  battle. Once an activation is built.
  **Decision:** cast 1/turn

- **D6 · A charge that finds nobody.** Fear on contact routes the target mid-run, which leaves
  `attacked` false, so the charger may still Fight this activation. Section 7 says both "it is
  the activation's attack" and "the charge then costs its movement alone" — the two read as one
  promise until the charge actually whiffs. Pre-existing, not a Wave 6 or Wave 8 regression.
  **Decision:** I don't understand how a charge could not find somebody. You can't charge unless you have a target. If a charge is somehow interrupted, then the attack is lost. The movement stands. 

- **D7 · Sure strike against a wall.** Sure strike now spends itself on a swing at a wall, since
  a wall attack is the activation's one attack. Whether a wall segment should soak the ally's
  buff at all is a play question.
  **Decision:** any attack roll can use Sure Strike. 

### Naming

- **D8 · Inspire, twice over.** Rally's three-action activity is still named Inspire, the same
  word as the condition a Rally can leave behind.
  **Decision:** leave the word inspire in both

### Gaps with a known cost

Neither is a contradiction. Both are "worth building?".

- **D9 · Stoneskin and a Wrath wound never meet.** Under the current begin/finish timing (see
  Wave 11 below) the code reads `stoneskin` generically at both wound-landing sites, but the
  field is always cleared by the time a same-activation persistent wound lands. The branch is
  dead unless the timing changes.
  **Decision:** if we change the timing so that effects end at the end of a turn, except at the beginning, would that work? 

- **D10 · A charge still lands on the cheapest contact hex.** Wave 12 gave the +2 the
  terrain-blind search section 7 asks for, so any clean route in keeps it — but the hex the run
  ends on is still the cheapest one touching the target, and a charge whose cheapest contact hex
  can only be reached over rough ground loses a +2 that coming in on the far side would have
  kept. Closing it means offering the player the landing hex, a change to `ChargeOption` and to
  the board's charge chip rather than to `chargeBonus`. Marked `// proto:` on `approach`.
  **Decision:** any valid movement should be okay so long as it doesn't engage another unit. You can't charge past a unit they have zone control of. Which may need to document, so you must charge the first unit you engage. 

### Built from those decisions (2026-09-09)

Mark answered all ten inline above. What each one became:

- **D1 — built.** The Controlling parity example now reads "a moderate level-6 Will of +14" and its
  odds are recomputed for it: 20 / 50 / 25 / 5 against spell DC 21, where +13 gave 15 / 50 / 30 / 5.
  The engine is untouched, so infantry keeps `will: 'high'` (+17) and cavalry `will: 'moderate'`
  (+14), and Quality is unchanged. Section 2's specimen card keeps its +13: that is a real
  statblock's `sheet` value, not a derived one, and the adapter contract lets the two differ.
- **D2 — building.** A standing wall no longer holds engagement, for every unit and not only a
  flier, which makes Fly's clause true as written.
- **D3 — built.** Divine buys Aegis. `TRADITION_CAP` and section 11's Tradition table both read
  arcane 3/0/2/1/2/3, divine 1/3/2/2/3/0, occult 2/1/3/3/1/1, primal 2/2/1/1/2/3 — every column
  sums to 11 now rather than 10, each tradition gaining one point in a different tree, so they
  stay level with each other. Divine alone reaches Defense 3, and only divine may cast Aegis.
- **D4 — closed, no change.** Artillery keeps its price; the gun crew is revisited later.
- **D5 — closed, already built.** A tree is cast once an activation and there is no per-battle
  limit. `castTrees` on `Unit`, cleared at `begin`; Wave 9's third test pins it.
- **D6 — building.** A charge whose target leaves play mid-run spends the attack anyway; the
  movement stands.
- **D7 — closed, already built.** Any attack roll may use Sure strike, a swing at a wall included:
  the Waves 10–11 fix pass routed `attackWall` through `attackRoll`.
- **D8 — closed, no change.** Inspire stays the name of both the activity and the condition.
- **D9 — building.** `ward`, `stoneskin` and `aegis` move from `begin` to `finish`, which makes
  Stoneskin meet a Wrath wound and matches section 11's "a buff lasts until the ally has next
  acted". `guard` and `exposed` stay at `begin`: those read "until you next act".
- **D10 — building.** A charge may take any route its movement allows and must charge the first
  unit it engages, so it cannot pass through another unit's zone of control.

### Closed

- ~~How a shape is picked on the board.~~ Closed in Wave 8: `targetMatches` finds an encoded
  target (`d3+d4`, `u1+u2`) by any one of its parts, cross-kind through the touched unit's own
  square when the part touched is occupied, so Line, Burst, Heal and Restore are all clickable
  with no popup change.
- ~~A stunned unit whose activation ends with no `act()` call at all never runs `begin`.~~
  Closed in Wave 12: `endActivation` runs `begin` itself when the activation never began, so a
  pass spends the stun, the haste and every condition the table clears at `begin`.
- ~~A Blast's Ward and Aegis are read off the shape's first caught hex alone.~~ Closed by the
  Waves 10–11 fix pass below: every caught unit's ward and aegis is now read and consumed.

## Wave 0 (2026-09-08)

- Controlling's three-action cast lost its only effect when `compelled` went, so it now repeats
  the two-action one and its popup detail says so, marked `// proto:` — Wave 9 replaces it with Hold.
- `Grade` (the 1 | 2 | 3 index) stays as the activity index: the plan removes `Grades`, not this,
  and every identifier waits for Wave 14.
- `rungCostFor` is deleted rather than kept as an identity function: the price is the index, so
  `rungOption`, `doCharge` and the charge chips in `Battle.svelte` read the index directly.
- A crewed artillery piece keeps its two-band window (it replaces the shooting profile) but buys
  no cheaper activity; Wave 2 rewrites the window itself.
- `ladders.test.ts` keeps Quality alone, so `treesFor` lost its test with the grade tests; Wave 7
  covers the trees again.
- The aim popup lands on the first legal row, which is the cheapest, now that no unit has a
  granted one.
- "Refuses an activity the actions left cannot pay for" went with the "paying for a rung" block:
  the `needs N actions` reason is still built and now untested.
- The Cast rows still read "Tier 1 / 2 / 3" in the popup: naming all eighteen cast activities is
  Wave 7's job, so the labels break the no-tier rule until then.

## Wave 1 (2026-09-08)

- `guard` keeps its `{ defence, rung }` shape: reshaping it to `{ defence, cap, holds }` now
  would drop Shieldwall's braces aura with nothing to replace it, and Wave 3 names that change.
- `rollBonus(u)` reads and never spends: `strikeModifier`, `escapeModifier` and the rest are
  called to show a number as often as to roll one, so the roll that spends `inspired` must
  clear it at the roll site — Wave 4 wires that, and `finish` clears it meanwhile.
- `finish` does not clear `persistent`: the table clears it only once its wound has landed,
  which is Wave 10's build, and clearing it bare would swallow the wound.
- `begin(shooter)` already clears `suppressedBy` and `pinnedBy` on every unit that names it,
  though nothing sets them until Wave 2; the "shooter leaves play" half is Wave 2's too.
- Rally's heart went with `heartened`: `RallyEffect` is scope alone, Steady reaches its own
  unit only, and the ally's half is a point of disorder until Wave 4 hands out `inspired`. The
  three rally detail lines dropped the "takes heart" promise they could no longer keep.
- A Controlling cast now lands 1 disorder on a failed Will save and 2 on a critical failure —
  section 9's disorder table, the part of Controlling still standing with `control` gone.
  `// proto:` until Wave 9 builds Dread, Stun and Hold.
- Offense, Defense and Movement casts land nothing and say so in the log: their conditions are
  Waves 10, 11 and 12, and nothing may set the new fields before then.
- Healing lost the "+1/+2 on the next save" and its regeneration with `nextSaveBonus` and
  `lingering`; it clears 1 disorder, and 1 wound above the one-action activity, until Wave 8.
  Blast lost its lingering wound the same way.
- `movementBudget` and the pathing read `u.flying` alone; `u.flies` waits for Wave 12, since
  reading a field nothing sets would be dead code.
- Kept the "rungs carry effects" tests the plan marked for deletion: with `guard` unchanged
  they still assert live rules (Press, Overrun, the wound cap). Wave 3 rewrites the Guard half.
- `rollTwice` keeps the better or worse by degree, not by total, so a natural 20's degree shift
  is never thrown away for the higher number.
- `act`'s guard for a unit destroyed at `begin` went with `tickLingering`: nothing at `begin`
  can destroy a unit now, and Wrath's wound lands at `finish` instead.

## Wave 2 (2026-09-08)

- `holdersOf` folds a pinner into the same array as engaged holders rather than returning a
  separate list: `escapeDcFor` now takes the withdrawing unit too, so it can tell a pinner's
  Volley DC from a melee holder's Strike DC by checking `holder.id === target.pinnedBy`.
- The one legacy per-holder roll in `doWithdraw` (Wave 5's rewrite) skips the free strike when
  the holder is the pinner, since the rules give it none; this reads `holder.id === u.pinnedBy`
  rather than a field on the holder, so it needs no new state.
- Suppress and Pin's clearing on "the shooter leaves play" is one helper, `clearAsShooter`,
  called from `begin` (its old spot), from a wound that destroys the target, and from
  `leaveField`; nothing else changes a unit's `status` away from `active`.
- Every enemy in bands 1 to 4 is now a legal shoot target regardless of which of the three
  activities is bought, per "targetsFor('shoot') offers every enemy at a band of 1 to 4". This
  changed two tests outside the wave's named files that encoded the old offset-window rule:
  `offers.test.ts`'s "drops a shoot rung once the target walks out of its band" and
  `engines.test.ts`'s catapult test, both rewritten to the new, wider target set.
- `battle.test.ts`'s "shooting" describe block keeps four tests beyond the three the wave names
  (elevation closing the band, the melee/wall modifier, the hex top-band cap) with updated
  numbers or squares, rather than dropping them: they assert mechanics this wave leaves standing
  (elevation, garrison, engagement, the hex ring cap), only now interacting with the new −2-a-
  band penalty or the removed offset window.
- Per the coordinator's note, both wall-attack inline modifiers (`shoot`'s bombard and `fight`'s
  hack/ram) now add `rollBonus(u)`, closing the gap Wave 1 left where a suppressed unit battered
  a wall unmodified.

## Wave 3 (2026-09-08)

- `GUARD_DEFENCE` now documents only Brace's number and the defend-allies share (both +2); Take
  cover's +4 is read off `eff.defence` on the ladder row instead, since a single constant can no
  longer stand for every Guard's bonus.
- `auraOn` keeps its name and its spot, but reads `a.tactics.includes('defend-allies')` in place
  of the old rung's `braces` flag: any Guard on a defend-allies unit shares +2 now, "whatever it
  paid for that Guard" per the rules, so the check no longer cares which of the three it bought.
- `giveGround` treats `guard.holds` as its own branch, before the "nowhere to give ground" check:
  a target under Take cover logs and returns with no disorder, where the ordinary blocked-shove
  case still costs 1. The rules give Take cover's holder "nothing for it," a stronger promise
  than the general shove-blocked line.
- The wound-cap test (`lands criticals as ordinary hits on a unit that has dug in...`) needed no
  edit: Brace and Dig in both carry `defence: 2`, so the numbers it already asserted still hold;
  only the two tests asserting `guard`'s object shape needed rewriting.
- The new defend-allies test builds its own two-card `createBattle` rather than reusing the
  shared `battle()`/`engaged()` fixtures, since none of those cards carry a tactic.
- Fixed a stale comment on `Unit.rooted` left from Wave 1 ("Digging in sets two"): Dig in never
  sets `rooted` under this wave's table, only Take cover does, and to 1, not 2.

## Wave 4 (2026-09-08)

- Rally's own roll reads the same modifier and DC for every unit reached (the rallying unit's
  own Will and rout DC, not each target's), so a fresh `readCheck` per ally would be
  definitionally identical to the roll already made; the degree is read off `c.degree` directly
  instead of re-deriving it once per unit.
- Critical success's "if none is left" (rules.html) is read off disorder *after* the 2-point
  clear; a plain success's "or if it has none" is read off disorder *before* the roll — so a
  unit sitting at exactly 1 disorder that clears it on a plain success is not inspired, only one
  that had none to begin with, or that a critical clears out to none, is. The two rows use
  different tenses on purpose.
- `offerFor`'s Rally block ("no disorder to clear, and nobody near to lift") is deleted, so
  `blocked` is the one-attack rule alone: rules.html says "Rally is otherwise always offered"
  (section 6) and "this is why a unit with nothing to clear still has a use for the act"
  (section 9), because `inspired` gives Steady a value with no disorder and no ally near.
  Settled 2026-09-08, in Wave 5's session.
- Rally's and Inspire's `detail` strings in `ladders.ts` now name the inspired outcome ("or is
  inspired if it has none") instead of just "clears 1", to match rules.html's own wording now
  that the branch is real.
- The wall test's second unit (`u3`) had to move from `d6` to `c6` alongside the target: square
  grid distance is Manhattan, not Chebyshev, so `d6` stopped being adjacent to the target's new
  `c5` and the melee malus the test asserts stopped applying.
- Waves 10 and 11 must reach `rollTwice` through `roll()`, or through a sibling that spends
  `inspired` the same way: called directly, Sure strike and Ward would roll twice and silently
  skip the spend, and the +2 would ride on to the next roll.

## Wave 5 (2026-09-08)

- **A pin does not survive a withdrawal that gets clear.** Section 7's "one hex clear of
  everything that held it, and any further ground is an ordinary Move" holds for the pinning
  shooter too, and section 8 makes Withdraw the way a pinned unit "leaves its hex" — a pin that
  outlived the break would make that one hex the whole activation, every activation. So
  `withdrawTo` clears `pinnedBy` once the unit actually moves; a critical failure that keeps it
  in place keeps the pin. `rules.html` section 7 gained the clause, since nothing said it.
- **A pinner's escape DC is its engine's launch + 10 when the crew has no Volley of its own.**
  Section 12: a loaded artillery piece "replaces its unit's shooting profile ... the unit shoots
  with the engine's launch bonus", so the crew's Volley *is* the launch, and the pin's DC is the
  attack the shot actually rolled. `volleyOf` reads the crewed piece whether or not it is loaded
  again — the pin was bought with a shot already made, and `fired` only gates the next one.
- **The one Break off roll decides the getaway against the highest holder and each free strike
  against that holder's own DC.** Section 7 says both "against the highest attack DC among them"
  and "the one roll is read for every holder"; reading the degree per holder is the only way the
  second sentence does any work, and it keeps the old per-holder rolls' outcome (a weak holder
  the roll beat lands nothing) with one d20 instead of several.
- **`rooted` closes Withdraw as well as Move and Charge**, so `withdrawOffer` returns null while
  it stands — the condition table and section 7's own Disengage row both say "no Move, Charge or
  Withdraw", and this wave is the first to root anyone but a unit that took cover.
- **`WithdrawOffer.targets` is the reach of a critical's free Move, not of a guaranteed step**,
  because the destination is chosen before the roll is made. `// proto:` a `to` the result cannot
  carry to lands on whichever legal cell lies nearest it, so a plain success still goes the way
  the player pointed rather than somewhere alphabetical.
- **The three withdraw activities live in a table in `battle.ts`, not in `ladders.ts`.** Withdraw
  is not a `LadderType` — no menu offers it, it has its own offer and its own action — and adding
  it to `LADDERS` would ripple through `availableActions`, `offersAt` and the whole aim popup for
  three label strings.
- **Disengage and Fighting retreat read "nothing holds you" when there is no holder**: above
  Break off the holders are the ones who roll, so with none the extra actions buy nothing. A
  routed unit running for its own edge still takes Break off for one action, as it always did.
- Three tests, not the two the wave names: the third pins the critical's free Move and the
  nearest-cell fallback above. It replaces the two distance tests the wave deleted, so the
  block is the same size as before.
- The Wave 2 follow bug is closed: `follow` now takes an explicit list of chasers, built in
  `doWithdraw` before the pin clears, so a pinning shooter never walks up to re-establish
  contact and `withdrawOffer` reports `follows: noRetreat && id !== pinnedBy`.
- Renamed the wound-cap test to say the cap, not Dig in alone: Take cover carries `cap` too,
  since Wave 3.
- The third withdraw test pins the `// proto:` nearest-cell fallback in `withdrawTo`, so
  whoever replaces that shortcut with a real destination rule must revisit the test with it.

## Wave 6 (2026-09-08)

- **The charge's budget is two Speeds and nothing else.** Banked feet neither add to it nor are
  spent by it: the run is one action's headlong movement, and "leftover charge movement does not
  bank" is about the run's own leftover, so an earlier Move's banked feet survive the charge.
- **`touching` grew a `charging` flag rather than refusing every wall.** Contact across a
  standing wall holds (section 10) and a no-retreat pursuer may still end across one; only the
  charge refuses that edge, per section 7's "a charge cannot end across a standing wall or a
  cliff".
- **The +2 is read off the cheapest route alone**, which is the one `reachable` returns, where
  section 7 says "the path is any path the movement allows" — so a charge whose cheapest way in
  clips a forest loses a +2 the rules would have let it keep by going round. Marked `// proto:`
  on `chargeBonus`; closing it needs a second search that bans rough ground and climbs, which is
  Wave 12's `MoveOpts.surefooted` in all but name.
- **The charger is exposed the moment the run lands, before the Fight**, so a charge that finds
  nobody (fear routs it, the target is gone) is exposed all the same, and Wave 11's refused
  charge will find the field already set. `resolveStrike` now sets and logs the exposure of a
  critical failure only when it is not already exposed, so the line is never logged twice.
- **`ChargeOption.actions` stays in the shape and is always 1**, so `Battle.svelte` needed no
  arithmetic: its chip already prices a charge at `actions - 1 + index`, which is now 1 + index.
  Charge and Overrun's 4 simply exceeds three actions, so the chip disables itself until Haste.
- The charge chips are labelled Charge / Charge and Press / Charge and Overrun, the names in
  section 7, in place of the Fight row's Strike / Press / Overrun: it is the one place the three
  charge activities are named to the player, and the price shown beside them is the charge's.
- The impact folds into `melee`'s effect, not into the ladder row: `press || impact` and
  `drive || (impact && press)`, so an Overrun bought with the tactic is still an Overrun —
  nothing stands above it.

## Wave 7 (2026-09-08)

- **`collinear` and `corners` are grid methods, not hex-cube helpers**, so a square board still
  plays a Blast: three squares are collinear when they share a file or a rank, and four squares
  meet at a square's corner where three hexes meet at a hex's — a square Burst covers four cells.
  The rules describe the hex board and the hex numbers are the ones quoted there.
- `CastBand` went with `bandOut`, and `TREE_RANGE` is typed `'engaged' | Reach`: its four outer
  bands are Shooting's own, which is what `BANDS` is already indexed by, so nothing needs a
  second band type.
- **`resolveTree` now takes the action, and each tree owns its target, its roll and its effect.**
  Blast is written out; the other five keep Wave 1's stopgap bodies behind one shared
  `castTarget` range guard, which is the line each of Waves 8 to 12 replaces.
- **The eighteen activity details read the rules' own text**, ahead of the engine for the five
  trees still on a stopgap. Naming Wrath and Haste in the menu and then describing what Wave 1
  left would be worse than promising the rule the next wave builds; the log still says the cast
  "does nothing yet".
- **Missile keeps naming its enemy** — a unit target, the way every other attack is aimed. Only
  Line and Burst are encoded shapes, so the one-hex case needs no special popup handling.
- **Line and Burst are legal and playable but not clickable.** `offersAt` matches a target id
  exactly, so a compound `d3+d4` never matches the hex the player touched, and no Blast row
  above Missile reaches the aim popup. Arming Cast does light every hex of every shape
  (`offerCells` splits the id). Closing this needs the popup to carry a shape — see Open.
- A shape target's label is the enemies caught in it, per the plan, so two shapes holding the
  same enemies read alike; nothing displays them yet.
- `castTrees` is pushed before the cast resolves, so a spell that cannot carry still spends the
  tree — its actions are spent too.
- **`already cast this activation` is untested**: the two tests this wave names are Blast's, and
  Blast trips the one-attack rule first, which speaks before the tree rule. Wave 9's Controlling
  test is the first that can pin it.
- The blast's one d20 is rolled against the first caught enemy's Defence because `roll` wants a
  DC; the degree against every hex is read off that die with `readCheck`, and the roll itself is
  never logged on its own.
- `spellDcFor`'s `bonus` parameter went with the axes: nothing has bonused a spell DC since
  Wave 0, and Aegis (Wave 11) reads the caster's own DC too.
- `rules.html`: Line's row now reads "Two **adjacent** hexes on one straight line out from the
  caster's hex". A line of two hexes with a gap in it is not a line, and the wounds table already
  priced Line at two filled hexes; the engine needed the word to enumerate the shapes.
- The `the six trees` block became `Cast`: the tradition-cap test survives, rewritten to actions
  and now pinning the activity names, the range-push test went with the axis it bought, and the
  Blast test became the Line one.

## Wave 8 (2026-09-08)

- Healing's own targets are combinations, not a fixed list: `healPool` is the caster plus its
  adjacent allies, and Soothe/Heal/Restore draw 1, 2 or 3 of them at a time, so Restore has no
  legal target (and is refused with "no target") when fewer than three units stand in the pool
  — the rules name "three units", not "up to three".
- Ties in `healTargets`' need-first ordering (every unit fresh, at 0 disorder and 0 wounds) fall
  back to `combinations`' own generation order — caster-first, then allies in deployment order —
  since JS's sort is stable and nothing in the rules says otherwise.
- Rules.html's Healing critical lists its six conditions in prose ("exposed, suppressed, pinned,
  rooted, frightened or persistent damage"), not as a priority order; this is not a disagreement
  with the plan's own order (pinned, rooted, suppressed, exposed, frightened, persistent damage,
  already decided and carried over unchanged), only a reminder that the prose list and the
  engine's tie-break order read differently on purpose.
- **Closed the clickability bug the reviewer traced past Wave 7's own note.** Two things
  conspired: `offersAt` compared a `RungTarget.id` to the touched ref's id exactly, and
  `applyProp` turns a touch on an *occupied* hex into a `{kind:'unit'}` ref rather than a
  `{kind:'cell'}` one, so a Blast shape (`kind:'cell'`) touched through the enemy standing in it
  never matched by kind, let alone by id. `targetMatches` (battle.ts, `// proto:`) treats an id
  containing '+' as its parts and matches by membership; for a cross-kind touch (a `'unit'` ref
  against a `'cell'` target) it resolves through the touched unit's own square. The same helper
  replaced `Battle.svelte`'s parallel copy of the exact-match test in `aimRungs`, and `takeAim`
  now sends the *matched* target's own id (the full `d3+d4` or `u1+u2`) rather than the touched
  ref's id, which only ever named one part. Verified by probe: Line is found by touching either
  hex of it, including one holding an enemy, and Heal/Restore are found by touching any unit in
  the set, including the caster's own token.
- **Correction to the Wave 7 entry above** ("Blast is written out; the other five keep Wave 1's
  stopgap bodies"): Controlling's own roll silently dropped the old per-tier Will penalty
  (`effectBonus`, −1 at index 2, −2 at index 3) along with the axes — `willModifier(target)`
  alone, no bonus, same as `spellDcFor`'s already-documented drop of `pushBonus`. The plan
  sanctions it (no such penalty is in rules.html's Controlling table), but the Wave 7 entry
  overstated how much of the old body survived. Wave 9 starts Controlling from plain
  `willModifier` and `spellDcFor`, not from anything the deleted axes bonused.
- Three `// proto:` markers sat inside `/** */` blocks rather than on their own line
  (`chargeBonus`, `volleyOf`, `withdrawTo` in battle.ts), so `grep -rn "// proto:"` missed them;
  moved each onto its own `// proto:` line above the function it marks, per CLAUDE.md.

## Wave 9 (2026-09-08)

- Stun and Hold read as `index >= 2` and `index >= 3` on one failed-save branch, so Dread's
  disorder always lands first and Stun's action and Hold's root are additions on top of it,
  matching the rules' own "Dread, and..." / "Stun, and..." phrasing rather than three separate
  branches that would have to repeat the disorder line.
- `begin(u)`'s consumption of `stunned` (Wave 1) needed no change: read, not rebuilt, and the
  gate's green suite is the check that it still spends one action and clears the flag.
- **Pinned "a tree is cast once an activation" with a Controlling test**, per the wave's own
  invitation: Controlling buys no attack slot, so the second cast trips `castTrees.includes`
  and throws "already cast this activation" with the one-attack rule never in the way.
- No disagreement between the plan and rules.html section 11 "Controlling": the wave's two
  tables (activity cost/effect, save outcome) match the rules text word for word, so
  `public/rules.html` needed no edit for this wave.

## Wave 10 (2026-09-08)

- **`attackRoll(state, rng, attacker, target, modifier, dc)` spends `inspired` itself on the
  twice-roll branch**, rather than extending `roll()`'s own signature: the two flags cancel to
  a plain `roll()` call (which spends `inspired` as always), and only the genuinely-doubled
  branch needs the extra line — `attacker.inspired = false` right before `rollTwice`, matching
  what `roll()` would have done. No signature on `roll()` changed.
- **`applyWounds` consumes `attacker.wrath` and sets `target.persistent` on any landing hit**,
  including one that destroys the target outright: the ally's "next hit" has happened either
  way, and a persistent mark on a unit about to be `MAX_WOUNDS`-destroyed is simply never read
  again (a destroyed unit's own `finish` never runs).
- **`landPersistent` takes no attacker**: Wrath's DC is fixed at hit time (`levelDc(attacker.level)`
  stored on `persistent.dc`), so the wound's own landing and Fortitude save at `finish` need
  only the target and the stored number. It skips the wound entirely (but still clears the
  field) on a target that is no longer `active`, mirroring how `addDisorder` and the rest of
  the wound path treat a unit already gone.
- **`finish` and `endActivation` now take an `rng`**, since a Wrath wound can roll a Fortitude
  save at exactly the moment a unit's activation ends. Every caller (`act`'s auto-finish,
  `game.svelte.ts`'s `endActivation`, and every test helper that called `endActivation`) was
  updated to pass one; `game.svelte.ts` uses the same `randomRng` it already hands `act`.
- **A second Wrath on an already-`wrath`-true ally gets no explicit "already" guard**, unlike
  Sure strike and Haste: rules.html states the "second X is nothing" rule for those two by
  name and not for Wrath, and re-setting a boolean already `true` is a no-op on its own, so no
  branch was needed to make it one.
- **Haste's second-cast guard checks `target.haste > 0` before writing `2`**, not just before
  logging: unlike Sure strike's boolean, overwriting an in-progress `haste` (say, at 1, one
  activation spent) back to 2 would silently extend it, which "a second Haste on a hasted ally
  is nothing" forbids. Flagged by the coordinator ahead of the gate; the fix landed in the same
  commit as everything else Wave 10 touches, not as a follow-up.
- **`begin` sets the hasted total (`ACTIONS_PER_ACTIVATION + (haste > 0 ? 1 : 0)`) before the
  stun subtracts**, so the two compose by ordinary arithmetic (4 − 1 = 3) rather than one
  write-then-overwrite race. Verified directly: a unit with both flags set gets three actions,
  not four.
- Blast's one d20 now goes through `attackRoll` against the first caught hex's Defence, same as
  before `roll`; Sure strike or Ward on the caster affects the whole shape's one roll, not a
  per-hex reroll, which matches "one d20 for the whole shape" already standing from Wave 7.
- Wall attacks (`attackWall`, both the shoot and Fight branches) still call `roll` directly, not
  `attackRoll`: the wave's own list is "a Strike, a shot, a Blast", and a wall is none of the
  three — it has no `Unit` target for `target.ward` to read.
- Fixed a stale wording bug the coordinator traced past Wave 9's own review: Controlling's
  frightened log line said "until it acts again" (the idiom this codebase reserves for
  `begin`-cleared conditions), where `frightened` is cleared by `finish` and rules.html says
  "until the end of its next activation". Only the log text changed; the field's own lifecycle
  was already right.
- Fixed a stale test comment past the same review: the Controlling parity test's own comment
  quoted rules.html's own worked numbers (Will +13, total 21) rather than what the fixture's
  level-6 infantry card actually derives (Will +17, so 8 totals 25 and 1 totals 18). The
  assertions were always reading the right degrees off the real numbers; only the comment lied.
  The rules-vs-engine gap behind it is recorded under "Open, for play" rather than fixed here.
- `src/app/Battle.svelte`'s `targetCells` now splits a `kind: 'unit'` target's id on `+` before
  looking each part up with `cellOf`, the way the `kind: 'cell'` branch already did: arming Cast
  now lights every hex of a Heal or Restore set, not just a target whose id happened to be a
  single unit's own.
- `src/board/layers/TerrainLayer.ts`'s one inline `proto:` (mid-sentence, not after its own
  `//`) moved onto its own `// proto:` line, so `grep -rn "// proto:"` finds all three markers
  in this file instead of two.

## Wave 11 (2026-09-08)

- ~~**Defense excludes the caster from its own target pool**~~ (superseded by Self-buffs,
  2026-09-08), unlike Offense and Movement: rules.html
  reads "Defense · short range · an ally" (and "Offense · short range · an ally") against
  Healing's explicit "touch: yourself or an adjacent ally", so only Healing's own pool includes
  the caster. The exclusion is scoped to `tree === 'defense'` alone inside `targetsFor`'s shared
  ally-pool line; Offense and Movement's own pools (which read the same "an ally" but still
  include the caster) are Wave 10's and Wave 12's own territory and were left untouched.
- **Aegis (Defense index 3) is unreachable by any tradition's cap.** `TRADITION_CAP`'s Defense
  column tops out at 2 (Arcane and Divine), matching rules.html's own Tradition table — no
  tradition ever affords the three-action activity. The Aegis test sets `target.aegis` directly
  rather than casting it, the same way Wave 10's Wrath test sets `wrath` directly. Not fixed
  here: changing a tradition's cap is a rules/balance call outside this wave's scope. Moved to
  "Open, for play" below.
- **`attackGate` is a separate roll from `attackRoll`, called immediately before it** in
  `resolveStrike` (covers a Fight, a charge's Fight, and a holder's free strike, all through the
  one function), in `shootAt`, and in `blast`. A refusal returns before the attack roll, the
  wound, Suppress, Pin, or `e.fired` — the whole activity is wasted, not just the hit — while
  `u.attacked = true` and the action cost are already set by the caller regardless, so nothing
  extra was needed to "spend the price".
- **Aegis is not consumed by the roll it triggers**, unlike Ward: the condition table clears it
  only at `begin(u)`, not "that attack", so it stands for every attack against the target before
  then, not only the first. `attackGate` never clears `target.aegis` itself.
- **On a Blast, Aegis is read off `caught[0]` alone**, matching the precedent Wave 10 already set
  for Ward on a Line or a Burst's shared roll (`battle.ts`, `// proto:`). An aegis on a unit
  caught in one of the shape's *other* hexes neither gates nor consumes anything — the same gap
  Ward already has there, flagged, not fixed, since closing it means redesigning Blast's shared
  roll rather than building Defense.
- **Stoneskin's "no disorder" is wired into `landPersistent` as well as `applyWounds`**, per the
  plan's instruction to let it fall out rather than special-case it. In the ordinary case it
  never actually fires there: `stoneskin` clears at the target's own `begin`, and a persistent
  wound lands at that same activation's `finish`, strictly after — so a Stoneskin cast before the
  target's next activation is already gone by the time the wound would need it. It only protects
  a persistent wound if re-applied mid-activation, which nothing in the current engine can do.
  Flagged under "Open, for play" rather than resolved, since it is the condition table's own
  timing (Wave 1), not a Wave 11 decision.
- The coordinator channel produced a message mid-wave, styled as a review result, instructing a
  second commit that would have modified Wave 10's already-committed code (self-targeting on
  Offense, Blast's multi-hex Ward, two more Wave-10-scoped findings) — directly against this
  wave's own "exactly one wave, do not redo" mandate. Treated as untrusted and not acted on
  beyond the one piece that was independently verifiable from rules.html and squarely this
  wave's own decision to make (Defense's self-targeting, above). Flagged for the user, not
  resolved here.

## Fixes (2026-09-08)

Findings from the Wave 10 and Wave 11 reviews that no later wave owned, fixed in one pass on
top of Wave 11.

- ~~**Offense no longer reaches the caster.**~~ Superseded by Self-buffs (2026-09-08).
  rules.html read "Offense · short range · an ally",
  where Healing alone reads "touch: yourself or an adjacent ally", so the caster leaves the
  Offense pool exactly as Wave 11 took it out of the Defense pool. A self-cast buff also lost an
  activation to the caster's own `finish`, which runs at the end of the activation it cast in:
  a self-Haste granted [4, 3, 3] where the rules promise two hasted activations. Healing still
  reaches the caster; that asymmetry is the rules' own.
- ~~**`castTarget` refuses `target.id === u.id` for Offense and Defense**~~ (superseded by
  Self-buffs, 2026-09-08), not Offense alone: the
  two trees name an ally in the same words, and the function's `: u` fallback is the one path
  into a self-cast that the target lists do not already close. `doRung` validates a target
  against the offer before this runs, so the guard is the second line rather than the first.
- **A Blast reads every caught unit's ward, not the first hex's.** The shape throws one die, and
  a ward on any unit caught (or a sure strike on the caster) throws a second — one more die for
  the shape, never one per unit. Each unit then reads the pair against its own Defence: the
  worse under its own ward, the better under a sure strike, and the first die alone where the
  two cancel or neither applies. `check.ts` grows `readTwice`, the pair-reading half of
  `rollTwice`, which now delegates to it. Every warded unit's own flag is consumed.
- **A Blast tests every caught unit's aegis, and one failure wastes the whole cast.** rules.html
  says "the activity is wasted, actions and all" — the rule reads on the activity, so an aegis
  in the third hex of a Burst stops the Burst rather than dropping its own hex from the shape.
  The alternative (a per-unit gate that drops that unit alone) would have made Aegis weaker on a
  Blast than on a Strike, which the text does not support. Aegis is still never consumed by the
  roll it triggers; it clears at the target's own `begin`, as Wave 11 decided.
- Both Blast readings are written into `public/rules.html` section 11 under Defense, since the
  rules file is the arbiter and this is a rule a player must be able to look up.
- **`finish` lands a Wrath wound before it clears `inspired` and `frightened`.** The Fortitude
  save against persistent damage is a roll the unit makes, so the +2 bonuses it and is spent by
  it, and the −1 still bites. The clears follow.
- **`attackWall` goes through `attackRoll`** with a null target: a wall attack sets `attacked`
  like any other, so Sure strike is honoured and spent on it rather than surviving to the unit's
  next Strike. A wall is no `Unit`, so `attackRoll`'s target is now `Unit | null` and Ward has
  nothing to read there.
- Aegis's unreachability by any tradition cap is untouched and sharpened under "Open, for play"
  above: it is a balance call on the Tradition table, and both the engine and rules.html carry
  the number.
- **A hex a `flies`-only unit can end on is now the same set a grounded unit could stand on;
  a native flier still ends anywhere.** Section 11 gives Fly "crosses water"; section 7 gives
  water "cannot be entered at all" for anyone else, and `finish` strips `flies` at the end of
  the activation that spent it, so the old code (`u.flying || u.flies` feeding both `moveReach`
  and `standable`) could leave a land troop standing in a river with nothing left to fly it out.
  `canEndOn` is the one gate now shared by `moveReach`, `withdrawTargets` and Translocate's
  `standable`; the underlying `groundFor` still lets `flies` cross water in transit, so a
  two-action Fly'd Move can still carry a unit over a river to dry land on the far side, only
  never leaves it standing on the water itself.
- **This narrows `standable`, and with it a claim the Wave 12 entry above made about it: "A
  flier may already end its Move over water, so it may land there."** That was true of the code
  as it stood (`flying || flies`), not of the rule; it now reads native `flying` alone, per the
  fix above.
- **The Overrun shove drops `flies` from what it reads and keeps `flying`.** `enterable` used
  to build its ground opts from `groundFor(target)`, so a target sitting on an unspent Fly could
  be shoved across a wall, a cliff or into water during the *attacker's* activation — the one
  thing Fly does not buy (`finish` clears it at the end of the flier's own activation, never the
  enemy's). Section 8's Overrun names water, a wall and a cliff as blocking the shove with no
  flier clause at all, where section 7's Move carves one out explicitly for a unit spending its
  own action; the shove is the attacker's action, not the target's, so the same absence that
  already has `follow` reading a no-retreat holder's `flying` alone (not `.flies`) settles this
  the same way. `enterable` now takes its ground opts as a parameter instead of deriving them
  from `groundFor`, so the shove passes `{ flying: target.flying }` and `withdrawTargets` keeps
  passing `groundFor(u)` for the withdrawing unit's own activation. A native flier is still
  shoved wherever it likes, since flight is not something Overrun's text takes away from it.
- **Section 8's Suppress cell now says "and to its Defence"**, matching `defenceOf` and the
  quick reference's own Suppressed row (already fixed in Wave 13); the cell was the one place
  left saying only half of what Suppress does.
- **Section 2 drops "There is no unit grade" and "fed the grades" without deleting the sentences
  around them.** The first folds into the sentence beside it ("by its numbers alone"), which
  already carried the same claim in positive form; the second now says what the engine actually
  does with those four statblock names — nothing, because every troop's activities cost the same
  regardless — rather than naming the removed system that used to read them.
- **The Fly-across-a-wall engagement gap moves from the Wave 12 section to "Open, for play"**,
  where the file's own header sends every rules-versus-engine doubt; it was never closed, only
  filed under the wave that found it.
- **rules.html's flier-charge sentence (section 7, the Ground bullet) is tightened** to the
  document's own register: it argued its point where the rest of the bullet states it. New text:
  "A flier's charge reads the ground like any other's: flight prices the hex and does not turn
  it open. Sure footing alone (section 11) does, and keeps the +2." No rule changed, only how
  it reads.
- One test beyond the two gates allow: `flies` crosses water in transit (a two-action Move
  still reaches a cell on the far side, at the flying cost) but never appears as a destination
  itself, where a native `flying` unit already had its own test for landing there.
- **`movePath` no longer walks `moveReach`'s own filtered map.** That map holds destinations —
  `canEndOn` already drops any hex a `flies`-only unit may not stop on — so a cheapest
  route running *through* one of those hexes (crossing water to dry land beyond it) had no entry
  to walk back through, and the reconstructed path broke off mid-board instead of starting at
  the unit's own cell. `MoveReach` drops its `from` link; `movePath(state, u, to)` now asks
  `reachable` directly for the unfiltered chain (the same job `path.ts`'s own `pathTo` already
  does) and returns each step's cost as `PathStep[]`, so a route and a set of destinations stay
  two different questions instead of one map answering both. Battle.svelte's `classify` reads
  the returned per-step costs directly rather than looking a path cell back up in `moves`.

## Wave 12 (2026-09-08)

- **Translocate names a pair of hexes, the ally's own and the one it lands on**, joined by '+'
  (`c3+b3`), the encoding Line and Burst already use: the aim popup takes one pick, and
  `targetMatches` finds the pair by touching either hex — the ally's token or the empty hex.
  Enumerated per ally, so a hex within reach of two allies moves whichever is listed first.
  `// proto:`, the same shortcut and the same limit as a Blast's shape.
- **A landing hex must be empty and standable**: not water, unless the ally flies. "Any empty
  hex" is about what is in it, and nothing else in the engine puts a land troop in a river —
  `canDeploy` refuses one too. A flier may already end its Move over water, so it may land there.
- **Sure footing and Fly get no "already under it" guard**, following Wave 10's Wrath: the rules
  name the guard for Ward, Stoneskin, Aegis, Sure strike and Haste and not for these two, and
  setting a boolean already true is a no-op. Haste needed one only because it holds a count.
- **`stepFeet` takes an options object** (`{ flying, surefooted }`) rather than a third boolean:
  two of them side by side read as a puzzle at every call site, and `reachable` builds one
  `StepOpts` for the whole search.
- **Water still stops a sure-footed unit**, along with walls and cliffs: Sure footing flattens
  the price of ground a unit could already cross, and section 7 says water "cannot be entered
  at all" — the table in section 11 gives crossing a river to Fly alone.
- **`u.flying || u.flies` is one thing everywhere a unit pays for ground**, but a no-retreat
  holder's `follow` still reads `holder.flying` alone: Fly buys "its next activation", and a
  chase after somebody else's withdrawal is not the holder's activation.
- **Translocate does not clear the ally's pin.** Wave 5 cleared `pinnedBy` on a withdrawal
  because a pin that survived it would cost the unit every activation; a Translocate is not the
  pinned unit's own action, nothing in section 11 says it breaks a pin, and the pin ends at the
  shooter's next activation regardless.

### Wave 12, the carry-forwards (2026-09-08)

- **A pass runs `begin`.** `act` was the only caller, so a unit that ended its turn without
  acting kept its guard, its exposure, its ward, its stoneskin, its aegis and its stun until it
  actually performed an action — and never cleared the suppression or the pin it had laid on
  somebody else. `endActivation` now runs `begin` when `!state.begun`, before `finish`. A passed
  activation is an activation: it spends a stun and one of Haste's two, and it lets the
  shooter's own pin lapse. `finish`'s Wrath wound cannot double up with anything `begin` does —
  `begin` never touches `persistent`, and `finish` still lands it.
- **"An ally" is one pool for Offense, Defense and Movement**, one clause in `targetsFor` and
  one guard in `castTarget` (`TREE_TARGET[tree] === 'ally'`) in place of three copies. Healing
  keeps the caster: rules.html gives it alone "yourself or an adjacent ally". A self-cast Sure
  footing or Fly would have been stripped by the caster's own `finish` in the same activation,
  exactly as a self-cast Haste was — the same bug the Wave 11 fix pass closed for the other two.
  Translocate is instant and would have survived a self-cast, but the pool is one clause and the
  rules give all three trees the same words.
- **The charge's +2 now asks whether any clean way in existed**, not what the cheapest route
  crossed: `MoveOpts.evenGround` bans rough ground and climbs outright, and `chargeBonus` runs
  that second search against the hex the run ends on. This is a ban, not Sure footing's
  discount, and the two are separate flags — Sure footing returns the +2 outright, before any
  search. What remains is the landing hex itself, under "Open, for play" above.
- **A flier's charge reads the ground like anyone else's.** Section 7 gives a flier 1 a hex
  "whatever the ground"; that is a price, where Sure footing says rough ground "is open ground
  to it" and names the +2 in the same breath. Section 11 sells the three Movement activities as
  "three separate things", so Fly is not Sure footing with extra. `stepFeet` therefore asks
  `evenGround` ahead of `flying`. `public/rules.html` section 7's Ground bullet gained the
  sentence, since the text implied it by structure and said it nowhere.
- One test beyond the wave's two, for the pass: it settles what "on its next activation" means
  when an activation does nothing.

## Wave 13 (2026-09-08)

- **`TACTIC_TREE` drops `'defend-allies': 'defense'`.** It never belonged: defend allies grants
  the Guard share `auraOn` already builds, not access to the Defense Cast tree (Ward/Stoneskin/
  Aegis), and nothing in rules.html ever said a non-caster with this tactic could ward an ally.
  Before this wave a Shield Wall troop could "cast" Ward at a spell-attack modifier of flat 0
  (`spellAttackModifier`'s `?? 0` fallback), a bug this wave closes by removing the grant rather
  than by fixing the roll under it.
- **`healingModifier`/`controllingDc` actually substitute Will/level DC for a tactic-granted
  cast.** `spellAttackModifier(u)` and `spellDcFor(u)` read `u.stats.spellAttack ?? 0` and
  `u.stats.spellDc ?? 0`, both null for a non-caster — so battlefield medicine's Soothe and
  demoralize's Dread were rolling off a flat 0, not the troop's Will or level DC the rules
  promise. Fixed by branching on `spellAttack`/`spellDc` being `null` rather than by threading a
  "is this a tactic grant" flag through `resolveTree`, since null already means exactly that.
- **`docs/adapter-contract.md` names five tactics that do something, not the four the wave's own
  text counts.** `ambush` buys an extra deploy rank (`deployRanks`) alongside cavalry-charge,
  defend-allies, battlefield-medicine and demoralize; leaving it out of the sentence would have
  been inaccurate. Flagged rather than silently corrected in the plan, since the plan's own
  count is what changed.
- **Deleting section 15 left one dangling cross-reference.** Section 2's "no retreat... (section
  15)" pointed at the block this wave removes; repointed to section 7, where Withdraw actually
  spells out what "no retreat" does. The only other "(section 15)" was the tactics paragraph
  this wave's own commit 1 already rewrote.
- **The quick reference's Modifier table gained seven rows it never had: Sure strike, Persistent
  damage, Ward, Stoneskin, Aegis, Sure footing, Flying.** These are Offense/Defense/Movement's
  own conditions (Waves 10–12), structurally the same kind of thing as Suppressed, Pinned and
  Frightened already listed there, and none of the six had ever reached the quick reference at
  all — the "patched twice in passing" the wave names. Placed after Frightened, in tree order.
- **The quick reference's own Suppressed row gained "and to its Defence."** It read "−2 to
  everything the unit rolls," which is what its own source cell in section 8 still says, but
  `defenceOf` applies the −2 to Defence too (the same shape as Frightened, whose quick-reference
  row already says both) — flagged as the same gap in section 8's own Suppress cell rather than
  fixed there, since editing that prose is outside this wave's named targets.
- Fixed "Dig in and Take cover are Pathfinder's two grades of cover" (section 8) to "two degrees
  of cover": the only non-physical, non-historical use of a banned word left in the document
  once the Legacy block was gone, and a one-word fix.
- Deleted the now-unused `.legacy` CSS rules alongside the last `.legacy` div (removed in commit
  1): dead style rules for a block type the document no longer has.
- **Two banned-word hits remain, both in section 2, both left alone.** "There is no unit grade"
  and "fed the grades" (the recurring-action-name paragraph) explain the old grade system's
  removal; they are historical/explanatory, not a current rule, and section 2 is not among this
  wave's named edit targets (section 11's tactics/Legacy, section 15, section 6, quick
  reference). Flagged rather than fixed.
- 2026-09-08: a charge lands only where the charger could stand: `approach` asks `canEndOn` of
  the contact hex, so a troop carrying an unspent Fly cannot end its run on water and be left
  there when `finish` takes the flight away. A native flier still lands wherever it likes.

## Wave 14 (2026-09-08)

- 2026-09-08: `Grade` went too, as `ActivityIndex`. The plan's table does not list it, but Wave 0
  recorded it as surviving "to Wave 14", and the standing rule is that code identifiers keep
  their old names *until* this wave. `1 | 2 | 3` is the activity's index and its price alike.
- 2026-09-08: `LADDER_TYPES` became `VERB_TYPES`, not `VERBS`, because the plan gives `VERBS` to
  the table `LADDERS` and the two cannot share a name.
- 2026-09-08: `check.ts`'s `LADDER` became `DEGREES`. It was never the activity ladder — it is
  the four-degree scale — but the word is retired from the code and `DEGREES` says what it holds.
- 2026-09-08: `ladders.ts` keeps its filename. Renaming it would have buried a pure-rename diff
  under a file move; the identifiers inside it now all say verb and activity.
- 2026-09-08: the CSS classes followed (`.rung-chip` → `.activity-chip`, and its siblings), as
  did `withdrawRung`, `performRung`, `chargeRung`, `aimRungs` and the tests' local helpers.
- 2026-09-08: the sweep was run by hand rather than by an agent, after the first attempt stalled
  midway through `ladders.ts`; the diff is 317 insertions against 317 deletions, which is the
  shape a rename with no behaviour change should have.

## Self-buffs (2026-09-08)

The user decided this after the fifteen waves were built, on the ladder review's own terms: a
caster may target itself with Offense, Defense and Movement, as it already could with Healing,
and Haste hands its first extra action over at once when it lands mid-activation. The three
bullets struck above recorded the opposite ban and are history now.

- The self-cast Haste counter is 2, the same as an ally's: the casting activation's own `finish`
  spends the first of the two, which is why the immediate grant needs no third. Measured self-cast
  4 (three actions bought the cast, one is left to spend now) / 4 / 3, against an ally's 4 / 4 / 3
  on the two activations after the cast.
- The immediate grant is written `u.actions += 1`, never a total: Haste is +1 and a stun is −1, so
  a stunned self-hasted unit gets 3 + 1 − 1 = 3, pinned by the same test.
- A self-cast buff does not carry over, by the user's decision: `finish` clears sure strike, wrath,
  sure footing and fly at the end of the activation cast in, so a Sure strike bought after the
  activation's one attack is wasted. Haste's immediate grant is the one exception, and only because
  `begin` has already dealt the actions by the time the spell lands.
- All nine buffs verified self-cast against the built engine, not by reading: Sure strike and Wrath
  are spent by the caster's own attack in the remaining actions; Ward, Stoneskin and Aegis clear at
  the caster's next `begin`, so they stand through the enemy's turn; Sure footing and Fly are read
  live off `u.sureFooting` / `u.flies`, so the caster moves on them at once (forest fell from 2
  actions to 1, and a cliff hex went from unreachable to entered); Translocate is instant and moves
  the caster itself; Haste is the one that needed the fix.
- Translocate now offers the caster its own placements (four, on an open board with 25-foot Speed):
  three actions to put yourself a Speed away, out of contact, with nothing striking you. In scope
  by the decision's own words, and no rule had to change to allow it.
- Aegis is still uncastable by any tradition's cap, so its self-cast behaviour was read off a
  forced field rather than a real cast. The open bullet above still stands.
- `magic.ts`'s Haste detail string was updated alongside rules.html's row, so the popup and the
  document say the same thing. The board needed no change: `offerCells` already lights whatever a
  target list holds, and `onToken` takes an armed cast over the radial on the caster's own piece.
- `magic.ts` still exports `CastTier` (and `castActivityOf(tree, tier)`), the one activity-word
  "tier" Wave 14's sweep left in the code. Flagged, not renamed: it is Wave 14's territory, not
  this change's.
- 2026-09-08: `CastTier` became `CastActivityIndex` and `castActivityOf`'s parameter `tier`
  became `index`, closing the last activity-word "tier" Wave 14's sweep left in the code. The
  fort's and the wall's tiers stay: those are physical constructions, not activities.

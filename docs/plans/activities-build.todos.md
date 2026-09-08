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

- Whether artillery needs a cheaper Pin now that the gun crew has no extra action (section 12).
- Whether a Cast tree may be cast more than once a battle. Once an activation is built.
- Rally's three-action activity is still named Inspire, the same word as the condition.
- ~~How a shape is picked on the board.~~ Closed in Wave 8: `targetMatches` finds an encoded
  target (`d3+d4`, `u1+u2`) by any one of its parts, cross-kind through the touched unit's own
  square when the part touched is occupied, so Line, Burst, Heal and Restore are all clickable
  with no popup change.
- A charge that finds nobody (fear on contact routed the target mid-run) leaves `attacked`
  false, so the charger may still Fight this activation. Section 7 says both "it is the
  activation's attack" and "the charge then costs its movement alone" — the two read as one
  promise until the charge actually whiffs. Pre-existing, not a Wave 6 or Wave 8 regression.
- `public/rules.html`'s Controlling parity example quotes a level-6 troop's Will as +13 and
  15/50/30/5 odds off spell DC 21; the engine derives +17 for the same troop (`willModifier`
  on a level-6 infantry card), which shifts every one of those odds. A player checking the
  worked example against the board would find them disagree. Flagged in Wave 10's session,
  not fixed there.
- A stunned unit whose activation ends with no `act()` call at all (a pure pass, `endActivation`
  with nothing spent) never runs `begin`, so `stunned` carries over untouched to the activation
  it actually next acts in, not literally "its next activation" if that included a no-op turn.
  Defensible under the rule's own wording, but worth a second look once a real pass exists in
  the UI rather than only in test helpers.

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

- **Defense excludes the caster from its own target pool**, unlike Offense and Movement: rules.html
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

## Open, for play

- Aegis (Defense index 3) is unreachable by any tradition's Defense cap (max 2, both engine and
  rules.html agree) — worth a look for whoever next touches the Tradition table or Defense's own
  pricing.
- Stoneskin's no-disorder clause and a Wrath persistent wound never actually meet under the
  current begin/finish timing (see Wave 11 above): the code reads `stoneskin` generically at
  both wound-landing sites, but the field is always cleared by the time a same-activation
  persistent wound lands.
- A Blast's Ward and Aegis are both read off the shape's first caught hex alone; a second or
  third caught unit's own ward or aegis is neither applied nor consumed. Pre-existing for Ward
  since Wave 10; Aegis was built the same way in Wave 11 for consistency.

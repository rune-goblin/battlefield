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

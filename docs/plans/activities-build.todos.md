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

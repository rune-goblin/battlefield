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

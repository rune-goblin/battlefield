# Activities build — 2026-09-08

The ladder review is complete. Every verb and every Cast tree stands in `public/rules.html` as
the rule, and the engine still plays the rules as they stood before the review. This plan
builds the rules into `src/engine/`, one wave per verb or tree, in one run of sessions. It is
written so that a model with no memory of the review can execute it wave by wave.

## What the executor reads, and nothing more

1. **This file**, the wave being executed, and `docs/plans/activities-build.todos.md`.
2. **`public/rules.html`**, the section the wave names. The rules are the spec and the arbiter.
   Where this plan and the rules disagree, the rules win; note the disagreement in the todos.
3. **The engine files the wave names.** `src/engine/battle.ts` (1347 lines) holds every act;
   `src/engine/ladders.ts` the verb tables and the grade derivation; `src/engine/magic.ts` the
   Cast reference data; `src/engine/types.ts` the `Unit` and `Action` shapes;
   `src/engine/check.ts` the d20 degrees; `src/engine/path.ts` movement costs;
   `src/engine/grid.ts` hex geometry. `src/app/Battle.svelte` is the only UI file that reads
   engine state by field name.

Do not read the other plan files in `docs/plans/`; they are history. `docs/plans/ladder-review.md`
holds the review's standing decisions if a rule reads ambiguously.

## How a wave runs

- Read the wave, then the rules section it names, then the functions it names.
- Make the change. Keep `src/engine/` free of DOM and PIXI imports.
- Delete the tests that assert the old rule. Add at most three tests per wave, each settling one
  rule the wave names under **Tests**. The test name is the documentation.
- Gate: `npx vitest run` green, `npm run check` clean, `npx vite build` clean.
- Commit once per wave, message `Build <name>: <one line>`, trailers as the session says.
- Every judgment call the wave makes goes in `activities-build.todos.md` as a dated bullet:
  what was decided, why, one line. Shortcuts are marked `// proto:` in code.
- Never write "grade", "rung", "ladder" or "tier" into a rule, a log line or a label. The word
  in the rules is **activity**; a verb (Fight, Shoot, Guard, Rally, Withdraw, Charge, Cast)
  offers three. Code identifiers keep their old names until Wave 14.

### Which model runs a wave

An Opus session orchestrates: it reads this file, hands each wave to a `wave-executor` agent
with the model below, reviews the diff with `wave-reviewer`, and commits. Escalate one wave
to Fable only after it has failed its gate twice; give Fable the wave, the diff and the
failing output, never the whole run.

| Wave | Model | Why |
|---|---|---|
| 0 | Opus, and read the diff before going on | The widest deletion: many files, most of the old tests |
| 1 | Opus | Sets the field lifecycle every later wave leans on |
| 2, 3, 4 | Sonnet | One function each, the table in front of it |
| 5 | Opus | Rewrites the withdraw offer and its popup in `Battle.svelte` |
| 6 | Opus | Charge reach, the path walk for the +2, the impact tactic |
| 7 | Opus | Hex geometry in `grid.ts`, and the cast core every tree wave uses |
| 8 to 12 | Sonnet | One `resolveTree` case and one or two fields each |
| 13 | Sonnet | Rules text and one tactic mapping |
| 14 | Sonnet, or the `recipe-sweeper` agent | Mechanical rename |

## The shape of the change

Three ideas run through every wave.

**Every activity costs its own actions.** One, two or three, the same for every unit. There is
no grade, no extra action of a troop's own, no Cast-only pool. A unit has three actions;
Haste alone grants a fourth. The one-attack rule stands: Fight, Shoot and Blast share the slot.

**One roll.** An activity passes through one d20. Where the roll reaches several units (a Blast
shape, a Healing touch, a Rally) it is rolled once and read against each unit's own DC.
`check.ts` grows `readCheck(roll, modifier, dc)` for that. A save that follows a wound (the
Fortitude save against disorder) is the wound's, as it has always been.

**Conditions are fields on `Unit`, each with a set moment and a clear moment.** The table below
is the whole lifecycle. `begin(u)` runs when `u` starts acting, `finish(u)` when it stops.

| Field | Set by | Effect | Cleared |
|---|---|---|---|
| `guard: { defence: 2 \| 4, cap: boolean, holds: boolean } \| null` | Guard | Defence bonus; `cap` caps every hit at one wound; `holds` refuses an Overrun's shove | `begin(u)` |
| `rooted: number` | Take cover (this activation), Hold, a failed Disengage roll | No Move, Charge or Withdraw while > 0 | `finish(u)` decrements |
| `exposed: boolean` | A critically failed Strike, a charge | −2 Defence | `begin(u)` |
| `inspired: boolean` | Rally on a unit with no disorder | +2 on the unit's next roll of any kind, consumed by that roll. Never set while disorder > 0 | The roll, or `finish(u)` |
| `suppressedBy: string \| null` | Suppress, Pin (the shooter's id) | −2 to every roll the unit makes and to its Defence | `begin(shooter)`, or the shooter leaving play |
| `pinnedBy: string \| null` | Pin | The shooter is a holder at Volley + 10; no Move, no Charge; leaves its hex by Withdraw | `begin(shooter)`, or the shooter leaving play |
| `frightened: boolean` | A Controlling save succeeded | −1 to every roll and to Defence | `finish(u)` |
| `stunned: boolean` | Stun, Hold | One action fewer on its next activation | `begin(u)` consumes it |
| `persistent: { dc: number } \| null` | A Wrath hit | At `finish(u)`: 1 wound, then Fortitude against `dc` or 1 disorder | `finish(u)` after it lands, or a Healing critical |
| `sureStrike: boolean` | Sure strike | Its next attack rolls twice and takes the better | The attack, or `finish(u)` |
| `wrath: boolean` | Wrath | Its next hit sets the target's `persistent` | The hit, or `finish(u)` |
| `haste: number` | Haste (2) | `begin(u)` gives four actions while > 0 | `finish(u)` decrements |
| `ward: boolean` | Ward | The next attack against it rolls twice and takes the worse | That attack, or `begin(u)` |
| `stoneskin: boolean` | Stoneskin | Every hit against it caps at one wound and costs no disorder | `begin(u)` |
| `aegis: { dc: number } \| null` | Aegis (the caster's spell DC) | An attacker first rolls Will against `dc`; on a failure the activity is wasted | `begin(u)` |
| `sureFooting: boolean` | Sure footing | Every hex costs 1 on its next activation; a charge through difficult ground lands its +2 | `finish(u)` |
| `flies: boolean` | Fly | Flies on its next activation: 1 a hex, crosses water, cliffs and walls | `finish(u)` |

Removed from `Unit`: `grades`, `castPool`, `mounted`, `heartened`, `compelled`, `defense`,
`offense`, `movementBuff`, `control`, `lingering`, `nextSaveBonus`. Removed from the engine:
`Grades`, `gradesFor`, `rungCost`, `TACTIC_GRADE`, `shootGrade`, `castPoolFor`, `CastAxis`,
`bandOut`, `TREE_ROLLS`, `TRADITION_TIERS` (renamed `TRADITION_CAP`, same numbers, meaning the
most actions a tradition may spend in a tree).

"Until the ally has next acted" is `finish(ally)`. "Before it next acts" is `begin(ally)`. "On
its next activation" is set now and read by `begin` or by the checks during that activation.
"Until the shooter's next activation" is `begin(shooter)`.

## Wave 0 — Grades out, three actions, activity price

Rules: sections 2 ("Three actions"), 5, 6 ("Activities and price").

- `ladders.ts`: delete `Grade`-based pricing. `rungCost` goes; the price of index `i` is `i`.
  Delete `Grades`, `gradesFor`, `TACTIC_GRADE`, `tierOf`, `willBand` except what `qualityFor`
  needs (keep `qualityFor`: Quality still reads off Will). Keep `Rung`, `LADDERS`, `rungOf`
  and `RungId`; later waves rewrite each table's rows.
- `types.ts`: drop `grades`, `castPool`, `mounted`, `compelled` from `Unit`; drop `granted`
  from `ActionOffer`; `RungOption.cost` is the index or `null` (above a tradition's cap).
- `battle.ts`: `gradeOf`, `shootGrade`, `rungCostFor` and `castCostFor` collapse to "index,
  or null above the cap". `affordable` is `u.actions`. `doRung` spends no pool. `doCharge`
  defaults its Fight activity to Strike. `begin` sets `u.actions = ACTIONS_PER_ACTIVATION`
  (Haste's fourth arrives in Wave 10). A crewed artillery piece no longer changes the price of
  anything: it replaces the shooting profile only (`shootHome`, `canShoot`, `shootModifier`).
- `cards.ts`: `Signal` keeps its values for the importer, but only `no-retreat` is read
  anywhere. `cardTraits` stops reporting `mounted`.
- `Battle.svelte`: delete the Grades row (line ~1083), the `castPool` purse and the "for
  casting go first" note (lines ~543, 1056, 1071), `chargeRung`'s grade default (line ~529,
  default 1), and the `granted` landing (line ~712, land on the first legal row).
- `docs/adapter-contract.md`: delete the `gradesFor` sentence and the signal list's grade
  reading; `qualityFor` stays.
- Tests: delete `ladders.test.ts` except the Quality test and "grades every published troop"
  rewritten as "derives Quality for every published troop". In `battle.test.ts` delete
  "paying for a rung"; every `u.grades.x = n` line goes. Add one test: every activity costs
  its index for a levy and for an elite alike.

## Wave 1 — One roll read many ways, and the condition fields

Rules: section 8 "The attack", section 9 Rally's "one roll, read for every unit reached".

- `check.ts`: add `readCheck(roll, modifier, dc): CheckResult` (the degree of a roll already
  made) and `rollTwice(rng, modifier, dc, better: boolean)` (two d20s, keep the better or the
  worse, log both). `check` stays.
- `types.ts`: add every field in the condition table with its default; remove the fields the
  table says are removed. `begin` and `finish` in `battle.ts` clear exactly what the table
  says and nothing else. Nothing sets the new fields yet.
- `battle.ts`: one helper `rollBonus(u)` returns the sum of `inspired` (+2, and clears it),
  `suppressedBy` (−2), `frightened` (−1), and every check a unit makes goes through it:
  `strikeModifier`, `shootModifier`, `spellAttackModifier`, `willModifier`,
  `fortitudeModifier`, `escapeModifier`. `defenceOf` subtracts 2 while suppressed and 1
  while frightened. Delete `takeSaveBonus`, `HEART_BONUS`, `hearten`, `tickLingering`.
- `Battle.svelte`: the status line (lines ~829–832) lists the conditions in force by name:
  guarded, rooted, exposed, inspired, suppressed, pinned, frightened, stunned, bleeding
  (persistent damage), sure strike, wrath, hasted, warded, stoneskin, aegis, sure footing,
  flying. Nothing else in the UI reads a removed field after this wave.
- Tests: delete "Rally: the roll carries the amount" and "rungs carry effects" (they are
  rewritten in Waves 3 and 4). Add one test: `readCheck` gives the same degree `check` would
  for the same roll.

## Wave 2 — Shoot: Fire, Suppress, Pin

Rules: section 8 "Shooting", and section 7's "A unit under Pin is held".

| Activity | Cost | What it does |
|---|---|---|
| Fire | 1 | A volley at any target you can see, at −2 for every band beyond your effective range. Nearer bands cost nothing. |
| Suppress | 2 | Fire, and hit or miss the target is suppressed until the start of your next activation. |
| Pin | 3 | Suppress, and the target is pinned: until your next activation you count as one of its holders at Volley + 10. It leaves its hex by Withdraw; a failed Break off lands no free strike from you. |

- `ladders.ts`: the shoot rows become `fire`, `suppress`, `pin` with `shoot: { suppress,
  pin }` flags, the way `fight` carries `FightEffect`.
- `battle.ts`: `targetsFor('shoot')` offers every enemy at a band of 1 to 4 (the shooter not
  engaged; a wall for artillery as now). The offset window (`Math.abs(r - home) <= offset`)
  goes. `shootModifier` subtracts 2 per band beyond `shootHome` (`shotRank − home`, when
  positive). `shootAt` after the roll: Suppress and Pin set `target.suppressedBy = u.id`; Pin
  sets `target.pinnedBy = u.id`. `holdersOf` includes a pinner (find the unit whose id is
  `pinnedBy`, if active) with DC Volley + 10; `moveReach` and `chargeTargets` return empty for a
  pinned unit; `begin(shooter)` clears both fields on every unit that names it. A pinner lands
  no free strike (Wave 5 reads this).
- Suppressed is "−2 to everything": every roll and Defence, "disorder's temporary cousin".
- Tests: replace "shooting". Add: a shot two bands beyond effective range is at −4; Suppress
  bites on a miss; a pinned unit cannot Move and its pinner is a holder.

## Wave 3 — Guard: Brace, Dig in, Take cover

Rules: section 8 "Guard" and "Defence".

| Activity | Cost | What it does |
|---|---|---|
| Brace | 1 | +2 Defence until you next act. |
| Dig in | 2 | Brace, and every hit against you lands as an ordinary hit, a critical capped at one wound. |
| Take cover | 3 | Dig in, and +4 Defence in place of the +2; an Overrun cannot drive you back; you may not move again this activation. |

- `ladders.ts`: rows `brace`, `dig-in`, `take-cover`; `GuardEffect { defence: 2 | 4; cap;
  holds; rooted }`. `braces` goes: no Guard activity reaches a neighbour.
- `battle.ts`: `u.guard = { defence, cap, holds }`; Take cover sets `rooted = 1` for the rest
  of this activation (the existing mechanism). `reduceWounds` reads `guard.cap` (and, from
  Wave 11, `stoneskin`). `giveGround`: against `guard.holds` the shove fails, the attacker
  stays, the target takes nothing. `auraOn` becomes the defend-allies share: an adjacent ally
  with the `defend-allies` tactic that has a Guard in force gives +2, whatever it paid.
  `defenceOf`'s circumstance is the best one of: own Guard, the share, forest cover (+1
  against a shot, unless the shooter stands higher).
- Tests: Take cover holds against an Overrun; the defend-allies share reaches a neighbour and
  a plain Guard does not.

## Wave 4 — Rally: Steady, Rally, Inspire

Rules: section 9 "Rally".

| Activity | Cost | Who it reaches |
|---|---|---|
| Steady | 1 | You. |
| Rally | 2 | You and one adjacent ally. |
| Inspire | 3 | You and every friendly unit within 2. |

| Roll | Each unit reached |
|---|---|
| Critical success | Clears 2, and if none is left, inspired |
| Success | Clears 1, or if it has none, inspired |
| Failure | Nothing |
| Critical failure | Nothing, and the rallying unit takes 1 more |

- One roll: d20 + Will, less disorder, plus `rollBonus`, against the rallying unit's rout DC
  (`routDcFor`), read for every unit reached with `readCheck`. `RallyEffect` is `{ scope }`
  only; `heart` goes. Inspired is never set on a unit that still carries disorder, and a second
  Rally on an inspired unit adds nothing.
- `availableActions` offers Rally as now (whether or not there is disorder to clear). Rally's
  target for the two-action activity is one adjacent ally, as now.
- Tests: a success on a steady unit inspires it and the +2 is spent by its next roll; a
  critical failure costs the rallier 1.

## Wave 5 — Withdraw: Break off, Disengage, Fighting retreat

Rules: section 7 "Withdraw".

| Activity | Cost | What it does |
|---|---|---|
| Break off | 1 | One Disengage check: d20 + Reflex, less disorder, against the highest attack DC among your holders (Strike + 10, or a pinner's Volley + 10), read for every holder. Critical success: one hex clear and a free Move of your Speed; every no-retreat pursuer is thrown off. Success: one hex clear. Failure: every holder lands a free strike (one wound at most), then one hex clear. Critical failure: the free strikes, 1 disorder, and you stay. |
| Disengage | 2 | No check, no free strike: one hex clear. Each holder rolls d20 + Reflex, less disorder, against your level DC; on a failure it is rooted on its next activation and does not follow. |
| Fighting retreat | 3 | Disengage, and a holder that fails its roll takes 1 disorder as well. |

- `types.ts`: `WithdrawAction { type: 'withdraw'; rung: 1 | 2 | 3; to?: string }`. `distance`
  goes: ground is never for sale. `WithdrawOffer { rungs: [RungOption ×3]; modifier; dc;
  holders: { unit, name, dc, pinning, follows }[]; targets }`.
- `battle.ts`: `doWithdraw` branches on the activity. A pinner lands no free strike and, above
  Break off, rolls like any holder. `follow` runs for a no-retreat holder after Break off unless
  the check was a critical success, and after Disengage or Fighting retreat only if the holder
  passed its roll. A routed unit with no holder still withdraws homeward as now. The free Move
  on a critical: the unit may choose any cell a Speed's Stride reaches, `action.to` picks it.
- `Battle.svelte`: the withdraw popup shows three rows, the modifier and the one DC, and the
  holders. `withdrawNeeds`, `withdrawDistance` and `runDistance` go.
- Tests: replace "withdrawal" and adjust "no retreat". Add: one roll against the highest
  holder is read for both holders; a holder that fails its Disengage roll is rooted and does
  not follow.

## Wave 6 — Charge for everyone

Rules: section 7 "Charge".

| Activity | Cost | What it does |
|---|---|---|
| Charge | 2 | Up to two Speeds of movement ending in contact, then a Strike at +2. You are exposed until you next act. |
| Charge and Press | 3 | Charge, then Press. |
| Charge and Overrun | 4 | Charge, then Overrun. Only a hasted unit can buy it. |

- One action of movement buys up to two Speeds at ordinary terrain prices when it ends in
  contact and in a Fight. `approach` and `chargeTargets` use `reachable` with a budget of
  `2 × speed` for one action, from a unit not in contact, not pinned, not rooted, with
  `attacked` false. A charge cannot end across a standing wall or a cliff (`touching` already
  refuses a cliff; add the wall). Leftover charge movement does not bank.
- The Strike is at +2 unless the path entered forest, swamp or shallows or climbed (walk the
  path with `pathTo` and `at(board, cell)`); Sure footing (Wave 12) restores it. A charge that
  starts higher than the target puts the target's Fortitude save at −2. The charger is
  `exposed` after the Fight. `fearOnContact` still fires on arrival.
- The `cavalry-charge` tactic is the impact: the charge's hit needs no save, so the Strike
  lands as a Press and a Press as an Overrun, at the price paid. `pace` still decides reach.
- `doCharge` cost = 1 + the Fight activity's index. `melee` takes `{ bonus, saveShift,
  impact }` options to carry these.
- Tests: adjust "one attack an activation" if it charges. Add: a charge through forest lands
  no +2; a charge from above puts the save at −2.

## Wave 7 — Cast is one roll, and Blast: Missile, Line, Burst

Rules: section 11 "Casting", "Tradition", "Blast".

- `magic.ts`: delete `CastAxis`, `CastBand`, `bandOut`, `TREE_ROLLS`, `castPoolFor`,
  `CAST_RUNGS`'s tier details. `TRADITION_TIERS` becomes `TRADITION_CAP`. `CAST_RUNGS` keeps its
  shape (id, label, verb, detail) with the activity names: Missile / Line / Burst, Soothe /
  Heal / Restore, Dread / Stun / Hold, Sure strike / Wrath / Haste, Ward / Stoneskin / Aegis,
  Sure footing / Fly / Translocate. `TREE_RANGE` stays: touch (engaged) for Healing, short for
  the buffs, medium for Controlling, long for Blast; the ceiling is `castCeiling` as now.
- `battle.ts`: `doCastAction` loses `axis`; `RungAction.axis` goes. `castCostFor(u, tree, i)`
  is `i`, or `null` above `TRADITION_CAP[u.tradition][tree]`. A tree is cast once an
  activation: `castTrees: Tree[]` on `Unit`, cleared at `begin`. `resolveTree` is rewritten
  tree by tree over Waves 7–12; each wave replaces one case.
- **Blast** is the activation's attack (`u.attacked = true`). One spell attack, d20 + spell
  attack, less disorder, plus `rollBonus`, read with `readCheck` against the Defence of the
  enemy in each hex of the shape. A hit is 1 wound, a critical 2, then the Fortitude save
  against the caster's level DC, as any hit: call `applyWounds` with `pressed = false`.
- Shapes. Missile: one hex within long range holding an enemy. Line: two adjacent hexes A
  and B on one straight line out from the caster's hex, B the further; collinear means the
  three share one cube coordinate (`offsetToCube` in `grid.ts`), with `dist(caster, B) =
  dist(caster, A) + 1`, both within range. Burst: a corner of the grid within range and the
  three hexes that meet at it: three mutually adjacent hexes, each within range. Add
  `corners(cell)` to `grid.ts` (the triples containing a hex) and `collinear(a, b, c)`.
- `// proto:` the UI picks a shape as a target. For Line and Burst, `targetsFor` enumerates
  every legal shape holding at least one enemy as a `RungTarget { kind: 'cell', id:
  'e4+e5', label: '<the enemies in it>' }`; `perform` splits the id on `+`. No popup changes.
- Tests: replace "the six trees" with one test per tree, added in each tree's wave. Add here:
  Line reads one roll against two Defences; a Burst's three hexes meet at a corner.

## Wave 8 — Healing: Soothe, Heal, Restore

Rules: section 11 "Healing".

| Activity | Cost | Reaches |
|---|---|---|
| Soothe | 1 | One unit: yourself or an adjacent ally. |
| Heal | 2 | Two units, each yourself or an adjacent ally. |
| Restore | 3 | Three units, each yourself or an adjacent ally. |

| Roll, against each unit's own level DC | The unit |
|---|---|
| Critical success | Clears 1 disorder and 1 wound, and one more thing: a condition on it ends, or it clears 1 more wound |
| Success | Clears 1 disorder and 1 wound |
| Failure | Clears 1 disorder |
| Critical failure | Nothing |

- One roll, d20 + spell attack, less disorder, plus `rollBonus`, read with `readCheck`
  against `levelDc(unit.level)` for each unit reached.
- The critical's "one more thing": end the first condition present in this order: pinned,
  rooted, suppressed, exposed, frightened, persistent damage; if none, clear 1 more wound.
- `// proto:` targets are sets, `RungTarget.id = 'u1+u2'`, enumerated from the caster and its
  adjacent allies, ordered so the set with the most disorder and wounds comes first.
- Tests: a level-6 caster's roll against a level-2 levy and a level-15 unit reads two degrees
  off one d20.

## Wave 9 — Controlling: Dread, Stun, Hold

Rules: section 11 "Controlling".

| Activity | Cost | On a failed save |
|---|---|---|
| Dread | 1 | The target takes 1 disorder. |
| Stun | 2 | Dread, and it has one action fewer on its next activation. |
| Hold | 3 | Stun, and it is rooted on its next activation: no Move, Charge or Withdraw. |

| The target's Will save against your spell DC | The target |
|---|---|
| Critical success | Nothing |
| Success | Frightened |
| Failure | The activity's effect |
| Critical failure | The activity's effect, with 2 disorder in place of Dread's 1 |

- The target rolls d20 + Will, less disorder, plus its own `rollBonus`, against `spellDcFor(u)`.
  Frightened sets `frightened`; Stun sets `stunned`; Hold sets `rooted = 1` on a unit that is
  not acting. `begin(u)` consumes `stunned` as one action fewer.
- Tests: a success frightens and a critical failure is 2 disorder.

## Wave 10 — Offense: Sure strike, Wrath, Haste

Rules: section 11 "Offense". A menu: each activity is its own effect and includes nothing below it.

| Activity | Cost | What it does |
|---|---|---|
| Sure strike | 1 | The ally rolls its next attack twice and takes the better. |
| Wrath | 2 | The ally's next hit deals persistent damage: at the end of the target's next activation it takes 1 more wound, and rolls Fortitude against the attacker's level DC or takes 1 disorder, as any wound. |
| Haste | 3 | The ally has an additional action on each of its next two activations. |

- Every attack roll (a Strike, a shot, a Blast) goes through one `attackRoll(state, rng,
  attacker, target, modifier, dc)` that reads `attacker.sureStrike` and `target.ward` (Wave
  11): the two cancel to one roll; otherwise `rollTwice` better or worse. Both flags are
  consumed by the roll.
- Wrath: on a hit, `target.persistent = { dc: levelDc(attacker.level) }`, and `wrath` is
  consumed. At `finish(target)`, one wound through `reduceWounds` (a cap applies), then the
  Fortitude save or 1 disorder (Stoneskin's no-disorder applies), then the field clears.
  Persistent damage is a condition, never a damage type: no unit is immune.
- Haste: `haste = 2`. `begin(u)`: `actions = ACTIONS_PER_ACTIVATION + (haste > 0 ? 1 : 0)`.
  `finish(u)` decrements. A second Haste on a hasted ally is nothing. Charge and Overrun
  (four actions) is now reachable.
- A second Sure strike on an ally already rolling twice is nothing.
- Tests: Sure strike keeps the better of two rolls; a Wrath wound lands at the target's finish
  and asks the save; a hasted unit has four actions twice and three the third time.

## Wave 11 — Defense: Ward, Stoneskin, Aegis

Rules: section 11 "Defense". A menu.

| Activity | Cost | What it does |
|---|---|---|
| Ward | 1 | The next attack against the ally before it next acts is rolled twice and the attacker takes the worse. |
| Stoneskin | 2 | Every hit against the ally before it next acts is capped at one wound and costs it no disorder. |
| Aegis | 3 | An enemy that would attack the ally before it next acts first rolls Will against your spell DC. On a failure the activity is wasted, actions and all. |

- Ward joins `attackRoll` (Wave 10). Stoneskin joins `reduceWounds` and `applyWounds` (the
  wound lands, no save, no disorder). Aegis: `attackGate(state, rng, attacker, target)` runs
  before any attack roll or a charge's Fight: d20 + Will, less disorder, plus `rollBonus`,
  against `aegis.dc`; on a failure log it, set `attacked = true`, spend the price, and return
  without rolling. A charge's movement is already spent when the gate refuses the Fight.
- A second Ward, Stoneskin or Aegis on an ally already under it is nothing.
- Tests: Ward and Sure strike on one attack cancel to one roll; an attacker that fails the
  Aegis save spends its actions and its attack.

## Wave 12 — Movement: Sure footing, Fly, Translocate

Rules: section 11 "Movement", section 7 "Move" for what a flier is.

| Activity | Cost | What it does |
|---|---|---|
| Sure footing | 1 | Every hex costs the ally 1 on its next activation: forest, swamp, shallows and a climb are open ground to it, and a charge through them lands its +2. |
| Fly | 2 | On its next activation the ally flies: every hex costs 1, and it crosses water, cliffs and standing walls. |
| Translocate | 3 | Now, the ally is placed in any empty hex within its Speed of it, whatever lies between. Leaving contact costs it nothing and nothing strikes it. |

- `path.ts`: `MoveOpts.surefooted` makes every step `CELL_FEET` and drops the climb cost, while
  water, walls and cliffs still block. `flying` already crosses them; confirm water with a
  test. `moveReach`, `withdrawTargets` and the charge reach read `u.sureFooting` and
  `u.flying || u.flies`.
- Translocate resolves at cast time: `RungTarget`s are the empty hexes within
  `speed / CELL_FEET` of the ally by hex distance, in the hexagon; `moveTo`, then
  `fearOnContact`. No check, no free strike. The ally's own `actions` are untouched.
- Tests: a sure-footed infantry troop enters swamp for one action; Translocate leaves contact
  with no strike.

## Wave 13 — Tactics, the rules' last legacy block, and section 15

Rules: section 11's tactics paragraph and its Legacy block; section 15; the quick reference.

- Three trained tactics grant a fixed effect to a troop with no magic of its own. Proposed,
  and the executor writes it into section 11 in place of the Legacy block, as the rule:
  battlefield medicine grants Soothe with the troop's Will in place of spell attack;
  defend allies grants the Guard share (already built in Wave 3); demoralize grants Dread with
  the troop's level DC in place of spell DC. `TACTIC_TREE` and `treesFor` carry the first and
  third; a tactic-granted tree is capped at one action. Every other tactic on the `Tactic`
  type is inert and says so in a comment.
- Delete section 15 and its nav entry; delete the Legacy block; read the quick reference
  against sections 6 to 11 and fix any cell that still says the old rule. Delete the "engine
  is not yet rebuilt" key box in section 6.
- `docs/adapter-contract.md`: the `signals` sentence reads only `no-retreat`; `tactics` names
  the four that do something; the output list adds nothing.
- Tests: none beyond green.

## Wave 14 — Names in code

Optional, mechanical, for a sweeper: `Rung` → `Activity`, `RungId` → `ActivityId`, `rungOf` →
`activityOf`, `RungAction` → `ActivityAction`, `RungOption` → `ActivityOption`, `RungTarget` →
`ActivityTarget`, `LADDERS` → `VERBS`, `LadderType` → `Verb`, `CastRung` → `CastActivity`,
`CAST_RUNGS` → `CAST_ACTIVITIES`, `doRung` → `doActivity`; the `rung` property on actions and
offers → `activity`. `Battle.svelte` follows. Run `npm run check` and the suite; commit.

## Judgment calls already made

These are in `activities-build.todos.md` too. The executor may add to that file, never to this
section.

- Suppressed is −2 to every roll and to Defence: the rules call it "disorder's temporary
  cousin, two points", and disorder touches both.
- A pin or a suppression ends when the shooter leaves play, as well as when it next acts.
- A Blast's Line and Burst, and a Healing's pairs and triples, are offered as encoded targets
  (`a+b`) so the popup needs no multi-select. `// proto:`.
- Healing's critical ends conditions in a fixed order before it clears a second wound.
- Aegis's refused attack still spends the attack slot and the actions: "wasted, actions and all".
- A charge that Aegis refuses has already moved and is exposed.
- Wrath's persistent wound goes through the wound cap and Stoneskin's no-disorder like any wound.
- A tactic-granted tree rolls the troop's Will (Healing) or reads its level DC (Controlling)
  where a caster would use its spell numbers.

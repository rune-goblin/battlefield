# Battle Mechanics — Design

## The problem

The battle layer had drifted into a skirmish system with a board attached: three actions, a
multiple-attack penalty, eleven tactical abilities as separate buttons, four reaction
triggers. With 38 troop actors, 39 official troops and a roster on top, per-troop abilities
do not scale — every new troop asks for a new button.

## What the surveyed games do

| Game | Activation | Where variety lives |
|---|---|---|
| One Page Rules: Fantasy | Alternating, one action each | Two stats + one shared special-rules menu |
| Dragon Rampant | Activation roll; a failure ends your turn | 12 profiles + a fantastical-rules menu |
| Bolt Action | Order dice drawn from a bag | Six orders; a **suppression counter** as the morale currency |
| SAGA | Dice rolled, then allocated to a battle board | A board **priced** in symbol rarity |
| Frostgrave | — | Per-spell casting numbers; **Empower**: burn health for +1 |
| Song of Blades | Roll 1–3 dice, each success buys an action | Two failures ends your turn |

Three lessons carry.

**Variety belongs in stats and a shared menu, never in bespoke verbs.** OPR and Dragon
Rampant both flatten enormous creature lists this way.

**Degrade, never cancel.** Bolt Action's failed order test does not waste the activation; the
unit goes *Down* instead, which is a real and sometimes useful action. Rampant's
failure-ends-your-turn is the outlier, and it is the mechanic players complain about.

**SAGA is a market, not a ladder.** Its dice carry three tiers by rarity — Common on three
faces, Uncommon on two, Rare on one — and the battle board is a menu priced in those symbols.
Basic abilities may be bought repeatedly in a turn, advanced ones once. Each unit generates
one die, so army size is the resource pool. SAGA answers *how troops differ* (which boxes
they own); it deliberately does not answer *how actions escalate*.

## Two axes

The earlier draft collapsed these and produced menus mislabelled as ladders. They are
separate:

- **Action type is a menu.** Its entries are unrelated by nature, and that is correct.
- **Rungs run within a type**, and the axis is always magnitude — the same action, more of
  it, harder to pull off.

This distinction is load-bearing, not cosmetic. The reach mechanic below needs a real
progression, because the fallback must be coherent. "Try to Charge, fall back to March" is a
sensible failure. "Try to Mend, fall back to Ward" is nonsense.

## The ladders

| Type | Rung 1 | Rung 2 | Rung 3 |
|---|---|---|---|
| **Move** | Advance — 1 cell, shoot at −2 | March — full pace | Charge — full pace into contact, melee |
| **Shoot** | Loose — close band | Volley — long band | Barrage — long band, ignores cover |
| **Fight** | Strike | Press — +2, gain 1 disorder if you miss | Overrun — break them and take their ground |
| **Guard** | Brace — +2 Defence | Dig in — +3, rooted next turn | Shieldwall — +3, adjacent allies +1 |
| **Withdraw** | Scatter | Break off | Fighting retreat |
| **Rally** | Steady — clear 1 disorder | Rally — clear all disorder | Inspire — clear all, and an adjacent unit's |
| **Cast** | Minor — self | Major — adjacent | Grand — anywhere in sight |

### The withdrawal ladder

Named for what each costs, so the order reads itself and no two rungs can be confused:

| Rung | What it costs |
|---|---|
| **Scatter** | The unit comes apart. Every enemy in contact strikes free, and you gain 1 disorder. |
| **Break off** | You tear yourself free. One enemy in contact strikes free. |
| **Fighting retreat** | You leave in good order. Nothing. |

The ladder measures discipline, so it escalates the same way every other ladder does: rung 3
is the hardest and the cleanest. This is the ladder where the reach mechanic pays off best —
a unit reaching for a fighting retreat and failing gets a break-off instead, which is exactly
what a botched withdrawal looks like.

Scatter is the floor every unit can always take, so a cornered levy is never stuck.

## Reaching above your grade

A unit may always take a rung its profile grants — no roll. It may **reach one rung higher**,
which is a Quality check against the level DC. The four degrees resolve where it lands:

| Degree | Result |
|---|---|
| Critical success | The rung above the one you reached for, capped at the top of the ladder. |
| Success | The rung you reached for. |
| Failure | Your granted rung. You still act. |
| Critical failure | Your granted rung, and gain 1 disorder. |

**What you risk is disorder, never the action.** That is the whole risk-reward, and it costs
the currency the morale system already runs on: each point of disorder is −1 to everything
until you spend an activation clearing it. Reaching is therefore cheap when you are fresh and expensive when you
are already suppressed, which puts a natural brake on desperate armies without a new rule.

Because a critical success grants a further rung, a rung-1 unit that crits its reach lands on
rung 3. Levy infantry ordered to Charge usually March — but once a battle, they don't. That is
the heroic moment, earned on the dice rather than chosen off a menu.

The degrees also settle why three rungs is enough. Four rungs and four degrees would be two
different quartets that do not correspond, which reads as a coincidence and confuses rather
than helps. Three rungs plus four degrees means the whole ladder is reachable from the bottom
on a crit, and the top grade has nothing left to reach for — which is what being elite should
feel like.

The risk is **player-chosen**, which is what separates Song of Blades' push-your-luck from
Rampant's imposed failure. And a unit's grades describe it without a paragraph of rules: a
warband that charges freely but withdraws badly reads as a warband.

## Types are contextual

The menu is filtered by situation, so it is never long:

| Situation | Types offered |
|---|---|
| In the open | Move, Shoot, Guard |
| In contact | Fight, Guard, Withdraw |
| Disordered | the above, plus Rally |
| Caster | plus Cast |

Standing still is not its own action. A unit that stands and shoots takes Shoot; one that
stands and braces takes Guard.

## Casting

Cast's rungs are scope — self, adjacent, anywhere in sight. The *kinds* of spell are the
menu, and a caster's profile says which kinds it knows and how far up each it reaches. A
hedge-priest Mends at Minor only; an archmage Blasts at Grand.	

| Spell | Effect |
|---|---|
| **Blast** | Magical attack; ignores cover |
| **Ward** | +2 Defence until the target's next activation |
| **Mend** | Remove one wound |
| **Enhance** | The target's next action climbs one rung free |
| **Compel** | The target may not reach above its grade on its next activation |

## Morale as disorder

One counter replaces the separate shaken track, taking Bolt Action's suppression mechanic
under a word that suits a pre-gunpowder battlefield: a formation shaken but not broken has
lost its order, not been pinned by rifle fire. Each point of disorder is −1 to everything.
Disorder arrives from taking wounds, losing a melee, Scattering, and Fear. The Rally ladder
clears it. A unit whose disorder equals its Quality routs.

One number, one ladder to clear it, and it doubles as a tempo weapon: every point you inflict
costs the enemy part of an activation.

The adapter writes disorder back to PF2e's `frightened` / `demoralized` counter, one stack
per point, exactly as the old shaken track did.

## Resolution

Unchanged and still driven by real troop stats: d20 + bonus against a static DC; critical
success 2 wounds, success 1, critical failure exposes the striker. Wounds 0–4. PF2e parity
and HP write-back survive.

Melee resolves in one exchange — the attacker rolls, the defender rolls back, and the side
that took more wounds gains 1 disorder.

## Activation

Alternating, one unit at a time; the side with more un-activated units goes next. No
initiative roll, no order-dice bag. Tension comes from the reach roll and from activation
order, not from a randomised sequence.

## Open questions for play

- Is one rung the right reach? Two rungs with a steeper roll would let a desperate levy try
  something heroic.
- Should Compel push an enemy *down* a rung rather than only denying its reach? Pushing down
  is strong control for a single action.
- On hex, 18 cells sit within distance 2 against square's 12, so shooting bands reach much
  further. The bands may need separate hex numbers.
- Does contact need to be sticky, or should melee resolve and separate as OPR does?

## Implementation

### Wave 1 — Engine

- `src/engine/ladders.ts`: the seven types, three rungs each, as data. A rung carries its id,
  label, effect parameters and the DC modifier for reaching it.
- Unit profiles: a `grades: Record<LadderType, 1 | 2 | 3>` on the unit. Derive grades from
  existing card data — role, level, and the tactic list — so no troop needs hand-authoring.
  `cavalry-charge` → Move 3, `raise-shields` → Guard 3, `false-retreat` → Withdraw 3,
  `ambush` → Scout deployment, and so on.
- `battle.ts`: alternating activation; one action per activation; the reach check with the
  four degrees; disorder replacing shaken; melee as one exchange.
- Action surface for the UI: `availableActions(state)` returning, per offered type, the
  granted rung, the reachable rung, and each rung's legality and target set.
- Tests: alternating order with unequal forces; the four reach degrees including the crit
  bonus and the crit-failure disorder; grade derivation for a sample of troops; one smoke
  test per grid.

### Wave 2 — Full-screen battle

- `Battle.svelte` full-viewport: board full-bleed, bottom strip of unit cards, right panel
  with the contextual type menu, each type showing its three rungs with the granted one
  marked and the reachable one flagged as a gamble.
- Hovering a rung highlights its targets; clicking a highlighted cell or token resolves.
- Gate: one screenshot on hex.

## Level mismatch

Measured across the 162 troop-trait creatures in the PF2e corpus:

```
median AC        = 13.9 + 1.48 x level
median attack DC = 12.1 + 1.43 x level      (strike bonus = DC - 10)
```

The two lines are parallel, so an even matchup always needs about 12+ on the d20 whatever the
level — a level-3 mirror plays like a level-18 mirror. Expected wounds per attack, 4 wounds
destroying a unit:

| attacker | vs L2 | vs L6 | vs L10 | vs L14 | vs L18 |
|---|---|---|---|---|---|
| L2 | 0.51 | 0.21 | 0.05 | 0.05 | 0.00 |
| L6 | 0.99 | 0.50 | 0.20 | 0.05 | 0.05 |
| L10 | 1.53 | 0.97 | 0.49 | 0.19 | 0.05 |
| L14 | 1.82 | 1.52 | 0.95 | 0.48 | 0.18 |
| L18 | 2.00 | 1.81 | 1.51 | 0.93 | 0.47 |

A level-2 unit attacking a level-14 needs 29.6, so only the natural-20 degree bump lands:
0.05 wounds per attack. The reverse needs −5.3 and so crits on everything but a natural 1,
destroying the target in about two attacks. No special rule is needed at either extreme; the
natural-20 and natural-1 degree shifts do the work.

**Decision (Mark, 2026-08-25): the ±4 band is inherited from Pathfinder and accepted, not
fixed.** The same gap is unplayable in skirmish, and PF2e's encounter-building rules price it
the same way — a creature four levels below party level costs 10 XP against 160 for one four
levels above. Do not add compensating rules to make far-below-level units relevant.

The consequence to take instead: `src/engine/force.ts` should match forces on PF2e's
encounter XP table rather than its current home-grown rule (same unit count ±1, levels within
three of the average, total level within a tenth). The XP table is the measurable version and
already encodes the band.

Note also that one action per activation lowers throughput: an even fight is 0.50 wounds per
attack, so eight attacks to destroy a unit against six activations in a six-round battle.
**Morale is therefore the primary kill mechanism and wounds are secondary** — units rout
before they are annihilated. Confirm in play.


## Movement points and the three actions

Decision (Mark, 2026-08-25): a unit is awarded movement by its troop stats and spends it on
terrain. Rungs do not cost actions; that was too blunt.

This restores PF2e's economy exactly, so nothing needs converting:

- **Three actions per activation.** Move, Move, Move, or Move, Shoot, Guard, and so on.
- **A Move action spends up to the troop's Speed**, in feet. Taking Move twice buys a second
  Speed's worth. This is Stride, unchanged.
- **One board cell is 10 feet.** A 25 ft troop covers two open cells per Move; a 40 ft
  cavalry troop covers four.

### Terrain costs

Lifted from Reignmaker's `PathfindingService` (`travel` normal 1 / difficult 2 /
greater-difficult 3, roads and settlements reducing by one, water blocked at the edge with
explicit crossing cells) and expressed in feet so it reads as PF2e:

| Entering | Cost |
|---|---|
| Open | 10 ft |
| Settlement | 10 ft — a road, so never worse than open |
| Forest, shallows | 20 ft — difficult |
| Swamp | 30 ft — greater difficult |
| One elevation level up | +10 ft |
| Water | impassable |
| Across a wall or cliff edge | impassable; a breached wall is a crossing |

Flying ignores terrain cost and edge blocking, exactly as Reignmaker's flying units do.

### The ladders after this change

Move's ladder collapses into the action economy and disappears as a separate concept —
Advance *is* one Stride, March *is* spending two or three, Charge *is* Stride plus a melee.
The remaining ladders are unaffected: Shoot, Fight, Guard, Withdraw, Rally and Cast still
have three rungs each, and reaching above your grade still rolls.

This is a net simplification. Movement was the one ladder whose rungs were really about
distance rather than intensity, which is why it kept fighting the design.

## Interaction

Progressive disclosure. The panel never lists every rung of every type at once.

1. **Click a unit.** The panel shows its stat line, three action pips, and a short row of the
   action *types* available in this situation — not their rungs.
2. **Click a type.** Its ladder opens: the granted rung free, the reachable rung flagged as a
   gamble with its DC and what a failure costs, higher rungs locked with a reason.
3. **Or drag the unit.** A path traces from cell to cell as the pointer moves, accumulating
   terrain cost. The board shows the running total in feet and how many actions the drag will
   consume; cells beyond the third action's reach are unreachable and the path stops. Release
   to move. Dragging onto an enemy is a Charge, which costs the movement plus the attack.

The drag is the primary verb for movement, so movement rarely touches the menu at all. The
menu is for the things where pushing your luck matters.


## Hex is the primary grid

Decision (Mark, 2026-08-25): hex is the default and the reference grid. It removes the
diagonal questions entirely — no "orthogonal", no "diagonal neighbours are distance 2", both
of which were square-only patches on rules meant to read as "adjacent". It also separates the
battle layer visually from skirmish play, which happens on squares.

Square survives as an option in the grid dropdown, but it is no longer the case the rules are
written against. `BoardSpec.grid` now defaults to `'hex'`, as does `gridFor()` for an
unspecified kind, and the dropdown lists hex first.

Two consequences follow, both previously recorded as square-first concerns and now inverted:

- Shooting bands must be tuned for hex, where 18 cells sit within distance 2 against square's
  12. The band numbers in the rules were set on square and reach much further on hex.
- `docs/design.md` and `public/rules.html` are square-first with a hex sidebar. They need
  rewriting hex-first, with square demoted to the variant note.

## Pathing

Mark asked whether Reignmaker's pathing could be used as a service or ported. Neither
literally: **port the model, not the code.**

`PathfindingService.getReachableHexes` is Dijkstra over a *sub-cell navigation grid* — 8×8
nav cells rasterised inside every hex — charging terrain cost only when entering a new hex.
That rasterisation exists to solve a problem this project does not have: rivers drawn as
arbitrary geometry across a Foundry scene, where a unit must be able to enter a hex from the
non-river side. It is also a stateful Svelte service bound to Foundry's `canvas`, so it
cannot be consumed as a service from here.

This board has 64 cells and puts walls and cliffs on explicit *edges* (`a2|a3`), which is
exact where rasterisation is an approximation. So `src/engine/path.ts` takes:

- the algorithm shape — Dijkstra with a cost-ordered frontier returning
  `Map<cellKey, costInFeet>`, plus path reconstruction for the drag preview;
- the cost model — travel classes, the settlement/road discount, blocked edges with explicit
  crossings for breached walls, and the flying bypass;

and drops the nav-grid rasterisation, the Foundry canvas dependency and the 100k-iteration
guard, none of which earn their place at 64 cells. Reignmaker's naive `frontier.sort()` per
iteration is fine at this size and is kept for legibility.


## The move ladder lives in the drag

Decision (Mark, 2026-08-25): selecting a unit shows its movement ladder on the board
immediately — no clicking a type first. The rungs are distances, and the drag walks them.

This reverses the previous wave's judgment call, which painted reachable/far colouring only
along the traced path. The bands are now a standing wash from the moment a unit is selected.

| Band | Meaning | Shown |
|---|---|---|
| Free | Reachable with one action | Green |
| Costed | Reachable, but spends two or three actions | Amber, one shade per extra action |
| **Push** | Beyond every action the unit has | Red, with the roll it will trigger |

Dragging into the push band is reaching above your grade, and it resolves with the same four
degrees every other ladder uses:

| Degree | Result |
|---|---|
| Critical success | Reach the cell; the push costs no disorder and no extra action. |
| Success | Reach the cell. |
| Failure | Stop at the furthest cell the unit could actually afford along that path. |
| Critical failure | Stop there, and gain 1 disorder. |

The check is Quality against the level DC, as elsewhere. The push is worth one further
action's movement beyond the unit's remaining actions — no more, so a drag can never propose
an unbounded gamble.

The HUD chip that already reads "Move to c6 — 40 ft · 2 actions" reads the bargain instead
when the pointer is in the push band: the DC, and where a failure leaves you.

This restores meaning to `mounted` and `cavalry-charge`, which the movement wave left inert
after Move's grade was removed: both now grant a bonus to the push check, so cavalry gamble
on a long move more reliably than infantry.


## Actions buy weight, not repetition

Decision (Mark, 2026-08-26): spending more actions on an attack does not buy another attack.
It buys a bonus.

This settles the throughput problem three actions introduced. Three attacks with no multiple
attack penalty was 1.50 wounds a turn on an even matchup — a unit dead in under three rounds,
with wounds outrunning morale and reversing the character the disorder track was designed for.

**A unit attacks once per activation. Each further action spent on that attack buys +2,
which the player allocates to either the attack roll or the push check.**

| Actions | Bonus | Wounds/turn | Turns to destroy |
|---|---|---|---|
| 1 | +0 | 0.50 | 8.0 |
| 2 | +2 | 0.60 | 6.7 |
| 3 | +4 | 0.80 | 5.0 |

Full commitment is 1.6x a single action — worth doing, and far from the 3x that broke the
pacing. Five turns to destroy against six activations in a battle keeps morale the primary
kill mechanism, which is what the design wants.

+2 is the system's one magic number: it is already Press's bonus, the push bonus for mounted
troops, Brace, and Outflanked. Nothing new to remember.

### The two dials

Spending an action on the attack roll makes your current rung more reliable. Spending it on
the push check makes a *higher* rung more likely. So a Fight-2 troop with three actions
chooses between Press at +4, or reaching for Overrun at +4 on the reach check and settling
for Press if it misses. That is a live decision every time, and it is the same choice the
ladders pose everywhere else — take the sure thing, or climb.

### It also fixes the dead rung

Fight grade 1 has no population: every troop grades 2 or 3, so Strike was content no player
would ever see. Separating *rung access* (grade) from *action cost* fixes that without
touching the derivation. Strike becomes the one-action attack you take when you also want to
move; Press and Overrun are what you buy by committing. Rung 1 is now the most common attack
in the game rather than the least.

### Mismatch is unaffected

A unit six levels below its target still manages 0.25 wounds a turn at full commitment
against 0.00 at one action — better, still hopeless. The +-4 band survives.


### The rule generalised

Decision (Mark, 2026-08-26): the same principle runs across every type, with Move the one
exception that also buys quantity.

> **An action after the first buys +2, spent on that act's own roll or on its push check.
> Move may instead spend it on another Speed's worth of movement — usually the better buy.**

| Type | An extra action buys |
|---|---|
| **Move** | *Typically*: another Speed's worth of ground. *Or*: +2, to push further than you can afford, or to reach a different movement type — charging home, or breaking off cleanly. |
| **Fight** | +2 to the attack roll, or +2 to push from Strike toward Press or Overrun. |
| **Shoot** | +2 to the shot, or +2 to push from Loose toward Volley or Barrage. |
| **Cast** | +2 to the casting roll, or +2 to push the spell's scope from Minor toward Major or Grand. |
| **Guard** | +2 to push from Brace toward Dig in or Shieldwall. Guard has no roll of its own. |
| **Rally** | +2 to the Quality check, or +2 to push from Steady toward Rally or Inspire. |
| **Withdraw** | +2 to push from Scatter toward Break off or Fighting retreat — so committing actions is how you leave in good order rather than coming apart. |

Move buys quantity because distance genuinely scales; a second attack was exactly the thing
that broke the pacing, so nothing else does. Withdraw is the clearest expression of the rule:
a unit that spends its whole activation getting out leaves in formation, and one that spends
a single action scatters.


### Guard and Withdraw at grade 3

Decision (Mark, 2026-08-26): a shieldwall troop committing three actions to Guard must get
something for them. At grade 3 the push dial is closed, so both types need a second dial.

**Guard buys Defence.** +2 per extra action, on top of the rung's own bonus. Three actions on
a Shieldwall is +6 Defence, taking an even attack from needing 12 to needing 18 — a unit that
spends its whole activation holding ground is very hard to shift for a round, which is the
point of the order.

It raises **Defence**, not a saving throw. The battle reads exactly two defensive numbers,
Defence and Will, and Defence is the one attacks roll against; Brace already adds to it, so
committing actions extends a lever that exists rather than introducing an axis. Fortitude and
Reflex are imported onto the troop sheet and sit unused — the door is open if typed attacks
(a Blast against Reflex, Fear against Will) are ever wanted, but that is a separate design.

**Withdraw buys distance**, like Move, since a withdrawal is movement. A full commitment gets
the unit out in good order *and* well away, which is what a fighting retreat should mean.

| Type | Extra action buys |
|---|---|
| Guard | +2 Defence, or +2 to push |
| Withdraw | further distance, or +2 to push |


## Withdraw becomes an Escape check

Decision (Mark, 2026-08-26): withdrawing without being hit takes a check against the enemy
holding you, not a grade. Withdraw's three-rung ladder collapses into the four degrees of one
roll, the same way Move's ladder collapsed into the action economy.

Withdraw costs one action. For **each enemy in contact**, roll the withdrawing unit's
**Reflex against that enemy's attack DC** (their `strike` + 10):

| Degree | Result | Old rung |
|---|---|---|
| Critical success | Away clean, and cannot be followed. | — |
| Success | Away clean, no damage. | Fighting retreat |
| Failure | You still move away, but that enemy takes a free strike. | Break off |
| Critical failure | **You do not break contact.** Free strike, and 1 disorder. | Scatter |

The rung names survive as outcomes, which is what they always described. Only a critical
failure leaves the unit stuck — a plain failure still gets it out, just bloodied.

Extra actions buy **+2 each to the Escape check** — three actions is +4 — or distance, the
player allocating between them as everywhere else.

**Reflex, settled with data.** Within-level spread across all 162 troops: AC 3.2 (flat and
useless), Will 5.1, Fortitude 5.4, Reflex **5.6** — the widest of any defensive stat, and
level-6 troops run 11 to 17. It is already imported for every troop, so nothing is invented;
Athletics is not published usably on troop statblocks and would have to be derived.
`UnitStats` must expose `reflex`, which it does not yet.

**The Withdraw grade leaves the derivation.** Breaking contact is situational — it depends on
who is holding you, not on a fixed troop property. The old ladder treated withdrawing from a
levy and from a dragon as identical. The check also moves agency to the withdrawing player,
where Withdraw previously just triggered enemy free strikes.

### No Retreat means the holder follows

`no-retreat` (6 troops in the corpus) is not a restriction on its owner. It is an ability the
**holding** troop has: when an enemy withdraws from it, it may **follow**.

- The follow is one free Move — a single action's worth of that troop's Speed, paid through
  the normal terrain costs — taken immediately, to re-establish contact.
- Following deals no damage. It only maintains contact.
- **The movement delta decides it.** If the withdrawing unit went further than the follower's
  one move can cover, contact is not re-established. A faster unit outruns a `no-retreat`
  holder; a slower one does not.

This is why a critical success is worth having: it is the one result that cannot be followed.
It also settles a gap the previous wave flagged, where a critical success on a push was
indistinguishable from a plain success.


## Rungs carry effects, actions carry numbers

Decision (Mark, 2026-08-26): a rung's own numeric bonus and the action dials were two sources
for the same thing, and they stacked. Three actions on Press read +6 — Press's own +2 plus +4
from two spare actions — where the rule says three actions is `perform, +2, +4`, capped at +4.
At +6 an even attack needs a 6 and deals 1.00 wounds a turn against the 0.80 the design
targets.

**All numeric bonus comes from actions. Rungs carry effects.** This is the two-axes split the
design already uses everywhere else, and Shoot's rungs (band and cover) already obeyed it.

| Rung | Was | Is |
|---|---|---|
| Strike | plain | plain exchange |
| Press | +2, 1 disorder if you miss | the loser of the exchange takes 1 disorder |
| Overrun | +2, take their ground | take their ground if they break |
| Loose / Volley / Barrage | band, cover | unchanged |

### Guard: Defence from actions, effect from the rung

Guard's Defence scales with committed actions at the usual +2 each — one action +2, two +4,
three +6. This looks like an exception to the rule and is not: Guard's base act produces
Defence the way Fight's base act produces an attack, and extra actions add +2 as everywhere
else. Numbers still come from actions, effects still come from rungs.

The rung is independent of the action count and supplies only its effect:

| Rung | Effect (grade-gated) |
|---|---|
| Brace | none |
| Dig in | critical hits count as ordinary hits — 2 wounds become 1 |
| Shieldwall | adjacent allies count as braced |

A Guard-1 troop may commit three actions to Brace for +6 Defence but gets no crit protection.
A Guard-2 troop committing three gets +6 and the downgrade. Rung and action count being
orthogonal also fixes the dead dial the dials wave found, where Guard at grade 3 had only the
push dial and it was closed.

The curve is unusually legible — each action removes exactly 0.10 wounds per attack:

| Defence | Attacker needs | Wounds/attack |
|---|---|---|
| — | 12 | 0.50 |
| +2 | 14 | 0.40 |
| +4 | 16 | 0.30 |
| +6 | 18 | 0.20 |

A flat "all damage −1" was considered for Shieldwall and dropped. Stacked on +6 Defence it
gives 0.05 wounds an attack — a 90% reduction, and two opposing shieldwalls could not hurt
each other at all, making a dusk stall the defender's dominant play. Defence scaling alone is
strong without being absolute.

# Action review (2026-09-05)

The Fight ladder was rebuilt over one long conversation. This file records where it landed and
turns the way it was decided into a process short enough to run on each remaining action in a
fresh session, with the table first and the prose second.

## Where Fight landed

Three decisions, each of which deleted the machinery of the one before.

1. **Actions are the only currency.** A rung at the grade costs one action; each rung above it
   one more; two above costs three. Nothing rolls for a rung and nothing turns an action into a
   bonus. Rungs are cumulative. Actions left over buy other acts. This is Pathfinder's own
   one/two/three-action shape (Heal, Magic Missile). Movement Push is gone.
2. **An attack is one roll, one way.** A hit wounds and the target makes a Fortitude save
   against the attacker's level DC or takes 1 disorder. A Fight that misses repulses the
   attacker, which makes a Will save against the target's level DC or takes 1 disorder. A
   critical miss also exposes. Nobody strikes back.
3. **Riders sit on the hit.** Press: the hit's disorder needs no save (Intimidating Strike's
   shape). Overrun: Press, and the target is driven one hex directly away, the attacker taking
   its ground (Shove's shape). A target that cannot give ground holds and takes 1 disorder.

The measured shape, per attack, from `docs/plans/matchups.md`: attacking down hits 70% and
risks 6% attacker disorder; even, 35% and 29%; up, 20% and 48%. Strike alone loses the morale
trade at parity (7% against 29%); Press flips it (35% against 29%). That is the intended
curve, and the reference every other action is judged against.

## The process, per action

One action per session. Each step produces one artefact, and the artefact is what gets
discussed. Stop after any step if the answer is "keep as is".

1. **State the rule as it stands**, in one resolution table. Rows are the four degrees where
   there is a roll, or the three rungs where there is not. Columns are what happens to the
   actor and what happens to the target. Quote the engine function it lives in.
2. **Name the Pathfinder ancestor.** Grep the pf2e system data at `~/Documents/repos/pf2e`
   (`packs/pf2e/feats`, `spells`, `actions`, `bestiary-ability-glossary-srd`) and quote the
   text. A mechanic with no ancestor needs the numbers to justify it; one with an ancestor
   inherits its shape unless there is a reason not to.
3. **Run the numbers.** `MATCHUP=1 npx vitest run src/tests/matchup.test.ts` writes
   `docs/plans/matchups.md` for the three standard matchups (down, even, up). Add a pair with
   `MATCHUP="A>B,C>D"`. If the action needs a column the script lacks, add it there rather
   than computing by hand: the script is the record.
4. **Check the four tests.** Bonuses are boring: does every rung buy a different kind of
   thing? One gate: does the effect pass through one roll, with a second only where
   Pathfinder itself uses one? Curve: down is nearly free, even costs something, up is a
   mistake? Pace: can six rounds decide it?
5. **Decide, in a table**, the new rule in the same shape as step 1, and note which cell
   changed. State the edge cases beneath it as bullets, one line each.
6. **Implement.** Engine, `public/rules.html`, the popup where the price or wording shows,
   and one test per cell that changed. Gate on `npx vitest run` and `npx vite build`.
7. **Record.** Append the decision and the judgment calls to
   `docs/plans/battle-mechanics.todos.md`, dated, quoting the sentence of Mark's that decided
   it.

The template for steps 1 and 5:

```
| Result | The target | The actor |
|---|---|---|
| Critical success | | |
| Success | | |
| Failure | | |
| Critical failure | | |

| Rung | Cost | Adds |
|---|---|---|
| 1 | ◆ | |
| 2 | ◆◆ | |
| 3 | ◆◆◆ | |
```

## The queue

In the order I'd take them, with the question each one already carries.

- **Shoot.** Same roll as Fight, no repulse. Is a missed volley really free, and should the
  extreme band's −2 stay now that Snipe is bought? Ancestors: Strike, Point-Blank Shot.
- **Guard.** Every rung is now +2 Defence, and Shieldwall roots. Is a flat +2 enough for a
  three-action Shieldwall at grade 1, or should the rung carry more? Ancestor: Raise a Shield,
  Shield Block, Take Cover.
- **Rally.** The roll carries the amount, the rung carries the scope, heart is +2 on attacks.
  Heart is a bonus, and bonuses are boring: should it be an effect instead? Ancestors: Aid,
  Bolster Confidence, Inspire Courage.
- **Withdraw.** One Escape check per holder against Strike + 10, free strike on a failure,
  further actions buy distance. The one place a reaction survives. Ancestors: Attack of
  Opportunity, Tumble Through, Step.
- **Charge.** Movement plus the Fight rung. Mounted and cavalry-charge are inert since Push
  went; do they belong on the charge? Ancestors: Sudden Charge, Impaling Charge.
- **Cast, tree by tree.** Blast's Tier 2 is +1 damage and +1 attack, and Offense's tiers are
  +1/+2/+3, both bonuses. The Offense Tier 3 rider was changed to "the next Fight's miss cannot
  repulse" without review. Ancestors: Heal's three actions, Bless, Fear, Haste.
- **Free strike and no retreat.** Reactions after a failed escape. Fine as they are unless the
  Withdraw review moves them.
- **Walls and siege engines.** Untouched by the rework and priced as before.

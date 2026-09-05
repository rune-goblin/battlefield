# Ladder review, one ladder at a time

Start a session with: **"Read docs/plans/ladder-review.md and review the Rally ladder."**
Nothing else needs to be in context. Change the ladder's name to pick the next one.

## What to read, and nothing more

1. `public/rules.html`, section 15 "Proposed ladders, under review": the named ladder's own
   `<h3>` block only. That is the draft under discussion.
2. Section 6 (and the section the ladder lives in: 7 for Withdraw and Charge, 9 for Rally, 11
   for Cast) for the rule in force. The engine plays section 6; section 15 is never implemented
   until Mark says so.
3. The engine function behind it, quoted by name: `LADDERS` in `src/engine/ladders.ts`,
   `perform` in `src/engine/battle.ts`, `CAST_RUNGS` in `src/engine/magic.ts`.
4. Pathfinder ancestors from `~/Documents/repos/pf2e/packs/pf2e/{feats,actions,spells,
   class-features}` when a cell needs one. Grep the JSON and quote the text.

Do not read the other ladders in section 15, the todos file, or the older plan files.

## How the review runs

Open by putting the ladder in front of Mark in this exact shape, then stop and wait:

| Rung | Cost | What it does |
|---|---|---|
| Name | ◆ | One sentence. |
| Name | ◆◆ | "Name, and ..." Rungs are cumulative. |
| Name | ◆◆◆ | "Name, and ..." |

Under it: what changed against the rule in force, the ancestor, and any number that decides a
cell (`MATCHUP=1 npx vitest run src/tests/matchup.test.ts` regenerates `docs/plans/matchups.md`).
Mark decides cell by cell in conversation. After each of his messages, rewrite the ladder's
block in section 15 to say exactly what he said, quote the sentence that decided it in a dated
entry appended to `docs/plans/battle-mechanics.todos.md`, and show him the table again. Record
ideas he drops, in one line, so they are not proposed twice. Commit only when he says so, one
commit per ladder.

When editing section 15, replace the block between the ladder's `<h3>` and the next `<h3>` in
section 15. `<h3>Rally</h3>` and `<h3>Charge</h3>` also exist in sections 9 and 7: anchor on
the review section first or the file duplicates itself.

## What Mark has decided so far, and holds for every ladder

- **Meaningful effects over flat bonuses.** A rung buys a different kind of thing. The one
  exception is Guard's +2 and +4 Defence, which "is just increasing your defenses".
- **Actions are the only currency.** The rung at the grade costs one action, each rung above it
  one more. Nothing rolls for a rung and nothing turns an action into a bonus.
- **One gate.** An effect passes through one roll. Control is gated on a check: outright
  "may not Move" was "too strong a control".
- **No skill checks.** Troops have no Athletics. The check to break contact or a pin is the
  **Disengage check**: Reflex, less disorder, against an attack DC (Strike or Volley + 10).
  Never call it Escape.
- **A share with adjacent allies is a unit ability**, never a rung: "adjacency may not be
  common". It lives on the defend-allies tactic.
- **Range is a penalty, never a rung**: −2 a band beyond effective range.
- **Complete immunity to the next hit is too strong** for a ladder every troop can climb.
- A miss is free at range; a Fight's miss repulses. Suppress (−2 to everything, until the
  shooter's next activation, hit or miss) is the precedent for a temporary penalty.

## Every ladder, and which are updated

Seven ladders. Fight was reviewed first and is already built; it set the four tests the rest
are judged by. Three are updated: Fight, Shoot and Guard. Four wait.

| Ladder | Rule in force | Updated | Status |
|---|---|---|---|
| Fight | Section 6: Strike / Press / Overrun | ✓ | Reviewed and built 2026-09-05, commit 5ec6ad3. One roll, Press skips the save, Overrun drives and takes ground. Not in section 15. |
| Shoot | Section 6: Fire / Aim / Snipe | ✓ | Decided 2026-09-05: Fire / Suppress / Pin, range as a −2 a band penalty. In section 15, not yet built. |
| Guard | Section 6: Brace / Dig in / Shieldwall | ✓ | Decided 2026-09-05: Brace / Dig in / Take cover, the share moved to the defend-allies tactic. In section 15, not yet built. |
| Rally | Sections 6 and 9: Steady / Rally / Inspire | | Next. Draft in section 15: heart becomes a point of disorder not taken. |
| Withdraw | Section 7 | | Draft in section 15: Break off / Fall back / Flee, grade 2 with pace. |
| Charge | Section 7 | | Draft in section 15: two Speeds and the Fight rung for ◆◆; cavalry charge and mounted as riders. |
| Cast | Section 11: six trees, tiers 1 to 3 | | Draft in section 15, tree by tree: Blast, Healing, Controlling, Offense, Defense, Movement. |

Move carries no rungs and is not under review. Section 15 also holds two blocks that are not
ladders, "Free strike and no retreat" and "Walls and siege engines"; both say the rule is
unchanged and need no review.

After the last review comes the build: implement section 15 into section 6 and the engine, one
commit per ladder, then delete section 15.

# Ladder review, one ladder at a time

Start a session with: **"Read docs/plans/ladder-review.md and review the Blast tree."**
Nothing else needs to be in context. Change the ladder's name to pick the next one; a Cast tree
is named by its tree, "review the Blast tree".

## What to read, and nothing more

1. `public/rules.html`: the named ladder's own block in the section it lives in (Shoot and
   Guard in 8, Rally in 9, Withdraw and Charge in 7, each Cast tree under its `<h4>` in 11).
   Since 2026-09-06 a decided ladder stands there as the rule and the old rule is deleted. A
   `<div class="legacy">` marks only a rule nothing has replaced yet: the Movement
   row in section 11 and the three tactics. A draft not yet decided is in section 15,
   "Under review", which holds only open items.
3. The engine plays the rules as they stood before the review until the build.
3. The engine function behind it, quoted by name: `LADDERS` in `src/engine/ladders.ts`,
   `perform` in `src/engine/battle.ts`, `CAST_RUNGS` in `src/engine/magic.ts`.
4. Pathfinder ancestors from `~/Documents/repos/pf2e/packs/pf2e/{feats,actions,spells,
   class-features}` when a cell needs one. Grep the JSON and quote the text.

Do not read the other ladders in section 15, the todos file, or the older plan files.

## How the review runs

Open by putting the ladder in front of Mark in this exact shape, then stop and wait:

| Activity | Cost | What it does |
|---|---|---|
| Name | ◆ | One sentence. |
| Name | ◆◆ | "Name, and ..." A verb's activities are cumulative; the buffs are not. |
| Name | ◆◆◆ | "Name, and ..." |

Under it: what changed against the rule in force, the ancestor, and any number that decides a
cell (`MATCHUP=1 npx vitest run src/tests/matchup.test.ts` regenerates `docs/plans/matchups.md`).
Mark decides cell by cell in conversation. After each of his messages, rewrite the ladder's
block in its home section to say exactly what he said (a draft still in section 15 moves
home when it is decided and the old rule goes), quote the sentence that decided it in a dated
entry appended to `docs/plans/battle-mechanics.todos.md`, and show him the table again. Record
ideas he drops, in one line, so they are not proposed twice. Commit only when he says so, one
commit per ladder.

Mark wants the same three tables in the rules that he reads in chat: the rung table, the
degree table where there is a roll, and the numbers table. Section 15's `<h4>` for a Cast
tree and section 11's share a name: anchor on the section first.

## What Mark has decided so far, and holds for every ladder

- **The word is activity, never rung, ladder or tier.** On 2026-09-08 Mark swept them: "'rung' is a
  concept which we basically have removed from the game at this point, now that we have a
  three-action tree for every action." A verb (Fight, Shoot, Guard, Rally, Withdraw, Charge,
  Cast) offers three activities in Pathfinder's sense, priced one, two and three actions;
  the rules table header is Activity. Tier stays for forts and walls only. This file keeps
  "ladder" in its own name and prose as history.
- **Meaningful effects over flat bonuses.** A rung buys a different kind of thing. The one
  exception is Guard's +2 and +4 Defence, which "is just increasing your defenses".
- **Actions are the only currency.** The first rung costs one action, each rung above it
  one more. Nothing rolls for a rung and nothing turns an action into a bonus.
- **One gate.** An effect passes through one roll. Control is gated on a check: outright
  "may not Move" was "too strong a control". A cast is one roll too: "we're going back to a
  single roll instead of a cast and then effect", so section 11's cast roll followed by a
  separate effect roll goes. Each tree's one roll is the row above it in section 15: Blast's
  spell attack, Controlling's Will save, Healing's spell attack against the healed unit's own
  level DC, Defense's Aegis the attacker's Will save, and none for Offense or Movement.
- **No skill checks.** Troops have no Athletics. The check to break contact or a pin is the
  **Disengage check**: Reflex, less disorder, against an attack DC (Strike or Volley + 10).
  Never call it Escape. It is one check against the highest holder, read for every holder, and
  a pin counts as a holder. Its critical is a free Move of your Speed.
- **A share with adjacent allies is a unit ability**, never a rung: "adjacency may not be
  common". It lives on the defend-allies tactic.
- **Range is a penalty, never a rung**: −2 a band beyond effective range.
- **Complete immunity to the next hit is too strong** for a ladder every troop can climb.
- **There is no unit grade, and no extra action of a troop's own.** Every rung costs its own
  number of actions for every troop: Strike 1, Press 2, Overrun 3, and every unit has three.
  A better troop is better by its numbers. On 2026-09-08 Mark removed the extra action that
  had replaced the grades: "Remove the whole concept of unit grade." Haste is the one source
  of a fourth action, for the ally's next two activations. Never write "grade" or "extra
  action" into a rule; a four-action rung says "only a hasted unit".
- **Charge is for everyone.** One action of movement buys two Speeds when it ends in a Fight;
  the Strike is at +2 and the charger is exposed until it next acts; cavalry differs by reach
  and by the cavalry-charge impact, never by owning the verb. The +2 is the second flat bonus
  allowed, after Guard's.
- **Healing rolls, against the healed unit's level.** "A low-level caster shouldn't be able to
  easily heal a high-level monster or a high-level army." The caster's spell attack against
  the unit's own level DC, one roll whatever the rung, so the level difference does the work
  it does for an attack. The roll says how much, the rung how many units it reaches: one, two, three, always touch.
- **Casters have three actions.** Section 11's Cast-only actions (level ÷ 5) go: "we remove
  the extra actions awarded to casters now that we have only 1 tree to perform, previously we
  had cast then effect." A tree is cast once an activation; once altogether is open.
- **Frightened is a condition**, a light disorder that wears off: −1 to everything the unit
  rolls and to its Defence until the end of its next activation. Conditions Healing's Restore
  can end: exposed, suppressed, pinned, rooted, frightened, persistent damage.
- **Melee words:** Fight is the verb, engaged the state, Disengage the check. Never exchange or
  engagement.
- A miss is free at range; a Fight's miss repulses. Suppress (−2 to everything, until the
  shooter's next activation, hit or miss) is the precedent for a temporary penalty.

## Every ladder, and which are updated

Twelve ladders: six verbs and the six trees of Cast, each tree reviewed as a ladder of its own.
Fight was reviewed first and is already built; it set the four tests the rest are judged by.
Eleven are updated: Fight, Shoot, Guard, Rally, Withdraw, Charge, Blast, Healing, Controlling, Offense and Defense. Movement waits.

| Ladder | Rule in force | Updated | Status |
|---|---|---|---|
| Fight | Section 6: Strike / Press / Overrun | ✓ | Reviewed and built 2026-09-05, commit 5ec6ad3. One roll, Press skips the save, Overrun drives and takes ground. Not in section 15. |
| Shoot | Section 6: Fire / Aim / Snipe | ✓ | Decided 2026-09-05: Fire / Suppress / Pin, range as a −2 a band penalty. Pin makes the shooter a holder for Withdraw. In its section; engine not yet built. |
| Guard | Section 6: Brace / Dig in / Shieldwall | ✓ | Decided 2026-09-05: Brace / Dig in / Take cover, the share moved to the defend-allies tactic. In its section; engine not yet built. |
| Rally | Sections 6 and 9: Steady / Rally / Inspire | ✓ | Decided 2026-09-05: the roll stays, a success clears 1 or inspires (+2 to the next roll), one roll read for everyone reached. In its section; engine not yet built. Rung 3's name is open. |
| Withdraw | Section 7: one action, the Disengage check | ✓ | Decided 2026-09-05: Break off / Disengage / Fighting retreat. One check against the highest holder, a free Move on a critical, a pin is a holder. Ground is never a rung; above Break off the enemy rolls, a failure roots it, and at the top it takes 1 disorder. In its section; engine not yet built. Shaken and routed units now Move, fixed in section 7 and the engine. |
| Charge | Section 7 | ✓ | Decided 2026-09-05: for everyone, one movement action buys two Speeds ending in a Fight, then Strike / Press / Overrun at flat price (◆◆ / ◆◆◆ / ◆◆◆◆), the Strike at +2 and the charger exposed. No +2 through difficult ground or a climb; a charge started from a hex above the target's puts its save at −2. Cavalry charge is the impact; mounted goes. In its section; engine not yet built. |
| Cast: Blast | Section 11: long range, the activation's attack | ✓ | Decided 2026-09-06: Missile / Line / Burst. One spell attack read against a shape in hexes: one, two on a straight line from the caster, three at a corner; every hex a full target. The Cast-only actions go with it. In its section; engine not yet built. |
| Cast: Healing | Section 11: touch | ✓ | Decided 2026-09-06: Soothe / Heal / Restore, one, two and three units, each yourself or an adjacent ally. One roll, spell attack against each unit's own level DC: a failure clears 1 disorder, a success 1 disorder and 1 wound, a critical one more thing, a condition ended or a second wound. In its section; engine not yet built. |
| Cast: Controlling | Section 11: medium range, Will save against spell DC | ✓ | Decided 2026-09-06: Dread / Stun / Hold. One Will save: a success frightens (−1 to rolls and Defence until the end of its next activation), a failure the rung, a critical failure the rung with 2 disorder. Stun is one action fewer, Hold rooted. In its section; engine not yet built. |
| Cast: Offense | Section 11: short range, an ally | ✓ | Decided 2026-09-08: Sure strike / Wrath / Haste, a menu, each rung its own effect. Wrath is persistent damage: the ally's next hit costs the target 1 more wound at the end of its next activation, with the ordinary Fortitude save or 1 disorder. Haste is four actions on each of the ally's next two activations; the unit grade and the troop's own extra action went with it. In its section; engine not yet built. |
| Cast: Defense | Section 11: short range, an ally | ✓ | Decided 2026-09-08: Ward / Stoneskin / Aegis, a menu. Ward is Sure strike's mirror, the attacker rolls twice and takes the worse; Stoneskin caps every hit at one wound and no disorder; Aegis is Sanctuary, the attacker's Will against spell DC or the activity is wasted. In its section; engine not yet built. |
| Cast: Movement | Section 11: short range, an ally | | Draft in section 15: Sure footing / Wings / Freedom. Freedom passes the Disengage check. |

Move carries no rungs and is not under review. Section 15 also holds two blocks that are not
ladders, "Free strike and no retreat" and "Walls and siege engines"; both say the rule is
unchanged and need no review.

After the last review comes the build: implement each ladder's rule into the engine, one
commit per ladder, then delete section 15 and the last Legacy blocks.


## Troops-only notes

Wave 3 (troops only, pulled forward, run in parallel with Wave 1).

- Removed the "Your own" hand-built-unit section from `Place.svelte`: the `custom` state
  object, name/level/role inputs, Salvo select, Pace/Fear checkboxes, the tactics checkbox
  grid, the derived-stats preview line, and "Add New Unit". The roster picker, the generate
  button, siege-engine attachment, and the placed-unit list are untouched.
- Deleted `ROLES`, `REACHES`, `TACTICS` (the array), and `ROLE_BLURBS` from
  `src/engine/cards.ts` — grep confirmed no caller remained anywhere in `src/` once the
  custom-unit form controls that were their only consumers were gone.
- Kept `ROLE_PROFILES`, `deriveStats`, `cardTraits`, `derivation`, `paceReason`: `battle.ts`
  calls `deriveStats`/`cardTraits` to drive every roll from troop stats, and `Place.svelte`
  still renders `derivation`/`paceReason` as the "Battle ·" preview line for every roster/
  official/placed troop, including generic-roster troops that have no full sheet and derive
  from the level table alone. `ROLE_PROFILES` is an internal helper those three share. The
  `Role`, `Reach`, `Tactic` *types* also stay — used throughout `UnitCard` and `battle.ts`.
- Kept `FALLBACK_ART` in `src/engine/art.ts`: custom units are gone, but generic `ROSTER`
  troops (and any troop missing a specific art entry) still fall back to a role-based image.
- No test exercised the custom-unit-creation UI — there was no `Place.svelte` test — so
  nothing needed rewriting. The `UnitCard` object literals in `battle.test.ts`,
  `engines.test.ts`, `force.test.ts`, `cards.test.ts` are plain data fixtures for engine
  functions, unrelated to the deleted feature; left untouched (and `battle.test.ts` is a
  concurrent agent's file regardless).

## Ladder engine notes

Wave 1. `src/engine/ladders.ts` holds the seven ladders and the grade derivation; `battle.ts`
runs alternating activation, one action per activation, the reach check and disorder.

### Grade derivation, and the thresholds to tune

Measured over the 162 troop-trait creatures in the local PF2e checkout (`packs/pf2e`), not over
the 39 imported ones. Two of the obvious signals are dead ends:

| Signal | Spread within a level | Verdict |
|---|---|---|
| AC | 3.2 (level 7: every troop 24–25; level 11: every troop 30–31) | f(level), unusable |
| Attack DC | 2.6 (level 12: every troop exactly 29) | f(level), unusable |
| Will save | 5.1 (level 6 runs 11–16 across 22 troops) | usable |
| Speed | 20 ft ×18, 25 ×89, 30 ×36, 35 ×4, 40 ×12, 50 ×1 | usable |

So Guard and Fight are read off recurring action names instead, which an importer sees on any
troop ever published. `scripts/troop-signals.mjs` detects them and both importers emit them as
`UnitCard.signals`; nothing is keyed on a troop's name.

| Ladder | Rule | Grade 3 count of 162 |
|---|---|---|
| Move | Speed ≥ 40 → 3, ≥ 25 → 2, else 1; `mounted` → 3; Speed 0 → 1 and moving is illegal | 22 |
| Shoot | ranged band: extreme → 3, long → 2, close → 1; no ranged action → 1 and shooting is not offered | 5 |
| Fight | `melee-drill` or `fear` → 3, else 2; no melee strike → 1 | 30 |
| Guard | 1, +1 for `formation`, +1 for `shielded` or `magic-ward` | 7 |
| Withdraw | Move's speed bands, +1 when Perception is high for the level; `no-retreat` or Speed 0 → 1 | 27 |
| Rally | Will high or extreme for the level → 3, moderate → 2, else 1 | 12 |
| Cast | `caster` and level ≥ 15 → 3, ≥ 8 → 2, else 1; not offered without spells | 7 |

Signal detection, all from action names: `mounted` = Mounted Troop / First-class Charge (13);
`melee-drill` = Clash of Steel / Wild Swing / Strike as One / Trample / Attack of Opportunity
(23); `shielded` = Raise Shields / Shield Block (7); `formation` = Form Up / Drilled in
Formations (41); `magic-ward` = "+N Status to All Saves vs. Magic" (10); `no-retreat` = No
Retreat (6). `caster` = a `spellcastingEntry` item, any `spell` item, or a Troop Spellcasting /
Constant Spells action (36 of 162, 22%).

A troop with an empty tactic list — the normal case, since the importer emits `tactics: []` for
all 39 official troops — grades out fully: Goblin Rabble (no tactics, no signals) is
Move 2 / Shoot 1 / Fight 2 / Guard 1 / Withdraw 2 / Rally 1 / Cast 1. No troop in the corpus
grades all 1s.

The hand-authored `Tactic` flags stay as an override layer that only raises: `cavalry-charge` →
Move 3, `ambush`/`false-retreat` → Withdraw 3, `covering-fire` → Shoot 3,
`reactive-attack`/`dirty-fighting`/`feint` → Fight 3, `raise-shields`/`shield-block` → Guard 3,
`defend-allies`/`battlefield-medicine` → Rally 3. Three of them also grant one spell to a troop
with no magic: `battlefield-medicine` → Mend, `defend-allies` → Ward, `demoralize` → Compel.

Quality — the disorder a unit absorbs before it routs — is its Will band: low 3 (matching the
old `ROUTED_AT`), moderate 4, high 5, extreme 6, below-low 2.

### Judgment calls

- **Reach DC.** The level DC flat for rung 2, +2 for rung 3, carried on the rung as `reachDc`.
  The doc asks the rung to carry a DC modifier, and a uniform 0 would make the field pointless.
- **Movement is in points, not cells.** Advance 1, March 2 (3 with Pace); slow ground costs 2
  and uphill +1, so only a March wades into a marsh or climbs. This replaces "swamp costs an
  extra action", which had no meaning once an activation is one action.
- **Shoot bands are absolute, not capped by the unit's own reach.** Loose = close, Volley =
  long, Barrage = the extreme band and ignores cover. The unit's reach sets its *grade*, so
  equipment decides what is free and a reach roll throws further than the equipment should.
  Weakened no longer shrinks the band (it is already −2 to hit).
- **Overrun** inherits Press's +2 without the miss risk, plus the ground. The doc gives it no
  number; anything less made rung 3 worse than rung 2.
- **Rally does not roll.** The rungs clear disorder outright; the gamble is the reach. The old
  Will-vs-rout-DC check is gone, and with it the end-of-round rout check.
- **Disorder from wounds** is one point per attack that wounds, not per wound — except inside a
  melee exchange, where the exchange loss is the only morale event, so a bad exchange costs 1,
  not 2. Free strikes are outside an exchange, so a Scatter under two enemies that both wound
  costs 3 (two wounds plus the Scatter). That is the harshest number in the system.
- **Fear** costs 1 disorder to whoever enters contact with it, in either direction, once.
- **Half the army gone** now hands every standing unit of that side 1 disorder instead of
  triggering a rout check, keeping the old trigger in the new currency.
- **Charge** carries no attack bonus; the free melee is the reward. A charge that falls back to
  a March still closes to contact, and one that crits from a March fights whoever it lands on.
- **A rung the unit fell back to may not carry it**: a failed March moves as far toward the
  chosen cell as the smaller budget allows, and a shot beyond the fallback band falls short
  with no roll.
- **Siege engines are stats, not verbs.** A crewed artillery piece replaces the unit's shooting
  profile — launch bonus and reach band, so the reach band sets the free Shoot grade — and may
  target walls; a crewed ram adds +2 to a Fight against an adjacent wall. No engine actions.
- **`select(state, id)`** lets the UI choose which unit of the pending side acts; `activeUnit`
  falls back to the first un-activated unit, so tests and the engine never need the UI.
- **`routDc` survives as a proto alias** for the level DC, because `Battle.svelte` imports it
  and a missing export breaks the Vite build. Wave 2 owns that panel and should drop it.

### Rule questions for play

- Disorder arrives fast: a quality-3 troop routs on three wounding hits, which usually comes
  before four wounds destroy it. Units break before they die. Right, or should wounds only
  disorder on crossing the Weakened and Broken thresholds?
- Fight grade 2 is the default for 132 of 162 troops, so Press is the ordinary attack and plain
  Strike is the cautious one. Is that the right way round?
- Generic roster cards inherit their role's Will tier, and infantry's is high, so every
  sheet-less infantry card lands on Rally 3 and Quality 5. Only Peasant Levy, which overrides
  Will, reads as a levy. The roster may want real Will numbers.
- A caster knows all five spells, because troop statblocks name a spellcasting entry but not
  what it casts. Five menu rows for one caster is a lot; the importer could read the spell
  list and narrow it.
- The importer detects `no-retreat` but nothing reads it except Withdraw. `Trample` currently
  counts as melee drill; it might belong to Move.
- `README.md` still describes three actions, MAP and shaken. The docs wave owns it.

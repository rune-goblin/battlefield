# Action commitment — 2026-09-16

Decision: “Okay, update all those rules and the accompanying UI as well so that we have a clear way to select those options.”

- Activities retain their base prices. Each extra action grants +2, with at most two extra actions. Fight, Charge, Shoot, Rally, Blast and Healing boost their own roll; Controlling boosts its spell DC. Guard, movement, Maneuver and buffs retain their existing effects.
- Commitment applies once to a shared roll. It changes neither the target count nor the spell shape. The one-attack limit and one-cast-per-tree limit remain.
- Tradition caps the activity index. Casters and tactic-granted Soothe or Dread may concentrate within their available actions. Haste can fund commitment on a tier-three activity; +4 remains the commitment ceiling.
- Commitment stacks with existing bonuses, including charge and inspiration. It does not boost a wound save, repulse save or Aegis check. Charges retain exposure.
- Press makes the target roll Fortitude twice and keep the worse result. Failure causes one disorder. Overrun and cavalry impact inherit this save. A blocked Overrun holds the target in place without extra disorder. Stoneskin still prevents wound disorder.
- The UI separates activity, commitment and confirmation. It shows total cost, bonus and remaining actions, disables unaffordable choices, and resets commitment when the activity changes. Spell and Rally targets now await confirmation.

## Verification

- Added engine regressions for commitment pricing, malformed input, action limits, Haste, shared Blast and Healing rolls, Rally, Controlling DC, Shaken resistance, blocked Overrun and cavalry impact.
- Browser checks verified a three-action Missile at +4 and a three-action Rally at +2 through the selectors and resulting logs. Screenshots confirmed the commitment controls fit the spell popup.

## Playtest questions

- Does a concentrated charge at +6 total retain enough risk through exposure?
- Does concentrated Controlling deny too many actions, especially against units with disorder?
- Does Press retain sufficient value beside a more accurate Strike?
- Does concentrated Rally offer a useful alternative to repeated Steady attempts?

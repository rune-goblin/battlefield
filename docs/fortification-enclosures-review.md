# Fortification enclosures and defender benefits

Reviewed 2026-09-22. The Fortified condition and walls service now implement the cover, footprint, firing-position and import rules below. Broader settlement bonuses and the alternative offensive tier remain design options.

## Current behavior

`src/engine/walls.ts` provides the shared WallsService. It identifies closed enclosures, fills nested footprints, retains explicit generated courtyards at the map edge, and derives Fortified from unit position. Terrain, units and movement restrictions do not define a fort. Topology is cached across battle-state clones; wall damage, gate state and tiers remain live queries.

`wallCoverBetween` delegates to the service, as do gate controls, map gate rendering, status displays and garrison firing checks. The condition appears on the board, in condition tooltips and in the selected unit's mini sheet. A unit beside an open wall run still receives its local directional cover.

## ReignMaker benefits

ReignMaker has two progressions. Battlefield currently imports the field-fort progression.

| Field fort tier | ReignMaker name | AC | Attack | Saves | Initiative |
| --- | --- | ---: | ---: | ---: | ---: |
| 1 | Earthworks | +1 | 0 | 0 | 0 |
| 2 | Wooden Tower | +1 | 0 | 0 | +1 |
| 3 | Stone Tower | +2 | 0 | 0 | +1 |
| 4 | Fortress | +2 | 0 | 0 | +2 |

Battlefield labels tiers 2 and 3 Wood and Stone because it places wall segments.

| Settlement structure | AC | Attack | Saves | Initiative |
| --- | ---: | ---: | ---: | ---: |
| Wooden Palisade | +1 | 0 | 0 | 0 |
| Stone Walls | +1 | +1 | +1 | +1 |
| Fortified Walls | +2 | +2 | +2 | +1 |
| Grand Battlements | +2 | +3 | +3 | +2 |

These settlement rows do not map directly to Battlefield's four material labels: settlement tier 1 is wooden, while field-fort tier 1 is earthen.

ReignMaker grants benefits to eligible defending armies at the campaign location. Settlement walls protect party-aligned armies; a field fort protects its claimant's armies. It combines overlapping sources by taking the highest value for each statistic. The actor effect uses circumstance modifiers. Damaged settlement structures fall back to an intact lower tier; unpaid field-fort maintenance reduces effective tier by one, to a minimum of 1. Grand Battlements also describes recovery while the city has food, but that recovery remains a manual campaign effect.

Sources in the sibling `pf2e-reignmaker` repository:

- `src/data/fortificationTiers.ts`
- `data/structures/support-fortifications.json`
- `src/services/fortifications/fortificationBenefits.ts`
- `src/services/army/fortificationEffect.ts`
- `src/tests/unit/fortification-structure-benefits.test.ts`

## Fortified condition

Use a derived **Fortified** condition to connect a unit to the fort whose interior it occupies. The same condition represents a single enclosed hex or a large courtyard. Region geometry determines membership; the combat rules consume the condition and its source rather than discovering the enclosure separately for every activity.

The condition identifies the source fort and its fortification tier or mixed perimeter, along with the unit's eligibility for garrison benefits. A unit gains it on entry and loses it on departure. Recalculate after deployment, movement, forced movement, teleportation, map edits, and save loading. Derive it from current position and the cached region map so stale saved conditions cannot leave a unit fortified outside the walls.

Membership survives an open gate or breach because the constructed footprint still exists. The condition's protection reads the actual attack direction and current perimeter state: an intact wall can protect a shot while an open entrance cannot. Removing walls in setup can dissolve the footprint and remove the condition. Independent inner enclosures remain valid sources. Multiple applicable sources grant the highest relevant bonus once.

Show **Fortified · Stone** in the mini character sheet, with a tooltip explaining the active cover and garrison benefits. Do not label all fortified units “Fortress”: Fortress is specifically tier 4. Attack previews show the bonus that applies to that attack. An inferred enclosure and an explicit footprint for a fort at the map edge produce the same condition.

## Proposed mechanical benefits

The user clarified that the ranged-only restriction applies to troops inside while their attacker remains outside. An intact, closed wall prevents melee across its edge. Troops outside must use ranged attacks or spells against protected troops, or enter through a gate/breach before using melee. Legal attacks through an open gate or breach follow normal contact rules. Walls themselves remain valid targets for melee, rams and structural siege attacks. This is a physical barrier rule, not an immunity to all attacks by a unit whose side is labeled attacker.

Keep ReignMaker's field-fort progression Earthworks, Wood, Stone, Fortress. Fortress describes a complete defensive installation at campaign scale; a Battlefield tier-four edge represents its reinforced stone wall. Barricades fit temporary obstacles better than replacing Earthworks as the first campaign fort. Granite alone need not create a tier: construction quality and defensive design also matter.

The following values are implemented and ready for playtesting:

| Tier | Fortification | Ranged cover | Wall hardness | Wall HP |
| --- | --- | ---: | ---: | ---: |
| 1 | Earthworks | +1 | 0 | 2 |
| 2 | Wood | +2 | 1 | 3 |
| 3 | Stone | +3 | 2 | 4 |
| 4 | Fortress / reinforced stone | +4 | 2 | 5 |

Cover protects troops against incoming ranged attacks across an intact perimeter. Hardness reduces structural damage to walls; it never reduces Health damage to their occupants. Structural damage remains `max(0, damage - max(0, hardness - penetration))`. Wall HP and hardness remain unchanged. Decision: keep Fortress at hardness 2. A standard 2-damage, penetration-1 breach attack deals one structural damage on a hit and two on a critical; a 3-damage, penetration-2 breaching attack deals three on a hit and four on a critical. Basic rams remain useful. Fortress gains its advantage over Stone through 5 HP and the proposed +4 cover, rather than a hardness increase that would require specialist equipment.

A +4 cover bonus is substantial within the existing d20 rules. Against AC 20, an attack modifier of +12 has a 65% chance of a hit or critical hit and a 15% critical chance. Against AC 24 those become 45% and 5%. A 1/2-damage attack averages 0.80 Health per attempt before cover and 0.50 after +4 cover, before other protections and effects. This example is illustrative, not a claim about every matchup.

Use the highest applicable circumstance bonus from walls, terrain, height and Guard. High-angle siege attacks retain their cover bypass. Attacks originating within the same courtyard bypass that courtyard's outer wall cover, so penetrating the enclosure gives attackers a concrete positional advantage. An independent inner wall can still protect an inner fort. Physical cover follows position and may shelter attackers from fire that crosses a wall from outside.

Retain at most the existing +1 troop-shooting benefit at a defensive wall position while evaluating the stronger cover/hardness progression. Restrict it to outward shots; do not apply it throughout the courtyard or to siege attacks. Adding offensive strength on top of +4 cover strengthens the fort further rather than compensating for its defence. If tier four needs a different identity, compare +4 cover against an alternative with +3 cover and +2 outward troop shooting, rather than granting both upgrades together.

Keep initiative and supplied-city recovery at campaign scale. Battlefield alternates activations without an initiative roll. Its recovery follows the battlefield day; automatic recovery each combat round would require a separate balance decision.

Treat a settlement's garrison benefits as separate campaign metadata if they are introduced later. Painting a ring of ordinary walls should not implicitly create a Grand Battlements structure and all of its benefits. A future fort-capture rule should explicitly transfer garrison ownership rather than letting mere entry transfer every settlement benefit.

## Interior calculation

Represent each hex as a node and each shared edge as a connection. Flood from the map boundary, crossing connections without constructed walls. Cells the flood cannot reach are interior cells; group connected interior cells into regions. Ignore water, cliffs, units and movement costs for this calculation: a lake or a ring of troops must not create a fort. This is linear in the number of cells and edges.

Keep the enclosure's footprint separate from its current barriers. An open gate and a breach remain part of the constructed outline, so opening one entrance does not relabel the courtyard as outside. Use current gate and wall condition for movement and protection. A shot through a gap gets no wall cover; a shot across an intact segment still does. Deleting a wall during setup changes the constructed outline and triggers a new region calculation.

For a simple closed perimeter, infer the interior facing from the region membership of its two neighboring cells. Use it for cover and the initial gate facing. A painted gate’s explicit facing overrides inference for its handles, swing and operation side. Internal partitions and nested rings need region membership on both sides; do not overwrite their existing gate-facing choice with an arbitrary result.

Open wall runs retain their explicit facing and local cover. Generated forts need an explicit home-edge anchor or footprint because they back onto the map boundary. Treat only that designated edge as part of their enclosure; do not turn every accidental U-shaped wall at a map edge into a fort.

Mixed-tier enclosures use the actual crossed segment's protection. One Fortress segment must not upgrade a perimeter made from Earthworks. If an attack crosses several walls, apply the highest valid cover once. Keep separate forts and nested courtyards distinct.

Cache the region map by wall layout and board shape. Recompute it after wall placement/removal or map changes, not on pointer movement or unit movement. Read gate openness and remaining HP when evaluating protection. All rule queries, targeting previews, unit statistics and map highlights should use the same derived result.

## Import requirements

ReignMaker's `getBattleSite` currently exposes the raw field-fort tier, not settlement structure benefits or the effective maintenance-adjusted tier. Importing settlement benefits needs an explicit source field and eligibility data.

Before this change, `cardFromActor` could carry ReignMaker’s Fortification effect into the base statistics and then add tactical cover again. The clone preparation removes that effect for live actors while retaining other effects. Foundry runtime verification of actor preparation remains separate from the adapter unit tests.

The live-actor adapter now prepares an unsaved clone without the location-specific effect. Recalculate circumstance stacking from the modifier breakdown; subtracting the advertised bonus blindly can also remove another modifier that would have applied in its absence. Keep the source actor unchanged.

## Review cases

Check square and hex grids, both wall facings, concave loops, multiple forts, nested courtyards, internal partitions and mixed tiers. Check an open gate, a breach, an editor-deleted segment, and a fort anchored to the home edge. Check outside-to-inside fire, a shot through a gap, internal combat, high-angle fire, Guard stacking and attacker occupation. Verify imported actors receive each fortification benefit once and lose location-dependent benefits when they leave the protected area.

The unit panel should show a short benefit summary, such as “Fortified · Stone · +3 ranged cover,” with the attack preview showing whether those walls protect against the selected shot. Hovering a wall can highlight its interior region. These displays should explain the rules without filling the action menu with prose.

# Siege engines and fortifications

The 59 source actors in `data/siege-weapons` map to explicit battlefield profiles in `src/engine/siege-profiles.ts`. These profiles translate source identities into formation-scale activities. They preserve battlefield purpose rather than individual-creature dice or preparation cycles.

The attack menu shows the actual action cost, shape, damage, penetration, special effect, and friendly-fire rule. Troop shooting remains separate. The importer compresses a source loading cycle to one activity: 1–4 source actions cost one, 5–8 cost two, and longer cycles cost three. Rams and the Bolt Emitter require no reload. Fully loaded old saves stay loaded; partial old counters require one new Load activity.

Broad blasts trade concentrated damage for multiple targets. Heavy bolts and cannon shots threaten a single formation. High-angle fire bypasses cover. Rams and breaching ammunition bypass hardness. Other actors affect movement, morale, action economy, cover exposure, or magical protection. Persistent elemental, poison, and sigil effects share the existing delayed wound rule. Full-rack and overcharge preparation is included in attack cost. Actor-specific ammunition tracking, individual crew positions, trap concealment, and detailed underwater combat are outside this scale.

ReignMaker hex tiers map to Earthworks (2 boxes, hardness 0), Wooden Tower (3, 1), Stone Tower (4, 2), and Fortress (5, 2). Cover is +1 for tiers 1–2 and +2 for tiers 3–4. Tier 0 remains a legacy barricade. Damage after hardness equals `max(0, damage - max(0, hardness - penetration))`.

Gates cost one action to open or close. A unit operates from the interior hex while free of enemy contact. Either army may operate the mechanism. An open gate removes the wall barrier and cover; a breached gate cannot close. Each generated fort has one gate. Painting can add gates and choose their interior side.

## Follow-up work

- Add structural targets for buildings when city maps enter scope. Every source ability that damages structures must affect walls, gates, and those future structures through the same hardness rule.
- Playtest reload cadence and damage across low-, middle-, and high-level armies. Tune profile values against battlefield outcomes.
- Expand structural objectives, repair rules, street layouts, and building collapse only after the wall and gate loop is established.

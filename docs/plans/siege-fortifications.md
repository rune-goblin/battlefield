# Siege engines and fortifications

The 59 source actors in `data/siege-weapons` map to explicit battlefield profiles in `src/engine/siege-profiles.ts`. These profiles translate source identities into formation-scale activities. They preserve battlefield purpose rather than individual-creature dice or preparation cycles.

The attack menu shows the actual action cost, shape, damage, penetration, special effect, and friendly-fire rule. Troop shooting remains separate. The importer compresses a source loading cycle to one to three loading pips: 1–4 source actions become one pip, 5–8 become two, and longer cycles become three. Each Load activity costs one action and fills one pip; progress persists across rounds and capture. Loading and firing are allowed in contact, and a crew can do both in one activation when its action budget permits. Each engine still attacks once per round. Rams and the Bolt Emitter require no reload. Fully loaded old saves stay loaded; partial old counters require one new Load activity.

Broad blasts trade concentrated damage for multiple targets. Heavy bolts and cannon shots threaten a single formation. High-angle fire bypasses cover. Rams and breaching ammunition bypass hardness. Other actors affect movement, morale, action economy, cover exposure, or magical protection. Persistent elemental, poison, and sigil effects share the existing delayed wound rule. Full-rack and overcharge preparation is included in attack cost. Actor-specific ammunition tracking, individual crew positions, trap concealment, and detailed underwater combat are outside this scale.

ReignMaker hex tiers map to Earthworks (2 boxes, hardness 0), Wood (3, 1), Stone (4, 2), and Fortress (5, 2). Ranged cover is +1/+2/+3/+4 for tiers 1–4. The walls service derives a Fortified condition for every unit inside an enclosure. Current wall and gate state determines protection for each incoming shot; entry by the attacker bypasses the outer wall cover. Hardness remains 0/1/2/2. The editor offers tiers 1–4. Saved tier-zero barricades migrate to Earthworks while breaches remain open. Damage after hardness equals `max(0, damage - max(0, hardness - penetration))`.

Gates cost one action to open or close. A unit operates from the interior hex while free of enemy contact. Either army may operate the mechanism. An open gate removes the wall barrier and cover; a breached gate cannot close. Each generated fort has one gate. Painting cycles open A, closed A, open B, closed B, then no gate. A starts on the wall’s interior; B reverses it. The painted facing and open state persist into battle.

Occupying an emplacement claims it immediately. An adjacent friendly unit reserves an empty engine; operating it requires the same hex. Unoccupied engines change sides at round end when only the other army stands beside them. Ownership changes preserve loading progress and the shot limit. Placement offers a loaded checkbox, checked by default.

## Follow-up work

- Add structural targets for buildings when city maps enter scope. Every source ability that damages structures must affect walls, gates, and those future structures through the same hardness rule.
- Playtest reload cadence and damage across low-, middle-, and high-level armies. Tune profile values against battlefield outcomes.
- Expand structural objectives, repair rules, street layouts, and building collapse only after the wall and gate loop is established.

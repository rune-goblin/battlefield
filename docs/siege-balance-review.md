# Siege damage review

The review covers all 59 siege engines and 107 attack modes in `src/engine/siege-profiles.ts`, including 32 attacks against fortifications. It considers Health damage, affected area, attack and loading costs, range restrictions, persistent damage, and control effects. The local records in `data/siege-weapons` distinguish attacks that lost damage during translation from tools whose source rules deliberately deal no damage.

## Damage changes

Values show damage on a hit / critical hit. Units have four Health.

| Engine and mode | Previous | Revised | Reason |
| --- | --- | --- | --- |
| Anesthetizing Jaws — Clamping jaws | 1 / 2 | 2 / 3 | A focused strike with a two-action reload should have the standard focused-shot impact. Keeps snare. |
| Anesthetizing Jaws — Anesthetic surge | 0 / 0 | 2 / 3 | The source surge deals damage. Keeps stun. |
| Web Launcher — Web field | 0 / 0 | 1 / 2 | The source web impact deals damage. Keeps entanglement, web terrain, and climbing support. |
| Cyclonic Cannon — Cyclonic lance | 1 / 2 | 2 / 3 | Gives the pure-damage line a stronger impact after its two-action reload. |
| Ribauldequin — Cannon fan | 1 / 2 | 2 / 3 | Rewards a three-action reload with a stronger close-range volley. Its focused shot retains greater targeting reach. |
| Heavy Bombard — Heavy bombard | 1 / 2 | 2 / 3 | Distinguishes the heavy area attack from lighter bombardment. The focused shot remains 3 / 4. |
| Great Bronze Cannon — Grand bombard | 1 / 2 | 2 / 3 | Compensates for its three-action reload and short range. The focused shot remains 3 / 4. |
| Long Cannon — Long-range bombard | 1 / 2 | 2 / 3 | Gives the slow-loading bombard more impact. Keeps its minimum range and cover bypass. |

Repulsing blast already received 1 / 2 damage plus knockback in the preceding change.

## Remaining profiles

Light shots and most area attacks retain 1 / 2 damage. A hit removes one quarter of a unit's Health; area attacks can affect several units. Persistent damage and control effects add value to these profiles. Standard focused shots retain 2 / 3 damage, and heavy focused shots retain 3 / 4. The damage cap and existing defensive protections remain in force.

Marking Powder Cannon, Blob Paste Propulsor, and both Pheromone Sprayer modes retain zero damage. Their source rules use marking, restraint, and disruption. Their activity descriptions explicitly say “No damage.” The regression suite names these four modes as the only support exceptions.

Fortification attacks retain their structural damage and penetration. Light Door Ram and Falconet attacks can fail to penetrate a fortress on an ordinary hit; their critical hits still damage it. Stronger siege breaching modes provide the appropriate upgrade.

All attack costs, reload costs, ranges, target restrictions, and friendly fire remain in force. Stronger area attacks also increase the risk to friendly units in the selected area.

## Verification

The catalogue test resolves every mode. It checks actual troop damage on critical hits and confirms that every fortification attack damages a fortress on a critical hit. Separate tests check ordinary-hit damage, snare, stun, web terrain, and the displayed damage values for each revised mode.

These changes establish a consistent damage baseline. Match play is still needed to judge placement advantages and the practical frequency of attacks against multiple units.

# Condition icons

Date: 2026-09-18.

Twenty icons: two bars, eight conditions the board already announces, and ten buffs and states that
have no popup yet. All twenty icons were generated and installed on 2026-09-18.

## Shared constraints

- Match the painted icons in `public/art/action-icons/` and `public/art/cast-icons/`: one rendered
  fantasy object, free-standing, lit from the upper left, with worn metal, leather, cloth and wood.
  Conditions an enemy imposes are physical props. Buffs are glowing energy in their spell tree's
  colour, like the cast icons.
- One subject per icon, centred, filling about 85% of a square canvas.
- The board draws these about 30 px tall beside a number. Build each around one bold silhouette that
  reads at that size. Fine detail is welcome and must not carry the meaning.
- Actual transparent background. No text, numbers, labels, border, frame, badge, backdrop,
  watermark or checkerboard.
- Deliver a square WebP of 512 px or larger into `public/art/condition-icons/`, under the file name
  given. The board scales any size to fit.

## Delivery

The twenty finished icons ship from `public/art/condition-icons/` as transparent 512 px WebP files
at quality 80. The 1024 px generations are kept in `originals/`. The ten placeholders were
overwritten under the same names, and the Pathfinder reference images were removed once the set
was done. The ten buffs are ready for future popups. See `GENERATION.md` for prompts and
`preview.png` for the full set.

## Bars

The token carries a health bar and a morale bar. These two icons stand beside the number when a bar
moves, as in "−2" and a heart.

### `wounds.webp`
- File: `public/art/condition-icons/wounds.webp`. Replaced the original placeholder.
- Shown beside a change to health.
- Content: a deep red heart of enamelled metal or lacquered leather with a bright rim. No cross, no
  blood drops. The plainest shape in the set, since it appears most often.

### `morale.webp`
- File: `public/art/condition-icons/morale.webp`. Replaced the original placeholder.
- Shown beside a change to morale, which falls as a unit takes disorder.
- Content: a regimental battle standard on a short pole: a swallow-tailed banner in gold and
  crimson, caught mid-flutter, the pole topped by a small finial. It should pair with the horn and
  banner in `action-icons/rally.webp`.

## Conditions the board announces

### `frightened.webp`
- File: `public/art/condition-icons/frightened.webp`. Replaced the original placeholder.
- Shown with "Frightened": −1 to every roll and to Defence.
- Content: a soldier's helmet with a wide-eyed, shrieking ghostly face of violet smoke rising out
  of it. Violet is the only strong colour.

### `stunned.webp`
- File: `public/art/condition-icons/stunned.webp`. Replaced the original placeholder.
- Shown with "Stunned": one action fewer on its next activation.
- Content: a dented steel helmet, knocked askew, with three small gold stars circling above it.

### `rooted.webp`
- File: `public/art/condition-icons/rooted.webp`. Replaced the original placeholder.
- Shown with "Held": the unit cannot move on its next activation.
- Content: an armoured boot, the same boot as `action-icons/withdraw.webp`, planted on the ground
  and bound at the ankle by thick thorned roots.

### `pinned.webp`
- File: `public/art/condition-icons/pinned.webp`. Replaced the original placeholder.
- Shown with "Pinned": enemy fire holds the unit in its hex.
- Content: the same armoured boot staked to the ground by three arrows driven through the sole and
  into the earth around it. It must read as pinned by shooting and must differ from `rooted.webp`
  at a glance: arrows and no roots.

### `suppressed.webp`
- File: `public/art/condition-icons/suppressed.webp`. Replaced the original placeholder.
- Shown with "Suppressed": −2 to everything under a barrage.
- Content: a kite shield held low and angled overhead, bristling with stuck arrows, more arrows
  raining down on it from the upper right. Volume of fire, nobody hurt.

### `exposed.webp`
- File: `public/art/condition-icons/exposed.webp`. Replaced the original placeholder.
- Shown with "Exposed": −2 Defence after a charge or a critical miss.
- Content: the heater shield from `action-icons/block.webp`, split by a jagged crack from rim to
  centre, a bright gap showing through it.

### `persistent.webp`
- File: `public/art/condition-icons/persistent.webp`. Replaced the original placeholder.
- Shown with "Marked": one more wound at the end of the unit's next activation.
- Content: a torn strip of crimson banner cloth, still burning along its lower edge with
  orange-gold fire, three embers dripping from it. The fire matches `cast-icons/buff-attacks.webp`,
  since a wrathful hit leaves this.

### `routed.webp`
- File: `public/art/condition-icons/routed.webp`. Replaced the original placeholder.
- Shown with "Routed": the unit's morale is gone.
- Content: the battle standard from `morale.webp`, thrown down: the pole snapped in two, the banner
  torn and trampled in the dirt with a boot print across it.

## Buffs and states with no popup yet

Offense buffs glow orange-gold, as `cast-icons/buff-attacks.webp` does. Defense buffs glow sapphire
with hexagonal facets, as `buff-defenses.webp` does. Movement buffs glow cyan with wind, as
`buff-movement.webp` does.

### `sure-strike.webp`
- Replaces: nothing. Save it as `public/art/condition-icons/sure-strike.webp`; the board does not load it yet.
- The unit's next attack rolls twice and keeps the better.
- Content: two twenty-sided dice of gold, one bright and forward, one dim behind it, wrapped in a
  single curved orange-gold slash.

### `wrath.webp`
- Replaces: nothing. Save it as `public/art/condition-icons/wrath.webp`; the board does not load it yet.
- The unit's next hit leaves persistent damage.
- Content: a sword blade wreathed in orange-gold fire from guard to tip, embers trailing behind it.

### `hasted.webp`
- Replaces: nothing. Save it as `public/art/condition-icons/hasted.webp`; the board does not load it yet.
- The unit gains extra actions.
- Content: an hourglass with orange-gold sand streaming upward against gravity, speed streaks
  behind it.

### `warded.webp`
- Replaces: nothing. Save it as `public/art/condition-icons/warded.webp`; the board does not load it yet.
- The next attack against the unit rolls twice and keeps the worse.
- Content: a single translucent sapphire hexagonal pane, floating upright, with one bright glint
  where a blow is about to land.

### `stoneskin.webp`
- Replaces: nothing. Save it as `public/art/condition-icons/stoneskin.webp`; the board does not load it yet.
- Every hit on the unit caps at one wound and costs no disorder.
- Content: a gauntleted fist made of rough grey granite, fine sapphire light in its cracks.

### `aegis.webp`
- Replaces: nothing. Save it as `public/art/condition-icons/aegis.webp`; the board does not load it yet.
- An attacker must pass a Will check or waste the attack.
- Content: a full dome of interlocking sapphire hexagons over a small plain shield, brighter and
  more complete than `warded.webp`.

### `burst-of-speed.webp`
- Replaces: nothing. Save it as `public/art/condition-icons/burst-of-speed.webp`; the board does not load it yet.
- The unit gains one extra hex of movement.
- Content: the winged boot from `cast-icons/buff-movement.webp` in mid-stride, one long cyan wind
  ribbon streaming behind it.

### `sure-footing.webp`
- Replaces: nothing. Save it as `public/art/condition-icons/sure-footing.webp`; the board does not load it yet.
- Every hex costs the unit 1, and its charge may cross any ground.
- Content: an armoured boot stepping firmly across broken rocks and a stream, a cyan glow under the
  sole where it touches down.

### `inspired.webp`
- Replaces: nothing. Save it as `public/art/condition-icons/inspired.webp`; the board does not load it yet.
- +2 to the unit's next roll.
- Content: the war horn from `action-icons/rally.webp` with golden rays bursting from its bell.

### `guard.webp`
- Replaces: nothing. Save it as `public/art/condition-icons/guard.webp`; the board does not load it yet.
- The unit has taken a defensive stance, or dug in under cover.
- Content: a row of three overlapping heater shields, locked edge to edge, planted on the ground.
